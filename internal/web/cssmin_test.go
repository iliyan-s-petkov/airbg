package web

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMinifyCSS_StripsComments(t *testing.T) {
	in := []byte("/* a design note about why this rule exists */\n.a { color: red; }\n")
	out := string(minifyCSS(in))
	if strings.Contains(out, "design note") {
		t.Fatalf("comment survived minification: %q", out)
	}
	if !strings.Contains(out, ".a") || !strings.Contains(out, "color: red") {
		t.Fatalf("minification pruned a rule, not just a comment: %q", out)
	}
}

func TestMinifyCSS_CollapsesWhitespaceAndBlankLines(t *testing.T) {
	in := []byte(".a {\n  color: red;\n\n\n  margin: 0;\n}\n\n.b { color: blue; }\n")
	out := string(minifyCSS(in))
	if strings.Contains(out, "\n\n") {
		t.Fatalf("blank-line run was not collapsed: %q", out)
	}
	if !strings.Contains(out, ".a") || !strings.Contains(out, ".b") {
		t.Fatalf("a selector went missing: %q", out)
	}
}

// A CSS comment token inside a quoted string is content, not a comment, and
// must survive untouched — the naive "strip anything between /* and */" would
// corrupt this.
func TestMinifyCSS_LeavesCommentLookalikeInsideStringUntouched(t *testing.T) {
	in := []byte(`.a::before { content: "/* not a comment */"; }`)
	out := string(minifyCSS(in))
	if !strings.Contains(out, `/* not a comment */`) {
		t.Fatalf("string content was mangled by comment stripping: %q", out)
	}
}

// The descendant combinator's space is significant (".a .b" selects a .b
// inside an .a; ".a.b" selects one element with both classes) — collapsing
// whitespace to a single space must never collapse it to nothing.
func TestMinifyCSS_PreservesDescendantCombinatorSpace(t *testing.T) {
	in := []byte(".a   .b { color: red; }")
	out := string(minifyCSS(in))
	if !strings.Contains(out, ".a .b") {
		t.Fatalf("descendant combinator space was lost, changing selector meaning: %q", out)
	}
}

func TestMinifyCSS_HandlesEscapedQuoteInsideString(t *testing.T) {
	in := []byte(`.a::before { content: "she said \"hi\""; } .b { color: red; }`)
	out := string(minifyCSS(in))
	if !strings.Contains(out, ".b") {
		t.Fatalf("an escaped quote inside a string ended the string early and ate the next rule: %q", out)
	}
}

func TestMinifyCSS_ShrinksTheRealAppCSS(t *testing.T) {
	raw, err := staticFS.ReadFile("static/app.css")
	if err != nil {
		t.Fatalf("read static/app.css: %v", err)
	}
	min := minifyCSS(raw)
	if len(min) >= len(raw) {
		t.Fatalf("minified app.css (%d bytes) is not smaller than raw (%d bytes)", len(min), len(raw))
	}
	t.Logf("app.css: %d bytes raw -> %d bytes minified (%.0f%% smaller)", len(raw), len(min), 100*(1-float64(len(min))/float64(len(raw))))
	// A handful of real, known selectors must still be present: minification
	// must not have pruned a rule.
	for _, want := range []string{".footer p", ".langpick__opt", "box-sizing: border-box"} {
		if !strings.Contains(string(min), want) {
			t.Fatalf("minified app.css is missing %q — a rule was pruned, not just whitespace/comments", want)
		}
	}
}

func TestLoadStaticAssets_HashesTheMinifiedBytesNotTheSource(t *testing.T) {
	sa := loadAssetsFromNothingHelper(t)
	content, ok := sa.Content("app.css")
	if !ok {
		t.Fatal("app.css should have a minified content override")
	}
	raw, err := staticFS.ReadFile("static/app.css")
	if err != nil {
		t.Fatalf("read static/app.css: %v", err)
	}
	if string(content) == string(raw) {
		t.Fatal("Content(app.css) equals the raw source — minification is not happening")
	}

	sum, ok := sa.version("app.css")
	if !ok {
		t.Fatal("app.css should be versioned")
	}
	if sa.URL("app.css") != "/static/app.css?v="+sum {
		t.Fatalf("unexpected URL: %s", sa.URL("app.css"))
	}
}

func loadAssetsFromNothingHelper(t *testing.T) StaticAssets {
	t.Helper()
	return LoadStaticAssets()
}

func TestServeStaticFiles_ServesMinifiedCSSWithCorrectHeaders(t *testing.T) {
	sa := LoadStaticAssets()
	h := serveStaticFiles(sa, staticFS)

	req := httptest.NewRequest("GET", "/static/app.css", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != 200 {
		t.Fatalf("status = %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "text/css; charset=utf-8" {
		t.Fatalf("Content-Type = %q", ct)
	}
	minified, _ := sa.Content("app.css")
	if rec.Body.String() != string(minified) {
		t.Fatal("response body does not match the minified content the hash was computed over")
	}
	raw, _ := staticFS.ReadFile("static/app.css")
	if rec.Body.Len() >= len(raw) {
		t.Fatalf("served app.css (%d bytes) is not smaller than the raw source (%d bytes)", rec.Body.Len(), len(raw))
	}
}

func TestServeStaticFiles_PassesThroughNonCSSUnmodified(t *testing.T) {
	sa := LoadStaticAssets()
	h := serveStaticFiles(sa, staticFS)

	req := httptest.NewRequest("GET", "/static/theme-init.js", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	raw, err := staticFS.ReadFile("static/theme-init.js")
	if err != nil {
		t.Fatalf("read static/theme-init.js: %v", err)
	}
	if rec.Code != 200 {
		t.Fatalf("status = %d", rec.Code)
	}
	if rec.Body.String() != string(raw) {
		t.Fatal("theme-init.js was modified — only CSS should be rewritten")
	}
}
