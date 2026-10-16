import { expect, test } from '@grafana/plugin-e2e';
import { QueryType } from '../../src/types/queryBuilder';
import { builderFieldRow, pickBuilderSelect, switchToBuilderMode } from './helpers/builder';
import { FIXTURE_FROM_ISO, FIXTURE_TO_ISO, skipFixtureTestsOnCloud } from './helpers/env';
import { exploreUrl } from './helpers/explore';
import { rowCount, waitForQueryDataResponseWithBody } from './helpers/queryResponse';
import { runQuery } from './helpers/sqlEditor';

const FIXTURE_ROW_COUNT = 5;

test.describe('OTel logs table that keeps TimestampTime but is keyed on Timestamp (#2103)', () => {
  test.beforeEach(() => {
    skipFixtureTestsOnCloud('otel_logs_2103.sql');
  });

  for (const table of ['otel_logs_2103_local', 'otel_logs_2103']) {
    test(`the logs builder filters ${table} on Timestamp`, async ({ page, explorePage }) => {
      await page.goto(exploreUrl({ queryType: QueryType.Logs, from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
      await switchToBuilderMode(page, QueryType.Logs);
      await pickBuilderSelect(page, 'Database', 'e2e_test');
      await pickBuilderSelect(page, 'Table', table);
      // The switch's label covers its checkbox input.
      await builderFieldRow(page, 'Use OTel').getByRole('checkbox').check({ force: true });

      const sqlPreview = builderFieldRow(page, 'SQL Preview');
      // LogAttributes appears once the OTel column map is applied, so the checks below see the detected schema.
      await expect(sqlPreview).toContainText('LogAttributes');
      await expect(sqlPreview).toContainText(
        `FROM "e2e_test"."${table}" WHERE ( timestamp >= $__fromTime AND timestamp <= $__toTime ) ORDER BY timestamp DESC LIMIT 1000`
      );
      await expect(sqlPreview).not.toContainText('TimestampTime');

      const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
      await runQuery(page);
      await responsePromise;
      expect(rowCount(getBody())).toBe(FIXTURE_ROW_COUNT);
    });
  }
});
