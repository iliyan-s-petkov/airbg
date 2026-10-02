package config

import "testing"

func TestCollectorUserAgentIsBuiltFromBaseURL(t *testing.T) {
	cases := map[string]string{
		"https://airbg.org":     "airbg.org collector (+https://airbg.org)",
		"https://airbg.org/":    "airbg.org collector (+https://airbg.org)",
		"https://kanarche.eu":   "kanarche.eu collector (+https://kanarche.eu)",
		"http://localhost:8080": "localhost:8080 collector (+http://localhost:8080)",
	}
	for base, want := range cases {
		if got := CollectorUserAgent(base); got != want {
			t.Errorf("CollectorUserAgent(%q) = %q, want %q", base, got, want)
		}
	}
}

func TestResolveGivesEveryCollectorTheSameUserAgent(t *testing.T) {
	r, err := readRaw("../../airbg.yaml")
	if err != nil {
		t.Fatal(err)
	}
	base := "https://example.test"
	r.Listen.BaseURL = &base
	cfg := resolve(r)
	want := "example.test collector (+https://example.test)"
	for name, got := range map[string]string{
		"Upstream": cfg.Upstream.UserAgent,
		"Wind":     cfg.Wind.UserAgent,
		"EEA":      cfg.EEA.UserAgent,
	} {
		if got != want {
			t.Errorf("%s.UserAgent = %q, want %q", name, got, want)
		}
	}
}
