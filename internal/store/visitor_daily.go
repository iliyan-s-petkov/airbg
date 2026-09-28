package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// VisitorDaily is one day's Cloudflare traffic totals. No IPs, nothing
// per-request — see internal/upstream/cloudflare/README.md.
type VisitorDaily struct {
	Day       time.Time
	Uniques   int
	Requests  int64
	PageViews int64
	FetchedAt time.Time
}

// VisitorDailyMaxDay returns the most recent stored day and whether any row
// exists. The collector uses this to size its lookback window to the gap.
func (s *Store) VisitorDailyMaxDay(ctx context.Context) (time.Time, bool, error) {
	var day *time.Time
	if err := s.pool.QueryRow(ctx, `SELECT max(day) FROM visitor_daily`).Scan(&day); err != nil {
		return time.Time{}, false, err
	}
	if day == nil {
		return time.Time{}, false, nil
	}
	return *day, true, nil
}

// VisitorDailyLast returns the newest n stored rows, oldest first. It counts
// rows, not calendar days: a missing day stays a gap and is never filled.
func (s *Store) VisitorDailyLast(ctx context.Context, n int) ([]VisitorDaily, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT day, uniques, requests, page_views, fetched_at FROM (
		   SELECT day, uniques, requests, page_views, fetched_at
		   FROM visitor_daily ORDER BY day DESC LIMIT $1
		 ) newest ORDER BY day ASC`, n)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]VisitorDaily, 0, min(n, 365))
	for rows.Next() {
		var v VisitorDaily
		if err := rows.Scan(&v.Day, &v.Uniques, &v.Requests, &v.PageViews, &v.FetchedAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// UpsertVisitorDaily replaces each named day: a re-fetch is a correction,
// since Cloudflare's own daily group can still shift for a day or two.
func (s *Store) UpsertVisitorDaily(ctx context.Context, vs []VisitorDaily) (int64, error) {
	if len(vs) == 0 {
		return 0, nil
	}
	batch := &pgx.Batch{}
	for _, v := range vs {
		batch.Queue(
			`INSERT INTO visitor_daily (day, uniques, requests, page_views, fetched_at)
			 VALUES ($1, $2, $3, $4, $5)
			 ON CONFLICT (day) DO UPDATE
			   SET uniques = EXCLUDED.uniques,
			       requests = EXCLUDED.requests,
			       page_views = EXCLUDED.page_views,
			       fetched_at = EXCLUDED.fetched_at`,
			v.Day, v.Uniques, v.Requests, v.PageViews, v.FetchedAt)
	}
	if err := s.pool.SendBatch(ctx, batch).Close(); err != nil {
		return 0, err
	}
	return int64(len(vs)), nil
}

// SeedVisitorDaily fills gaps only: it never overwrites a day the collector
// already wrote. Returns the number of rows actually inserted.
func (s *Store) SeedVisitorDaily(ctx context.Context, vs []VisitorDaily) (int64, error) {
	if len(vs) == 0 {
		return 0, nil
	}
	batch := &pgx.Batch{}
	for _, v := range vs {
		batch.Queue(
			`INSERT INTO visitor_daily (day, uniques, requests, page_views, fetched_at)
			 VALUES ($1, $2, $3, $4, $5)
			 ON CONFLICT (day) DO NOTHING`,
			v.Day, v.Uniques, v.Requests, v.PageViews, v.FetchedAt)
	}
	br := s.pool.SendBatch(ctx, batch)
	defer br.Close()
	var n int64
	for range vs {
		tag, err := br.Exec()
		if err != nil {
			return n, err
		}
		n += tag.RowsAffected()
	}
	return n, nil
}
