#!/usr/bin/env bash
#
# Benchmark the trace ID query optimization in generateTraceIdQuery().
#
# Seeds a synthetic traces table (~5M rows) plus the companion _trace_id_ts
# index table, runs the unoptimized and optimized forms against it, and
# compares read_rows / read_bytes / query_duration_ms from system.query_log.
#
# The deterministic signal is read_rows: the optimization exists to make
# ClickHouse skip granules by narrowing the time range to what the primary
# key can prune. Wall-clock is logged for reference only.
#
# Prereqs:
#   docker compose up -d clickhouse-server
#
# Usage:
#   ./tests/benchmarks/trace-id-query.sh
#
# Exits non-zero if the read_rows ratio (slow/fast) drops below
# MIN_READ_ROWS_RATIO. The default floor (40x) is set below the observed
# ratio at 5M rows (~55x) so transient ClickHouse variance doesn't flake
# the check. The optimization is real — it's just capped by how many rows
# the two index-table subqueries themselves read, which grows with index
# size. Bump ROW_COUNT to see a larger ratio.

set -euo pipefail

CH_HOST=${CH_HOST:-localhost}
CH_PORT=${CH_PORT:-9000}
CH_DB=${CH_DB:-bench}
ROW_COUNT=${ROW_COUNT:-5000000}
TARGET_TRACE_ID=${TARGET_TRACE_ID:-00000000000000000000000000000042}
MIN_READ_ROWS_RATIO=${MIN_READ_ROWS_RATIO:-40}

# Prefer `clickhouse-client` on the host; fall back to the dockerised one.
if command -v clickhouse-client >/dev/null 2>&1; then
  CH_CMD="clickhouse-client --host ${CH_HOST} --port ${CH_PORT}"
else
  CH_CMD="docker exec -i clickhouse-server clickhouse-client"
fi

run_sql() {
  # shellcheck disable=SC2086
  ${CH_CMD} --multiquery --query "$1"
}

run_sql_format() {
  # shellcheck disable=SC2086
  ${CH_CMD} --query "$1" --format "$2"
}

log() { printf '[bench] %s\n' "$*" >&2; }

log "Seeding ${ROW_COUNT} rows into ${CH_DB}.bench_traces (this can take ~30s)"

run_sql "
CREATE DATABASE IF NOT EXISTS ${CH_DB};

DROP TABLE IF EXISTS ${CH_DB}.bench_traces;
DROP TABLE IF EXISTS ${CH_DB}.bench_traces_trace_id_ts;

CREATE TABLE ${CH_DB}.bench_traces
(
    TraceId     String,
    SpanId      String,
    ParentSpanId String,
    ServiceName LowCardinality(String),
    SpanName    LowCardinality(String),
    Timestamp   DateTime64(9) CODEC(Delta, ZSTD),
    Duration    Int64
)
ENGINE = MergeTree
PARTITION BY toDate(Timestamp)
ORDER BY (ServiceName, Timestamp);

CREATE TABLE ${CH_DB}.bench_traces_trace_id_ts
(
    TraceId String,
    Start   DateTime64(9),
    End     DateTime64(9)
)
ENGINE = MergeTree
ORDER BY (TraceId, Start);

-- Noise rows: uniformly distributed across 24h, several services.
INSERT INTO ${CH_DB}.bench_traces
SELECT
    lower(hex(reinterpretAsFixedString(rand64()))) AS TraceId,
    lower(hex(reinterpretAsFixedString(rand64()))) AS SpanId,
    lower(hex(reinterpretAsFixedString(rand64()))) AS ParentSpanId,
    ['api', 'worker', 'cache', 'db', 'auth'][(number % 5) + 1] AS ServiceName,
    ['GET /users', 'POST /pay', 'SELECT', 'auth.verify', 'cache.get'][(number % 5) + 1] AS SpanName,
    toDateTime64('2026-03-01 00:00:00', 9) + INTERVAL (number % 86400) SECOND AS Timestamp,
    (rand() % 1000000)::Int64 AS Duration
FROM numbers(${ROW_COUNT});

-- Target trace: 20 spans clustered in a 1-second window 6 hours into the range.
INSERT INTO ${CH_DB}.bench_traces
SELECT
    '${TARGET_TRACE_ID}' AS TraceId,
    lower(hex(reinterpretAsFixedString(rand64()))) AS SpanId,
    lower(hex(reinterpretAsFixedString(rand64()))) AS ParentSpanId,
    'api' AS ServiceName,
    'GET /target' AS SpanName,
    toDateTime64('2026-03-01 06:00:00', 9) + INTERVAL (number * 50) MILLISECOND AS Timestamp,
    (rand() % 10000)::Int64 AS Duration
FROM numbers(20);

-- Populate the index: one row per TraceId with its span time range.
INSERT INTO ${CH_DB}.bench_traces_trace_id_ts
SELECT TraceId, min(Timestamp) AS Start, max(Timestamp) AS End
FROM ${CH_DB}.bench_traces
GROUP BY TraceId;

OPTIMIZE TABLE ${CH_DB}.bench_traces FINAL;
OPTIMIZE TABLE ${CH_DB}.bench_traces_trace_id_ts FINAL;
"

log "Seed complete. Running queries."

# Disable result cache and give each query a unique tag we can look up in
# system.query_log.
SLOW_TAG="bench_trace_slow_$(date +%s)_$RANDOM"
FAST_TAG="bench_trace_fast_$(date +%s)_$RANDOM"

# Unoptimized: the pre-fix path. Filters the whole table by TraceId.
SLOW_SQL="SELECT /* ${SLOW_TAG} */ * FROM ${CH_DB}.bench_traces WHERE TraceId = '${TARGET_TRACE_ID}' FORMAT Null"

# Optimized: the exact shape generateTraceIdQuery() emits today when
# applyTraceIdOptimization fires.
FAST_SQL="WITH /* ${FAST_TAG} */
  '${TARGET_TRACE_ID}' AS trace_id,
  (SELECT min(Start) FROM ${CH_DB}.bench_traces_trace_id_ts WHERE TraceId = trace_id) AS trace_start,
  (SELECT max(End) + 1 FROM ${CH_DB}.bench_traces_trace_id_ts WHERE TraceId = trace_id) AS trace_end
SELECT * FROM ${CH_DB}.bench_traces
WHERE TraceId = trace_id
  AND Timestamp >= trace_start
  AND Timestamp <= trace_end
FORMAT Null"

run_sql "SET use_query_cache = 0; ${SLOW_SQL};"
run_sql "SET use_query_cache = 0; ${FAST_SQL};"

log "Flushing query_log"
run_sql "SYSTEM FLUSH LOGS;"

metrics_for() {
  local tag="$1"
  run_sql_format "
    SELECT read_rows, read_bytes, query_duration_ms
    FROM system.query_log
    WHERE type = 'QueryFinish'
      AND query LIKE '%${tag}%'
      AND query NOT LIKE '%system.query_log%'
    ORDER BY event_time DESC
    LIMIT 1
  " TSV
}

read -r SLOW_ROWS SLOW_BYTES SLOW_MS < <(metrics_for "${SLOW_TAG}")
read -r FAST_ROWS FAST_BYTES FAST_MS < <(metrics_for "${FAST_TAG}")

if [[ -z "${SLOW_ROWS:-}" || -z "${FAST_ROWS:-}" ]]; then
  log "ERROR: could not read query_log metrics. Slow='${SLOW_ROWS:-}' Fast='${FAST_ROWS:-}'"
  exit 2
fi

printf '\n'
printf '                          read_rows      read_bytes   duration_ms\n'
printf '  unoptimized (slow):  %12s   %12s   %11s\n' "${SLOW_ROWS}" "${SLOW_BYTES}" "${SLOW_MS}"
printf '  optimized   (fast):  %12s   %12s   %11s\n' "${FAST_ROWS}" "${FAST_BYTES}" "${FAST_MS}"

if [[ "${FAST_ROWS}" -eq 0 ]]; then
  log "ERROR: optimized query read 0 rows — index table or target trace is likely missing."
  exit 3
fi

RATIO=$(( SLOW_ROWS / FAST_ROWS ))
printf '\n  read_rows ratio: %sx fewer rows in the optimized path\n' "${RATIO}"

if (( RATIO < MIN_READ_ROWS_RATIO )); then
  log "FAIL: read_rows ratio ${RATIO}x is below the floor of ${MIN_READ_ROWS_RATIO}x."
  log "      (Either the optimization regressed or the seed is too small — tune ROW_COUNT.)"
  exit 1
fi

log "OK: optimization reads ${RATIO}x fewer rows (floor ${MIN_READ_ROWS_RATIO}x)."
