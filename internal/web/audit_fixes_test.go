package web_test

import (
	"net/http"
	"regexp"
	"strings"
	"testing"
)

var titleRe = regexp.MustCompile(`<title>([^<]*)</title>`)

// S01: the 404 carries the same brand suffix as every other page, no canonical
// and no hreflang alternates, and still answers 404.
func TestNotFoundPageUsesSiteBrandAndNoAlternates(t *testing.T) {
	rr := renderer(t, fixture(t))
	for _, path := range []string{"/area/atlantis", "/en/area/atlantis", "/nonexistent"} {
		rec := fetch(t, rr, path)
		if rec.Code != http.StatusNotFound {
			t.Errorf("%s: status = %d, want 404", path, rec.Code)
		}
		body := rec.Body.String()
		m := titleRe.FindStringSubmatch(body)
		if m == nil {
			t.Fatalf("%s: no <title>", path)
		}
		if !strings.HasSuffix(m[1], " | airbg.org") {
			t.Errorf("%s: title %q does not end with the site brand", path, m[1])
		}
		for _, unwanted := range []string{`rel="canonical"`, `rel="alternate"`} {
			if strings.Contains(body, unwanted) {
				t.Errorf("%s: the 404 advertises %s", path, unwanted)
			}
		}
	}
}

// The embed's title uses the same brand as the rest of the site.
func TestEmbedTitleUsesSiteBrand(t *testing.T) {
	body := framed(t, renderer(t, fixture(t)), "/embed").Body.String()
	if m := titleRe.FindStringSubmatch(body); m == nil || m[1] != "airbg.org" {
		t.Errorf("embed title = %v, want airbg.org", m)
	}
}

// S02: the head names the default-language URL as x-default, as the sitemap does.
func TestHeadCarriesXDefaultPointingAtTheDefaultLanguage(t *testing.T) {
	rr := renderer(t, fixture(t))
	cases := map[string]string{
		"/":              "https://airbg.org/",
		"/en/":           "https://airbg.org/",
		"/area/sofia":    "https://airbg.org/area/sofia",
		"/en/area/sofia": "https://airbg.org/area/sofia",
		"/en/about":      "https://airbg.org/about",
	}
	for path, want := range cases {
		body := fetch(t, rr, path).Body.String()
		tag := `<link rel="alternate" hreflang="x-default" href="` + want + `">`
		if !strings.Contains(body, tag) {
			t.Errorf("%s: head is missing %s", path, tag)
		}
	}
}

// I01: every map island hands MapLibre the strings it would otherwise show in
// English, from the catalogue of the page's language.
func TestMapIslandCarriesMapLibreStrings(t *testing.T) {
	rr := renderer(t, fixture(t))
	cases := []struct {
		path, title, toggle string
		framed              bool
	}{
		{"/", "Карта на качеството на въздуха", "Показване на източниците", false},
		{"/en/", "Air quality map", "Toggle attribution", false},
		{"/area/sofia", "Карта на качеството на въздуха", "Показване на източниците", false},
		{"/embed", "Карта на качеството на въздуха", "Показване на източниците", true},
	}
	for _, c := range cases {
		var body string
		if c.framed {
			body = framed(t, rr, c.path).Body.String()
		} else {
			body = fetch(t, rr, c.path).Body.String()
		}
		for _, want := range []string{
			`data-t-map-title="` + c.title + `"`,
			`data-t-attribution-toggle="` + c.toggle + `"`,
		} {
			if !strings.Contains(body, want) {
				t.Errorf("%s: missing %s", c.path, want)
			}
		}
	}
}

// A03: the embed snippet scrolls sideways, so it has to be reachable and named.
func TestAboutEmbedCodeIsKeyboardScrollable(t *testing.T) {
	rr := renderer(t, fixture(t))
	for path, label := range map[string]string{"/about": "Код за вграждане", "/en/about": "Embed code"} {
		body := fetch(t, rr, path).Body.String()
		want := `<pre class="about-code" dir="ltr" tabindex="0" role="region" aria-label="` + label + `">`
		if !strings.Contains(body, want) {
			t.Errorf("%s: embed <pre> is not focusable and named; want %s", path, want)
		}
	}
}

// S03: the home page keeps the product H1 and adds a visible keyword H2 under it.
func TestHomeHeadingPairsProductH1WithKeywordH2(t *testing.T) {
	rr := renderer(t, fixture(t))
	cases := map[string][2]string{
		"/":    {"Моят въздух", "Качество на въздуха в България"},
		"/en/": {"My Air", "Air quality in Bulgaria"},
	}
	for path, want := range cases {
		body := fetch(t, rr, path).Body.String()
		h1 := `<h1 class="t-title">` + want[0] + `</h1>`
		h2 := `<h2 class="t-sub">` + want[1] + `</h2>`
		i, j := strings.Index(body, h1), strings.Index(body, h2)
		if i < 0 || j < 0 || j < i {
			t.Errorf("%s: want %s followed by %s (h1 at %d, h2 at %d)", path, h1, h2, i, j)
		}
	}
}

// U08: About and GitHub are hidden from the phone header, so the language menu carries them.
func TestLanguageMenuCarriesAboutAndSourceLinks(t *testing.T) {
	rr := renderer(t, fixture(t))
	cases := map[string]string{"/": `href="/about"`, "/en/": `href="/en/about"`}
	for path, about := range cases {
		body := fetch(t, rr, path).Body.String()
		start := strings.Index(body, `<ul class="langpick__list">`)
		if start < 0 {
			t.Fatalf("%s: no language list", path)
		}
		list := body[start : start+strings.Index(body[start:], "</ul>")]
		for _, want := range []string{about, `href="https://github.com/iliyan-s-petkov/airbg"`, `rel="noopener noreferrer"`} {
			if !strings.Contains(list, want) {
				t.Errorf("%s: language menu is missing %s", path, want)
			}
		}
	}
}
