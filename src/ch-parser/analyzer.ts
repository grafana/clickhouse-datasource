/**
 * Wrapper around @clickhouse/analyzer WASM for ClickHouse-aware SQL validation.
 *
 * Usage:
 *   - Call `initAnalyzer()` once at startup (fire-and-forget) when the feature flag is on.
 *   - Call `analyzerValidate(sql)` synchronously from validate(); returns null if not yet ready.
 *
 * The WASM binary is served from dist/static/clickhouse_analyzer_bg.wasm,
 * placed there by the `prebuild` npm script (scripts/copy-analyzer-wasm.js).
 */

import { init as wasmInit, getDiagnostics } from '@clickhouse/analyzer';
import { preprocessSql } from './macro-preprocessor';
import type { Validation } from 'data/validate';

// Webpack sets this global to the plugin's public base URL (e.g. "public/plugins/…/").
declare const __webpack_public_path__: string;

let initialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Lazy-initialize the WASM module. Safe to call multiple times.
 * The returned promise resolves when the module is ready.
 */
export function initAnalyzer(): Promise<void> {
  if (initialized) {
    return Promise.resolve();
  }
  if (initPromise) {
    return initPromise;
  }
  initPromise = (async () => {
    const wasmUrl = `${__webpack_public_path__}static/clickhouse_analyzer_bg.wasm`;
    await wasmInit(wasmUrl);
    initialized = true;
  })();
  return initPromise;
}

/** Diagnostic shape returned by getDiagnostics() JSON. */
interface RawDiagnostic {
  message: string;
  range: [number, number];
  severity: 'Error' | 'Warning' | 'Information' | 'Hint';
  suggestion: string | null;
  related: unknown[];
}

/** Convert a flat character offset to 1-based line + column. */
function offsetToLineCol(sql: string, offset: number): { line: number; col: number } {
  const clamped = Math.min(offset, sql.length);
  let line = 1;
  let col = 1;
  for (let i = 0; i < clamped; i++) {
    if (sql[i] === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}

/**
 * Validate `sql` using the ClickHouse analyzer WASM.
 *
 * Returns null when:
 *   - The WASM module has not been initialized yet (graceful degradation).
 *   - The diagnostics JSON cannot be parsed (unexpected WASM output).
 *
 * Pre-processes Grafana macros/variables before passing SQL to the analyzer
 * so that constructs like `$__timeFilter(col)` don't produce spurious errors.
 */
export function analyzerValidate(sql: string): Validation | null {
  if (!initialized) {
    return null;
  }

  const { preprocessed } = preprocessSql(sql);

  let diagnostics: RawDiagnostic[];
  try {
    diagnostics = JSON.parse(getDiagnostics(preprocessed)) as RawDiagnostic[];
  } catch {
    return null;
  }

  const errors = diagnostics.filter((d) => d.severity === 'Error');
  if (errors.length === 0) {
    return { valid: true };
  }

  const first = errors[0];
  const start = offsetToLineCol(preprocessed, first.range[0]);
  const end = offsetToLineCol(preprocessed, first.range[1]);

  return {
    valid: false,
    error: {
      startLine: start.line,
      endLine: end.line,
      startCol: start.col,
      endCol: end.col,
      message: first.message,
      expected: first.suggestion ?? first.message,
    },
  };
}
