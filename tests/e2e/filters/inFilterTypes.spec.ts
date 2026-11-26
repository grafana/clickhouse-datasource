// E2E coverage for IN and NOT IN builder filters on columns that are not String (#2225).
// FilterEditor copies the column type onto the filter and stores IN and NOT IN values as an
// array for every type that is not boolean, number or date. Unit tests in
// src/data/sqlGenerator.test.ts cover the SQL generated for that shape. Only E2E confirms the
// builder shows one literal per value and ClickHouse accepts the list for each column type.
// tests/fixtures/in_filter_types.sql seeds e2e_test.in_filter_types with 3 rows.

import { expect, test } from '@grafana/plugin-e2e';
import type { Page } from '@playwright/test';
import { FilterOperator } from '../../../src/types/queryBuilder';
import { builderFieldRow } from '../helpers/builder';
import { skipFixtureTestsOnCloud } from '../helpers/env';
import { exploreUrl } from '../helpers/explore';
import { frameValues, QueryDataBody } from '../helpers/queryResponse';
import { runQuery } from '../helpers/sqlEditor';

// A 4.x plugin version opens builderOptions in the Query Builder instead of migrating them to SQL.
const BUILDER_PLUGIN_VERSION = '4.0.0';

interface FilterColumn {
  key: string;
  type: string;
  values: string[];
}

const ENUM_ELEMENTS = "('x' = 1, 'y' = 2, 'z' = 3)";

// The values match rows 1 and 2 of the fixture.
const COLUMNS: FilterColumn[] = [
  { key: 'enum8_value', type: `Enum8${ENUM_ELEMENTS}`, values: ['x', 'y'] },
  { key: 'nullable_enum8_value', type: `Nullable(Enum8${ENUM_ELEMENTS})`, values: ['x', 'y'] },
  { key: 'enum16_value', type: `Enum16${ENUM_ELEMENTS}`, values: ['x', 'y'] },
  {
    key: 'uuid_value',
    type: 'UUID',
    values: ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'],
  },
  { key: 'ipv4_value', type: 'IPv4', values: ['10.0.0.1', '10.0.0.2'] },
  { key: 'ipv6_value', type: 'IPv6', values: ['2001:db8::1', '2001:db8::2'] },
];

// Both Bool values match every row, so NOT IN leaves this column out.
const BOOL_COLUMN: FilterColumn = { key: 'bool_value', type: 'Bool', values: ['true', 'false'] };

/**
 * Open the Table builder on the fixture with one filter per column, check the SQL preview, run
 * the query and return the ids it selects.
 */
async function runBuilderFilters(page: Page, operator: FilterOperator, columns: FilterColumn[]): Promise<unknown[]> {
  await page.goto(
    exploreUrl({
      pluginVersion: BUILDER_PLUGIN_VERSION,
      builderOptions: {
        database: 'e2e_test',
        table: 'in_filter_types',
        queryType: 'table',
        mode: 'list',
        columns: [{ name: 'id' }],
        // The shape FilterEditor stores after picking the column, the operator and the values.
        filters: columns.map((c) => ({
          filterType: 'custom',
          condition: 'AND',
          key: c.key,
          type: c.type,
          operator,
          value: c.values,
        })),
        orderBy: [{ name: 'id', dir: 'ASC' }],
        limit: 1000,
      },
    })
  );

  const clauses = columns.map((c) => `${c.key} ${operator} (${c.values.map((v) => `'${v}'`).join(', ')})`);
  const preview = builderFieldRow(page, 'SQL Preview');
  for (const clause of clauses) {
    await expect(preview).toContainText(clause);
  }

  // Wait for the request with the generated SQL, because loading the page can run the query first.
  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('/api/ds/query') && (r.request().postData() ?? '').includes(clauses[0])
  );
  await runQuery(page);
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  return frameValues((await response.json()) as QueryDataBody)[0] ?? [];
}

test.describe('IN and NOT IN filters on columns that are not String', () => {
  test.beforeEach(() => {
    skipFixtureTestsOnCloud('in_filter_types.sql');
  });

  test('IN returns the rows that match one of the values', async ({ page }) => {
    const ids = await runBuilderFilters(page, FilterOperator.In, [...COLUMNS, BOOL_COLUMN]);
    expect(ids).toEqual([1, 2]);
  });

  test('NOT IN returns the rows that match none of the values', async ({ page }) => {
    const ids = await runBuilderFilters(page, FilterOperator.NotIn, COLUMNS);
    expect(ids).toEqual([3]);
  });
});
