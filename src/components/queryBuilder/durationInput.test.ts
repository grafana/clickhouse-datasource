import { TimeUnit } from 'types/queryBuilder';
import {
  formatFromStoredUnit,
  nanosecondsToStoredUnit,
  parseDurationInput,
  storedUnitAbbreviation,
  storedUnitToNanoseconds,
} from './durationInput';

describe('parseDurationInput', () => {
  it.each([
    ['1ns', 1],
    ['500ns', 500],
    ['1us', 1_000],
    ['1µs', 1_000],
    ['1ms', 1_000_000],
    ['10.5ms', 10_500_000],
    ['1s', 1_000_000_000],
    ['1.2s', 1_200_000_000],
    ['2s', 2_000_000_000],
    [' 2S ', 2_000_000_000],
    ['2 s', 2_000_000_000],
    ['0.5s', 500_000_000],
    ['.5s', 500_000_000],
  ])('parses %s to %d ns', (input, expected) => {
    const r = parseDurationInput(input);
    expect('error' in r).toBe(false);
    if (!('error' in r)) {
      expect(r.nanoseconds).toBeCloseTo(expected, 6);
      expect(r.hadSuffix).toBe(true);
    }
  });

  it('treats bare numbers as nanoseconds', () => {
    const r = parseDurationInput('1000000000');
    expect('error' in r).toBe(false);
    if (!('error' in r)) {
      expect(r.nanoseconds).toBe(1_000_000_000);
      expect(r.hadSuffix).toBe(false);
    }
  });

  it.each(['', '   ', 'abc', 's', 'ms', '1.2.3s', '1x', '-5ms'])('rejects %s', (bad) => {
    expect('error' in parseDurationInput(bad)).toBe(true);
  });
});

describe('unit conversion', () => {
  it('nanosecondsToStoredUnit round-trips', () => {
    for (const unit of [TimeUnit.Seconds, TimeUnit.Milliseconds, TimeUnit.Microseconds, TimeUnit.Nanoseconds]) {
      const ns = 1_500_000_000;
      const stored = nanosecondsToStoredUnit(ns, unit);
      expect(storedUnitToNanoseconds(stored, unit)).toBeCloseTo(ns, 3);
    }
  });

  it('converts to milliseconds', () => {
    expect(nanosecondsToStoredUnit(1_200_000_000, TimeUnit.Milliseconds)).toBe(1200);
  });

  it('converts to seconds as a decimal', () => {
    expect(nanosecondsToStoredUnit(1_500_000_000, TimeUnit.Seconds)).toBe(1.5);
  });
});

describe('formatFromStoredUnit', () => {
  it('appends the unit abbreviation', () => {
    expect(formatFromStoredUnit(1200, TimeUnit.Milliseconds)).toBe('1200ms');
    expect(formatFromStoredUnit(1, TimeUnit.Seconds)).toBe('1s');
    expect(formatFromStoredUnit(500, TimeUnit.Nanoseconds)).toBe('500ns');
    expect(formatFromStoredUnit(500, TimeUnit.Microseconds)).toBe('500µs');
  });
});

describe('storedUnitAbbreviation', () => {
  it('returns short unit label', () => {
    expect(storedUnitAbbreviation(TimeUnit.Nanoseconds)).toBe('ns');
    expect(storedUnitAbbreviation(TimeUnit.Microseconds)).toBe('µs');
    expect(storedUnitAbbreviation(TimeUnit.Milliseconds)).toBe('ms');
    expect(storedUnitAbbreviation(TimeUnit.Seconds)).toBe('s');
  });
});
