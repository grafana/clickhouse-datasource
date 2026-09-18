import { TimeUnit } from 'types/queryBuilder';

const NS_PER_UNIT: Record<TimeUnit, number> = {
  [TimeUnit.Seconds]: 1_000_000_000,
  [TimeUnit.Milliseconds]: 1_000_000,
  [TimeUnit.Microseconds]: 1_000,
  [TimeUnit.Nanoseconds]: 1,
};

const UNIT_ABBREVIATIONS: Record<TimeUnit, string> = {
  [TimeUnit.Seconds]: 's',
  [TimeUnit.Milliseconds]: 'ms',
  [TimeUnit.Microseconds]: 'µs',
  [TimeUnit.Nanoseconds]: 'ns',
};

const SUFFIX_TO_UNIT: Record<string, TimeUnit> = {
  s: TimeUnit.Seconds,
  ms: TimeUnit.Milliseconds,
  us: TimeUnit.Microseconds,
  'µs': TimeUnit.Microseconds,
  ns: TimeUnit.Nanoseconds,
};

/** Ordered longest-first so `ms`/`ns`/`us` match before `s`. */
const SUFFIXES_LONGEST_FIRST = ['ms', 'ns', 'us', 'µs', 's'];

export interface ParsedDuration {
  /** Value normalised to nanoseconds. May be a floating-point number. */
  nanoseconds: number;
  /** Whether the input used an explicit unit suffix (false = bare number). */
  hadSuffix: boolean;
}

/**
 * Parse a human-friendly duration string.
 *
 * Accepted forms (case-insensitive, optional whitespace between number and suffix):
 *   - `<n>` (bare integer or decimal) — interpreted as nanoseconds
 *   - `<n>s`, `<n>ms`, `<n>us` / `<n>µs`, `<n>ns`
 *
 * Rejects: empty strings, negative numbers, NaN, unknown suffixes.
 */
export const parseDurationInput = (text: string): ParsedDuration | { error: string } => {
  if (text === undefined || text === null) {
    return { error: 'Value required' };
  }
  const trimmed = String(text).trim();
  if (trimmed.length === 0) {
    return { error: 'Value required' };
  }

  const lower = trimmed.toLowerCase();
  let numberPart = lower;
  let suffix: string | undefined;
  for (const s of SUFFIXES_LONGEST_FIRST) {
    if (lower.endsWith(s)) {
      suffix = s;
      numberPart = lower.slice(0, -s.length).trim();
      break;
    }
  }

  if (numberPart.length === 0) {
    return { error: 'Missing numeric value' };
  }

  if (!/^-?\d+(\.\d+)?$/.test(numberPart) && !/^-?\.\d+$/.test(numberPart)) {
    return { error: `Unrecognised duration: "${text}"` };
  }

  const n = Number(numberPart);
  if (!Number.isFinite(n)) {
    return { error: `Unrecognised duration: "${text}"` };
  }
  if (n < 0) {
    return { error: 'Duration must be non-negative' };
  }

  const unit = suffix ? SUFFIX_TO_UNIT[suffix] : TimeUnit.Nanoseconds;
  return { nanoseconds: n * NS_PER_UNIT[unit], hadSuffix: Boolean(suffix) };
};

/** Convert a nanosecond value to the column's stored unit. */
export const nanosecondsToStoredUnit = (ns: number, unit: TimeUnit): number => {
  return ns / NS_PER_UNIT[unit];
};

/** Convert a value already in the stored unit back to nanoseconds. */
export const storedUnitToNanoseconds = (value: number, unit: TimeUnit): number => {
  return value * NS_PER_UNIT[unit];
};

/**
 * Format a stored-unit value as a bare-number string with its unit suffix.
 * Used only as a fallback when a filter has no `rawInput` (e.g. saved queries
 * authored before this UI existed).
 */
export const formatFromStoredUnit = (value: number, unit: TimeUnit): string => {
  return `${value}${UNIT_ABBREVIATIONS[unit]}`;
};

export const storedUnitAbbreviation = (unit: TimeUnit): string => UNIT_ABBREVIATIONS[unit];
