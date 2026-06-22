import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { AnnotationQuery } from '@grafana/data';
import { createAnnotationSupport, generateChangeDetectionSQL, resolveTraceSchema } from './CHAnnotationSupport';
import { Datasource } from './CHDatasource';
import { CHQuery, EditorType } from 'types/sql';
import { TableColumn } from 'types/queryBuilder';

const columns: readonly TableColumn[] = [
  { name: 'ServiceName', type: 'String', picklistValues: [] },
  { name: 'Environment', type: 'String', picklistValues: [] },
  { name: 'ResourceAttributes', type: 'Map(String, String)', picklistValues: [] },
  { name: 'Timestamp', type: 'DateTime64(9)', picklistValues: [] },
];

interface DatasourceConfig {
  defaultDb?: string;
  defaultTable?: string;
  tracesDb?: string;
  tracesTable?: string;
  configMode?: 'classic' | 'single-table';
  signalType?: 'logs' | 'traces';
}

const buildDatasource = (config: DatasourceConfig = {}): Datasource => {
  const ds = {} as Datasource; // [as-cast: allow] test mock, mirrors SchemaPicker.test.tsx
  ds.settings = {
    jsonData: { configMode: config.configMode, signalType: config.signalType },
  } as Datasource['settings']; // [as-cast: allow] minimal settings stub for resolveTraceSchema
  ds.getDefaultDatabase = jest.fn(() => config.defaultDb ?? 'default');
  ds.getDefaultTable = jest.fn(() => config.defaultTable);
  ds.getDefaultTraceDatabase = jest.fn(() => config.tracesDb);
  ds.getDefaultTraceTable = jest.fn(() => config.tracesTable);
  ds.fetchDatabases = jest.fn(() => Promise.resolve(['default', 'otel_v2']));
  ds.fetchTables = jest.fn(() => Promise.resolve(['otel_traces', 'otel_logs']));
  ds.fetchColumns = jest.fn(() => Promise.resolve([...columns]));
  ds.fetchUniqueMapKeys = jest.fn(() => Promise.resolve(['service.version']));
  return ds;
};

describe('generateChangeDetectionSQL', () => {
  it('generates lagInFrame change detection over 30-second buckets for a plain column', () => {
    const sql = generateChangeDetectionSQL({ table: 'deploys', column: 'version' });
    // Dominant value per bucket (topK), not any(): a service running two
    // versions at once must not flap. Validated against the live OTel demo
    // where any() produced a marker storm for a concurrently-versioned service.
    expect(sql).toContain('lagInFrame(topK(1)("version")[1])');
    expect(sql).not.toContain('any(');
    expect(sql).toContain('toStartOfInterval(Timestamp, INTERVAL 30 second)');
    expect(sql).toContain('OVER (PARTITION BY "ServiceName" ORDER BY time)');
    expect(sql).toContain('"ServiceName" AS tags');
    expect(sql).toContain('FROM "deploys"');
    // The prev_version != '' guard drops each group's first bucket, where
    // lagInFrame returns '' and would otherwise mark every group at the window edge.
    expect(sql).toContain("WHERE prev_version != '' AND prev_version != version");
  });

  it('accesses the map key in both the aggregate and the filter', () => {
    const sql = generateChangeDetectionSQL({
      database: 'otel',
      table: 'otel_traces',
      column: 'ResourceAttributes',
      mapKey: 'service.version',
    });
    expect(sql).toContain(`topK(1)("ResourceAttributes"['service.version'])[1]`);
    expect(sql).toContain(`AND "ResourceAttributes"['service.version'] != ''`);
    expect(sql).toContain('FROM "otel"."otel_traces"');
    expect(sql).toContain('ResourceAttributes.service.version change');
  });

  it('partitions and tags by a custom group-by column', () => {
    const sql = generateChangeDetectionSQL({ table: 't', column: 'c', groupBy: 'Environment' });
    expect(sql).toContain('PARTITION BY "Environment"');
    expect(sql).toContain('"Environment" AS tags');
    expect(sql).toContain('GROUP BY "Environment", time');
  });

  it('returns a placeholder comment when the table or column is missing', () => {
    const placeholder = '-- Select a table and column above to generate the change detection query';
    expect(generateChangeDetectionSQL({})).toBe(placeholder);
    expect(generateChangeDetectionSQL({ table: 'only_table' })).toBe(placeholder);
    expect(generateChangeDetectionSQL({ column: 'only_column' })).toBe(placeholder);
  });

  it('escapes single quotes in the map key so the string literal cannot break out', () => {
    const sql = generateChangeDetectionSQL({ table: 't', column: 'attrs', mapKey: "a'b" });
    expect(sql).toContain(`['a\\'b']`);
    expect(sql).not.toContain(`['a'b']`);
    expect(sql).toContain(`attrs.a\\'b change`);
  });
});

describe('resolveTraceSchema (compact vs complete datasource)', () => {
  it('uses the traces OTel config on a complete (classic) datasource', () => {
    const ds = buildDatasource({ defaultDb: 'fallback', tracesDb: 'otel', tracesTable: 'spans' });
    expect(resolveTraceSchema(ds)).toEqual({ database: 'otel', table: 'spans' });
  });

  it('uses the configured single table on a compact (single-table) traces datasource', () => {
    const ds = buildDatasource({
      defaultDb: 'otel_v2',
      defaultTable: 'my_traces',
      configMode: 'single-table',
      signalType: 'traces',
    });
    expect(resolveTraceSchema(ds)).toEqual({ database: 'otel_v2', table: 'my_traces' });
  });

  it('ignores the single table when it is configured for a different signal', () => {
    const ds = buildDatasource({
      defaultDb: 'otel_v2',
      defaultTable: 'my_logs',
      configMode: 'single-table',
      signalType: 'logs',
    });
    expect(resolveTraceSchema(ds)).toEqual({ database: 'otel_v2', table: 'otel_traces' });
  });

  it('falls back to the general default db and conventional table for a bare datasource', () => {
    expect(resolveTraceSchema(buildDatasource({}))).toEqual({ database: 'default', table: 'otel_traces' });
  });

  it('prefers the traces database over the general default', () => {
    const ds = buildDatasource({ defaultDb: 'general', tracesDb: 'tracing' });
    expect(resolveTraceSchema(ds)).toEqual({ database: 'tracing', table: 'otel_traces' });
  });
});

describe('createAnnotationSupport: prepareAnnotation', () => {
  const support = createAnnotationSupport(buildDatasource());

  it('migrates a legacy rawQuery annotation into the modern target shape', () => {
    const migrated = support.prepareAnnotation?.({
      name: 'legacy',
      enable: true,
      iconColor: 'red',
      rawQuery: 'SELECT 1 AS time',
    });
    expect(migrated?.target?.rawSql).toBe('SELECT 1 AS time');
    expect(migrated?.target?.editorType).toBe(EditorType.SQL);
    expect(migrated?.target?.refId).toBe('annotation');
  });

  it('leaves a modern annotation untouched', () => {
    const modern: AnnotationQuery<CHQuery> = {
      name: 'modern',
      enable: true,
      iconColor: 'red',
      target: { refId: 'a', pluginVersion: '', editorType: EditorType.SQL, rawSql: 'SELECT 2 AS time' },
    };
    const result = support.prepareAnnotation?.(modern);
    expect(result?.target?.rawSql).toBe('SELECT 2 AS time');
  });

  it('does not invent a target when rawQuery is absent', () => {
    const result = support.prepareAnnotation?.({ name: 'empty', enable: true, iconColor: 'red' });
    expect(result?.target).toBeUndefined();
  });
});

describe('createAnnotationSupport: getDefaultQuery', () => {
  it('returns a service.version deployment change-detection default', () => {
    const support = createAnnotationSupport(buildDatasource({ defaultDb: 'mydb' }));
    const query = support.getDefaultQuery?.();
    expect(query?.editorType).toBe(EditorType.SQL);
    expect(query?.refId).toBe('annotation');
    expect(query?.rawSql).toContain(`"ResourceAttributes"['service.version']`);
    expect(query?.rawSql).toContain('PARTITION BY "ServiceName"');
    expect(query?.rawSql).toContain('FROM "mydb"."otel_traces"');
  });

  it('targets the configured trace table on a complete (classic) datasource', () => {
    const support = createAnnotationSupport(buildDatasource({ tracesDb: 'otel', tracesTable: 'spans' }));
    expect(support.getDefaultQuery?.().rawSql).toContain('FROM "otel"."spans"');
  });
});

describe('AnnotationQueryEditor', () => {
  const getEditor = (ds: Datasource) => {
    const editor = createAnnotationSupport(ds).QueryEditor;
    if (!editor) {
      throw new Error('annotation QueryEditor is not defined');
    }
    return editor;
  };

  const baseQuery: CHQuery = { refId: 'annotation', pluginVersion: '', editorType: EditorType.SQL, rawSql: '' };

  const renderEditor = (
    ds: Datasource,
    annotation: AnnotationQuery<CHQuery>,
    onAnnotationChange?: (annotation: AnnotationQuery<CHQuery>) => void
  ) => {
    const QueryEditor = getEditor(ds);
    return waitFor(() =>
      render(
        <QueryEditor
          datasource={ds}
          query={baseQuery}
          onChange={() => {}}
          onRunQuery={() => {}}
          annotation={annotation}
          onAnnotationChange={onAnnotationChange}
        />
      )
    );
  };

  const annotationWith = (extra: Record<string, unknown>): AnnotationQuery<CHQuery> => ({
    name: 'test',
    enable: true,
    iconColor: 'red',
    ...extra,
  });

  it('hides the schema picker for the custom preset', async () => {
    const result = await renderEditor(buildDatasource(), annotationWith({ preset: 'custom' }));
    expect(result.getByText('Annotation Type')).toBeInTheDocument();
    expect(result.queryByText('Database')).not.toBeInTheDocument();
    expect(result.getByRole('textbox')).toBeInTheDocument();
  });

  it('shows the schema picker for the change detection preset', async () => {
    const result = await renderEditor(
      buildDatasource(),
      annotationWith({ preset: 'change_detection', changeDetection: {} })
    );
    expect(result.getByText('Database')).toBeInTheDocument();
    expect(result.getByText('Watch Column')).toBeInTheDocument();
  });

  it('shows the Group By picker once a watch column is selected', async () => {
    const result = await renderEditor(
      buildDatasource(),
      annotationWith({
        preset: 'change_detection',
        changeDetection: { database: 'default', table: 'otel_traces', column: 'ResourceAttributes' },
      })
    );
    expect(result.getByText('Group By')).toBeInTheDocument();
  });

  it('emits the edited SQL through onAnnotationChange', async () => {
    const onAnnotationChange = jest.fn();
    const result = await renderEditor(buildDatasource(), annotationWith({ preset: 'custom' }), onAnnotationChange);
    fireEvent.change(result.getByRole('textbox'), { target: { value: 'SELECT 99 AS time' } });
    expect(onAnnotationChange).toHaveBeenCalledTimes(1);
    expect(onAnnotationChange.mock.calls[0][0].target.rawSql).toBe('SELECT 99 AS time');
  });

  it('is a no-op when no onAnnotationChange handler is provided', async () => {
    const result = await renderEditor(buildDatasource(), annotationWith({ preset: 'custom' }));
    expect(() => fireEvent.change(result.getByRole('textbox'), { target: { value: 'SELECT 1' } })).not.toThrow();
  });

  it('regenerates the SQL when switching to the change detection preset', async () => {
    const onAnnotationChange = jest.fn();
    const result = await renderEditor(
      buildDatasource({ defaultDb: 'default' }),
      annotationWith({ preset: 'custom' }),
      onAnnotationChange
    );

    const presetSelect = result.getAllByRole('combobox')[0];
    fireEvent.keyDown(presetSelect, { key: 'ArrowDown' });
    fireEvent.click(await result.findByText('Change Detection'));

    expect(onAnnotationChange).toHaveBeenCalled();
    const emitted = onAnnotationChange.mock.calls[onAnnotationChange.mock.calls.length - 1][0];
    expect(emitted.preset).toBe('change_detection');
    expect(emitted.target.rawSql).toContain('Select a table and column');
  });
});
