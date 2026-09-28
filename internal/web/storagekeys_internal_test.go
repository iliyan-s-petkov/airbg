package web

import (
	"testing"

	"airbg.org/internal/i18n"
)

// TestStorageKeysHaveACataloguePurpose is OpenProject #585's guard: a key
// added to storage-keys.json with no matching privacy.storage.<key> entry in
// both catalogues must fail this test, not ship as a blank row on the privacy
// section.
func TestStorageKeysHaveACataloguePurpose(t *testing.T) {
	keys := loadStorageKeys()
	if len(keys) == 0 {
		t.Fatal("loadStorageKeys returned no keys — storage-keys.json failed to load or parse")
	}

	cat, err := i18n.Load()
	if err != nil {
		t.Fatalf("i18n.Load: %v", err)
	}

	for _, k := range keys {
		wantKey := storagePurposeKey(k)
		for _, lang := range cat.Languages() {
			if !cat.Has(lang, wantKey) {
				t.Errorf("storage key %q has no %q entry in the %q catalogue", k, wantKey, lang)
			}
			if got := cat.T(lang, wantKey); got == "" {
				t.Errorf("storage key %q purpose is empty in %q", k, lang)
			}
		}
	}
}

// TestStorageKeysCSVMatchesKeys pins the island's data-keys contract: the CSV
// the template writes to the "clear my settings" button is exactly the
// allow-list, comma-joined, in file order.
func TestStorageKeysCSVMatchesKeys(t *testing.T) {
	keys := loadStorageKeys()
	got := storageKeysCSV()
	want := ""
	for i, k := range keys {
		if i > 0 {
			want += ","
		}
		want += k
	}
	if got != want {
		t.Errorf("storageKeysCSV() = %q, want %q", got, want)
	}
}
