package ingest_test

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"airbg.org/internal/area"
	"airbg.org/internal/db"
	"airbg.org/internal/ingest"
	"airbg.org/internal/metrics"
	"airbg.org/internal/quality"
	"airbg.org/internal/store"
	"airbg.org/internal/testsupport"
	"airbg.org/internal/upstream"
)

// A frozen sensor must be flagged on the first poll after a restart, not after
// another 12 polls: the history is seeded from the reading table.
func TestSeededHistoryFlagsFrozenSensorOnFirstPoll(t *testing.T) {
	ctx := context.Background()
	pool := testsupport.NewPostgres(t)
	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	if _, err := area.Import(ctx, pool, "../area/testdata/bulgaria.geojson", area.NationalBoundaryKind); err != nil {
		t.Fatalf("area.Import(bulgaria): %v", err)
	}
	st := store.New(pool, testStoreConfig(), testSeriesTimeout)

	now := time.Now().UTC().Truncate(time.Second)
	var prior []quality.Scored
	for i := 1; i <= 11; i++ {
		prior = append(prior, quality.Scored{
			Reading: reading(1, "P1", 42, 0, now.Add(-time.Duration(i)*5*time.Minute)),
			Flag:    quality.FlagOK,
		})
	}
	if err := st.UpsertSensors(ctx, prior, map[int64]string{1: "BG"}); err != nil {
		t.Fatalf("UpsertSensors: %v", err)
	}
	if _, err := st.WriteReadings(ctx, prior); err != nil {
		t.Fatalf("WriteReadings: %v", err)
	}

	run := func(seed bool) ingest.Stats {
		hist := quality.NewHistory(12)
		if seed {
			if _, err := st.SeedHistory(ctx, hist, 3*time.Hour, 12); err != nil {
				t.Fatalf("SeedHistory: %v", err)
			}
		}
		f := stubFetcher{readings: []upstream.Reading{reading(1, "P1", 42, 0, now)}}
		stats, err := ingest.New(f, st, hist, testScorer(), testAssignTimeout, testCountries).RunOnce(ctx)
		if err != nil {
			t.Fatalf("RunOnce: %v", err)
		}
		return stats
	}

	if got := run(false).Flagged[quality.FlagStuck]; got != 0 {
		t.Fatalf("unseeded stuck = %d, want 0 (the restart gap this test closes)", got)
	}
	if got := run(true).Flagged[quality.FlagStuck]; got != 1 {
		t.Errorf("seeded stuck = %d, want 1 on the first poll", got)
	}

	// The scoring run's flag counts are also exported as a labelled counter.
	rec := httptest.NewRecorder()
	metrics.Handler().ServeHTTP(rec, httptest.NewRequest("GET", "/metrics", nil))
	if !strings.Contains(rec.Body.String(), `airbg_readings_flagged_total{flag="stuck"} 1`) {
		t.Errorf("metrics output lacks airbg_readings_flagged_total{flag=\"stuck\"} 1:\n%s", rec.Body.String())
	}
}
