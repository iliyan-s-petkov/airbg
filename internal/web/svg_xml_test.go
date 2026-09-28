package web

import (
	"encoding/xml"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"testing"
)

// Browsers refuse to decode a malformed SVG used as <img>, so every static SVG
// must be well-formed XML. encoding/xml rejects "--" inside comments itself.
func TestStaticSVGsAreWellFormedXML(t *testing.T) {
	var paths []string
	err := filepath.WalkDir("static", func(path string, d fs.DirEntry, err error) error {
		if err == nil && !d.IsDir() && filepath.Ext(path) == ".svg" {
			paths = append(paths, path)
		}
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(paths) == 0 {
		t.Fatal("no SVGs found under static/; the test would pass vacuously")
	}
	for _, path := range paths {
		if err := decodeToEOF(path); err != nil {
			t.Errorf("%s: %v", path, err)
		}
	}
}

func decodeToEOF(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	dec := xml.NewDecoder(f)
	for {
		if _, err := dec.Token(); err == io.EOF {
			return nil
		} else if err != nil {
			return err
		}
	}
}
