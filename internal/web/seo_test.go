package web_test

import (
	"encoding/xml"
	"net/http"
	"strings"
	"testing"
)

// TestRobotsTxt pins the body byte for byte, including the Sitemap line built
// from testConfig's BaseURL (https://airbg.org) — not a hardcoded host.
func TestRobotsTxt(t *testing.T) {
	rec := fetch(t, renderer(t, fixture(t)), "/robots.txt")

	if rec.Code != http.StatusOK {
		t.Fatalf("GET /robots.txt = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/plain") {
		t.Errorf("Content-Type = %q, want text/plain", ct)
	}

	want := "User-agent: *\n" +
		"Allow: /\n" +
		"Disallow: /api/\n" +
		"Sitemap: https://airbg.org/sitemap.xml\n"
	if got := rec.Body.String(); got != want {
		t.Errorf("robots.txt = %q, want %q", got, want)
	}
}

// sitemapXML is the shape this package's tests decode /sitemap.xml into.
type sitemapXML struct {
	XMLName xml.Name `xml:"urlset"`
	Xmlns   string   `xml:"xmlns,attr"`
	URLs    []struct {
		Loc     string `xml:"loc"`
		LastMod string `xml:"lastmod"`
		Links   []struct {
			Rel      string `xml:"rel,attr"`
			Hreflang string `xml:"hreflang,attr"`
			Href     string `xml:"href,attr"`
		} `xml:"link"`
	} `xml:"url"`
}

func fetchSitemap(t *testing.T) sitemapXML {
	t.Helper()
	rec := fetch(t, renderer(t, fixture(t)), "/sitemap.xml")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /sitemap.xml = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/xml") {
		t.Errorf("Content-Type = %q, want application/xml", ct)
	}

	var doc sitemapXML
	if err := xml.Unmarshal(rec.Body.Bytes(), &doc); err != nil {
		t.Fatalf("sitemap.xml did not parse as XML: %v\n%s", err, rec.Body.String())
	}
	return doc
}

// TestSitemapIsWellFormedXML: encoding/xml.Unmarshal above already proves this
// for every other test in this file; this one also pins the namespace, which a
// well-formedness check alone would not catch.
func TestSitemapIsWellFormedXML(t *testing.T) {
	doc := fetchSitemap(t)
	if doc.Xmlns != "http://www.sitemaps.org/schemas/sitemap/0.9" {
		t.Errorf("urlset xmlns = %q, want the sitemap protocol namespace", doc.Xmlns)
	}
}

// TestSitemapContainsEveryArea: both fixture areas (sofia, vidin) must appear,
// plus the three static pages. A dropped area is invisible in the rendered
// site and only shows up here.
func TestSitemapContainsEveryArea(t *testing.T) {
	doc := fetchSitemap(t)

	locs := make(map[string]bool, len(doc.URLs))
	for _, u := range doc.URLs {
		locs[u.Loc] = true
	}

	for _, want := range []string{
		"https://airbg.org/",
		"https://airbg.org/areas",
		"https://airbg.org/about-the-data",
		"https://airbg.org/area/sofia",
		"https://airbg.org/area/vidin",
	} {
		if !locs[want] {
			t.Errorf("sitemap is missing %q", want)
		}
	}
	if len(doc.URLs) != 5 {
		t.Errorf("sitemap has %d <url> entries, want 5: %+v", len(doc.URLs), doc.URLs)
	}
}

// TestSitemapHasReciprocalAlternatesAndXDefault: every URL must carry an
// hreflang link for every served language, plus x-default, and the bg/en
// hrefs must be the SAME page in each language (reciprocal) — not just present
// somewhere on the page.
func TestSitemapHasReciprocalAlternatesAndXDefault(t *testing.T) {
	doc := fetchSitemap(t)

	for _, u := range doc.URLs {
		byLang := map[string]string{}
		for _, l := range u.Links {
			if l.Rel != "alternate" {
				t.Errorf("%s: link rel = %q, want alternate", u.Loc, l.Rel)
			}
			byLang[l.Hreflang] = l.Href
		}

		bg, ok := byLang["bg"]
		if !ok {
			t.Errorf("%s: no bg alternate", u.Loc)
		}
		en, ok := byLang["en"]
		if !ok {
			t.Errorf("%s: no en alternate", u.Loc)
		}
		xdefault, ok := byLang["x-default"]
		if !ok {
			t.Errorf("%s: no x-default alternate", u.Loc)
		}
		if xdefault != bg {
			t.Errorf("%s: x-default = %q, want it to match the bg alternate %q", u.Loc, xdefault, bg)
		}
		if bg != u.Loc {
			t.Errorf("%s: bg alternate = %q, want it to equal loc (bg is the default, unprefixed language)", u.Loc, bg)
		}
		if !strings.HasPrefix(en, "https://airbg.org/en/") && en != "https://airbg.org/en/" {
			t.Errorf("%s: en alternate = %q, want it under /en/", u.Loc, en)
		}
	}
}

// TestSitemapExcludesEmbedAndAPI: neither surface is meant for search results.
func TestSitemapExcludesEmbedAndAPI(t *testing.T) {
	rec := fetch(t, renderer(t, fixture(t)), "/sitemap.xml")
	body := rec.Body.String()
	if strings.Contains(body, "/embed") {
		t.Error("sitemap.xml references /embed, which is noindex")
	}
	if strings.Contains(body, "/api/") {
		t.Error("sitemap.xml references /api/, which robots.txt disallows")
	}
}

// TestSitemapCarriesLastMod: every entry needs a <lastmod> so a crawler can
// tell a stale area page from a fresh one.
func TestSitemapCarriesLastMod(t *testing.T) {
	doc := fetchSitemap(t)
	for _, u := range doc.URLs {
		if u.LastMod != "2026-08-09" {
			t.Errorf("%s: lastmod = %q, want 2026-08-09 (the fixture's GeneratedAt)", u.Loc, u.LastMod)
		}
	}
}
