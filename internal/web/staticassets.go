package web

import (
	"crypto/sha256"
	"encoding/hex"
	"io/fs"
	"net/http"
	"path"
	"strconv"
	"strings"
)

// staticVersionParam is the query key the templates stamp and the handler reads.
const staticVersionParam = "v"

// StaticAssets content-hashes the hand-written files under /static/.
//
// Their names are stable by necessity — app.css is referenced by hand and
// theme-init.js has to run before paint — so a deploy used to leave a visitor
// on the previous copy for the whole of the static TTL. The hash goes in the
// URL instead, which changes the cache key on every edit.
type StaticAssets struct {
	versions map[string]string // "app.css" -> hex digest prefix
	content  map[string][]byte // "app.css" -> minified bytes actually served
}

// LoadStaticAssets hashes every embedded file under static/.
//
// CSS files are minified once here (comments and whitespace only — see
// cssmin.go; no rule is pruned) and the hash is taken over the minified bytes,
// not the source: the hash is a cache-busting token for what the browser
// actually receives, so it must change whenever that does, even if a future
// change to the minifier itself is the only thing that moved.
//
// A read failure leaves that file unversioned rather than failing the process:
// an unversioned URL still resolves, it just falls back to revalidating.
func LoadStaticAssets() StaticAssets {
	sa := StaticAssets{versions: make(map[string]string), content: make(map[string][]byte)}
	_ = fs.WalkDir(staticFS, "static", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		raw, err := fs.ReadFile(staticFS, p)
		if err != nil {
			return nil
		}
		name := strings.TrimPrefix(p, "static/")
		served := raw
		if strings.HasSuffix(name, ".css") {
			served = minifyCSS(raw)
			sa.content[name] = served
		}
		sum := sha256.Sum256(served)
		sa.versions[name] = hex.EncodeToString(sum[:])[:12]
		return nil
	})
	return sa
}

// Content returns the bytes actually served for name, when they differ from
// the embedded source (currently: minified CSS). The second return is false
// for anything the raw file server should keep handling unmodified.
func (sa StaticAssets) Content(name string) ([]byte, bool) {
	b, ok := sa.content[name]
	return b, ok
}

// URL is the served path for a static file, stamped with its content hash.
func (sa StaticAssets) URL(name string) string {
	if v, ok := sa.versions[name]; ok {
		return "/static/" + name + "?" + staticVersionParam + "=" + v
	}
	return "/static/" + name
}

// version reports the current hash of name, and whether it is known.
func (sa StaticAssets) version(name string) (string, bool) {
	v, ok := sa.versions[name]
	return v, ok
}

// serveStaticFiles serves the embedded static/ tree, substituting sa's
// minified bytes for any CSS file rather than the raw embedded ones. Anything
// sa has no override for (JS, SVG, the theme-init.js classic script) falls
// straight through to the ordinary embedded-FS file server, unmodified.
func serveStaticFiles(sa StaticAssets, fsys fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(fsys))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/static/")
		if content, ok := sa.Content(name); ok {
			w.Header().Set("Content-Type", "text/css; charset=utf-8")
			w.Header().Set("Content-Length", strconv.Itoa(len(content)))
			if r.Method != http.MethodHead {
				w.Write(content)
			}
			return
		}
		fileServer.ServeHTTP(w, r)
	})
}

// staticAssetCacheControl marks a request immutable only when it carries the
// hash the file currently has.
//
// Both halves matter. A stamped URL is a new URL on every edit, so a year is
// safe and no revalidation is needed. An unstamped or stale one — a bookmark,
// a link someone pasted, a page rendered by the previous build — must keep
// revalidating, or that URL pins the wrong bytes for a year.
func staticAssetCacheControl(next http.Handler, sa StaticAssets) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		value := shortRevalidateCacheControl
		if want, ok := sa.version(strings.TrimPrefix(path.Clean(r.URL.Path), "/static/")); ok {
			if r.URL.Query().Get(staticVersionParam) == want {
				value = immutableCacheControl
			}
		}
		w.Header().Set("Cache-Control", value)
		next.ServeHTTP(w, r)
	})
}
