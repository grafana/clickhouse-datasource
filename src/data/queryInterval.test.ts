import { applyMinIntervalToScopedVars, parseMinIntervalMs } from './queryInterval';

describe('parseMinIntervalMs', () => {
  it('parses a single integer plus a unit', () => {
    expect(parseMinIntervalMs('500ms')).toBe(500);
    expect(parseMinIntervalMs('10s')).toBe(10000);
    expect(parseMinIntervalMs(' 5m ')).toBe(5 * 60 * 1000);
    expect(parseMinIntervalMs('2h')).toBe(2 * 60 * 60 * 1000);
    expect(parseMinIntervalMs('1d')).toBe(24 * 60 * 60 * 1000);
    expect(parseMinIntervalMs('1w')).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('returns undefined for empty or invalid input', () => {
    expect(parseMinIntervalMs(undefined)).toBeUndefined();
    expect(parseMinIntervalMs('')).toBeUndefined();
    expect(parseMinIntervalMs('   ')).toBeUndefined();
    expect(parseMinIntervalMs('soon')).toBeUndefined();
    expect(parseMinIntervalMs('0s')).toBeUndefined();
  });

  // Forms rangeUtil.intervalToMs would accept (or read differently) while the
  // backend parser rejects them — the two sides have to agree, so both refuse.
  it('rejects forms the backend parser would not apply', () => {
    expect(parseMinIntervalMs('60')).toBeUndefined();
    expect(parseMinIntervalMs('5minutes')).toBeUndefined();
    expect(parseMinIntervalMs('5mm')).toBeUndefined();
    expect(parseMinIntervalMs('1.5m')).toBeUndefined();
    expect(parseMinIntervalMs('1h30m')).toBeUndefined();
    expect(parseMinIntervalMs('-5m')).toBeUndefined();
  });

  // Month and year mean different lengths on the two sides (30d vs 365.25/12 d).
  it('rejects month and year units', () => {
    expect(parseMinIntervalMs('1M')).toBeUndefined();
    expect(parseMinIntervalMs('1y')).toBeUndefined();
  });

  it('rejects values past the shared upper bound', () => {
    expect(parseMinIntervalMs('365d')).toBe(365 * 24 * 60 * 60 * 1000);
    expect(parseMinIntervalMs('366d')).toBeUndefined();
    expect(parseMinIntervalMs('100000d')).toBeUndefined();
    expect(parseMinIntervalMs('9999999999d')).toBeUndefined();
  });
});

describe('applyMinIntervalToScopedVars', () => {
  const scoped = {
    __interval: { text: '30s', value: '30s' },
    __interval_ms: { text: '30000', value: 30000 },
  };

  it('raises the interval when the floor is coarser', () => {
    expect(applyMinIntervalToScopedVars(scoped, '5m')).toEqual({
      __interval: { text: '5m', value: '5m' },
      __interval_ms: { text: '300000', value: 300000 },
    });
  });

  it('leaves the interval alone when it already meets the floor', () => {
    expect(applyMinIntervalToScopedVars(scoped, '10s')).toBe(scoped);
  });

  it('leaves the interval alone without a usable floor', () => {
    expect(applyMinIntervalToScopedVars(scoped, undefined)).toBe(scoped);
    expect(applyMinIntervalToScopedVars(scoped, 'soon')).toBe(scoped);
    expect(applyMinIntervalToScopedVars(scoped, '60')).toBe(scoped);
  });

  it('compares against __interval when __interval_ms is missing', () => {
    const withoutMs = { __interval: { text: '1h', value: '1h' } };
    expect(applyMinIntervalToScopedVars(withoutMs, '5m')).toBe(withoutMs);
    expect(applyMinIntervalToScopedVars(withoutMs, '2h')).toEqual({
      __interval: { text: '2h', value: '2h' },
      __interval_ms: { text: '7200000', value: 7200000 },
    });
  });

  it('applies the floor when no interval is in scope', () => {
    expect(applyMinIntervalToScopedVars({}, '1m')).toEqual({
      __interval: { text: '1m', value: '1m' },
      __interval_ms: { text: '60000', value: 60000 },
    });
  });

  it('preserves other scoped vars', () => {
    const result = applyMinIntervalToScopedVars({ ...scoped, foo: { text: 'bar', value: 'bar' } }, '5m');
    expect(result.foo).toEqual({ text: 'bar', value: 'bar' });
  });
});
