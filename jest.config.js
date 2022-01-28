const standard = require('@grafana/toolkit/src/config/jest.plugin.config');
const globals = standard.jestConfig().globals;
const tsJest = globals['ts-jest'];
const JestRunner = require('jest-runner');

module.exports = {
  ...{
    ...standard.jestConfig(),
    setupFilesAfterEnv: ['<rootDir>/src/test/setupTests.ts'],
    modulePathIgnorePatterns: ['<rootDir>/src/types.ts', '<rootDir>/src/module.ts'],
    globals: {
      ...globals,
      'ts-jest': {
        isolatedModules: tsJest.isolatedModules,
        tsconfig: tsJest.tsConfig,
      },
    },
    ...{runner: './jest-runner-serial.js'}
  },
};
