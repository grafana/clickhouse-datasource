#!/usr/bin/env bash
# Runs the full OTel schema canary cycle (#1901):
#
#   1. Start a fresh ClickHouse and otel/opentelemetry-collector-contrib:latest.
#   2. Wait for the clickhouseexporter to create its schema.
#   3. Push a small OTLP logs + traces payload and wait for the rows to land,
#      so insert-breaking exporter changes fail the canary too.
#   4. Diff the created tables against expected-columns.json.
#
# Usage:
#   ./run.sh            # exit 1 on schema drift
#   ./run.sh --update   # regenerate expected-columns.json from the live schema
#
# The stack is torn down on exit either way.
set -euo pipefail
cd "$(dirname "$0")"

CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://localhost:8123}"

cleanup() {
  docker compose down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose up --detach --quiet-pull

ch_query() {
  curl -fsS "${CLICKHOUSE_URL}" --data-binary "$1"
}

echo 'Waiting for the collector to create the OTel tables...'
for _ in $(seq 1 60); do
  tables="$(ch_query "SELECT count() FROM system.tables WHERE database = 'default' AND name IN ('otel_logs', 'otel_traces', 'otel_traces_trace_id_ts')" 2>/dev/null || echo 0)"
  if [ "${tables}" = '3' ]; then
    break
  fi
  sleep 2
done
if [ "${tables:-0}" != '3' ]; then
  echo 'Collector did not create otel_logs/otel_traces within 120s. Collector logs:' >&2
  docker compose logs collector >&2
  exit 2
fi

echo 'Pushing synthetic OTLP payloads...'
curl -fsS -X POST 'http://localhost:4318/v1/logs' -H 'Content-Type: application/json' \
  --data @fixtures/otlp-logs.json >/dev/null
curl -fsS -X POST 'http://localhost:4318/v1/traces' -H 'Content-Type: application/json' \
  --data @fixtures/otlp-traces.json >/dev/null

echo 'Waiting for the rows to be ingested...'
for _ in $(seq 1 60); do
  rows="$(ch_query "SELECT least(count(), 1) + (SELECT least(count(), 1) FROM otel_traces) FROM otel_logs" 2>/dev/null || echo 0)"
  if [ "${rows}" = '2' ]; then
    break
  fi
  sleep 2
done
if [ "${rows:-0}" != '2' ]; then
  echo 'OTLP payloads were accepted but never appeared in ClickHouse. Collector logs:' >&2
  docker compose logs collector >&2
  exit 2
fi

node compare-schema.mjs "$@"
