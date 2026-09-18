import { ScopedVars } from '@grafana/data';

/**
 * Grammar for the per-query min interval, deliberately narrower than
 * rangeUtil.intervalToMs: a single integer plus one unit, anchored at both ends.
 *
 * rangeUtil accepts input the backend's parser rejects or reads differently —
 * bare numbers ("60"), trailing garbage ("5minutes" via an unanchored regex),
 * fractions it truncates ("1.5m" → 1m), and compound durations where it reads
 * only the first unit ("1h30m" → 1h). Month and year are excluded because the
 * two sides disagree on their length (30d vs 365.25/12 d). What is left parses
 * identically here and in pkg/plugin/driver.go, so $__interval and
 * $__timeInterval can never bucket a single query at two resolutions.
 */
const MIN_INTERVAL_PATTERN = /^(\d+)(ms|s|m|h|d|w)$/;

const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Upper bound, mirrored in the backend. Beyond this the emitted SQL is
 * nonsense anyway, and large values overflow time.Duration on the backend —
 * which would silently skip the clamp there while still applying it here.
 */
export const MAX_MIN_INTERVAL_MS = 365 * UNIT_MS.d;

/**
 * Parses a per-query min interval ("10s", "1m", "1d") into milliseconds.
 * Returns undefined for anything the backend would not apply, which means
 * "no floor".
 */
export const parseMinIntervalMs = (minInterval?: string): number | undefined => {
  const matches = minInterval?.trim().match(MIN_INTERVAL_PATTERN);
  if (!matches) {
    return undefined;
  }

  const ms = Number(matches[1]) * UNIT_MS[matches[2]];
  return ms > 0 && ms <= MAX_MIN_INTERVAL_MS ? ms : undefined;
};

/**
 * Raises $__interval / $__interval_ms to the per-query min interval. These two
 * are substituted from scoped vars on the frontend, before the backend sees the
 * query, so the floor the backend applies to backend.DataQuery.Interval (for
 * $__timeInterval and friends) has to be mirrored here.
 */
export const applyMinIntervalToScopedVars = (scoped: ScopedVars, minInterval?: string): ScopedVars => {
  const minIntervalMs = parseMinIntervalMs(minInterval);
  if (minIntervalMs === undefined) {
    return scoped;
  }

  // __interval_ms is authoritative when present; fall back to the __interval
  // duration so a scope carrying only the string form is still compared rather
  // than overwritten with a finer bucket.
  const currentMs = Number.isFinite(Number(scoped.__interval_ms?.value))
    ? Number(scoped.__interval_ms?.value)
    : parseMinIntervalMs(String(scoped.__interval?.value ?? ''));
  if (currentMs !== undefined && currentMs >= minIntervalMs) {
    return scoped;
  }

  const text = (minInterval || '').trim();
  return {
    ...scoped,
    __interval: { text, value: text },
    __interval_ms: { text: String(minIntervalMs), value: minIntervalMs },
  };
};
