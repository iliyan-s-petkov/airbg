package cloudflare

import (
	"context"
	"log/slog"
	"time"

	"airbg.org/internal/config"
	"airbg.org/internal/store"
)

// lookbackDays is how many trailing days every ordinary run re-pulls, to
// catch late-arriving/corrected data (spike notes: Cloudflare's own daily
// group can still shift for a day or two after it closes).
const lookbackDays = 3

// backfillDays is the window a first run against an empty table pulls.
// Retention on this plan is ~29-30 days (see /tmp/airbg-cf-spike.md); the
// query-range cap Cloudflare enforces is far wider (~52 weeks), so this is
// what actually bounds the backfill, not the API.
const backfillDays = 30

// Stats is one RunOnce cycle's outcome.
type Stats struct {
	Points   int
	Written  int
	Backfill bool
}

type Collector struct {
	cfg    config.Cloudflare
	token  string
	client *Client
	store  *store.Store
	clock  func() time.Time
}

// NewCollector takes the token directly rather than reading TokenEnv itself,
// so the empty-token "do nothing" behaviour (requirement 4) is one visible
// branch in Loop instead of being hidden behind an env lookup down here.
func NewCollector(cfg config.Cloudflare, token string, s *store.Store) *Collector {
	return &Collector{cfg: cfg, token: token, client: New(cfg, token), store: s, clock: time.Now}
}

// SetClockForTesting overrides the clock RunOnce uses to compute "today" and
// to stamp fetched_at.
func (c *Collector) SetClockForTesting(clock func() time.Time) { c.clock = clock }

// window returns the inclusive [since, until] calendar-day range to fetch:
// backfillDays when the table is empty, otherwise the rolling lookbackDays.
func window(now time.Time, empty bool) (since, until time.Time) {
	until = truncateDay(now)
	days := lookbackDays
	if empty {
		days = backfillDays
	}
	since = until.AddDate(0, 0, -(days - 1))
	return since, until
}

func truncateDay(t time.Time) time.Time {
	t = t.UTC()
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

// RunOnce fetches the appropriate window and upserts it. Called with an empty
// token this would send an unauthenticated request and fail; callers must
// route through Loop, which never calls RunOnce when the token is empty.
func (c *Collector) RunOnce(ctx context.Context) (Stats, error) {
	var st Stats

	empty, err := c.store.VisitorDailyEmpty(ctx)
	if err != nil {
		return st, err
	}
	st.Backfill = empty

	since, until := window(c.clock(), empty)
	points, err := c.client.FetchDaily(ctx, since, until)
	if err != nil {
		return st, err
	}
	st.Points = len(points)

	fetchedAt := c.clock().UTC()
	rows := make([]store.VisitorDaily, len(points))
	for i, p := range points {
		rows[i] = store.VisitorDaily{
			Day:       p.Date,
			Uniques:   p.Uniques,
			Requests:  p.Requests,
			PageViews: p.PageViews,
			FetchedAt: fetchedAt,
		}
	}
	n, err := c.store.UpsertVisitorDaily(ctx, rows)
	st.Written = int(n)
	return st, err
}

// Loop runs RunOnce once immediately and then on cfg.PollInterval, until ctx
// is done. With no token set, it logs once at info level and returns — the
// server must start and run fine without the secret, which prod will not
// have until it is added to Infisical (see README.md).
func (c *Collector) Loop(ctx context.Context) {
	if c.token == "" {
		slog.Info("cloudflare analytics token not set; visitor_daily job disabled", "env", TokenEnv)
		return
	}

	run := func() {
		s, err := c.RunOnce(ctx)
		if err != nil {
			slog.Error("cloudflare visitor_daily cycle failed", "error", err)
			return
		}
		slog.Info("cloudflare visitor_daily cycle complete",
			"points", s.Points, "written", s.Written, "backfill", s.Backfill)
	}

	run()
	t := time.NewTicker(c.cfg.PollInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			run()
		}
	}
}
