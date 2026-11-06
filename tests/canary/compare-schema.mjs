#!/usr/bin/env node
// Diffs the OTel tables created by a live collector (see docker-compose.yml)
// against the checked-in snapshot in expected-columns.json.
//
// Usage:
//   node compare-schema.mjs            # print drift as markdown, exit 1 on drift
//   node compare-schema.mjs --update   # rewrite expected-columns.json from the live schema
//
// Environment:
//   CLICKHOUSE_URL   base URL of the ClickHouse HTTP interface (default http://localhost:8123)
//   CANARY_DATABASE  database the collector writes to (default "default")
//
// Exit codes: 0 = schemas match (or snapshot updated), 1 = drift detected, 2 = error.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SNAPSHOT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'expected-columns.json');
const TABLES = ['otel_logs', 'otel_traces', 'otel_traces_trace_id_ts'];

const baseUrl = process.env.CLICKHOUSE_URL || 'http://localhost:8123';
const database = process.env.CANARY_DATABASE || 'default';

async function fetchColumns(table) {
  const url = new URL(baseUrl);
  url.searchParams.set(
    'query',
    'SELECT name, type, default_kind FROM system.columns' +
      ' WHERE database = {db:String} AND table = {table:String} ORDER BY position FORMAT JSON'
  );
  url.searchParams.set('param_db', database);
  url.searchParams.set('param_table', table);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`ClickHouse query for ${table} failed: ${res.status} ${await res.text()}`);
  }

  const body = await res.json();
  return body.data.map(({ name, type, default_kind }) => ({
    name,
    type,
    // Only present for MATERIALIZED/ALIAS/DEFAULT columns, so plain columns
    // stay compact in the snapshot.
    ...(default_kind ? { defaultKind: default_kind } : {}),
  }));
}

function diffTable(table, expected, actual) {
  const lines = [];
  const expectedByName = new Map(expected.map((c) => [c.name, c]));
  const actualByName = new Map(actual.map((c) => [c.name, c]));

  for (const col of expected) {
    const live = actualByName.get(col.name);
    if (!live) {
      lines.push(`- \`${col.name}\` (${col.type}) was removed`);
    } else if (live.type !== col.type || (live.defaultKind || '') !== (col.defaultKind || '')) {
      const from = col.defaultKind ? `${col.type} ${col.defaultKind}` : col.type;
      const to = live.defaultKind ? `${live.type} ${live.defaultKind}` : live.type;
      lines.push(`- \`${col.name}\` changed from ${from} to ${to}`);
    }
  }
  for (const col of actual) {
    if (!expectedByName.has(col.name)) {
      lines.push(`- \`${col.name}\` (${col.type}${col.defaultKind ? ` ${col.defaultKind}` : ''}) was added`);
    }
  }

  return lines.length === 0 ? '' : `### \`${table}\`\n\n${lines.join('\n')}\n`;
}

const live = {};
try {
  for (const table of TABLES) {
    live[table] = await fetchColumns(table);
    if (live[table].length === 0) {
      console.error(`Table ${database}.${table} has no columns — did the collector create the schema?`);
      process.exit(2);
    }
  }
} catch (err) {
  // Exit 2, not 1. A connection failure, a non-2xx response, or a malformed
  // body is an infrastructure problem, and the workflow reads exit 1 as genuine
  // drift and files a tracking issue. `cause` carries the socket-level detail
  // that fetch hides behind its bare "fetch failed" message.
  console.error(`Could not read the live schema from ${baseUrl}: ${err.cause?.message || err.message}`);
  process.exit(2);
}

if (process.argv.includes('--update')) {
  await writeFile(SNAPSHOT_PATH, JSON.stringify(live, null, 2) + '\n');
  console.log(`Snapshot written to ${SNAPSHOT_PATH}`);
  process.exit(0);
}

let expected;
try {
  expected = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8'));
} catch (err) {
  console.error(`Could not read snapshot ${SNAPSHOT_PATH}: ${err.message}`);
  console.error('Run `node compare-schema.mjs --update` against a live canary stack to create it.');
  process.exit(2);
}

const sections = TABLES.map((table) => diffTable(table, expected[table] || [], live[table])).filter(Boolean);

if (sections.length === 0) {
  console.log('Collector-created schema matches the snapshot.');
  process.exit(0);
}

console.log('## OTel collector schema drift detected\n');
console.log(sections.join('\n'));
process.exit(1);
