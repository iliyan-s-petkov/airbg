package store_test

import (
	"testing"
	"time"

	"airbg.org/internal/store"
)

func TestVisitorDailyIsEmptyOnAFreshTable(t *testing.T) {
	ctx, _, s := newStore(t)
	empty, err := s.VisitorDailyEmpty(ctx)
	if err != nil {
		t.Fatalf("VisitorDailyEmpty: %v", err)
	}
	if !empty {
		t.Errorf("VisitorDailyEmpty = false, want true on a fresh table")
	}
}

func TestUpsertVisitorDailyWritesRows(t *testing.T) {
	ctx, pool, s := newStore(t)
	day := time.Date(2026, 9, 27, 0, 0, 0, 0, time.UTC)
	fetchedAt := time.Date(2026, 9, 28, 0, 5, 0, 0, time.UTC)

	n, err := s.UpsertVisitorDaily(ctx, []store.VisitorDaily{
		{Day: day, Uniques: 104, Requests: 500, PageViews: 162, FetchedAt: fetchedAt},
	})
	if err != nil {
		t.Fatalf("UpsertVisitorDaily: %v", err)
	}
	if n != 1 {
		t.Fatalf("n = %d, want 1", n)
	}

	empty, err := s.VisitorDailyEmpty(ctx)
	if err != nil {
		t.Fatalf("VisitorDailyEmpty: %v", err)
	}
	if empty {
		t.Errorf("VisitorDailyEmpty = true after a write, want false")
	}

	var uniques int
	var requests, pageViews int64
	if err := pool.QueryRow(ctx, `SELECT uniques, requests, page_views FROM visitor_daily WHERE day = $1`, day).
		Scan(&uniques, &requests, &pageViews); err != nil {
		t.Fatalf("query: %v", err)
	}
	if uniques != 104 || requests != 500 || pageViews != 162 {
		t.Errorf("got (%d, %d, %d), want (104, 500, 162)", uniques, requests, pageViews)
	}
}

// A re-fetch of the same day is a correction, not a second opinion: Cloudflare
// itself says late-arriving data lands within a day or two, so the job
// re-pulls the last 3 days every run.
func TestUpsertVisitorDailyReplacesAnEarlierValueForTheSameDay(t *testing.T) {
	ctx, pool, s := newStore(t)
	day := time.Date(2026, 9, 27, 0, 0, 0, 0, time.UTC)

	if _, err := s.UpsertVisitorDaily(ctx, []store.VisitorDaily{
		{Day: day, Uniques: 100, Requests: 400, PageViews: 150, FetchedAt: day},
	}); err != nil {
		t.Fatalf("UpsertVisitorDaily (first): %v", err)
	}
	if _, err := s.UpsertVisitorDaily(ctx, []store.VisitorDaily{
		{Day: day, Uniques: 181, Requests: 878, PageViews: 878, FetchedAt: day.Add(time.Hour)},
	}); err != nil {
		t.Fatalf("UpsertVisitorDaily (second): %v", err)
	}

	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM visitor_daily`).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 1 {
		t.Fatalf("row count = %d, want 1", n)
	}

	var uniques int
	if err := pool.QueryRow(ctx, `SELECT uniques FROM visitor_daily WHERE day = $1`, day).Scan(&uniques); err != nil {
		t.Fatalf("query: %v", err)
	}
	if uniques != 181 {
		t.Errorf("uniques = %d, want 181 (the second write's value)", uniques)
	}
}

func TestUpsertVisitorDailyEmptySliceIsANoOp(t *testing.T) {
	ctx, _, s := newStore(t)
	n, err := s.UpsertVisitorDaily(ctx, nil)
	if err != nil {
		t.Fatalf("UpsertVisitorDaily: %v", err)
	}
	if n != 0 {
		t.Errorf("n = %d, want 0", n)
	}
}
