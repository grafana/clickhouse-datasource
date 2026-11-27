import { init as wasmInit, getDiagnostics } from '@clickhouse/analyzer';
import { replaceGrafanaSyntax, toOriginalIndex } from './macro-preprocessor';
import { offsetToLineCol } from './helpers';
import { Validation } from 'data/validate';

let initialized = false;
let initPromise: Promise<void> | null = null;

/** Loads the analyzer WASM once. Later calls return the same promise. */
export function initAnalyzer(): Promise<void> {
  if (!initPromise) {
    // The glue resolves the .wasm beside itself via import.meta.url, which webpack
    // rewrites to the emitted asset under the plugin's runtime public path.
    initPromise = wasmInit().then(() => {
      initialized = true;
    });
  }
  return initPromise;
}

interface RawDiagnostic {
  message: string;
  /** UTF-8 byte offsets into the analyzed text. */
  range: [number, number];
  severity: 'Error' | 'Warning' | 'Hint';
  suggestion: { message: string; replacement: string | null } | null;
}

function byteOffsetToIndex(text: string, byteOffset: number): number {
  let bytes = 0;
  let index = 0;
  for (const ch of text) {
    if (bytes >= byteOffset) {
      break;
    }
    const codePoint = ch.codePointAt(0) ?? 0;
    bytes += codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
    index += ch.length;
  }
  return index;
}

/**
 * Validates `sql` with the ClickHouse analyzer, or returns null while the WASM
 * has not finished loading or its output cannot be read.
 */
export function analyzerValidate(sql: string): Validation | null {
  if (!initialized) {
    return null;
  }

  const { preprocessed, macroMap } = replaceGrafanaSyntax(sql);

  let diagnostics: RawDiagnostic[];
  try {
    diagnostics = JSON.parse(getDiagnostics(preprocessed)) as RawDiagnostic[];
  } catch {
    return null;
  }

  const first = diagnostics.find((d) => d.severity === 'Error');
  if (!first) {
    return { valid: true };
  }

  const toEditorPosition = (byteOffset: number) =>
    offsetToLineCol(sql, toOriginalIndex(preprocessed, byteOffsetToIndex(preprocessed, byteOffset), macroMap));
  const start = toEditorPosition(first.range[0]);
  const end = toEditorPosition(first.range[1]);

  return {
    valid: false,
    error: {
      startLine: start.line,
      endLine: end.line,
      startCol: start.col,
      endCol: end.col,
      message: first.message,
      expected: first.suggestion?.message ?? first.message,
    },
  };
}
