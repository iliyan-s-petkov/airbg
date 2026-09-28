package cloudflare_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"airbg.org/internal/db"
	"airbg.org/internal/store"
	"airbg.org/internal/testsupport"
	"airbg.org/internal/upstream/cloudflare"
)

func newStoreForCollector(t *testing.T) (context.Context, *store.Store) {
	t.Helper()
	ctx := context.Background()
	pool := testsupport.NewPostgres(t)
	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	return ctx, store.New(pool, testsupport.StoreConfig(), 5*time.Second)
}

// cfServer answers the GraphQL query with one row per day in the requested
// range, echoing the since/until it was sent so tests can assert on the
// window a run actually requested.
type cfServer struct {
	srv       *httptest.Server
	gotSince  string
	gotUntil  string
	gotLimit  float64
	callCount int
}

func newCFServer(t *testing.T) *cfServer {
	t.Helper()
	s := &cfServer{}
	s.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.callCount++
		var body struct {
			Variables map[string]any `json:"variables"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		s.gotSince, _ = body.Variables["since"].(string)
		s.gotUntil, _ = body.Variables["until"].(string)
		s.gotLimit, _ = body.Variables["limit"].(float64)

		since, _ := time.Parse("2006-01-02", s.gotSince)
		until, _ := time.Parse("2006-01-02", s.gotUntil)

		type row struct {
			Dimensions struct {
				Date string `json:"date"`
			} `json:"dimensions"`
			Uniq struct {
				Uniques int `json:"uniques"`
			} `json:"uniq"`
			Sum struct {
				Requests  int64 `json:"requests"`
				PageViews int64 `json:"pageViews"`
			} `json:"sum"`
		}
		var rows []row
		for d := since; !d.After(until); d = d.AddDate(0, 0, 1) {
			var rr row
			rr.Dimensions.Date = d.Format("2006-01-02")
			rr.Uniq.Uniques = 10
			rr.Sum.Requests = 100
			rr.Sum.PageViews = 50
			rows = append(rows, rr)
		}

		resp := struct {
			Data struct {
				Viewer struct {
					Zones []struct {
						HTTPRequests1dGroups []row `json:"httpRequests1dGroups"`
					} `json:"zones"`
				} `json:"viewer"`
			} `json:"data"`
		}{}
		resp.Data.Viewer.Zones = []struct {
			HTTPRequests1dGroups []row `json:"httpRequests1dGroups"`
		}{{HTTPRequests1dGroups: rows}}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	t.Cleanup(s.srv.Close)
	return s
}

func TestRunOnceBackfillsThirtyDaysOnAnEmptyTable(t *testing.T) {
	ctx, s := newStoreForCollector(t)
	srv := newCFServer(t)

	c := cloudflare.NewCollector(testConfig(srv.srv.URL), "test-token", s)
	now := time.Date(2026, 9, 28, 3, 0, 0, 0, time.UTC)
	c.SetClockForTesting(func() time.Time { return now })

	stats, err := c.RunOnce(ctx)
	if err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if !stats.Backfill {
		t.Error("Backfill = false, want true on an empty table")
	}
	if stats.Points != 30 || stats.Written != 30 {
		t.Errorf("Points=%d Written=%d, want 30/30", stats.Points, stats.Written)
	}
	if srv.gotSince != "2026-08-30" || srv.gotUntil != "2026-09-28" {
		t.Errorf("requested window [%s, %s], want [2026-08-30, 2026-09-28]", srv.gotSince, srv.gotUntil)
	}
}

func TestRunOnceUsesThreeDayLookbackWhenNotEmpty(t *testing.T) {
	ctx, s := newStoreForCollector(t)
	if _, err := s.UpsertVisitorDaily(ctx, []store.VisitorDaily{
		{Day: time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC), Uniques: 1, Requests: 1, PageViews: 1, FetchedAt: time.Now()},
	}); err != nil {
		t.Fatalf("seed: %v", err)
	}

	srv := newCFServer(t)
	c := cloudflare.NewCollector(testConfig(srv.srv.URL), "test-token", s)
	now := time.Date(2026, 9, 28, 3, 0, 0, 0, time.UTC)
	c.SetClockForTesting(func() time.Time { return now })

	stats, err := c.RunOnce(ctx)
	if err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if stats.Backfill {
		t.Error("Backfill = true, want false when the table already has data")
	}
	if stats.Points != 3 {
		t.Errorf("Points = %d, want 3", stats.Points)
	}
	if srv.gotSince != "2026-09-26" || srv.gotUntil != "2026-09-28" {
		t.Errorf("requested window [%s, %s], want [2026-09-26, 2026-09-28]", srv.gotSince, srv.gotUntil)
	}
}

func TestLoopDoesNothingWithoutAToken(t *testing.T) {
	ctx, s := newStoreForCollector(t)
	srv := newCFServer(t)

	c := cloudflare.NewCollector(testConfig(srv.srv.URL), "", s)
	runCtx, cancel := context.WithTimeout(ctx, 200*time.Millisecond)
	defer cancel()
	c.Loop(runCtx) // must return promptly, not block until the ticker fires

	if srv.callCount != 0 {
		t.Errorf("callCount = %d, want 0: an empty token must never reach the API", srv.callCount)
	}
	empty, err := s.VisitorDailyEmpty(ctx)
	if err != nil {
		t.Fatalf("VisitorDailyEmpty: %v", err)
	}
	if !empty {
		t.Error("table is not empty, but Loop should have done nothing")
	}
}
