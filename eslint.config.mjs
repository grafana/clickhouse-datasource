import { defineConfig } from 'eslint/config';
import baseConfig from './.config/eslint.config.mjs';

export default defineConfig([
  {
    ignores: [
      '**/logs',
      '**/*.log',
      '**/npm-debug.log*',
      '**/yarn-debug.log*',
      '**/yarn-error.log*',
      '**/node_modules/',
      '**/pids',
      '**/*.pid',
      '**/*.seed',
      '**/*.pid.lock',
      '**/lib-cov',
      '**/coverage',
      '**/dist/',
      '**/artifacts/',
      '**/work/',
      '**/ci/',
      '**/e2e-results/',
      '**/test_summary.json',
      '**/.idea',
      'pkg/__debug_bin',
      '**/.DS_Store',
      '**/.eslintcache',
      'test-results/',
      'playwright-report/',
      'blob-report/',
      'playwright/.cache/',
      'playwright/.auth/',
    ],
  },
  ...baseConfig,
  {
    // eslint-plugin-react-hooks 7 adds React Compiler rules that flag the existing prop-to-state
    // syncing and render-time ref tracking. Warn until those call sites are refactored, so the
    // dependency bump itself changes no behaviour.
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
]);
