package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// VisitorDaily is one day's Cloudflare traffic totals, as written. No IPs and
// nothing per-request — see internal/upstream/cloudflare/README.md.
type VisitorDaily struct {
	Day       time.Time
	Uniques   int
	Requests  int64
	PageViews int64
	FetchedAt time.Time
}

// VisitorDailyEmpty reports whether visitor_daily holds no rows yet. The
// cloudflare collector uses this to decide between a 3-day rolling pull and a
// full backfill of the available retention window.
func (s *Store) VisitorDailyEmpty(ctx context.Context) (bool, error) {
	var exists bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM visitor_daily)`).Scan(&exists); err != nil {
		return false, err
	}
	return !exists, nil
}

// UpsertVisitorDaily replaces each named day. A re-fetch of a day already
// stored is a correction — Cloudflare's own daily group can still shift for a
// day or two after it closes — not a second opinion.
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
