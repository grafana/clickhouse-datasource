import { expect, test } from '@grafana/plugin-e2e';
import { FIXTURE_FROM_ISO, FIXTURE_TO_ISO, skipFixtureTestsOnCloud } from '../helpers/env';
import { exploreUrl } from '../helpers/explore';
import { frameFields, frameValues } from '../helpers/queryResponse';
import { runSqlAndGetBody } from '../helpers/sqlEditor';

// E2E coverage for SimpleAggregateFunction column handling: the backend must
// unwrap SimpleAggregateFunction(fn, T) to the inner type T when converting
// rows to frames. Unit tests cover the type-mapping table; only a query against
// a real ClickHouse AggregatingMergeTree confirms the driver round-trip for
// each inner type (tests/fixtures/simple_aggregate_functions.sql seeds
// e2e_test.simple_aggregate_events with 5 rows).

test.describe('SimpleAggregateFunction type handling', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => {
    skipFixtureTestsOnCloud('simple_aggregate_functions.sql');
  });

  test('SimpleAggregateFunction(any, String) returns string values', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    const body = await runSqlAndGetBody(
      page,
      explorePage,
      'SELECT name FROM e2e_test.simple_aggregate_events ORDER BY timestamp'
    );

    // Fixture seeds exactly these 5 names in timestamp order.
    const values = frameValues(body);
    expect(values.length).toBeGreaterThan(0);
    expect(values[0]).toEqual(['alpha', 'beta', 'gamma', 'delta', 'epsilon']);
  });

  test('SimpleAggregateFunction(any, Nullable(String)) returns values with nulls preserved', async ({
    page,
    explorePage,
  }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    const body = await runSqlAndGetBody(
      page,
      explorePage,
      'SELECT label FROM e2e_test.simple_aggregate_events ORDER BY timestamp'
    );

    // Fixture rows 2 and 5 carry NULL labels.
    const values = frameValues(body);
    expect(values.length).toBeGreaterThan(0);
    expect(values[0]).toEqual(['first', null, 'third', 'fourth', null]);
  });

  test('SimpleAggregateFunction(any, Float64) returns numeric values', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    const body = await runSqlAndGetBody(
      page,
      explorePage,
      'SELECT value FROM e2e_test.simple_aggregate_events ORDER BY timestamp'
    );

    const values = frameValues(body);
    expect(values.length).toBeGreaterThan(0);
    expect(values[0]).toEqual([1.5, 2.0, 3.5, 4.0, 5.5]);
  });

  test('SimpleAggregateFunction(any, Nullable(Float64)) returns numbers with nulls', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    const body = await runSqlAndGetBody(
      page,
      explorePage,
      'SELECT nullable_value FROM e2e_test.simple_aggregate_events ORDER BY timestamp'
    );

    // Fixture rows 2 and 4 carry NULL nullable_value.
    const values = frameValues(body);
    expect(values.length).toBeGreaterThan(0);
    expect(values[0]).toEqual([1.5, null, 3.5, null, 5.5]);
  });

  test('SimpleAggregateFunction(sum, UInt64) returns integer values', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    const body = await runSqlAndGetBody(
      page,
      explorePage,
      'SELECT count FROM e2e_test.simple_aggregate_events ORDER BY timestamp'
    );

    const values = frameValues(body);
    expect(values.length).toBeGreaterThan(0);
    expect(values[0]).toEqual([10, 20, 30, 40, 50]);
  });

  test('SimpleAggregateFunction(any, Bool) returns boolean values', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    const body = await runSqlAndGetBody(
      page,
      explorePage,
      'SELECT is_active FROM e2e_test.simple_aggregate_events ORDER BY timestamp'
    );

    const values = frameValues(body);
    expect(values.length).toBeGreaterThan(0);
    expect(values[0]).toEqual([true, false, true, true, false]);
  });

  test('SimpleAggregateFunction(max, DateTime64) returns time values', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    const body = await runSqlAndGetBody(
      page,
      explorePage,
      'SELECT last_seen FROM e2e_test.simple_aggregate_events ORDER BY timestamp'
    );

    const fields = frameFields(body);
    const lastSeenField = fields.find((f) => f.name === 'last_seen');
    expect(lastSeenField?.typeInfo?.frame).toBe('time.Time');
  });

  test('table panel renders all SAF types with correct field metadata', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    const body = await runSqlAndGetBody(
      page,
      explorePage,
      'SELECT timestamp, name, label, value, nullable_value, count, is_active, last_seen FROM e2e_test.simple_aggregate_events ORDER BY timestamp'
    );

    const fields = frameFields(body);
    expect(fields.length).toBe(8);

    const fieldByName = (n: string) => fields.find((f) => f.name === n);
    expect(fieldByName('name')?.typeInfo?.frame).toBe('string');
    expect(fieldByName('label')?.typeInfo?.frame).toMatch(/string/);
    expect(fieldByName('value')?.typeInfo?.frame).toBe('float64');
    expect(fieldByName('nullable_value')?.typeInfo?.frame).toMatch(/float64/);
    expect(fieldByName('count')?.typeInfo?.frame).toMatch(/uint64|int64|float64/);
    expect(fieldByName('is_active')?.typeInfo?.frame).toBe('bool');
    expect(fieldByName('last_seen')?.typeInfo?.frame).toBe('time.Time');
  });
});
