// E2E coverage for the builder-UI-to-executed-SQL wiring on the classic
// datasource. The options-to-SQL mapping is heavily unit-tested in
// src/data/sqlGenerator.test.ts, but those tests cannot confirm that the
// editor components (ModeSwitch, AggregateEditor, GroupByEditor,
// OrderByEditor, LimitEditor, FilterEditor, EditorTypeSwitcher) dispatch the
// right builder-options state through QueryBuilder.tsx, nor that query.rawSql
// (which feeds both the SqlPreview and /api/ds/query) stays in sync with the
// UI. The builder has been rebuilt wholesale once before, so each test here
// asserts BOTH the generated SQL preview and the executed response shape
// against the seeded fixture data.

import { expect, test, ExplorePage } from '@grafana/plugin-e2e';
import type { Locator, Page } from '@playwright/test';
import { Components as Selectors } from '../../../src/selectors';
import { builderFieldRow, pickBuilderSelect, switchToBuilderMode } from '../helpers/builder';
import { FIXTURE_FROM_ISO, FIXTURE_TO_ISO, skipFixtureTestsOnCloud } from '../helpers/env';
import { exploreUrl } from '../helpers/explore';
import {
  QueryDataBody,
  frameFields,
  frameValues,
  rowCount,
  waitForQueryDataResponseWithBody,
} from '../helpers/queryResponse';
import { runQuery } from '../helpers/sqlEditor';

// Seed table from tests/e2e/fixtures/seed.sql: 10 rows spanning
// 2024-03-15 10:00-10:09 UTC with levels info (5), debug (2), warn (1)
// and error (2).
const SEED_DATABASE = 'e2e_test';
const SEED_TABLE = 'events';

/** Minimal typed view of the /api/ds/query request body the round-trip test inspects. */
interface DsQueryRequest {
  queries?: Array<{
    refId?: string;
    editorType?: string;
    rawSql?: string;
  }>;
}

/** The generated-SQL preview `<pre>` rendered by SqlPreview.tsx (mirrors query.rawSql). */
function sqlPreview(page: Page): Locator {
  return builderFieldRow(page, 'SQL Preview').locator('pre');
}

/**
 * Pick a value in a classic Grafana Select given its combobox locator
 * directly, for Selects that are not label-anchored (the aggregate column
 * and the order-by direction): open, type to filter, commit with Enter.
 */
async function pickSelectValue(page: Page, combobox: Locator, value: string) {
  await combobox.click();
  await page.keyboard.type(value);
  await page.keyboard.press('Enter');
  // Close any lingering option list before the next interaction.
  await page.keyboard.press('Escape');
}

/**
 * Pick an option in one of the new-style Combobox inputs used by the filter
 * editor (FilterEditor.tsx renders Combobox, not Select). The option is
 * clicked by exact name from the portalled listbox because the fuzzy filter
 * can keep several candidates visible (typing 'IN' also matches 'NOT IN').
 */
async function pickComboboxOption(page: Page, combobox: Locator, value: string) {
  await combobox.click();
  await combobox.fill(value);
  await page.getByRole('option', { name: value, exact: true }).click();
}

/** Run the current query and return the parsed /api/ds/query response body. */
async function runQueryAndGetBody(page: Page, explorePage: ExplorePage): Promise<QueryDataBody | null> {
  const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
  await runQuery(page);
  await responsePromise;
  return getBody();
}

/**
 * Build the aggregate query shared by the Aggregate-mode test and the
 * round-trip test: SELECT level, count(*) FROM e2e_test.events GROUP BY level.
 */
async function buildCountByLevelQuery(page: Page) {
  await page.getByRole('radio', { name: 'Aggregate', exact: true }).click();
  await pickBuilderSelect(page, 'Columns', 'level');

  // Add a count(*) aggregate. A new aggregate row defaults to the Count
  // function, so only the column Select needs picking (the second combobox
  // in the row, after the function Select).
  await page.getByTestId(Selectors.QueryBuilder.AggregateEditor.addButton).click();
  const aggregateRow = page.getByTestId(Selectors.QueryBuilder.AggregateEditor.itemWrapper);
  await pickSelectValue(page, aggregateRow.getByRole('combobox').nth(1), '*');

  await pickBuilderSelect(page, 'Group By', 'level');
}

test.describe('Query builder to executed SQL wiring', () => {
  // Fixture suites run serially so parallel workers do not compete for the
  // single local ClickHouse instance.
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => {
    skipFixtureTestsOnCloud('seed.sql');
  });

  // The explorePage fixture navigates to a bare /explore during its setup.
  // It must be requested here, not only in the test bodies: fixtures
  // initialise immediately before the first function that declares them,
  // so requesting it only in a test would run that navigation AFTER this
  // hook and wipe the builder state it configures (the query editor and
  // time range reset to defaults, and the run then never produces frames).
  test.beforeEach(async ({ page, explorePage }) => {
    void explorePage;
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    await switchToBuilderMode(page);
    await pickBuilderSelect(page, 'Database', SEED_DATABASE);
    // The table can auto-populate: events is alphabetically first in e2e_test.
    await pickBuilderSelect(page, 'Table', SEED_TABLE, { allowAutoPopulated: true });
  });

  test.describe('Aggregate mode', () => {
    test('count(*) grouped by level emits GROUP BY level and returns one row per seeded level', async ({
      page,
      explorePage,
    }) => {
      await buildCountByLevelQuery(page);

      const preview = sqlPreview(page);
      await expect(preview).toContainText('count(*)');
      await expect(preview).toContainText('GROUP BY level');

      const body = await runQueryAndGetBody(page, explorePage);
      // seed.sql has four distinct levels: info, debug, warn, error.
      expect(rowCount(body)).toBe(4);

      const fields = frameFields(body);
      const levelIndex = fields.findIndex((f) => f.name === 'level');
      expect(levelIndex).toBeGreaterThanOrEqual(0);
      const levels = frameValues(body)[levelIndex].map(String).sort();
      expect(levels).toEqual(['debug', 'error', 'info', 'warn']);

      // The count column is the only other field. Per-level counts from
      // seed.sql: info 5, debug 2, warn 1, error 2.
      const countIndex = fields.findIndex((f) => f.name !== 'level');
      expect(countIndex).toBeGreaterThanOrEqual(0);
      const counts = frameValues(body)
        [countIndex].map(Number)
        .sort((a, b) => a - b);
      expect(counts).toEqual([1, 2, 2, 5]);
    });
  });

  test.describe('Simple mode', () => {
    test('ORDER BY timestamp DESC returns the latest seeded timestamp first', async ({ page, explorePage }) => {
      await pickBuilderSelect(page, 'Columns', 'timestamp');

      // A new order-by row defaults to the first column option (timestamp)
      // ascending, so only the direction Select needs flipping to DESC.
      await page.getByRole('button', { name: 'Order By', exact: true }).click();
      const orderByRow = builderFieldRow(page, 'Order By');
      await pickSelectValue(page, orderByRow.getByRole('combobox').nth(1), 'DESC');

      await expect(sqlPreview(page)).toContainText('ORDER BY timestamp DESC');

      const body = await runQueryAndGetBody(page, explorePage);
      // seed.sql inserts 10 rows, so all of them arrive under the default limit.
      expect(rowCount(body)).toBe(10);
      // The latest seeded row is 2024-03-15 10:09:00 UTC. Time fields are
      // encoded as epoch millisecond numbers in the data frame JSON.
      const firstTimestamp = frameValues(body)[0][0];
      expect(Number(firstTimestamp)).toBe(Date.UTC(2024, 2, 15, 10, 9, 0));
    });

    test('LIMIT 3 caps the result at exactly three rows', async ({ page, explorePage }) => {
      await pickBuilderSelect(page, 'Columns', 'timestamp');

      // The limit Input commits on blur (LimitEditor.tsx).
      const limitInput = page.getByTestId(Selectors.QueryBuilder.LimitEditor.input);
      await limitInput.fill('3');
      await limitInput.blur();

      await expect(sqlPreview(page)).toContainText('LIMIT 3');

      const body = await runQueryAndGetBody(page, explorePage);
      // seed.sql inserts 10 rows into e2e_test.events, so LIMIT 3 must cap them.
      expect(rowCount(body)).toBe(3);
    });

    test('filter operators !=, IN and LIKE produce fixture-exact row counts', async ({ page, explorePage }) => {
      await pickBuilderSelect(page, 'Columns', 'timestamp');

      // A new filter starts as IS ANYTHING with no column selected.
      await page.locator('.query-editor-row').getByRole('button', { name: 'Filter', exact: true }).click();
      const filterRow = builderFieldRow(page, 'Filters');
      const keyCombobox = filterRow.getByRole('combobox').nth(0);
      // Resolved lazily: the operator combobox re-renders on key changes.
      const operatorCombobox = () => filterRow.getByRole('combobox').nth(1);

      // Phase 1: level != 'info'. Picking a String column resets the operator
      // to IS NOT NULL, so the operator is picked after the column.
      await pickComboboxOption(page, keyCombobox, 'level');
      await pickComboboxOption(page, operatorCombobox(), '!=');
      // The single string value Input has no accessible name, but it is the
      // only plain textbox in the row (the Combobox inputs have role combobox).
      const singleValueInput = filterRow.getByRole('textbox');
      await singleValueInput.fill('info');
      await singleValueInput.blur();

      await expect(sqlPreview(page)).toContainText(`WHERE ( level != 'info' )`);
      let body = await runQueryAndGetBody(page, explorePage);
      // seed.sql: 5 of the 10 rows are level=info, leaving 5 that are not.
      expect(rowCount(body)).toBe(5);

      // Phase 2: level IN ('error', 'warn'). Switching to a multi-value
      // operator converts the value editor to the comma separated Input.
      await pickComboboxOption(page, operatorCombobox(), 'IN');
      const multiValueInput = page.getByPlaceholder('comma separated values');
      await multiValueInput.fill('error,warn');
      await multiValueInput.blur();

      await expect(sqlPreview(page)).toContainText(`WHERE ( level IN ('error', 'warn') )`);
      body = await runQueryAndGetBody(page, explorePage);
      // seed.sql: 2 error rows plus 1 warn row.
      expect(rowCount(body)).toBe(3);

      // Phase 3: message LIKE '%Scheduled%'. Changing the column resets the
      // operator, so it is re-picked before entering the value.
      await pickComboboxOption(page, keyCombobox, 'message');
      await pickComboboxOption(page, operatorCombobox(), 'LIKE');
      const likeValueInput = filterRow.getByRole('textbox');
      await likeValueInput.fill('Scheduled');
      await likeValueInput.blur();

      await expect(sqlPreview(page)).toContainText(`WHERE ( message LIKE '%Scheduled%' )`);
      body = await runQueryAndGetBody(page, explorePage);
      // seed.sql: exactly two messages mention 'Scheduled task'.
      expect(rowCount(body)).toBe(2);
    });
  });

  test.describe('Editor type round-trip', () => {
    test('aggregate query survives builder to SQL editor and back without losing state', async ({
      page,
      explorePage,
    }) => {
      await buildCountByLevelQuery(page);

      const preview = sqlPreview(page);
      await expect(preview).toContainText('GROUP BY level');
      const previewSql = ((await preview.textContent()) ?? '').trim();

      // Builder to SQL editor: no confirmation in this direction, and the
      // Monaco editor receives the generated SQL. The 'count(*)' fragment
      // contains no spaces, so the assertion is immune to Monaco rendering
      // spaces as non-breaking spaces.
      await page.getByRole('radio', { name: 'SQL Editor' }).click();
      await expect(page.getByRole('radio', { name: 'SQL Editor' })).toBeChecked();
      await expect(page.getByRole('code')).toContainText('count(*)');

      // The executed SQL must be exactly the previewed SQL.
      const requestPromise = page.waitForRequest((r) => r.url().includes('/api/ds/query') && r.method() === 'POST');
      const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
      await runQuery(page);
      const request = await requestPromise;
      await responsePromise;
      const requestBody = JSON.parse(request.postData() ?? '{}') as DsQueryRequest;
      expect(requestBody.queries?.[0]?.editorType).toBe('sql');
      expect(requestBody.queries?.[0]?.rawSql).toBe(previewSql);
      // seed.sql has four distinct level values, one aggregate row each.
      expect(rowCount(getBody())).toBe(4);

      // SQL editor back to builder: the SQL parses as a plain SELECT, so the
      // lossy-conversion confirmation ('Are you sure?') appears and is
      // dismissed via Continue inside switchToBuilderMode. The reconstructed
      // builder state must regenerate the identical SQL.
      await switchToBuilderMode(page);
      await expect(page.getByRole('radio', { name: 'Aggregate', exact: true })).toBeChecked();
      await expect(builderFieldRow(page, 'Group By')).toContainText('level');
      await expect(sqlPreview(page)).toHaveText(previewSql);
    });
  });
});
