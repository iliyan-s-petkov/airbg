package upstream

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFetchSendsTheConfiguredUserAgent(t *testing.T) {
	var got string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Get("User-Agent")
		_, _ = w.Write([]byte("[]"))
	}))
	defer srv.Close()

	cfg := testUpstreamConfig(srv.URL)
	cfg.UserAgent = "kanarche.eu collector (+https://kanarche.eu)"
	if _, err := New(cfg).Fetch(context.Background()); err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if got != cfg.UserAgent {
		t.Errorf("User-Agent = %q, want %q", got, cfg.UserAgent)
	}
}
