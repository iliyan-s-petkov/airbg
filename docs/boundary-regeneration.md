# Regenerating the boundary data

`data/boundaries/` holds four GeoJSON files that `airbg import-areas` loads into
the `area` table. They are treated as a **one-time artefact**, not a build
output: no script regenerates them, and nothing in CI rebuilds them. This
document is what makes them reproducible anyway.

Read it before regenerating anything. The transformation rules below — the slug
rule above all — live only here and in the committed files. A regeneration that
silently drops one produces a file that imports cleanly and breaks every inbound
URL.

`data/boundaries/README.md` covers what the files *are* (sources, licences,
counts, per-city geometry caveats). This covers how to *rebuild* them.

## Why regenerating is riskier than it looks

Slugs appear in URLs: `/oblast/{slug}`, `/area/{slug}`. Changing one breaks
every inbound link and every search-engine result for that page. Treat a shipped
slug as permanent.

`area.slug` is the `area` table's `PRIMARY KEY`, shared globally across every
`kind`, and `area.Import` upserts on it (`ON CONFLICT (slug) DO UPDATE`). A
Bulgarian oblast and its capital city share a name, so both transliterate to the
same string: importing `oblasti.geojson` then `cities.geojson` once rewrote 26 of
28 oblast rows into city rows — same slug, so the second import overwrote the
first rather than inserting. `SELECT count(*) FROM area WHERE kind = 'oblast'`
dropped from 28 to 2, and every per-file feature count stayed correct throughout.

## The slug rule

Slugs are transliterated from `name_bg` (not `name_en`) using the Bulgarian
**Streamlined System** — the official 2009 transliteration — applied strictly
per character:

| | | | | | | | | | |
|---|---|---|---|---|---|---|---|---|---|
| а `a` | б `b` | в `v` | г `g` | д `d` | е `e` | ж `zh` | з `z` | и `i` | й `y` |
| к `k` | л `l` | м `m` | н `n` | о `o` | п `p` | р `r` | с `s` | т `t` | у `u` |
| ф `f` | х `h` | ц `ts` | ч `ch` | ш `sh` | щ `sht` | ъ `a` | ь `y` | ю `yu` | я `ya` |

Then: lowercase; spaces and hyphens become `-`.

Two rules on top of the table:

1. **The word-final `ия` → `ia` exception in the transliteration law is not
   applied.** This is why София is `sofiya`, not `sofia`. `bulgaria.geojson`'s
   `bulgaria` slug looks like the exception but is not produced by this rule at
   all — that file comes from Natural Earth with a hand-set slug.
2. **Every oblast slug carries a uniform `-oblast` suffix**
   (`varna-oblast`, `sofiya-grad-oblast`). Cities and Sofia districts keep the
   bare transliteration, because a city is what a reader searches for and the
   slug is what appears in its URL.

The suffix is uniform rather than applied only where a collision exists today.
A collision-driven rule breaks again the first time a new city is added whose
name matches an oblast that currently has no colliding city.

`name_en` is the conventional English exonym (`Sofia`, `Ruse`) and is display
copy only. Nothing keys on it.

**This rule is executable.** `internal/area/slug_rule_test.go` recomputes every
slug in all three OSM-derived files from that feature's own `name_bg` and fails
if the committed file disagrees, plus asserts the 80 slugs are globally
distinct. A regeneration that drops the `-oblast` suffix cannot be committed
green. Verified: all 79 OSM-derived slugs reproduce exactly from the table
above; there are no hand-edited exceptions to remember.

## Sources

### `bulgaria.geojson` — the national boundary

Natural Earth 1:10m Admin 0 – Countries, the feature with `ADM0_A3 = BGR`,
geometry unmodified. Public domain, so it is committed rather than fetched.
Properties are hand-set (`slug: bulgaria`, `iso_a2: BG`).

### `oblasti.geojson`, `cities.geojson`, `sofia-districts.geojson`

OpenStreetMap via the Overpass API (`overpass-api.de` or
`overpass.kumi.systems`), retrieved 2026-08-10. **Licence: ODbL 1.0** —
"© OpenStreetMap contributors" must appear in the site footer. That is a licence
obligation, not a courtesy.

The queries below are stated in the same terms `data/boundaries/README.md`
documents the data by. Bulgaria's OSM admin levels are **not uniform across
tiers**, which is the single most important thing to know before rerunning them.

**Oblasti — 28 features.** `boundary=administrative`, `admin_level=4`, inside
the `ISO3166-1=BG` area. One relation per oblast, matches exactly.

```overpassql
[out:json][timeout:180];
area["ISO3166-1"="BG"][admin_level=2]->.bg;
relation(area.bg)["boundary"="administrative"]["admin_level"="4"];
out geom;
```

**Cities — 27 features, not 28.** Sofia is the seat of both Sofia-grad and Sofia
Oblast, so 28 oblasti have only 27 distinct capitals. A 28th feature would mean
committing Sofia's polygon twice under two slugs.

Level differs per city and this is the part that cannot be automated blindly:

- 13 capitals have an `admin_level=8` city-proper boundary tagged `place=city`
  or `place=town`: Sofia, Ruse, Dobrich, Razgrad, Targovishte, Silistra, Shumen,
  Varna, Gabrovo, Veliko Tarnovo, Kyustendil, Burgas, Vidin.
- The other 14 have **no** settlement-level boundary in OSM, so their
  `admin_level=5` (`border_type=municipality`) boundary is used: Blagoevgrad,
  Vratsa, Kardzhali, Lovech, Montana, Pazardzhik, Pernik, Pleven, Plovdiv,
  Sliven, Smolyan, Haskovo, Stara Zagora, Yambol.

```overpassql
[out:json][timeout:180];
area["ISO3166-1"="BG"][admin_level=2]->.bg;
(
  relation(area.bg)["boundary"="administrative"]["admin_level"="8"]["name"="<capital>"];
  relation(area.bg)["boundary"="administrative"]["admin_level"="5"]["name"="<capital>"];
);
out geom;
```

Run per capital and take the `admin_level=8` result when one exists. If a rerun
finds an `admin_level=8` boundary for one of the 14, **that is a data
improvement, not a bug** — but it changes that city's polygon and therefore its
aggregate values, so make it a deliberate, separately reviewed commit and update
both the 13/14 split here and in `docs/known-limitations.md`.

**Sofia districts — 24 features.** `boundary=administrative`, `admin_level=6`,
inside the area named `Столична` (`admin_level=5`, the Stolichna municipality).
Not `admin_level=9`, which under `Столична` is a finer subdivision than the
district level.

```overpassql
[out:json][timeout:180];
area["name"="Столична"]["admin_level"="5"]->.sofia;
relation(area.sofia)["boundary"="administrative"]["admin_level"="6"];
out geom;
```

`out geom;` returns full outer-ring coordinates inline — no separate
`out body`/`out skel` pass is needed.

## Cleaning and simplification

Raw Overpass geometry is not importable as-is, and it is not yet a single
polygon either. `out geom;` on a relation returns one line geometry **per
member way**, not the assembled outer/inner ring: a typical oblast relation is
tagged together from dozens to hundreds of ways, each one a segment of the
boundary shared with a neighbouring relation. Handing those ways to PostGIS as
if each were already a ring — e.g. loading them individually and unioning the
result — produces a `MultiPolygon` with one sliver "part" per way: it parses,
it imports, `ST_IsValid` even holds, and its total area is a fraction of the
real place because only the ways happen to close on themselves that get
counted, while the rest trace the perimeter without ever enclosing anything.
This is what shipped for 21 of cities.geojson's 27 features (Plovdiv: 19 parts,
~6 points each, ~24 km² against a real ~102 km² municipality) — every
downstream check that only looked at parsed feature counts or `ST_IsValid`
passed, because both were true.

The member ways must be assembled into rings **before** cleaning. Run each
relation's collected member-way geometries through, in this order:

```sql
SELECT ST_CollectionExtract(
         ST_SimplifyPreserveTopology(
           ST_MakeValid(
             ST_BuildArea(
               ST_Collect(
                 ST_LineMerge(ST_Collect(member_way_geom))
               )
             )
           ),
           0.002),          -- roughly 200 m
         3)                 -- 3 = polygons only
       FROM relation_members
       GROUP BY relation_id
```

Each step earns its place:

- **`ST_Collect` + `ST_LineMerge` first.** Stitches the member ways back into
  contiguous closed rings. A relation's ways arrive in no particular order and
  a single ring is frequently split across several of them at each node where
  two neighbouring relations' boundaries meet; `ST_LineMerge` joins ways that
  share an endpoint into one linestring per ring.
- **`ST_BuildArea`** turns the merged, closed linestrings into the actual
  polygon(s) — outer rings become shells, rings nested inside them become
  holes. This is the step that was missing: without it, PostGIS has no way to
  know which of the many rings enclose area and which are holes, or that they
  belong to one polygon at all.
- **`ST_MakeValid` after assembly.** Several relations contain a spurious
  near-zero-length "outer" member way — an OSM digitisation artefact. Treated as
  its own ring it collapses into a degenerate line under simplification, turning
  the result into a `GeometryCollection` that `area.Import`'s `validateGeometry`
  rejects. Repairing before simplifying avoids hand-editing source rings.
- **`ST_SimplifyPreserveTopology`, not `ST_Simplify`.** Plain simplification can
  emit self-intersecting rings on its own.
- **`ST_CollectionExtract(..., 3)`** drops stray linestrings.

`internal/area/committed_boundaries_test.go`'s
`TestBoundaryPartsAssembleIntoAPlausibleArea` is the executable form of this
requirement: every oblast must be at least 1000 km², every city at least
5 km², every Sofia district at least 0.2 km², and each city polygon must
cover a known interior point (Plovdiv, Sofia, Varna, Burgas, Ruse). A
regeneration that reverts to one part per member way fails it immediately.

Vertex counts fall by roughly 20–25× — oblasti 369,993 → 14,051; cities
109,412 → 5,635; sofia-districts 26,457 → 1,394 — while staying far more precise
than point-in-polygon on a sensor coordinate requires.

Each feature's `properties` must carry `slug`, `name_bg`, `name_en` and
`source`. `area.Import` requires the first; the file must be a
`FeatureCollection` (a bare `Feature` imports zero features and once shipped
that way).

## Acceptance checks

A regeneration is finished when all of these pass — not when the files parse.

```bash
go test ./internal/area/ -run 'TestCommittedSlugs|TestSlugsAreUnique'   # no Docker needed
go test ./internal/area/                                                # needs Docker
```

- `TestCommittedSlugsFollowTheDocumentedRule` — every slug recomputes from
  `name_bg`, and the per-file feature counts are 28 / 27 / 24.
- `TestSlugsAreUniqueAcrossEveryFile` — 80 features, 80 distinct slugs.
- `TestAllFourFilesImportWithoutRowLoss` — per-**kind row counts in the
  database** after importing all four: country 1, oblast 28, city 27,
  neighbourhood 24. This is the one that catches a slug collision; per-file
  feature counts stay correct while rows are being overwritten.
- `TestSofiaSensorResolvesThroughAllTiers` — one Sofia point lands in an oblast,
  a city and a district. The three tiers must nest.
- `TestBoundariesDoNotSwapCoordinates` — bbox check. A file written `[lat, lon]`
  parses, imports and produces valid polygons; they just sit in the Indian
  Ocean.
- `TestImportCommittedBulgariaBoundary` — point-in-polygon against real cities,
  not a bbox: Bulgaria's bounding box overlaps five neighbours, so Bucharest,
  Thessaloniki and Skopje falling *outside* is what makes it a real test.
- `TestBoundaryPartsAssembleIntoAPlausibleArea` — every oblast/city/district
  area clears a minimum km², and each named city polygon covers its own known
  interior point. Catches a regeneration that keeps each relation member way as
  its own ring instead of assembling them with `ST_LineMerge`/`ST_BuildArea`.

Then check the footer still attributes OpenStreetMap.

## Adding a fourth tier

Run the cross-file slug check before committing — the primary key does not care
which file a row came from. `TestSlugsAreUniqueAcrossEveryFile`'s `wantTotal`
and its file list both need updating, and a new tier needs its own suffix rule
if its names can collide with an existing tier's.
