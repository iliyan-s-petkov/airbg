# Contributing

Thanks for looking at airbg.org. This project is a Go backend + Vite/vanilla-JS
frontend for an air quality map of Bulgaria.

## Setup

See [`docs/development.md`](docs/development.md) for local setup (Postgres via
Docker Compose, environment variables, running the server).

## Building and testing

```bash
go build ./...
go test ./... -race                    # unit: no Docker, no Node
go test -tags integration ./... -race  # integration: real Postgres via testcontainers
cd web && npx vitest run               # frontend unit tests
cd web && npm run build                # frontend build
```

The integration tier starts its own Postgres container via testcontainers. On
macOS with Colima, that needs `DOCKER_HOST` pointed at the Colima socket
before running it.

The e2e tier is a Go test that serves the built frontend, so it must run in
this order:

```bash
cd web && VITE_E2E_MAP_HANDLE=1 npm run build
go test -tags e2e ./internal/e2e/
cd web && npm run build   # rebuild without the E2E flag before committing/serving normally
```

## Pull requests

- Open a PR against `master`. CI (`.github/workflows/ci.yml`) must be green:
  Go build/vet/staticcheck/govulncheck, `go test ./... -race`, the web unit
  tests and build, the integration tier, and the e2e tier.
- Keep commits focused: a short imperative subject line (e.g. `fix: reject
  empty geometry on import`), and comments limited to 1-2 lines that explain
  *why*, not what.

## Reporting bugs or data problems

Use the issue templates under **Issues > New issue**. See
[`SECURITY.md`](SECURITY.md) for vulnerabilities instead of a public issue.
