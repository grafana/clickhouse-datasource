import { expect, test } from '@grafana/plugin-e2e';
import { FIXTURE_FROM_ISO, FIXTURE_TO_ISO, skipFixtureTestsOnCloud } from '../helpers/env';
import { exploreUrl } from '../helpers/explore';
import { frameValues } from '../helpers/queryResponse';
import { runSqlAndGetBody } from '../helpers/sqlEditor';

// Eight rows share one second (tests/fixtures/logs_ms_paging.sql). A logs page of 3 ends mid-second, and the
// next page moves its end to the oldest row of the previous one. The seconds-precision `$__toTime` rounds up
// to the whole second, so it would return the same newest rows again. The millisecond bound
// (`$__toTime_ms + INTERVAL 1 MILLISECOND`) must move the page forward and repeat only the boundary row.

const pageSql = [
  `SELECT "Body" FROM "e2e_test"."logs_ms_paging"`,
  `WHERE ( "TimestampTime" >= $__fromTime AND "TimestampTime" <= $__toTime )`,
  `AND ( "Timestamp" >= $__fromTime_ms AND "Timestamp" < $__toTime_ms + INTERVAL 1 MILLISECOND )`,
  `ORDER BY "Timestamp" DESC LIMIT 3`,
].join(' ');

test.describe('logs millisecond paging', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => {
    skipFixtureTestsOnCloud('logs_ms_paging.sql');
  });

  test('the next page moves past rows that share a second', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    const first = await runSqlAndGetBody(page, explorePage, pageSql);
    expect(frameValues(first)[0]).toEqual(['row-8', 'row-7', 'row-6']);

    // Page 2 ends at the oldest row of page 1 (10:00:00.600).
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: '2024-03-15T10:00:00.600Z' }));
    const second = await runSqlAndGetBody(page, explorePage, pageSql);
    expect(frameValues(second)[0]).toEqual(['row-6', 'row-5', 'row-4']);
  });
});
