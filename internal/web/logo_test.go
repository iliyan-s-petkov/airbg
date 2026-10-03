package web

import (
	"os"
	"strings"
	"testing"
)

// The README opens with the mascot, not the old favicon dot.
func TestReadmeShowsTheMascot(t *testing.T) {
	b, err := os.ReadFile("../../README.md")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(b), `src="internal/web/static/kanarche-mascot.svg"`) {
		t.Error("README does not reference the mascot SVG")
	}
	if _, err := os.Stat("static/kanarche-mascot.svg"); err != nil {
		t.Error(err)
	}
}

// The favicon and mascot files are static: only the mascot may animate.
func TestFaviconIsStaticAndMascotAnimates(t *testing.T) {
	fav, err := os.ReadFile("static/favicon.svg")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(fav), "animation") || strings.Contains(string(fav), "<animate") {
		t.Error("favicon.svg must not animate")
	}
	m, _ := os.ReadFile("static/kanarche-mascot.svg")
	if !strings.Contains(string(m), "prefers-reduced-motion") {
		t.Error("mascot must honour prefers-reduced-motion")
	}
}
