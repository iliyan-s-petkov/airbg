package cloudflare

import (
	"encoding/json"
	"fmt"
	"io"
	"time"
)

// seedRow is the JSON shape of one entry in a seed file: [{date,uniques,
// requests,pageViews}]. camelCase to match what a Cloudflare-flavoured export
// naturally uses, unlike the snake_case the rest of this project's JSON uses.
type seedRow struct {
	Date      string `json:"date"`
	Uniques   int    `json:"uniques"`
	Requests  int64  `json:"requests"`
	PageViews int64  `json:"pageViews"`
}

// ParseSeedFile reads a JSON array of daily totals for the "seed the table
// from a snapshot" path (OpenProject #591, requirement 3). It only parses;
// the caller decides whether and how to write the result.
func ParseSeedFile(r io.Reader) ([]DailyPoint, error) {
	var rows []seedRow
	if err := json.NewDecoder(r).Decode(&rows); err != nil {
		return nil, fmt.Errorf("cloudflare: parse seed file: %w", err)
	}
	points := make([]DailyPoint, 0, len(rows))
	for _, row := range rows {
		d, err := time.Parse(dateFormat, row.Date)
		if err != nil {
			return nil, fmt.Errorf("cloudflare: parse seed file: row %q: bad date: %w", row.Date, err)
		}
		points = append(points, DailyPoint{
			Date:      d.UTC(),
			Uniques:   row.Uniques,
			Requests:  row.Requests,
			PageViews: row.PageViews,
		})
	}
	return points, nil
}
