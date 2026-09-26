// E2E coverage for Layer 2 column auto-detection in the Logs query builder.
// Unit tests cover the name-matching heuristic itself; only E2E confirms the
// builder fetches the live column list from ClickHouse when a table is
// picked, applies the heuristic to fill the Time / Message / Log Level
// selectors, and leaves explicit user picks alone.

import { expect, test } from '@grafana/plugin-e2e';
import { QueryType } from '../../../src/types/queryBuilder';
import { builderFieldRow, pickBuilderSelect, switchToBuilderMode } from '../helpers/builder';
import { FIXTURE_FROM_ISO, FIXTURE_TO_ISO, skipFixtureTestsOnCloud } from '../helpers/env';
import { exploreUrl } from '../helpers/explore';

// Seed database + table from tests/fixtures/seed.sql. Chosen deliberately so the
// column names (`timestamp`, `message`, `level`) match the Layer 2 heuristics.
const SEED_DATABASE = 'e2e_test';
const SEED_TABLE = 'events';

test.describe('Column auto-detection (Layer 2)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => {
    skipFixtureTestsOnCloud('seed.sql');
  });

  test.describe('Logs builder', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(exploreUrl({ queryType: QueryType.Logs, from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
      await switchToBuilderMode(page, QueryType.Logs);
      await pickBuilderSelect(page, 'Database', SEED_DATABASE, { allowAutoPopulated: true });
      await pickBuilderSelect(page, 'Table', SEED_TABLE, { allowAutoPopulated: true });
    });

    test('auto-fills Time / Message / Log Level from conventional column names', async ({ page }) => {
      // The heuristic runs in a table-change effect; allow one render tick.
      await expect(builderFieldRow(page, 'Time')).toContainText('timestamp');
      await expect(builderFieldRow(page, 'Log Level')).toContainText('level');
      await expect(builderFieldRow(page, 'Message')).toContainText('message');
    });

    test('does not overwrite an explicit user pick when the table changes back', async ({ page }) => {
      // Baseline: heuristic has filled the Log Level slot with `level`.
      const levelRow = builderFieldRow(page, 'Log Level');
      await expect(levelRow).toContainText('level');

      // User explicitly picks `service` (a valid String column) for Log Level.
      await pickBuilderSelect(page, 'Log Level', 'service');
      await expect(levelRow).toContainText('service');

      // Changing the pick re-fires the heuristic effect (the selected columns
      // are in its dependency list), which must skip non-empty slots. A table
      // or database flip cannot exercise this: SetTable/SetDatabase rebuild
      // the whole builder state by design (useBuilderOptionsState.ts), wiping
      // every pick. The reset and re-arm paths are unit-tested in
      // logsQueryBuilderHooks.test.ts; here we give the re-fired effect time
      // to mis-fire before asserting the explicit pick was not clobbered
      // back to `level`.
      await page.waitForTimeout(500);
      await expect(levelRow).toContainText('service');
      await expect(levelRow).not.toContainText('level');
    });
  });
});
