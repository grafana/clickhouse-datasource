import { request } from '@playwright/test';
import { DATASOURCE_UID, PLUGIN_TYPE } from './env';

const BASE_URL = process.env.GRAFANA_URL || `http://localhost:${process.env.PORT || 3000}`;

export interface TestDataSource {
  uid: string;
  name: string;
  /** Merged over the base e2e data source's jsonData. */
  jsonData: Record<string, unknown>;
}

async function newAdminApiContext() {
  return request.newContext({
    baseURL: BASE_URL,
    httpCredentials: {
      username: process.env.GRAFANA_ADMIN_USER || 'admin',
      password: process.env.GRAFANA_ADMIN_PASSWORD || 'admin',
    },
  });
}

/**
 * Creates data sources through the Grafana API, inheriting the connection settings of the base
 * e2e data source so a spec works wherever that one points. A password cannot be inherited
 * (secure fields are write-only), so callers need a passwordless ClickHouse and must skip on Cloud.
 */
export async function createTestDataSources(dataSources: TestDataSource[]) {
  const ctx = await newAdminApiContext();
  const baseRes = await ctx.get(`/api/datasources/uid/${DATASOURCE_UID}`);
  if (!baseRes.ok()) {
    throw new Error(`Failed to read base datasource ${DATASOURCE_UID}: ${baseRes.status()}`);
  }
  const baseJsonData = (await baseRes.json())?.jsonData ?? {};

  for (const { uid, name, jsonData } of dataSources) {
    const res = await ctx.post('/api/datasources', {
      data: { name, uid, type: PLUGIN_TYPE, access: 'proxy', jsonData: { ...baseJsonData, ...jsonData } },
    });
    // 409 = already created by a parallel worker; anything else is a real failure.
    if (!res.ok() && res.status() !== 409) {
      throw new Error(`Failed to create e2e datasource ${uid}: ${res.status()} ${await res.text()}`);
    }
  }
  await ctx.dispose();
}

export async function deleteTestDataSources(dataSources: Array<Pick<TestDataSource, 'uid'>>) {
  const ctx = await newAdminApiContext();
  for (const { uid } of dataSources) {
    // Returns 404 when absent; APIRequestContext does not throw on non-2xx.
    await ctx.delete(`/api/datasources/uid/${uid}`);
  }
  await ctx.dispose();
}
