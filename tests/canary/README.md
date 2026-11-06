# OTel schema canary

Detects schema drift in the [`opentelemetry-collector-contrib`](https://github.com/open-telemetry/opentelemetry-collector-contrib)
`clickhouseexporter` before users hit it (see [#1901](https://github.com/grafana/clickhouse-datasource/issues/1901)).
The exporter ships breaking schema changes from time to time (most recently
v0.151.0 removed `TimestampTime` from `otel_logs`, see #1882), and previously we
only learned about them from user bug reports.

## How it works

`run.sh` boots the real collector (`:latest`, intentionally unpinned) against a
fresh ClickHouse, lets the exporter create its own schema, pushes a small OTLP
logs + traces payload, and diffs the created tables against
`expected-columns.json`. The comparison covers column names, types, and default
kinds for `otel_logs`, `otel_traces`, and `otel_traces_trace_id_ts`.

It runs weekly from `.github/workflows/otel-schema-canary.yml` (plus
`workflow_dispatch`, and on PRs labelled `schema-canary`). On drift the workflow
files or updates a tracking issue with the diff.

Two guards keep the pieces consistent:

- The canary diffs the live collector schema against the snapshot (weekly).
- Unit tests in `src/otel.test.ts` check the plugin's latest column maps only
  reference columns present in the snapshot (every PR).

## Running locally

```sh
./tests/canary/run.sh            # exit 1 on drift, with a markdown diff
./tests/canary/run.sh --update   # regenerate expected-columns.json
```

Requires Docker. The stack is torn down on exit.

## When the canary fails

1. Read the diff in the tracking issue or job summary.
2. If the change affects columns the plugin queries, add a new schema entry to
   `src/otel.ts` (see the `otel130` entry for a worked example).
3. Regenerate the snapshot with `./run.sh --update` and commit the result.

Additive or cosmetic changes (new materialized columns, type tweaks on columns
the plugin never touches) only need step 3.
