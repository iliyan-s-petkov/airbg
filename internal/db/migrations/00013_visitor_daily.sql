-- +goose Up

-- Daily unique visitors from Cloudflare's GraphQL analytics API. Not a sensor
-- reading; see internal/upstream/cloudflare/README.md. No IPs, no per-request
-- data — one row per day.

CREATE TABLE visitor_daily (
    day        date PRIMARY KEY,
    uniques    integer NOT NULL,
    requests   bigint NOT NULL,
    page_views bigint NOT NULL,
    fetched_at timestamptz NOT NULL
);

-- +goose Down
DROP TABLE visitor_daily;
