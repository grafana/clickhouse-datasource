import {
  buildJSONPathAccess,
  escapeJSONPathSegment,
  mintJSONAdhocKey,
  parseJSONAdhocKey,
  unescapeJSONPathSegment,
} from './jsonPath';

describe('escapeJSONPathSegment', () => {
  it('leaves plain segments unchanged', () => {
    expect(escapeJSONPathSegment('k8s')).toBe('k8s');
  });

  it('escapes a backtick so it cannot close the identifier', () => {
    expect(escapeJSONPathSegment('a`b')).toBe('a\\`b');
  });

  it('escapes a backslash', () => {
    expect(escapeJSONPathSegment('a\\b')).toBe('a\\\\b');
  });

  it('escapes backslash before backtick (no double-escaping)', () => {
    // `a\`b` -> backslash doubled first, then backtick escaped.
    expect(escapeJSONPathSegment('a\\`b')).toBe('a\\\\\\`b');
  });

  it('leaves single quotes untouched (not special inside a backtick identifier)', () => {
    expect(escapeJSONPathSegment("a'b")).toBe("a'b");
  });
});

describe('buildJSONPathAccess', () => {
  it('builds a single-segment cast access', () => {
    expect(buildJSONPathAccess('attrs', 'level')).toBe('attrs.`level`::Nullable(String)');
  });

  it('splits a dotted path into backtick-quoted segments', () => {
    expect(buildJSONPathAccess('attrs', 'k8s.pod.name')).toBe('attrs.`k8s`.`pod`.`name`::Nullable(String)');
  });

  it('escapes backticks in a segment to prevent identifier break-out', () => {
    expect(buildJSONPathAccess('attrs', 'a`b')).toBe('attrs.`a\\`b`::Nullable(String)');
  });

  it('leaves a plain (optionally dotted) column identifier unquoted', () => {
    expect(buildJSONPathAccess('ResourceAttributes', 'x')).toBe('ResourceAttributes.`x`::Nullable(String)');
    expect(buildJSONPathAccess('a.b', 'x')).toBe('a.b.`x`::Nullable(String)');
  });

  it('backtick-quotes a column that is not a plain identifier', () => {
    // A typed/unusual ad-hoc key must not splice arbitrary text into the
    // expression — the column becomes a single (quoted) identifier.
    expect(buildJSONPathAccess("a) OR 1=1--", 'x')).toBe('`a) OR 1=1--`.`x`::Nullable(String)');
  });
});

describe('mintJSONAdhocKey / parseJSONAdhocKey round-trip', () => {
  it('mints a single-segment backtick key', () => {
    expect(mintJSONAdhocKey('ResourceAttributes', 'level')).toBe('ResourceAttributes.`level`');
  });

  it('mints a nested path with one backtick group per level', () => {
    expect(mintJSONAdhocKey('ResourceAttributes', 'k8s.pod.name')).toBe(
      'ResourceAttributes.`k8s`.`pod`.`name`'
    );
  });

  it('preserves a table prefix in the base text', () => {
    expect(mintJSONAdhocKey('otel_logs.ResourceAttributes', 'level')).toBe(
      'otel_logs.ResourceAttributes.`level`'
    );
  });

  it('parses a minted key back to column + raw path (prefix dropped)', () => {
    expect(parseJSONAdhocKey('ResourceAttributes.`k8s`.`pod`.`name`')).toEqual({
      column: 'ResourceAttributes',
      path: 'k8s.pod.name',
    });
  });

  it('drops a table prefix when parsing', () => {
    expect(parseJSONAdhocKey('otel_logs.ResourceAttributes.`level`')).toEqual({
      column: 'ResourceAttributes',
      path: 'level',
    });
  });

  it('round-trips a segment containing a backtick', () => {
    const key = mintJSONAdhocKey('attrs', 'a`b');
    expect(parseJSONAdhocKey(key)).toEqual({ column: 'attrs', path: 'a`b' });
  });

  it('feeds parsed output straight into buildJSONPathAccess', () => {
    const parsed = parseJSONAdhocKey(mintJSONAdhocKey('attrs', 'k8s.pod'))!;
    expect(buildJSONPathAccess(parsed.column, parsed.path)).toBe('attrs.`k8s`.`pod`::Nullable(String)');
  });

  it('returns undefined for a Map bracket key', () => {
    expect(parseJSONAdhocKey("LogAttributes['level']")).toBeUndefined();
  });

  it('returns undefined for a bare/legacy dotted key', () => {
    expect(parseJSONAdhocKey('ResourceAttributes.level')).toBeUndefined();
    expect(parseJSONAdhocKey('ServiceName')).toBeUndefined();
  });
});

describe('unescapeJSONPathSegment', () => {
  it('is the inverse of escapeJSONPathSegment', () => {
    for (const s of ['plain', 'a`b', 'a\\b', 'a\\`b']) {
      expect(unescapeJSONPathSegment(escapeJSONPathSegment(s))).toBe(s);
    }
  });
});
