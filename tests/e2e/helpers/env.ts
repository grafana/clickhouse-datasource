import { test } from '@grafana/plugin-e2e';
import pluginJson from '../../../src/plugin.json';

export const PLUGIN_TYPE = pluginJson.id;

// Set only by the Cloud cron workflow (.github/workflows/cron.yml).
export const isCloudRun = !!process.env.GRAFANA_URL;

// DS_E2E_UID overrides both defaults. If the Cloud dev instance datasource is
// re-provisioned, update CLOUD_DEFAULT_UID.
const CLOUD_DEFAULT_UID = 'clickhouse-native-ds-m';
const LOCAL_DEFAULT_UID = 'clickhouse-e2e';
export const DATASOURCE_UID = process.env.DS_E2E_UID || (isCloudRun ? CLOUD_DEFAULT_UID : LOCAL_DEFAULT_UID);

// Logs-only and traces-only datasources from the local provisioning file.
export const SINGLE_LOGS_DATASOURCE_UID = 'clickhouse-e2e-single-logs';
export const SINGLE_TRACES_DATASOURCE_UID = 'clickhouse-e2e-single-traces';

// Every fixture row in tests/fixtures/ sits at 2024-03-15 10:00-10:09 UTC.
export const FIXTURE_FROM_ISO = '2024-03-15T09:45:00.000Z';
export const FIXTURE_TO_ISO = '2024-03-15T10:15:00.000Z';

/** Call from test.beforeEach in any suite that reads tables seeded by tests/fixtures/*.sql. */
export function skipFixtureTestsOnCloud(fixtureFile: string) {
  test.skip(
    isCloudRun,
    `Fixture-data tests depend on tables seeded by tests/fixtures/${fixtureFile} via the local e2e-data-loader Docker service, which is not available on Cloud.`
  );
}
