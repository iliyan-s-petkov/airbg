package snapshot

// The wind lattice is the met model's own 0.25 degree grid clipped to Bulgaria
// plus a margin, so every served vector is a native model cell. See
// docs/wind-overlay.md.
const (
	WindGridDeg = 0.25
	// WindGridKM is the nominal spacing: 0.25 degrees is 27.8 km of latitude and
	// about 20 km of longitude at 43N.
	WindGridKM = 25.0

	windMinLonIdx, windMaxLonIdx = 87, 117  // 21.75E to 29.25E
	windMinLatIdx, windMaxLatIdx = 163, 179 // 40.75N to 44.75N
)

// WindCell is one lattice point. Q and R are the longitude and latitude in
// units of WindGridDeg, the identity the forecast rows are keyed by.
type WindCell struct {
	Q, R     int
	Lon, Lat float64
}

// WindLattice returns the full lattice, ordered by Q then R. It does not depend
// on which sensors exist.
func WindLattice() []WindCell {
	cells := make([]WindCell, 0, (windMaxLonIdx-windMinLonIdx+1)*(windMaxLatIdx-windMinLatIdx+1))
	for q := windMinLonIdx; q <= windMaxLonIdx; q++ {
		for r := windMinLatIdx; r <= windMaxLatIdx; r++ {
			lon, lat := windCentre(q, r)
			cells = append(cells, WindCell{Q: q, R: r, Lon: lon, Lat: lat})
		}
	}
	return cells
}

func windCentre(q, r int) (lon, lat float64) {
	return round4(float64(q) * WindGridDeg), round4(float64(r) * WindGridDeg)
}
