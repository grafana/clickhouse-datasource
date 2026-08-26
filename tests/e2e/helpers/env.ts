import { test } from '@grafana/plugin-e2e';
import pluginJson from '../../../src/plugin.json';

// Shared environment constants for the E2E suite: plugin identifiers,
// datasource uid values for the local and Cloud runs, and the fixture time window.

export const PLUGIN_TYPE = pluginJson.id;

// GRAFANA_URL is set only by the Cloud cron workflow (see .github/workflows/cron.yml).
// Its presence indicates the local provisioning file and seed fixtures do not apply.
export const isCloudRun = !!process.env.GRAFANA_URL;

// The Cloud dev instance's ClickHouse datasource uid. If it's ever re-provisioned,
// update this constant or set DS_E2E_UID in the workflow as an override.
const CLOUD_DEFAULT_UID = 'clickhouse-native-ds-m';
const LOCAL_DEFAULT_UID = 'clickhouse-e2e';
export const DATASOURCE_UID = process.env.DS_E2E_UID || (isCloudRun ? CLOUD_DEFAULT_UID : LOCAL_DEFAULT_UID);

// Locally provisioned single-source datasources (logs-only / traces-only),
// used by the compact query mode tests.
export const SINGLE_LOGS_DATASOURCE_UID = 'clickhouse-e2e-single-logs';
export const SINGLE_TRACES_DATASOURCE_UID = 'clickhouse-e2e-single-traces';

// Time range that fully covers the seed fixture data in tests/fixtures/
// (all fixture rows sit at 2024-03-15 10:00-10:09 UTC).
export const FIXTURE_FROM_ISO = '2024-03-15T09:45:00.000Z';
export const FIXTURE_TO_ISO = '2024-03-15T10:15:00.000Z';

/**
 * Skip fixture-dependent tests on Cloud runs. Call from a test.beforeEach in
 * any suite that queries tables seeded by tests/fixtures/*.sql.
 */
export function skipFixtureTestsOnCloud(fixtureFile: string) {
  test.skip(
    isCloudRun,
    `Fixture-data tests depend on tables seeded by tests/fixtures/${fixtureFile} via the local e2e-data-loader Docker service, which is not available on Cloud.`
  );
}
