import { expect, test } from '@grafana/plugin-e2e';
import { FIXTURE_FROM_ISO, FIXTURE_TO_ISO, skipFixtureTestsOnCloud } from '../helpers/env';
import { exploreUrl } from '../helpers/explore';
import { frameFields, frames, frameValues, rowCount } from '../helpers/queryResponse';
import { runSqlAndGetBody } from '../helpers/sqlEditor';

// E2E regression guard for the JSON-type trace attribute feature.
//
// Background: ClickHouse 26+ uses a native JSON type for span/resource/event/link
// attribute columns (SpanAttributes, ResourceAttributes, Events.Attributes,
// Links.Attributes) instead of Map(String,String). mapKeys() does not work on
// JSON type. The plugin auto-detects JSON columns and uses a sentinel pattern for
// events/links: toJSONString(attributes) is stored under a sentinel Map key and
// expanded client-side. Top-level tags/serviceTags are returned as raw JSON and
// flattened client-side by flattenJsonTags in utils.ts.
//
// These tests verify the full stack:
//   A. SQL query with JSON attribute columns executes without a mapKeys error
//      and returns the correct number of rows.
//   B. The tags/serviceTags values in the response body are non-null JSON
//      objects (confirming ClickHouse returned JSON data, not an error).
//
// Fixture data is in tests/fixtures/trace_spans_json.sql (3 spans for
// trace 'e2e-json-trace-a').

const TRACE_ID = 'e2e-json-trace-a';
const EXPECTED_SPAN_COUNT = 3;

// Simplified SQL that exercises JSON-typed attribute columns without mapKeys.
// The real generated SQL uses JSONAllPaths + JSONExtractString; this raw query
// validates that the backend returns JSON column data without errors.
const TRACE_SQL = [
  `SELECT TraceId as traceID, SpanId as spanID, ParentSpanId as parentSpanID,`,
  `ServiceName as serviceName, SpanName as operationName,`,
  `SpanAttributes as tags, ResourceAttributes as serviceTags`,
  `FROM e2e_test.trace_spans_json`,
  `WHERE TraceId = '${TRACE_ID}'`,
].join(' ');

// SQL matching the shape generateSql produces for a non-flattenNested OTel trace query
// against a JSON-column table. For events/links, attributes are wrapped in a single-element
// Array(Map(String,String)) carrying the raw JSON blob under the sentinel key '__ch_json__',
// which is expanded client-side by expandJsonSentinel in utils.ts.
// NOTE: JSON_VALUE with a dynamic concat path is NOT used — ClickHouse requires the path
// argument to be a compile-time constant (error code 44).
const BUILDER_SQL = [
  `SELECT TraceId as traceID, SpanId as spanID, ParentSpanId as parentSpanID,`,
  `ServiceName as serviceName, SpanName as operationName,`,
  `SpanAttributes as tags, ResourceAttributes as serviceTags,`,
  `arrayMap((name, timestamp, attributes) -> tuple(name, toString(toUnixTimestamp64Milli(timestamp)),`,
  `[map('key', '__ch_json__', 'value', toJSONString(attributes))])::Tuple(name String, timestamp String, fields Array(Map(String, String))),`,
  `Events.Name, Events.Timestamp, Events.Attributes) AS logs`,
  `FROM e2e_test.trace_spans_json`,
  `WHERE TraceId = '${TRACE_ID}'`,
].join(' ');

test.describe('JSON-typed trace attribute columns', () => {
  test.beforeEach(() => {
    skipFixtureTestsOnCloud('trace_spans_json.sql');
  });

  test.describe.configure({ mode: 'serial' });

  test('SQL with JSON column references returns all spans', async ({ page, explorePage }) => {
    // Selects SpanAttributes/ResourceAttributes as raw JSON (no mapKeys).
    // Must succeed and return all 3 seeded spans.
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    const body = await runSqlAndGetBody(page, explorePage, TRACE_SQL);

    expect(frames(body).length).toBeGreaterThan(0);
    expect(rowCount(body)).toBe(EXPECTED_SPAN_COUNT);
  });

  test('tags and serviceTags fields carry non-null JSON data', async ({ page, explorePage }) => {
    // Verifies the Go backend passes JSON column data through correctly.
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    const body = await runSqlAndGetBody(page, explorePage, TRACE_SQL);

    // Find the index of the 'tags' field by name in the frame schema.
    const schemaFields = frameFields(body);
    const tagsIdx = schemaFields.findIndex((f) => f.name === 'tags');
    const serviceTagsIdx = schemaFields.findIndex((f) => f.name === 'serviceTags');
    expect(tagsIdx).toBeGreaterThanOrEqual(0);
    expect(serviceTagsIdx).toBeGreaterThanOrEqual(0);

    const values = frameValues(body);
    const tagsValues = values[tagsIdx] ?? [];
    const serviceTagsValues = values[serviceTagsIdx] ?? [];

    // Every row must have a non-null, non-empty object for tags and serviceTags.
    // A null or missing value would indicate the JSON column was not returned;
    // a plain string would indicate mapKeys failed and the error propagated.
    expect(tagsValues.length).toBe(EXPECTED_SPAN_COUNT);
    for (const v of tagsValues) {
      expect(v).not.toBeNull();
      expect(typeof v).toBe('object');
      expect(Object.keys(v as object).length).toBeGreaterThan(0);
    }

    expect(serviceTagsValues.length).toBe(EXPECTED_SPAN_COUNT);
    for (const v of serviceTagsValues) {
      expect(v).not.toBeNull();
      expect(typeof v).toBe('object');
    }
  });

  test('builder-shaped SQL with JSON sentinel pattern executes and returns event logs', async ({
    page,
    explorePage,
  }) => {
    // Validates the SQL shape the plugin generates for JSON-column OTel queries:
    // event attributes are wrapped in a single sentinel Map entry carrying the raw JSON blob;
    // the client-side expandJsonSentinel expands it into key-value pairs. mapKeys must NOT appear.
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    const body = await runSqlAndGetBody(page, explorePage, BUILDER_SQL);

    expect(frames(body).length).toBeGreaterThan(0);

    // All EXPECTED_SPAN_COUNT rows must be present.
    expect(rowCount(body)).toBe(EXPECTED_SPAN_COUNT);

    // The 'logs' field (events) must be present and non-null for spans with events.
    const logsIdx = frameFields(body).findIndex((f) => f.name === 'logs');
    expect(logsIdx).toBeGreaterThanOrEqual(0);

    const logsValues = frameValues(body)[logsIdx] ?? [];
    // jspan-1 and jspan-2 have events; at least one row must have a non-empty array. // cspell:ignore jspan
    const hasEvents = logsValues.some((v) => Array.isArray(v) && v.length > 0);
    expect(hasEvents).toBe(true);
  });
});
