# Benchmarks

Scripts here are **not part of CI**. They run against a live ClickHouse and
exist as reproducible evidence for performance claims made in PRs, and as
regression guards for anyone touching the affected code paths.

## trace-id-query.sh

Proves that the two-step trace ID lookup in
[`src/data/sqlGenerator.ts`](../../src/data/sqlGenerator.ts) (`generateTraceIdQuery`)
actually avoids a full table scan when a companion `_trace_id_ts` index table
exists.

### Why this exists

Trace ID lookup is the hot path for "View trace" deep-links from logs and
dashboards. On a traces table ordered by `(ServiceName, Timestamp)` — the
realistic OTel layout — a pure `WHERE TraceId = '…'` filter prunes nothing
and forces ClickHouse to read every granule. The companion index table
(keyed by `TraceId`) lets us resolve a tight `(Start, End)` time window
first, then use that window to let the primary key prune granules in the
main query.

Unit tests in [`sqlGenerator.test.ts`](../../src/data/sqlGenerator.test.ts)
assert the generated SQL is right; this benchmark asserts the SQL is
actually faster on real data.

### What it measures

`read_rows` from `system.query_log`, not wall-clock time. Two reasons:

- CI wall-clock is noisy; row counts are deterministic.
- `read_rows` is the direct cause of the speedup — fewer granules scanned
  because the time range narrows primary-key pruning.

Wall-clock (`query_duration_ms`) and `read_bytes` are logged for reference.

### Running it

```bash
docker compose up -d clickhouse-server
./tests/benchmarks/trace-id-query.sh
```

The seed inserts ~5M rows and takes around 30s on a laptop. Environment
knobs:

| Var | Default | Purpose |
| --- | --- | --- |
| `CH_HOST` | `localhost` | ClickHouse host |
| `CH_PORT` | `9000` | Native protocol port |
| `CH_DB` | `bench` | Benchmark database name |
| `ROW_COUNT` | `5000000` | Noise rows to insert |
| `MIN_READ_ROWS_RATIO` | `40` | Pass/fail floor for `slow_rows / fast_rows` |

Observed output (5M seed, local Docker):

```text
                          read_rows      read_bytes   duration_ms
  unoptimized (slow):       5000020      125001640            50
  optimized   (fast):         90112        1001918            43

  read_rows ratio: 55x fewer rows in the optimized path
[bench] OK: optimization reads 55x fewer rows (floor 40x).
```

The ratio grows with `ROW_COUNT` (84× at 20M rows) but sub-linearly — the
fast path's cost is dominated by the two index-table subqueries, which
themselves scale with the index size. The floor is set to catch a
regression where the optimization stops firing entirely (ratio → 1x), not
to assert a specific multiplier.

Exits non-zero if the ratio drops below the floor — useful when bisecting
a suspected regression in `generateTraceIdQuery`.

### When to re-run

- Before merging any change to `generateTraceIdQuery`.
- When changing the shape of the `_trace_id_ts` companion table or its
  default suffix.
- When someone claims the optimization "isn't helping in production" — rerun
  against a seed that matches their schema to reproduce.
