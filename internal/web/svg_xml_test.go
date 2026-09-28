package web

import (
	"encoding/xml"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestStaticSVGsAreWellFormedXML decodes every *.svg under static/ token by
// token to EOF. encoding/xml does not reject "--" inside a comment (XML
// forbids it), so each comment's text is also checked by hand.
func TestStaticSVGsAreWellFormedXML(t *testing.T) {
	err := filepath.WalkDir("static", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || !strings.HasSuffix(path, ".svg") {
			return nil
		}
		t.Run(path, func(t *testing.T) {
			f, err := os.Open(path)
			if err != nil {
				t.Fatal(err)
			}
			defer f.Close()

			dec := xml.NewDecoder(f)
			for {
				tok, err := dec.Token()
				if err == io.EOF {
					break
				}
				if err != nil {
					t.Fatalf("%s: %v", path, err)
				}
				if c, ok := tok.(xml.Comment); ok {
					if strings.Contains(string(c), "--") {
						t.Fatalf("%s: comment contains \"--\", which XML forbids: %q", path, string(c))
					}
				}
			}
		})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
