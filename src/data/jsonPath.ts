// Shared construction of ClickHouse JSON sub-path access expressions, so the
// query builder (sqlGenerator), the adhoc filter builder (adHocFilter) and
// adhoc tag-value fetching (CHDatasource) don't drift on quoting/escaping/cast.

// Backslash-escape backslashes and backticks so a segment can't close the
// backtick identifier early (invalid SQL, and an injection vector when the
// segment comes from data or user input).
export function escapeJSONPathSegment(segment: string): string {
  return segment.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
}

/**
 * Build a JSON sub-path access expression, e.g.
 * `buildJSONPathAccess('attrs', 'a.b')` → ``attrs.`a`.`b`::Nullable(String)``.
 *
 * The `Nullable(String)` cast is required: JSON sub-paths are `Dynamic`, which
 * `IN` / `NOT IN` reject with ILLEGAL_TYPE_OF_ARGUMENT, and an uncast sub-path
 * also reads all-null over Grafana's native protocol. The cast still preserves
 * the `IS NULL` signal for missing paths. Only the path segments are escaped;
 * `column` is emitted as-is, so the caller is responsible for passing a valid
 * column identifier.
 */
export function buildJSONPathAccess(column: string, path: string): string {
  const segments = path
    .split('.')
    .map((segment) => '`' + escapeJSONPathSegment(segment) + '`')
    .join('.');
  return `${column}.${segments}::Nullable(String)`;
}

// Inverse of escapeJSONPathSegment: `\X` → `X`.
export function unescapeJSONPathSegment(segment: string): string {
  return segment.replace(/\\(.)/g, '$1');
}

/**
 * Mint a self-describing ad-hoc filter key for a JSON sub-path, e.g.
 * `('ResourceAttributes', 'k8s.pod.name')` → ``ResourceAttributes.`k8s`.`pod`.`name` ``.
 *
 * The backtick form is what makes JSON keys stateless (like #2079's Map
 * bracket form): `escapeKey` and the tag-value path recognize it via
 * `parseJSONAdhocKey` and render it with no Map/JSON column cache, so a saved
 * filter applies on a fresh dashboard load. The cast is applied at render time
 * by `buildJSONPathAccess`, not baked into the stored key (it would show in the
 * dropdown).
 */
export function mintJSONAdhocKey(baseText: string, path: string): string {
  const segments = path
    .split('.')
    .map((segment) => '`' + escapeJSONPathSegment(segment) + '`')
    .join('.');
  return `${baseText}.${segments}`;
}

// Optional `table.` prefix, the JSON column, then one or more backtick-quoted
// path segments. The segment body allows escaped chars so a `\`` can't end the
// match early.
const JSON_ADHOC_KEY = /^(?:[^.`]+\.)?([^.`]+)((?:\.`(?:[^`\\]|\\.)*`)+)$/;

/**
 * Parse a key minted by `mintJSONAdhocKey` back into `{ column, path }` (any
 * `table.` prefix is dropped). Returns `undefined` for keys not in the backtick
 * JSON form (Map bracket, bare column, legacy dotted), so callers can fall
 * through to the existing handling.
 */
export function parseJSONAdhocKey(s: string): { column: string; path: string } | undefined {
  const m = s.match(JSON_ADHOC_KEY);
  if (!m) {
    return undefined;
  }
  const column = m[1];
  const segments = [...m[2].matchAll(/`((?:[^`\\]|\\.)*)`/g)].map((seg) => unescapeJSONPathSegment(seg[1]));
  return { column, path: segments.join('.') };
}
