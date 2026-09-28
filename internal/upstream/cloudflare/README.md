# internal/upstream/cloudflare

Daily unique-visitor counts, pulled from Cloudflare's GraphQL analytics API
into `visitor_daily` (OpenProject #591). Spike results: see the PR that added
this package, or ask for `/tmp/airbg-cf-spike.md`.

## What is stored

One row per calendar day: `day`, `uniques`, `requests`, `page_views`,
`fetched_at`. No IPs, nothing per-request — `httpRequests1dGroups`, not
`httpRequestsAdaptiveGroups`, is queried on purpose; the latter exposes
`clientIP` and this project has no use for it and no wish to store it.

## Schedule

In-process, like `wind` and `eea`: `Collector.Loop` runs inside `airbg serve`
(and `airbg collect`) on `cloudflare.poll_interval`, sharing the collector
pool. Not an ofelia job — see `deploy/ofelia.ini`'s header comment for why a
one-shot container is the wrong shape for a loop that never returns.

## Backfill vs. rolling window

Every run asks `Store.VisitorDailyEmpty`. An empty table means this is the
first run ever (or after a restore): it pulls `backfillDays` (30) days. Any
other run pulls the trailing `lookbackDays` (3) days, because Cloudflare's own
daily group can still shift for a day or two after it closes — a lookback
window "corrects" rather than duplicates via `ON CONFLICT (day) DO UPDATE`.

30 days, not more: the spike found actual stored retention on this plan is
~29-30 days, well short of the ~52-week query-range cap the API itself
enforces. Backfilling wider than that returns the same rows the API already
has, not more history.

## The token

`AIRBG_CF_ANALYTICS_TOKEN` is env-only, exactly like `AIRBG_DATABASE_URL`:
writing it to `airbg.yaml` is a startup error (the generic `token` key check
in `internal/config/load.go` catches it — there is no field for it in the
config schema at all to begin with). If it is unset, `Collector.Loop` logs
once at info level and returns; the server must start and run fine without
it, because production does not have the secret until it is added to
Infisical.

`cloudflare.zone_id` is not secret — the zone is public once the domain
resolves through Cloudflare — so it is committed in `airbg.yaml`.

## Seeding

`airbg seed-visitor-daily <path.json>` loads a JSON array of
`{date,uniques,requests,pageViews}` rows (the shape Cloudflare's own export
uses) and upserts them, for backfilling history predating this job or
restoring from a snapshot. `cloudflare.ParseSeedFile` does the parsing and is
unit-tested with no database; the command itself is not exercised in tests
against any real database — see the PR description for why.
