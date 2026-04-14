// force timezone to UTC to allow tests to work regardless of local timezone
// generally used by snapshots, but can affect specific tests
process.env.TZ = 'UTC';

const baseConfig = require('./.config/jest.config');

module.exports = {
  // Jest configuration provided by Grafana scaffolding
  ...baseConfig,
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
    // @clickhouse/analyzer ships ESM plus WASM, which jsdom cannot load.
    '@clickhouse/analyzer': '<rootDir>/src/__mocks__/clickhouse-analyzer.ts',
  },
};
