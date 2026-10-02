package snapshot

import (
	"encoding/json"
	"testing"
	"time"
)

// The flags column carries only unusable per-metric flags, one entry per
// sensor, so a station with a dead climate chip is not faulty for PM.
func TestSensorPayloadCarriesTheFlagsColumn(t *testing.T) {
	sensors := pair()
	sensors[1].Flags = map[string]string{"temperature": "out_of_range", "humidity": "out_of_range"}

	body, err := json.Marshal(sensorPayloadFrom(time.Unix(1_800_000_000, 0).UTC(), sensors))
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var got struct {
		Sensors struct {
			ID    []int64             `json:"id"`
			Flags []map[string]string `json:"flags"`
		} `json:"sensors"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("unmarshal: %v\n%s", err, body)
	}
	if len(got.Sensors.Flags) != len(got.Sensors.ID) {
		t.Fatalf("flags has %d entries, id has %d", len(got.Sensors.Flags), len(got.Sensors.ID))
	}
	if len(got.Sensors.Flags[0]) != 0 {
		t.Errorf("healthy device flags = %v, want none", got.Sensors.Flags[0])
	}
	if got.Sensors.Flags[1]["temperature"] != "out_of_range" || got.Sensors.Flags[1]["humidity"] != "out_of_range" {
		t.Errorf("climate device flags = %v", got.Sensors.Flags[1])
	}
}
