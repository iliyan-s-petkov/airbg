package quality

import (
	"math"
	"sync"
)

// exemptStuckValues are readings that legitimately repeat forever. Flagging them
// would mark healthy sensors as broken (spec §6.2).
var exemptStuckValues = map[string][]float64{
	"humidity": {0, 100},
	"P1":       {0},
	"P2":       {0},
}

// seriesState holds the most recent `depth` values of one series, oldest first.
type seriesState struct {
	vals []float64
}

// historyMaxTrackedSensors bounds tracked sensors against an unbounded leak;
// see README.md#historys-tracked-sensor-cap. A var so tests can shrink it.
var historyMaxTrackedSensors = 200_000

// SetHistoryMaxTrackedSensorsForTesting overrides historyMaxTrackedSensors
// and returns a func that restores the previous value.
func SetHistoryMaxTrackedSensorsForTesting(n int) (restore func()) {
	prev := historyMaxTrackedSensors
	historyMaxTrackedSensors = n
	return func() { historyMaxTrackedSensors = prev }
}

// History keeps the last `depth` readings per (sensor, metric). It starts
// empty; the store seeds it from the reading table at startup — see
// README.md#historys-tracked-sensor-cap.
type History struct {
	mu    sync.Mutex
	depth int
	state map[int64]map[string]*seriesState
	// order is first-seen order; eviction below is FIFO, not LRU — see
	// README.md#historys-tracked-sensor-cap.
	order []int64
}

func NewHistory(depth int) *History {
	return &History{
		depth: depth,
		state: make(map[int64]map[string]*seriesState),
	}
}

func (h *History) Observe(sensorID int64, metric string, value float64) {
	h.mu.Lock()
	defer h.mu.Unlock()

	byMetric, ok := h.state[sensorID]
	if !ok {
		byMetric = make(map[string]*seriesState)
		h.state[sensorID] = byMetric
		h.order = append(h.order, sensorID)
		for len(h.order) > historyMaxTrackedSensors {
			evict := h.order[0]
			h.order = h.order[1:]
			delete(h.state, evict)
		}
	}
	s, ok := byMetric[metric]
	if !ok {
		s = &seriesState{}
		byMetric[metric] = s
	}
	s.vals = append(s.vals, value)
	if len(s.vals) > h.depth {
		s.vals = s.vals[len(s.vals)-h.depth:]
	}
}

// IsStuck reports a full window of exactly equal values, except values that
// legitimately repeat.
func (h *History) IsStuck(sensorID int64, metric string) bool {
	v, ok := h.Constant(sensorID, metric)
	if !ok {
		return false
	}
	for _, exempt := range exemptStuckValues[metric] {
		if v == exempt {
			return false
		}
	}
	return true
}

// Constant returns the value and true when the full window is exactly one value.
func (h *History) Constant(sensorID int64, metric string) (float64, bool) {
	return h.window(sensorID, metric, 0)
}

// Frozen reports a full window whose spread (max - min) is within tolerance.
func (h *History) Frozen(sensorID int64, metric string, tolerance float64) bool {
	_, ok := h.window(sensorID, metric, tolerance)
	return ok
}

// window returns the latest value and true if the window is full and its spread
// is within tolerance.
func (h *History) window(sensorID int64, metric string, tolerance float64) (float64, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()

	s, ok := h.state[sensorID][metric]
	if !ok || len(s.vals) < h.depth {
		return 0, false
	}
	lo, hi := s.vals[0], s.vals[0]
	for _, v := range s.vals {
		lo, hi = math.Min(lo, v), math.Max(hi, v)
	}
	// The epsilon absorbs float error: 20.01-20.00 is 0.0100000000000016.
	return s.vals[len(s.vals)-1], hi-lo <= tolerance+1e-9
}
