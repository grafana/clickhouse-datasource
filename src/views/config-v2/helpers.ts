import { Protocol } from 'types/config';

/**
 * Creates a set of test props for the InfluxDB V2 config page for use in tests.
 * This function allows you to override default properties for specific test cases.
 */
export const createTestProps = (overrides: { options?: object; mocks?: object }) => ({
  options: {
    access: 'proxy',
    basicAuth: false,
    basicAuthUser: '',
    database: '',
    id: 1,
    isDefault: false,
    jsonData: {
      version: '',
      host: '',
      port: 9000,
      protocol: Protocol.Native,
      username: '',
    },
    name: 'ClickHouse',
    orgId: 1,
    readOnly: false,
    secureJsonFields: {},
    type: 'clickhouse',
    typeLogoUrl: '',
    typeName: 'ClickHouse',
    uid: 'z',
    url: '',
    user: '',
    withCredentials: false,
    ...overrides.options,
  },
  onOptionsChange: jest.fn(),
  ...overrides.mocks,
});
