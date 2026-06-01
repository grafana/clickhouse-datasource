import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { firstValueFrom } from 'rxjs';
import { DataQueryRequest, DataQueryResponse } from '@grafana/data';
import {
  CHVariableQuery,
  CHVariableQueryType,
  CHVariableSupport,
  VariableQueryEditor,
  generateVariableSql,
  pickerLevelFor,
} from './CHVariableSupport';
import { Datasource } from './CHDatasource';
import { TableColumn } from 'types/queryBuilder';

const baseQuery = (overrides: Partial<CHVariableQuery> = {}): CHVariableQuery => ({
  refId: 'v',
  queryType: 'sql',
  ...overrides,
});

describe('generateVariableSql', () => {
  it('lists databases via system.databases', () => {
    expect(generateVariableSql(baseQuery({ queryType: 'databases' }), 'default')).toBe(
      'SELECT name FROM system.databases ORDER BY name'
    );
  });

  it('lists tables in a specific database when one is selected', () => {
    const sql = generateVariableSql(
      baseQuery({ queryType: 'tables', database: 'otel' }),
      'default'
    );
    expect(sql).toBe("SELECT name FROM system.tables WHERE database = 'otel' ORDER BY name");
  });

  it('falls back to default database for tables when no database is selected', () => {
    const sql = generateVariableSql(baseQuery({ queryType: 'tables' }), 'default');
    expect(sql).toBe("SELECT name FROM system.tables WHERE database = 'default' ORDER BY name");
  });

  it('returns empty SQL for columns when database or table are missing', () => {
    expect(generateVariableSql(baseQuery({ queryType: 'columns' }), '')).toBe('');
    expect(generateVariableSql(baseQuery({ queryType: 'columns', database: 'otel' }), '')).toBe('');
  });

  it('lists columns for a fully-specified database and table', () => {
    const sql = generateVariableSql(
      baseQuery({ queryType: 'columns', database: 'otel', table: 'otel_logs' }),
      ''
    );
    expect(sql).toBe(
      "SELECT name FROM system.columns WHERE database = 'otel' AND table = 'otel_logs' ORDER BY name"
    );
  });

  it('returns empty SQL for column values when required fields are missing', () => {
    expect(generateVariableSql(baseQuery({ queryType: 'columnValues' }), '')).toBe('');
    expect(
      generateVariableSql(baseQuery({ queryType: 'columnValues', database: 'otel', table: 't' }), '')
    ).toBe('');
  });

  it('reads distinct values from a regular column', () => {
    const sql = generateVariableSql(
      baseQuery({
        queryType: 'columnValues',
        database: 'otel',
        table: 'otel_logs',
        column: 'ServiceName',
      }),
      ''
    );
    expect(sql).toBe(
      "SELECT DISTINCT ServiceName AS value FROM otel.otel_logs WHERE ServiceName IS NOT NULL ORDER BY value LIMIT 1000"
    );
  });

  it('reads distinct values from a Map column key when columnIsMap is set', () => {
    const sql = generateVariableSql(
      baseQuery({
        queryType: 'columnValues',
        database: 'otel',
        table: 'otel_logs',
        column: 'ResourceAttributes',
        mapKey: 'service.version',
        columnIsMap: true,
      }),
      ''
    );
    expect(sql).toBe(
      "SELECT DISTINCT ResourceAttributes['service.version'] AS value FROM otel.otel_logs WHERE ResourceAttributes['service.version'] IS NOT NULL ORDER BY value LIMIT 1000"
    );
  });

  it('falls back to plain column access when columnIsMap is set but no mapKey is chosen', () => {
    const sql = generateVariableSql(
      baseQuery({
        queryType: 'columnValues',
        database: 'otel',
        table: 'otel_logs',
        column: 'ResourceAttributes',
        columnIsMap: true,
      }),
      ''
    );
    expect(sql).toBe(
      "SELECT DISTINCT ResourceAttributes AS value FROM otel.otel_logs WHERE ResourceAttributes IS NOT NULL ORDER BY value LIMIT 1000"
    );
  });

  it('generates the OTel services preset against the default database', () => {
    expect(generateVariableSql(baseQuery({ queryType: 'otelServices' }), 'otel')).toBe(
      "SELECT DISTINCT ServiceName FROM otel.otel_logs WHERE $__timeFilter(Timestamp) AND ServiceName != '' ORDER BY ServiceName"
    );
  });

  it('generates the OTel log levels preset', () => {
    expect(generateVariableSql(baseQuery({ queryType: 'otelLevels' }), 'otel')).toBe(
      "SELECT DISTINCT SeverityText FROM otel.otel_logs WHERE $__timeFilter(Timestamp) AND SeverityText != '' ORDER BY SeverityText"
    );
  });

  it('generates the OTel operations preset', () => {
    expect(generateVariableSql(baseQuery({ queryType: 'otelOperations' }), 'otel')).toBe(
      "SELECT DISTINCT SpanName FROM otel.otel_traces WHERE $__timeFilter(Timestamp) AND SpanName != '' ORDER BY SpanName LIMIT 200"
    );
  });

  it('preserves the existing rawSql when the type is Custom SQL', () => {
    expect(
      generateVariableSql(baseQuery({ queryType: 'sql', rawSql: 'SELECT 1' }), 'default')
    ).toBe('SELECT 1');
  });
});

describe('pickerLevelFor', () => {
  const cases: Array<[CHVariableQueryType, ReturnType<typeof pickerLevelFor>]> = [
    ['sql', null],
    ['databases', null],
    ['tables', 'database'],
    ['columns', 'table'],
    ['columnValues', 'mapKey'],
    ['otelServices', null],
    ['otelLevels', null],
    ['otelOperations', null],
  ];
  cases.forEach(([type, expected]) => {
    it(`returns ${expected} for ${type}`, () => {
      expect(pickerLevelFor(type)).toBe(expected);
    });
  });
});

const buildDatasource = (overrides: Partial<Datasource> = {}): Datasource => {
  const ds = {} as Datasource;
  ds.getDefaultDatabase = jest.fn(() => 'default');
  ds.fetchDatabases = jest.fn(() => Promise.resolve(['default', 'otel']));
  ds.fetchTables = jest.fn(() => Promise.resolve(['otel_logs', 'otel_traces']));
  const columns: TableColumn[] = [
    { name: 'ServiceName', type: 'String', picklistValues: [] },
    { name: 'ResourceAttributes', type: 'Map(String, String)', picklistValues: [] },
  ];
  ds.fetchColumns = jest.fn(() => Promise.resolve(columns));
  ds.fetchUniqueMapKeys = jest.fn(() => Promise.resolve(['service.name', 'service.version']));
  ds.metricFindQuery = jest.fn(() =>
    Promise.resolve([{ text: 'foo' }, { text: 'bar' }])
  ) as unknown as Datasource['metricFindQuery'];
  return Object.assign(ds, overrides);
};

describe('VariableQueryEditor', () => {
  it('starts in Custom SQL mode and shows the SQL textarea only', async () => {
    const datasource = buildDatasource();
    const onChange = jest.fn();
    const result = await waitFor(() =>
      render(
        <VariableQueryEditor
          datasource={datasource}
          query={baseQuery()}
          onChange={onChange}
          onRunQuery={() => {}}
        />
      )
    );
    expect(result.getByLabelText('Variable type')).toBeInTheDocument();
    expect(result.getByLabelText('SQL Query')).toBeInTheDocument();
    expect(result.queryByText('Database')).not.toBeInTheDocument();
  });

  it('emits a regenerated SQL when the user picks List databases', async () => {
    const datasource = buildDatasource();
    const onChange = jest.fn();
    const result = await waitFor(() =>
      render(
        <VariableQueryEditor
          datasource={datasource}
          query={baseQuery()}
          onChange={onChange}
          onRunQuery={() => {}}
        />
      )
    );
    const typeCombobox = result.getByLabelText('Variable type');
    fireEvent.keyDown(typeCombobox, { key: 'ArrowDown' });
    fireEvent.keyDown(typeCombobox, { key: 'ArrowDown' });
    fireEvent.keyDown(typeCombobox, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as CHVariableQuery;
    expect(next.queryType).toBe('databases');
    expect(next.rawSql).toBe('SELECT name FROM system.databases ORDER BY name');
  });

  it('persists user edits to the SQL field without regenerating', async () => {
    const datasource = buildDatasource();
    const onChange = jest.fn();
    const result = await waitFor(() =>
      render(
        <VariableQueryEditor
          datasource={datasource}
          query={baseQuery({ queryType: 'sql', rawSql: 'SELECT 1' })}
          onChange={onChange}
          onRunQuery={() => {}}
        />
      )
    );
    const sqlArea = result.getByLabelText('SQL Query');
    fireEvent.change(sqlArea, { target: { value: 'SELECT name FROM system.databases LIMIT 5' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as CHVariableQuery;
    expect(next.queryType).toBe('sql');
    expect(next.rawSql).toBe('SELECT name FROM system.databases LIMIT 5');
  });

  it('renders a SchemaPicker when the variable type needs it', async () => {
    const datasource = buildDatasource();
    const onChange = jest.fn();
    const result = await waitFor(() =>
      render(
        <VariableQueryEditor
          datasource={datasource}
          query={baseQuery({ queryType: 'tables', database: 'otel' })}
          onChange={onChange}
          onRunQuery={() => {}}
        />
      )
    );
    expect(result.getByText('Database')).toBeInTheDocument();
  });
});

describe('CHVariableSupport', () => {
  it('returns an empty frame when no rawSql is present', async () => {
    const datasource = buildDatasource();
    const support = new CHVariableSupport(datasource);
    const request = {
      targets: [{ refId: 'v', queryType: 'sql' as CHVariableQueryType }],
      range: { from: new Date(), to: new Date() },
    };
    const response = (await firstValueFrom(
      support.query(request as unknown as DataQueryRequest<CHVariableQuery>)
    )) as DataQueryResponse;
    expect(response.data).toEqual([]);
  });

  it('wraps metricFindQuery output into a DataFrame with a text field', async () => {
    const datasource = buildDatasource();
    const support = new CHVariableSupport(datasource);
    const request = {
      targets: [
        {
          refId: 'v',
          queryType: 'databases' as CHVariableQueryType,
          rawSql: 'SELECT name FROM system.databases ORDER BY name',
        },
      ],
      range: { from: new Date(), to: new Date() },
    };
    const response = (await firstValueFrom(
      support.query(request as unknown as DataQueryRequest<CHVariableQuery>)
    )) as DataQueryResponse;
    expect(datasource.metricFindQuery).toHaveBeenCalledWith(
      'SELECT name FROM system.databases ORDER BY name',
      expect.objectContaining({ range: expect.any(Object) })
    );
    expect(response.data).toHaveLength(1);
    const frame = response.data[0];
    expect(frame.fields).toHaveLength(1);
    expect(frame.fields[0].name).toBe('text');
    expect(frame.fields[0].values).toEqual(['foo', 'bar']);
  });
});

