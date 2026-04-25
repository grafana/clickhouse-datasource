#!/usr/bin/env node
/**
 * Copies the @clickhouse/analyzer WASM binary from node_modules to src/static/
 * so that CopyWebpackPlugin can include it in dist/static/ at build time.
 */
const { copyFileSync, mkdirSync, existsSync } = require('fs');
const { join } = require('path');

const root = join(__dirname, '..');
const src = join(root, 'node_modules/@clickhouse/analyzer/pkg/clickhouse_analyzer_bg.wasm');
const destDir = join(root, 'src/static');
const dest = join(destDir, 'clickhouse_analyzer_bg.wasm');

if (!existsSync(src)) {
  console.warn('[copy-analyzer-wasm] @clickhouse/analyzer WASM not found at', src);
  console.warn('[copy-analyzer-wasm] Run: npm install (or link the package first)');
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log('[copy-analyzer-wasm] Copied', src, '→', dest);
