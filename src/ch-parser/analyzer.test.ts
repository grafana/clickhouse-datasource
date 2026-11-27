// cspell:ignore SELCT
import { getDiagnostics } from '@clickhouse/analyzer';
import { analyzerValidate, initAnalyzer } from './analyzer';

jest.mock('@clickhouse/analyzer', () => ({
  init: jest.fn(() => Promise.resolve()),
  getDiagnostics: jest.fn(),
}));

const mockGetDiagnostics = jest.mocked(getDiagnostics);

interface Diagnostic {
  message: string;
  range: [number, number];
  severity: 'Error' | 'Warning' | 'Hint';
  suggestion?: { message: string; replacement: string | null } | null;
}

const diagnostics = (...items: Diagnostic[]) => JSON.stringify(items.map((d) => ({ suggestion: null, ...d })));

describe('analyzerValidate', () => {
  it('returns null before the WASM has loaded', () => {
    expect(analyzerValidate('SELECT 1')).toBeNull();
    expect(mockGetDiagnostics).not.toHaveBeenCalled();
  });

  describe('once the WASM has loaded', () => {
    beforeAll(() => initAnalyzer());
    beforeEach(() => mockGetDiagnostics.mockReset());

    it('is valid when no diagnostic has Error severity', () => {
      mockGetDiagnostics.mockReturnValue(diagnostics({ message: 'w', range: [0, 1], severity: 'Warning' }));
      expect(analyzerValidate('SELECT 1')).toEqual({ valid: true });
    });

    it('reports the first Error and prefers the suggestion as the expected text', () => {
      mockGetDiagnostics.mockReturnValue(
        diagnostics(
          { message: 'w', range: [0, 1], severity: 'Warning' },
          {
            message: 'Unexpected token',
            range: [0, 5],
            severity: 'Error',
            suggestion: { message: 'Did you mean SELECT?', replacement: 'SELECT' },
          },
          { message: 'later', range: [6, 7], severity: 'Error' }
        )
      );
      expect(analyzerValidate('SELCT 1')).toEqual({
        valid: false,
        error: {
          startLine: 1,
          endLine: 1,
          startCol: 1,
          endCol: 6,
          message: 'Unexpected token',
          expected: 'Did you mean SELECT?',
        },
      });
    });

    it('returns null when the diagnostics cannot be parsed', () => {
      mockGetDiagnostics.mockReturnValue('not json');
      expect(analyzerValidate('SELECT 1')).toBeNull();
    });

    it('converts UTF-8 byte offsets to editor columns', () => {
      const sql = "SELECT '日本語' FROM foo WHERE";
      mockGetDiagnostics.mockReturnValue(
        diagnostics({ message: 'Expected expression', range: [33, 33], severity: 'Error' })
      );
      const result = analyzerValidate(sql);
      expect(result?.error).toMatchObject({ startLine: 1, startCol: sql.length + 1, endCol: sql.length + 1 });
    });

    it('maps offsets across multiple lines', () => {
      mockGetDiagnostics.mockReturnValue(
        diagnostics({ message: 'Expected expression', range: [21, 21], severity: 'Error' })
      );
      expect(analyzerValidate('SELECT a\nFROM t WHERE')?.error).toMatchObject({
        startLine: 2,
        startCol: 13,
        endLine: 2,
        endCol: 13,
      });
    });

    it('maps offsets after a macro placeholder back to the editor text', () => {
      const sql = 'SELECT a FROM t WHERE $__timeFilter(ts) AND';
      const preprocessed = 'SELECT a FROM t WHERE __macro_timeFilter__(ts) AND';
      mockGetDiagnostics.mockReturnValue(
        diagnostics({
          message: 'Expected expression',
          range: [preprocessed.length, preprocessed.length],
          severity: 'Error',
        })
      );
      expect(analyzerValidate(sql)?.error).toMatchObject({ startCol: sql.length + 1, endCol: sql.length + 1 });
      expect(mockGetDiagnostics).toHaveBeenCalledWith(preprocessed);
    });

    it('maps a range covering a placeholder onto the original macro text', () => {
      mockGetDiagnostics.mockReturnValue(
        diagnostics({ message: 'Unexpected token', range: [22, 42], severity: 'Error' })
      );
      expect(analyzerValidate('SELECT a FROM t WHERE $__timeFilter(ts) AND')?.error).toMatchObject({
        startCol: 23,
        endCol: 36,
      });
    });

    it('replaces global macros and bare variables and keeps the SETTINGS clause', () => {
      mockGetDiagnostics.mockReturnValue('[]');
      analyzerValidate(
        'SELECT a FROM t WHERE ts > $__from AND svc = $svc AND x IN (SELECT 1 FROM system.settings) SETTINGS max_threads = 1'
      );
      expect(mockGetDiagnostics).toHaveBeenCalledWith(
        'SELECT a FROM t WHERE ts > __macro_from__ AND svc = __var_svc__ AND x IN (SELECT 1 FROM system.settings) SETTINGS max_threads = 1'
      );
    });

    it('leaves the tag of a dollar-quoted string intact', () => {
      mockGetDiagnostics.mockReturnValue('[]');
      analyzerValidate("SELECT $tag$ it's $tag$ FROM t");
      expect(mockGetDiagnostics).toHaveBeenCalledWith("SELECT $tag$ it's $tag$ FROM t");
    });
  });
});
