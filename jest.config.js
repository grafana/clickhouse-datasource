// force timezone to UTC to allow tests to work regardless of local timezone
// generally used by snapshots, but can affect specific tests
process.env.TZ = 'UTC';

const baseConfig = require('./.config/jest.config');

module.exports = {
  // Jest configuration provided by Grafana scaffolding
  ...baseConfig,
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
    // Redirect @clickhouse/analyzer to a synchronous mock — the real package is
    // ESM+WASM and cannot run in Jest's jsdom environment.
    '@clickhouse/analyzer': '<rootDir>/src/__mocks__/clickhouse-analyzer.ts',
  },
};
