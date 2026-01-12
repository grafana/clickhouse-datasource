import { hasTimeFilter, injectTimeFilter, _testExports } from './autoTimeFilter';
import { findMainClausePosition } from './sqlUtils';

const { injectWhereClause } = _testExports;

describe('hasTimeFilter', () => {
  describe('detects time filter macros', () => {
    it('detects $__timeFilter macro', () => {
      expect(hasTimeFilter('SELECT * FROM table WHERE $__timeFilter(ts)')).toBe(true);
      expect(hasTimeFilter('SELECT * FROM table WHERE $__timeFilter( ts )')).toBe(true);
    });

    it('detects $__timeFilter_ms macro', () => {
      expect(hasTimeFilter('SELECT * FROM table WHERE $__timeFilter_ms(ts)')).toBe(true);
    });

    it('detects $__dateFilter macro', () => {
      expect(hasTimeFilter('SELECT * FROM table WHERE $__dateFilter(date_col)')).toBe(true);
    });

    it('detects $__dateTimeFilter macro', () => {
      expect(hasTimeFilter('SELECT * FROM table WHERE $__dateTimeFilter(ts)')).toBe(true);
    });

    it('detects $__dt macro (alias for dateTimeFilter)', () => {
      expect(hasTimeFilter('SELECT * FROM table WHERE $__dt(ts)')).toBe(true);
    });
  });

  describe('detects time value variables', () => {
    it('detects $__fromTime variable', () => {
      expect(hasTimeFilter('SELECT * FROM table WHERE ts >= $__fromTime')).toBe(true);
    });

    it('detects $__toTime variable', () => {
      expect(hasTimeFilter('SELECT * FROM table WHERE ts <= $__toTime')).toBe(true);
    });

    it('detects $__fromTime_ms variable', () => {
      expect(hasTimeFilter('SELECT * FROM table WHERE ts >= $__fromTime_ms')).toBe(true);
    });

    it('detects $__toTime_ms variable', () => {
      expect(hasTimeFilter('SELECT * FROM table WHERE ts <= $__toTime_ms')).toBe(true);
    });
  });

  describe('returns false for queries without time filter', () => {
    it('returns false for simple query', () => {
      expect(hasTimeFilter('SELECT * FROM table')).toBe(false);
    });

    it('returns false for query with WHERE but no time filter', () => {
      expect(hasTimeFilter('SELECT * FROM table WHERE status = 1')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(hasTimeFilter('')).toBe(false);
    });

    it('returns false for similar but different variable names', () => {
      expect(hasTimeFilter('SELECT * FROM table WHERE ts = $fromTime')).toBe(false);
      expect(hasTimeFilter('SELECT * FROM table WHERE ts = $__time')).toBe(false);
    });
  });
});

describe('injectTimeFilter', () => {
  const defaultOptions = {
    enabled: true,
    timeColumn: 'timestamp',
    timeColumnType: 'DateTime' as const,
  };

  describe('skips injection when not needed', () => {
    it('returns original SQL when disabled', () => {
      const sql = 'SELECT * FROM table';
      const result = injectTimeFilter(sql, { ...defaultOptions, enabled: false });
      expect(result).toBe(sql);
    });

    it('returns original SQL when timeColumn is empty', () => {
      const sql = 'SELECT * FROM table';
      const result = injectTimeFilter(sql, { ...defaultOptions, timeColumn: '' });
      expect(result).toBe(sql);
    });

    it('returns original SQL when time filter already exists', () => {
      const sql = 'SELECT * FROM table WHERE $__timeFilter(ts)';
      const result = injectTimeFilter(sql, defaultOptions);
      expect(result).toBe(sql);
    });

    it('skips non-SELECT queries', () => {
      const sql = 'INSERT INTO table VALUES (1, 2)';
      const result = injectTimeFilter(sql, defaultOptions);
      expect(result).toBe(sql);
    });
  });

  describe('injects WHERE clause correctly', () => {
    it('appends WHERE when none exists', () => {
      const sql = 'SELECT * FROM table';
      const result = injectTimeFilter(sql, defaultOptions);
      expect(result).toBe('SELECT * FROM table WHERE $__timeFilter("timestamp")');
    });

    it('prepends to existing WHERE clause', () => {
      const sql = 'SELECT * FROM table WHERE status = 1';
      const result = injectTimeFilter(sql, defaultOptions);
      expect(result).toBe('SELECT * FROM table WHERE $__timeFilter("timestamp") AND status = 1');
    });

    it('inserts before GROUP BY', () => {
      const sql = 'SELECT count(*) FROM table GROUP BY status';
      const result = injectTimeFilter(sql, defaultOptions);
      expect(result).toBe('SELECT count(*) FROM table WHERE $__timeFilter("timestamp") GROUP BY status');
    });

    it('inserts before ORDER BY', () => {
      const sql = 'SELECT * FROM table ORDER BY ts DESC';
      const result = injectTimeFilter(sql, defaultOptions);
      expect(result).toBe('SELECT * FROM table WHERE $__timeFilter("timestamp") ORDER BY ts DESC');
    });

    it('inserts before LIMIT', () => {
      const sql = 'SELECT * FROM table LIMIT 100';
      const result = injectTimeFilter(sql, defaultOptions);
      expect(result).toBe('SELECT * FROM table WHERE $__timeFilter("timestamp") LIMIT 100');
    });

    it('removes trailing semicolon', () => {
      const sql = 'SELECT * FROM table;';
      const result = injectTimeFilter(sql, defaultOptions);
      expect(result).toBe('SELECT * FROM table WHERE $__timeFilter("timestamp")');
    });
  });

  describe('uses correct macro based on column type', () => {
    it('uses $__timeFilter for DateTime', () => {
      const sql = 'SELECT * FROM table';
      const result = injectTimeFilter(sql, { ...defaultOptions, timeColumnType: 'DateTime' });
      expect(result).toContain('$__timeFilter');
      expect(result).not.toContain('$__timeFilter_ms');
    });

    it('uses $__timeFilter_ms for DateTime64', () => {
      const sql = 'SELECT * FROM table';
      const result = injectTimeFilter(sql, { ...defaultOptions, timeColumnType: 'DateTime64' });
      expect(result).toContain('$__timeFilter_ms');
    });
  });

  describe('handles complex queries', () => {
    it('handles query with WHERE and GROUP BY', () => {
      const sql = 'SELECT status, count(*) FROM table WHERE status > 0 GROUP BY status';
      const result = injectTimeFilter(sql, defaultOptions);
      expect(result).toBe(
        'SELECT status, count(*) FROM table WHERE $__timeFilter("timestamp") AND status > 0 GROUP BY status'
      );
    });

    it('handles query with multiple clauses', () => {
      const sql = 'SELECT * FROM table WHERE x = 1 GROUP BY y ORDER BY z LIMIT 10';
      const result = injectTimeFilter(sql, defaultOptions);
      expect(result).toBe(
        'SELECT * FROM table WHERE $__timeFilter("timestamp") AND x = 1 GROUP BY y ORDER BY z LIMIT 10'
      );
    });

    it('handles SETTINGS clause', () => {
      const sql = 'SELECT * FROM table SETTINGS max_execution_time=60';
      const result = injectTimeFilter(sql, defaultOptions);
      expect(result).toBe('SELECT * FROM table WHERE $__timeFilter("timestamp") SETTINGS max_execution_time=60');
    });
  });
});

describe('findMainClausePosition', () => {
  it('finds WHERE in simple query', () => {
    const sql = 'SELECT * FROM table WHERE x = 1';
    const pos = findMainClausePosition(sql, 'WHERE');
    expect(pos).toBeGreaterThan(0);
    expect(sql.slice(pos, pos + 5)).toBe('WHERE');
  });

  it('finds GROUP BY', () => {
    const sql = 'SELECT * FROM table GROUP BY x';
    const pos = findMainClausePosition(sql, 'GROUP BY');
    expect(pos).toBeGreaterThan(0);
    expect(sql.slice(pos, pos + 8)).toBe('GROUP BY');
  });

  it('returns -1 when clause not found', () => {
    const sql = 'SELECT * FROM table';
    const pos = findMainClausePosition(sql, 'WHERE');
    expect(pos).toBe(-1);
  });

  it('skips WHERE inside subquery', () => {
    const sql = 'SELECT * FROM (SELECT * FROM t WHERE y = 1) GROUP BY x';
    const pos = findMainClausePosition(sql, 'WHERE');
    // Should not find WHERE because it's inside parentheses
    expect(pos).toBe(-1);
  });

  it('finds WHERE outside subquery', () => {
    const sql = 'SELECT * FROM (SELECT * FROM t) WHERE x = 1';
    const pos = findMainClausePosition(sql, 'WHERE');
    expect(pos).toBeGreaterThan(0);
    expect(sql.slice(pos, pos + 5)).toBe('WHERE');
  });
});

describe('injectWhereClause', () => {
  const condition = '$__timeFilter("ts")';

  it('adds WHERE when none exists', () => {
    const result = injectWhereClause('SELECT * FROM table', condition);
    expect(result).toBe(`SELECT * FROM table WHERE ${condition}`);
  });

  it('prepends to existing WHERE', () => {
    const result = injectWhereClause('SELECT * FROM table WHERE x = 1', condition);
    expect(result).toBe(`SELECT * FROM table WHERE ${condition} AND x = 1`);
  });

  it('inserts before GROUP BY when no WHERE', () => {
    const result = injectWhereClause('SELECT * FROM table GROUP BY x', condition);
    expect(result).toBe(`SELECT * FROM table WHERE ${condition} GROUP BY x`);
  });
});
