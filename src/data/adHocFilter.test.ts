import { AdHocVariableFilter } from '@grafana/data';
import { AdHocFilter } from './adHocFilter';

describe('AdHocManager', () => {
  it('apply ad hoc filter with no inner query and existing WHERE', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTableFromQuery('SELECT * FROM foo');
    const val = ahm.apply('SELECT stuff FROM foo WHERE col = test', [
      { key: 'key', operator: '=', value: 'val' },
      { key: 'keyNum', operator: '=', value: '123' },
    ] as AdHocVariableFilter[]);
    expect(val).toEqual(
      `SELECT stuff FROM foo WHERE col = test settings additional_table_filters={'foo' : ' key = \\'val\\' AND keyNum = \\'123\\' '}`
    );
  });
  it('apply ad hoc filter with no inner query and no existing WHERE', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTableFromQuery('SELECT * FROM foo');
    const val = ahm.apply('SELECT stuff FROM foo', [
      { key: 'key', operator: '=', value: 'val' },
      { key: 'keyNum', operator: '=', value: '123' },
    ] as AdHocVariableFilter[]);
    expect(val).toEqual(
      `SELECT stuff FROM foo settings additional_table_filters={'foo' : ' key = \\'val\\' AND keyNum = \\'123\\' '}`
    );
  });
  it('apply ad hoc filter with an inner query without existing WHERE', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTableFromQuery('SELECT * FROM foo');
    const val = ahm.apply(`SELECT stuff FROM (SELECT * FROM foo) as r , bar GROUP BY s ORDER BY s`, [
      { key: 'key', operator: '=', value: 'val' },
      { key: 'keyNum', operator: '=', value: '123' },
    ] as AdHocVariableFilter[]);
    expect(val).toEqual(
      `SELECT stuff FROM (SELECT * FROM foo) as r , bar GROUP BY s ORDER BY s settings additional_table_filters={'foo' : ' key = \\'val\\' AND keyNum = \\'123\\' '}`
    );
  });
  it('apply ad hoc filter with an inner from query with existing WHERE', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTableFromQuery('SELECT * FROM foo');
    const val = ahm.apply(`SELECT stuff FROM (SELECT * FROM foo WHERE col = test) as r GROUP BY s ORDER BY s`, [
      { key: 'key', operator: '=', value: 'val' },
      { key: 'keyNum', operator: '=', value: '123' },
    ] as AdHocVariableFilter[]);
    expect(val).toEqual(
      `SELECT stuff FROM (SELECT * FROM foo WHERE col = test) as r GROUP BY s ORDER BY s settings additional_table_filters={'foo' : ' key = \\'val\\' AND keyNum = \\'123\\' '}`
    );
  });
  it('apply ad hoc filter with an inner where query with existing WHERE', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTableFromQuery('SELECT * FROM foo');
    const val = ahm.apply(
      `SELECT * FROM foo WHERE (name = stuff) AND (name IN ( SELECT * FROM foo WHERE (field = 'hello') GROUP BY name ORDER BY count() DESC LIMIT 10 )) GROUP BY name , time ORDER BY time`,
      [{ key: 'key', operator: '=', value: 'val' }] as AdHocVariableFilter[]
    );
    expect(val).toEqual(
      `SELECT * FROM foo WHERE (name = stuff) AND (name IN ( SELECT * FROM foo WHERE (field = 'hello') GROUP BY name ORDER BY count() DESC LIMIT 10 )) GROUP BY name , time ORDER BY time settings additional_table_filters={'foo' : ' key = \\'val\\' '}`
    );
  });
  it('does not apply ad hoc filter when the target table is not in the query', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTableFromQuery('SELECT * FROM bar');
    const val = ahm.apply('select stuff FROM foo', [
      { key: 'key', operator: '=', value: 'val' },
    ] as AdHocVariableFilter[]);
    expect(val).toEqual('select stuff FROM foo');
  });
  it('applies ad hoc filter to a query using ClickHouse SAMPLE syntax', () => {
    const ahm = new AdHocFilter();
    // Previously threw in setTargetTableFromQuery because getTable returned ''.
    ahm.setTargetTableFromQuery('SELECT * FROM otel_logs SAMPLE 0.1');
    const val = ahm.apply('SELECT * FROM otel_logs SAMPLE 0.1', [
      { key: 'ServiceName', operator: '=', value: 'cart' },
    ] as AdHocVariableFilter[]);
    expect(val).toEqual(
      `SELECT * FROM otel_logs SAMPLE 0.1 settings additional_table_filters={'otel_logs' : ' ServiceName = \\'cart\\' '}`
    );
  });
  it('applies ad hoc filter to a backtick-quoted table name', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTableFromQuery('SELECT * FROM `my-db`.`my-table`');
    const val = ahm.apply('SELECT * FROM `my-db`.`my-table`', [
      { key: 'key', operator: '=', value: 'val' },
    ] as AdHocVariableFilter[]);
    expect(val).toEqual(
      "SELECT * FROM `my-db`.`my-table` settings additional_table_filters={'my-db.my-table' : ' key = \\'val\\' '}"
    );
  });
  it('does not throw when the target table name contains regex metacharacters', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTableFromQuery('SELECT * FROM `a[b`');
    expect(() =>
      ahm.apply('SELECT * FROM `a[b`', [{ key: 'key', operator: '=', value: 'val' }] as AdHocVariableFilter[])
    ).not.toThrow();
  });
  it('apply ad hoc filter when the ad hoc options are from a query with a from inline query', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTableFromQuery('SELECT * FROM (select * FROM foo) bar');
    const val = ahm.apply('select stuff FROM foo', [
      { key: 'key', operator: '=', value: 'val' },
    ] as AdHocVariableFilter[]);
    expect(val).toEqual(`select stuff FROM foo settings additional_table_filters={'foo' : ' key = \\'val\\' '}`);
  });
  it('apply ad hoc filter when the ad hoc options are from a query with a where inline query', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTableFromQuery(
      'SELECT * FROM foo where stuff = stuff and (repo in (select * FROM foo)) order by stuff'
    );
    const val = ahm.apply('select stuff FROM foo', [
      { key: 'key', operator: '=', value: 'val' },
    ] as AdHocVariableFilter[]);
    expect(val).toEqual(`select stuff FROM foo settings additional_table_filters={'foo' : ' key = \\'val\\' '}`);
  });
  it('apply ad hoc filter to complex join statement', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTableFromQuery(
      'SELECT * FROM foo where stuff = stuff and (repo in (select * FROM foo)) order by stuff'
    );
    const val = ahm.apply(
      `SELECT number, letter FROM foo AS x INNER JOIN (SELECT number FROM system.numbers LIMIT 5) AS inner_numbers ON inner_numbers.number = x.number ARRAY JOIN ['a', 'b'] AS letter LIMIT 5`,
      [{ key: 'key', operator: '=', value: 'val' }] as AdHocVariableFilter[]
    );
    expect(val).toEqual(
      `SELECT number, letter FROM foo AS x INNER JOIN (SELECT number FROM system.numbers LIMIT 5) AS inner_numbers ON inner_numbers.number = x.number ARRAY JOIN ['a', 'b'] AS letter LIMIT 5 settings additional_table_filters={'foo' : ' key = \\'val\\' '}`
    );
  });
  it('throws an error when the adhoc filter select cannot be parsed', () => {
    const ahm = new AdHocFilter();
    expect(function () {
      ahm.setTargetTableFromQuery('select not sql');
    }).toThrow(new Error('Failed to get table from adhoc query.'));
  });
  it('apply ad hoc filter with same table casing', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTableFromQuery('SELECT * FROM fooTable');
    const val = ahm.apply('SELECT stuff FROM fooTable', [
      { key: 'key', operator: '=', value: 'val' },
    ] as AdHocVariableFilter[]);
    expect(val).toEqual(
      `SELECT stuff FROM fooTable settings additional_table_filters={'fooTable' : ' key = \\'val\\' '}`
    );
  });
  it('apply ad hoc filter with default schema', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTableFromQuery('SELECT * FROM default.foo');
    const val = ahm.apply('SELECT stuff FROM default.foo', [
      { key: 'key', operator: '=', value: 'val' },
    ] as AdHocVariableFilter[]);
    expect(val).toEqual(
      `SELECT stuff FROM default.foo settings additional_table_filters={'default.foo' : ' key = \\'val\\' '}`
    );
  });
  it('apply ad hoc filter and does not include the table reference in the selected fields of the function', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTableFromQuery('SELECT * FROM foo');
    const val = ahm.apply('SELECT foo.stuff FROM foo', [
      { key: 'foo.key', operator: '=', value: 'val' },
    ] as AdHocVariableFilter[]);
    expect(val).toEqual(`SELECT foo.stuff FROM foo settings additional_table_filters={'foo' : ' key = \\'val\\' '}`);
  });

  it('apply ad hoc filter converts "=~" to "REGEXP"', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTableFromQuery('SELECT * FROM foo');
    const val = ahm.apply('SELECT stuff FROM foo WHERE col = test', [
      { key: 'key', operator: '=~', value: 'val' },
    ] as AdHocVariableFilter[]);
    expect(val).toEqual(
      `SELECT stuff FROM foo WHERE col = test settings additional_table_filters={'foo' : ' key REGEXP \\'val\\' '}`
    );
  });

  it('apply ad hoc filter converts "!~" to "NOT REGEXP"', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTableFromQuery('SELECT * FROM foo');
    const val = ahm.apply('SELECT stuff FROM foo WHERE col = test', [
      { key: 'key', operator: '!~', value: 'val' },
    ] as AdHocVariableFilter[]);
    expect(val).toEqual(
      `SELECT stuff FROM foo WHERE col = test settings additional_table_filters={'foo' : ' key NOT REGEXP \\'val\\' '}`
    );
  });

  it('apply ad hoc filter IN operator with string values', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTableFromQuery('SELECT * FROM foo');
    const val = ahm.apply('SELECT stuff FROM foo WHERE col = test', [
      { key: 'key', operator: 'IN', value: "('val1', 'val2')" },
    ] as AdHocVariableFilter[]);
    expect(val).toEqual(
      `SELECT stuff FROM foo WHERE col = test settings additional_table_filters={'foo' : ' key IN (\\'val1\\', \\'val2\\') '}`
    );
  });

  it('apply ad hoc filter IN operator without parentheses', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTableFromQuery('SELECT * FROM foo');
    const val = ahm.apply('SELECT stuff FROM foo WHERE col = test', [
      { key: 'key', operator: 'IN', value: "'val1', 'val2'" },
    ] as AdHocVariableFilter[]);
    expect(val).toEqual(
      `SELECT stuff FROM foo WHERE col = test settings additional_table_filters={'foo' : ' key IN (\\'val1\\', \\'val2\\') '}`
    );
  });

  it('apply ad hoc filter IN operator with integer values', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTableFromQuery('SELECT * FROM foo');
    const val = ahm.apply('SELECT stuff FROM foo WHERE col = test', [
      { key: 'key', operator: 'IN', value: '(1, 2, 3)' },
    ] as AdHocVariableFilter[]);
    expect(val).toEqual(
      `SELECT stuff FROM foo WHERE col = test settings additional_table_filters={'foo' : ' key IN (1, 2, 3) '}`
    );
  });

  it('apply ad hoc filter to a query using ClickHouse INTERVAL syntax', () => {
    const ahm = new AdHocFilter();
    // The previous pgsql-based parser threw on the unquoted INTERVAL and dropped the filter.
    const sql =
      'SELECT ServiceName, count() c FROM otel.otel_logs WHERE Timestamp >= now() - INTERVAL 1 HOUR GROUP BY ServiceName';
    ahm.setTargetTableFromQuery(sql);
    const val = ahm.apply(sql, [{ key: 'ServiceName', operator: '=', value: 'frontend' }] as AdHocVariableFilter[]);
    expect(val).toEqual(
      `${sql} settings additional_table_filters={'otel.otel_logs' : ' ServiceName = \\'frontend\\' '}`
    );
  });

  it('apply ad hoc filter to a query using a ClickHouse lambda', () => {
    const ahm = new AdHocFilter();
    const sql = 'SELECT count() c FROM events WHERE arrayExists(x -> x > 1, spans)';
    ahm.setTargetTableFromQuery(sql);
    const val = ahm.apply(sql, [{ key: 'kind', operator: '=', value: 'server' }] as AdHocVariableFilter[]);
    expect(val).toEqual(`${sql} settings additional_table_filters={'events' : ' kind = \\'server\\' '}`);
  });

  it('does not apply an adhoc filter without "operator"', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTableFromQuery('SELECT * FROM foo');
    const val = ahm.apply('SELECT foo.stuff FROM foo', [
      // @ts-expect-error
      { key: 'foo.key', operator: undefined, value: 'val' },
    ]);
    expect(val).toEqual(`SELECT foo.stuff FROM foo`);
  });

  it('does not apply an adhoc filter without "value"', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTableFromQuery('SELECT * FROM foo');
    const val = ahm.apply('SELECT foo.stuff FROM foo', [
      // @ts-expect-error
      { key: 'foo.key', operator: '=', value: undefined },
    ]);
    expect(val).toEqual(`SELECT foo.stuff FROM foo`);
  });

  it('does not apply an adhoc filter without "key"', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTableFromQuery('SELECT * FROM foo');
    const val = ahm.apply('SELECT foo.stuff FROM foo', [
      // @ts-expect-error
      { key: undefined, operator: '=', value: 'val' },
    ]);
    expect(val).toEqual(`SELECT foo.stuff FROM foo`);
  });

  it('log a malformed filter', () => {
    const warn = jest.spyOn(console, 'warn');
    const value = { key: 'foo.key', operator: '=', value: undefined };
    const ahm = new AdHocFilter();
    ahm.setTargetTableFromQuery('SELECT * FROM foo');
    ahm.apply('SELECT foo.stuff FROM foo', [
      // @ts-expect-error
      value,
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Invalid adhoc filter will be ignored:', value);
  });

  it('apply ad hoc filter with no set table', () => {
    const ahm = new AdHocFilter();
    const val = ahm.apply('SELECT stuff FROM foo', [
      { key: 'key', operator: '=', value: 'val' },
    ] as AdHocVariableFilter[]);
    expect(val).toEqual(`SELECT stuff FROM foo settings additional_table_filters={'foo' : ' key = \\'val\\' '}`);
  });

  it('converts arrayElement with single quotes', () => {
    const ahm = new AdHocFilter();
    const result = ahm.apply('SELECT * FROM foo', [
      { key: "arrayElement(ResourceAttributes, 'cloud.region')", operator: '=', value: 'test' },
    ] as AdHocVariableFilter[]);
    expect(result).toContain("ResourceAttributes[\\'cloud.region\\']");
  });

  it('converts Map column filter to proper filter syntax', () => {
    const ahm = new AdHocFilter();
    const result = ahm.apply(
      'SELECT * FROM foo',
      [{ key: 'ResourceAttributes.cloud.region', operator: '=', value: 'test' }] as AdHocVariableFilter[],
      false
    );
    expect(result).toContain("ResourceAttributes[\\\'cloud.region\\\']");
  });
  it('converts JSON column filter to proper filter syntax', () => {
    const ahm = new AdHocFilter();
    const result = ahm.apply(
      'SELECT * FROM foo',
      [{ key: "ResourceAttributes.cloud.region'", operator: '=', value: 'test' }] as AdHocVariableFilter[],
      true
    );
    expect(result).toContain('ResourceAttributes.cloud.region');
  });

  describe('buildFilterString', () => {
    it('builds filter string with single filter', () => {
      const ahm = new AdHocFilter();
      const result = ahm.buildFilterString([{ key: 'key', operator: '=', value: 'val' }] as AdHocVariableFilter[]);
      expect(result).toEqual(" key = \\'val\\' ");
    });

    it('builds filter string with multiple filters', () => {
      const ahm = new AdHocFilter();
      const result = ahm.buildFilterString([
        { key: 'key', operator: '=', value: 'val' },
        { key: 'keyNum', operator: '=', value: '123' },
      ] as AdHocVariableFilter[]);
      expect(result).toEqual(" key = \\'val\\' AND keyNum = \\'123\\' ");
    });

    it('returns empty string with no filters', () => {
      const ahm = new AdHocFilter();
      const result = ahm.buildFilterString([]);
      expect(result).toEqual('');
    });

    it('builds filter string with regex operators', () => {
      const ahm = new AdHocFilter();
      const result = ahm.buildFilterString([{ key: 'key', operator: '=~', value: 'val' }] as AdHocVariableFilter[]);
      expect(result).toEqual(" key REGEXP \\'val\\' ");
    });

    it('builds filter string with negated regex operator', () => {
      const ahm = new AdHocFilter();
      const result = ahm.buildFilterString([{ key: 'key', operator: '!~', value: 'val' }] as AdHocVariableFilter[]);
      expect(result).toEqual(" key NOT REGEXP \\'val\\' ");
    });

    it('builds filter string with IN operator', () => {
      const ahm = new AdHocFilter();
      const result = ahm.buildFilterString([
        { key: 'key', operator: 'IN', value: "'val1', 'val2'" },
      ] as AdHocVariableFilter[]);
      expect(result).toEqual(" key IN (\\'val1\\', \\'val2\\') ");
    });

    it('ignores invalid filters', () => {
      const ahm = new AdHocFilter();
      const result = ahm.buildFilterString([
        { key: 'key', operator: '=', value: 'val' },
        { key: '', operator: '=', value: 'val' } as any,
        { key: 'key2', operator: '=', value: 'val2' },
      ] as AdHocVariableFilter[]);
      expect(result).toEqual(" key = \\'val\\' AND key2 = \\'val2\\' ");
    });
  });
  it('should apply ad hoc filter with . in column name', () => {
    const ahm = new AdHocFilter();
    const val = ahm.apply('SELECT stuff FROM foo', [
      { key: 'TABLE.key.key2', operator: '=', value: 'val' },
    ] as AdHocVariableFilter[]);
    expect(val).toEqual(`SELECT stuff FROM foo settings additional_table_filters={'foo' : ' key.key2 = \\'val\\' '}`);
  });

  describe('schema-driven Map column detection (#1434)', () => {
    it('rewrites dotted key access for user-registered Map columns (hideTableName)', () => {
      // Mirrors the hideTableNameInAdhocFilters=true path: UI emits `col.key`
      // with no table prefix. Without schema info, the default allowlist only
      // covers OTel names; the setter extends it.
      const ahm = new AdHocFilter();
      ahm.setMapColumns(new Set(['custom_tags']));
      const val = ahm.apply('SELECT * FROM foo', [
        { key: 'custom_tags.region', operator: '=', value: 'eu' },
      ] as AdHocVariableFilter[]);
      expect(val).toContain("custom_tags[\\'region\\']");
    });

    it('rewrites dotted key access for user-registered Map columns (table-prefixed)', () => {
      const ahm = new AdHocFilter();
      ahm.setMapColumns(new Set(['custom_tags']));
      const val = ahm.apply('SELECT * FROM foo', [
        { key: 'foo.custom_tags.region', operator: '=', value: 'eu' },
      ] as AdHocVariableFilter[]);
      expect(val).toContain("custom_tags[\\'region\\']");
    });

    it('leaves non-Map dotted keys alone (strip table prefix only)', () => {
      const ahm = new AdHocFilter();
      ahm.setMapColumns(new Set(['custom_tags']));
      const val = ahm.apply('SELECT * FROM foo', [
        { key: 'foo.plain_col', operator: '=', value: 'x' },
      ] as AdHocVariableFilter[]);
      // plain_col is not a Map → fall through to the existing table-prefix
      // strip behavior.
      expect(val).toContain(" plain_col = \\'x\\' ");
    });

    it('back-compat: OTel map columns still work without an explicit setMapColumns call', () => {
      const ahm = new AdHocFilter();
      // No setMapColumns — the default set ships with the OTel names so
      // behavior does not regress for existing users.
      const val = ahm.apply('SELECT * FROM foo', [
        { key: 'ResourceAttributes.http.method', operator: '=', value: 'GET' },
      ] as AdHocVariableFilter[]);
      expect(val).toContain("ResourceAttributes[\\'http.method\\']");
    });

    it('setMapColumns preserves the OTel defaults (additive, not replacing)', () => {
      const ahm = new AdHocFilter();
      ahm.setMapColumns(new Set(['custom_tags']));
      expect(ahm.getMapColumns().has('custom_tags')).toBe(true);
      expect(ahm.getMapColumns().has('LogAttributes')).toBe(true);
      expect(ahm.getMapColumns().has('ResourceAttributes')).toBe(true);
    });

    it('escapes single quotes and backslashes in Map keys (two-layer SQL embedding)', () => {
      // A Map key containing `'` must survive both the inner bracket-access
      // string literal and the outer additional_table_filters string. Without
      // escaping, `'` would close the outer string early and produce invalid
      // SQL (or worse, allow injection through a crafted key).
      const ahm = new AdHocFilter();
      ahm.setMapColumns(new Set(['labels']));
      const val = ahm.apply('SELECT * FROM foo', [
        { key: "labels.a'b", operator: '=', value: 'x' },
      ] as AdHocVariableFilter[]);
      // Outer-string bytes for `a'b` are `a\\\'b` (raw `\\\'` is the
      // two-level escape of `'`). The surrounding `\\\\'` brackets remain
      // the existing outer-escaped quote.
      expect(val).toContain("labels[\\'a\\\\\\'b\\']");
    });

    it('escapes backslashes in Map keys', () => {
      const ahm = new AdHocFilter();
      ahm.setMapColumns(new Set(['labels']));
      const val = ahm.apply('SELECT * FROM foo', [
        { key: 'labels.a\\b', operator: '=', value: 'x' },
      ] as AdHocVariableFilter[]);
      expect(val).toContain("labels[\\'a\\\\\\\\b\\']");
    });
  });

  describe('self-describing bracketed Map keys (#2043)', () => {
    it('renders a bracketed key without any setMapColumns call (table-prefixed)', () => {
      // Saved filters must apply on a fresh dashboard load, before
      // getTagKeys has run, because the key itself carries the Map access.
      const ahm = new AdHocFilter();
      const val = ahm.apply('SELECT * FROM events', [
        { key: "events.metadata['region']", operator: '=', value: 'eu' },
      ] as AdHocVariableFilter[]);
      expect(val).toContain("metadata[\\'region\\'] = \\'eu\\'");
    });

    it('renders a bracketed key without any setMapColumns call (hideTableName)', () => {
      const ahm = new AdHocFilter();
      const val = ahm.apply('SELECT * FROM events', [
        { key: "metadata['region']", operator: '=', value: 'eu' },
      ] as AdHocVariableFilter[]);
      expect(val).toContain("metadata[\\'region\\'] = \\'eu\\'");
    });

    it('renders a bracketed key whose map key contains dots', () => {
      const ahm = new AdHocFilter();
      const val = ahm.apply('SELECT * FROM events', [
        { key: "events.labels['http.method']", operator: '=', value: 'GET' },
      ] as AdHocVariableFilter[]);
      expect(val).toContain("labels[\\'http.method\\'] = \\'GET\\'");
    });

    it('re-escapes quotes from the minted string-literal body for the outer filter string', () => {
      // getTagKeys mints `labels['weird\'key']` for the raw map key
      // `weird'key`. The outer additional_table_filters embedding needs the
      // same two-layer escape as the legacy dotted form.
      const ahm = new AdHocFilter();
      const val = ahm.apply('SELECT * FROM events', [
        { key: "events.labels['weird\\'key']", operator: '=', value: 'x' },
      ] as AdHocVariableFilter[]);
      expect(val).toContain("labels[\\'weird\\\\\\'key\\']");
    });

    it('renders a bracketed key as dot access when useJSON is set', () => {
      const ahm = new AdHocFilter();
      const val = ahm.apply(
        'SELECT * FROM events',
        [{ key: "events.metadata['region']", operator: '=', value: 'eu' }] as AdHocVariableFilter[],
        true
      );
      expect(val).toContain("metadata.region = \\'eu\\'");
    });

    it('legacy dotted keys still render via the registered Map-column set', () => {
      // Already-saved dashboards persist the dotted form; it must keep
      // working when getTagKeys has populated the column set.
      const ahm = new AdHocFilter();
      ahm.setMapColumns(new Set(['metadata']));
      const val = ahm.apply('SELECT * FROM events', [
        { key: 'events.metadata.region', operator: '=', value: 'eu' },
      ] as AdHocVariableFilter[]);
      expect(val).toContain("metadata[\\'region\\'] = \\'eu\\'");
    });
  });
});
