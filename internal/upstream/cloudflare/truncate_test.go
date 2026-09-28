package cloudflare

import (
	"testing"
	"time"
)

// The stored "day" and Cloudflare's Date scalar are UTC calendar dates. A
// clock in another zone must still truncate to the UTC date, not the local
// one — otherwise a run just after local midnight in a zone ahead of UTC
// picks the wrong (later) day.
func TestTruncateDayNormalizesANonUTCClockToTheUTCDate(t *testing.T) {
	sofia, err := time.LoadLocation("Europe/Sofia")
	if err != nil {
		t.Skipf("no tzdata: %v", err)
	}
	// 2026-09-28 00:30 in Sofia (UTC+3) is 2026-09-27 21:30 UTC: still the
	// previous UTC calendar day.
	local := time.Date(2026, 9, 28, 0, 30, 0, 0, sofia)

	got := truncateDay(local)
	want := time.Date(2026, 9, 27, 0, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Errorf("truncateDay(%v) = %v, want %v", local, got, want)
	}
	if got.Location() != time.UTC {
		t.Errorf("truncateDay result location = %v, want UTC", got.Location())
	}
}
