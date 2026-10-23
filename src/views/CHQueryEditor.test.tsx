import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CHQueryEditor } from './CHQueryEditor';
import * as ui from '@grafana/ui';
import { mockDatasource, newMockDatasource } from '__mocks__/datasource';
import { CHQuery, EditorType } from 'types/sql';
import { ColumnHint, FilterOperator, QueryType } from 'types/queryBuilder';
import { pluginVersion } from 'utils/version';
import { selectors } from 'selectors';
import { CoreApp } from '@grafana/data';

jest.mock('@grafana/ui', () => ({
  ...jest.requireActual<typeof ui>('@grafana/ui'),
  CodeEditor: function CodeEditor({ onEditorDidMount, value }: { onEditorDidMount: any; value: string }) {
    onEditorDidMount = () => {
      return {
        getValue: () => {
          return value;
        },
      };
    };
    return <div data-testid="code-editor">{`${value}`}</div>;
  },
}));

describe('Query Editor', () => {
  it('Should display sql in the editor', () => {
    const rawSql = 'foo';
    render(
      <CHQueryEditor
        query={{ pluginVersion: '', rawSql, refId: 'A', editorType: EditorType.SQL }}
        onChange={jest.fn()}
        onRunQuery={jest.fn()}
        datasource={mockDatasource}
      />
    );
    expect(screen.queryByText(rawSql)).toBeInTheDocument();
  });

  it('Should render QueryBuilder when editorType is Builder', () => {
    render(
      <CHQueryEditor
        query={{
          pluginVersion: '',
          rawSql: 'SELECT * FROM table',
          refId: 'A',
          editorType: EditorType.Builder,
          builderOptions: {
            database: '',
            table: '',
            queryType: QueryType.Table,
          },
        }}
        onChange={jest.fn()}
        onRunQuery={jest.fn()}
        datasource={mockDatasource}
      />
    );
    // QueryBuilder does not have a test id, but we can check for generatedSql text
    expect(screen.getByText('SELECT * FROM table')).toBeInTheDocument();
  });

  it('renders an error alert instead of crashing when the editor throws (#1931)', () => {
    // Suppress React's error-boundary console noise for the intentional throw.
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const datasource = newMockDatasource();
    jest.spyOn(datasource, 'isSingleTableMode').mockImplementation(() => {
      throw new Error('render crash');
    });

    render(
      <CHQueryEditor
        query={{ pluginVersion: '', rawSql: 'SELECT 1', refId: 'A', editorType: EditorType.SQL }}
        onChange={jest.fn()}
        onRunQuery={jest.fn()}
        datasource={datasource}
      />
    );

    expect(screen.getByText('ClickHouse query editor failed to load')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('Should not sync builder options when editorType remains SQL', () => {
    const builderOptions = {
      database: 'db2',
      table: 'table2',
      queryType: QueryType.Table,
    };

    const query = {
      pluginVersion: '',
      rawSql: 'SELECT * FROM table2',
      refId: 'A',
      editorType: EditorType.SQL,
      builderOptions,
    };

    const onChange = jest.fn();

    render(<CHQueryEditor query={query} onChange={onChange} onRunQuery={jest.fn()} datasource={mockDatasource} />);

    // onChange should not be called since editorType is SQL
    expect(onChange).not.toHaveBeenCalled();
  });

  // Regression guard for #1918:
  // When the response-transform path pre-generates a trace ID deep-link with
  // `meta.hasTraceTimestampTable: true` and an optimized `rawSql` that joins
  // against `<table>_trace_id_ts`, the editor must NOT clobber that value
  // while `useHasTraceTimestampTable` is still resolving on a cold cache.
  // Before the fix, the hook returned `false` on its initial render, the
  // dispatch effect updated meta to `false`, and the next builderOptions
  // effect regenerated rawSql without the `_trace_id_ts` clause — causing
  // the first click after a fresh page load to time out.
  it('preserves meta.hasTraceTimestampTable on a cold-cache trace ID deep-link (#1918)', async () => {
    const ds = newMockDatasource();
    // Cold cache: peek returns undefined, async eventually resolves to true.
    jest.spyOn(ds, 'peekTraceTimestampTable').mockReturnValue(undefined);
    jest.spyOn(ds, 'hasTraceTimestampTable').mockResolvedValue(true);

    const optimizedSql =
      `WITH 'abc' as __gf_trace_id, ` +
      `(SELECT min(Start) FROM "otel"."otel_traces_trace_id_ts" WHERE TraceId = __gf_trace_id) as __gf_trace_start, ` +
      `(SELECT max(End) + 1 FROM "otel"."otel_traces_trace_id_ts" WHERE TraceId = __gf_trace_id) as __gf_trace_end ` +
      `SELECT "TraceId" as traceID FROM "otel"."otel_traces" ` +
      `WHERE traceID = __gf_trace_id AND "Timestamp" >= __gf_trace_start AND "Timestamp" <= __gf_trace_end`;

    const onChange = jest.fn();
    render(
      <CHQueryEditor
        query={{
          // Must use a v4+ pluginVersion so migrateCHQuery doesn't downgrade
          // the query into a CHSqlQuery and strip builderOptions.
          pluginVersion,
          refId: 'Trace ID',
          editorType: EditorType.Builder,
          rawSql: optimizedSql,
          builderOptions: {
            database: 'otel',
            table: 'otel_traces',
            queryType: QueryType.Traces,
            columns: [
              { name: 'Timestamp', hint: ColumnHint.Time },
              { name: 'TraceId', hint: ColumnHint.TraceId },
            ],
            meta: {
              minimized: true,
              isTraceIdMode: true,
              traceId: 'abc',
              hasTraceTimestampTable: true,
            },
          },
        }}
        onChange={onChange}
        onRunQuery={jest.fn()}
        datasource={ds}
      />
    );
    // Flush the hook's async resolution and any state-driven re-renders.
    await act(async () => {});

    // The dispatch effect must never push `hasTraceTimestampTable: false`,
    // and any regenerated rawSql must keep the `_trace_id_ts` join. Before
    // the fix, the cold-cache initial render of `useHasTraceTimestampTable`
    // returned `false`, the editor effect dispatched that into meta, and the
    // next builderOptions effect emitted an onChange with the unoptimized SQL.
    expect(onChange).toHaveBeenCalled();
    for (const [updated] of onChange.mock.calls) {
      expect(updated.builderOptions?.meta?.hasTraceTimestampTable).not.toBe(false);
      if (typeof updated.rawSql === 'string' && updated.rawSql.length > 0) {
        expect(updated.rawSql).toContain('otel_traces_trace_id_ts');
      }
    }
  });

  it('validates the companion table named by the query meta suffix on trace ID deep-links', async () => {
    // A saved deep-link query can bake a meta.traceTimestampTableSuffix that
    // differs from the current datasource config suffix. The editor's check
    // must probe the companion the generated SQL will reference (the query's
    // suffix), otherwise it validates one table while the emitted SQL joins
    // against another.
    const ds = newMockDatasource();
    jest.spyOn(ds, 'peekTraceTimestampTable').mockReturnValue(undefined);
    const hasSpy = jest.spyOn(ds, 'hasTraceTimestampTable').mockResolvedValue(true);

    render(
      <CHQueryEditor
        query={{
          pluginVersion,
          refId: 'Trace ID',
          editorType: EditorType.Builder,
          rawSql: '',
          builderOptions: {
            database: 'otel',
            table: 'otel_traces',
            queryType: QueryType.Traces,
            columns: [
              { name: 'Timestamp', hint: ColumnHint.Time },
              { name: 'TraceId', hint: ColumnHint.TraceId },
            ],
            meta: {
              minimized: true,
              isTraceIdMode: true,
              traceId: 'abc',
              traceTimestampTableSuffix: '_saved_ts',
            },
          },
        }}
        onChange={jest.fn()}
        onRunQuery={jest.fn()}
        datasource={ds}
      />
    );
    await act(async () => {});

    expect(hasSpy).toHaveBeenCalledWith('otel', 'otel_traces', '_saved_ts');
  });

  it('renders compact SQL chrome for single-table datasources', () => {
    const datasource = newMockDatasource();
    datasource.settings.jsonData.configMode = 'single-table';
    datasource.settings.jsonData.signalType = 'logs';
    datasource.settings.jsonData.logs = {
      defaultDatabase: 'otel_v2',
      defaultTable: 'otel_logs',
      otelEnabled: true,
      otelVersion: '1.29.0',
    };

    render(
      <CHQueryEditor
        query={{ pluginVersion: '', rawSql: 'SELECT 1', refId: 'A', editorType: EditorType.SQL }}
        onChange={jest.fn()}
        onRunQuery={jest.fn()}
        datasource={datasource}
      />
    );

    expect(screen.getByTestId('compact-sql-toolbar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch to compact view' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run Query' })).toBeInTheDocument();
    expect(screen.queryByText('Editor Type')).not.toBeInTheDocument();
    expect(screen.getByText('SELECT 1')).toBeInTheDocument();
  });

  it('switches from compact SQL back to a configured logs builder query', () => {
    const datasource = newMockDatasource();
    datasource.settings.jsonData.configMode = 'single-table';
    datasource.settings.jsonData.signalType = 'logs';
    datasource.settings.jsonData.logs = {
      defaultDatabase: 'otel_v2',
      defaultTable: 'otel_logs',
      otelEnabled: true,
      otelVersion: '1.29.0',
    };
    const onChange = jest.fn();

    render(
      <CHQueryEditor
        query={{ pluginVersion: '', rawSql: '', refId: 'A', editorType: EditorType.SQL }}
        onChange={onChange}
        onRunQuery={jest.fn()}
        datasource={datasource}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Switch to compact view' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        editorType: EditorType.Builder,
        builderOptions: expect.objectContaining({
          database: 'otel_v2',
          table: 'otel_logs',
          queryType: QueryType.Logs,
        }),
      })
    );
  });

  it('switches to compact view without crashing when the saved SQL query has no rawSql', () => {
    // Provisioned / hand-authored / alert query models can carry
    // { editorType: 'sql' } with no rawSql field; migrateCHQuery returns them
    // unchanged (rawSql undefined). switchToBuilder must not dereference
    // rawSql.trim() on undefined.
    const datasource = newMockDatasource();
    datasource.settings.jsonData.configMode = 'single-table';
    datasource.settings.jsonData.signalType = 'logs';
    datasource.settings.jsonData.logs = {
      defaultDatabase: 'otel_v2',
      defaultTable: 'otel_logs',
      otelEnabled: true,
      otelVersion: '1.29.0',
    };
    const onChange = jest.fn();

    render(
      <CHQueryEditor
        query={{ pluginVersion: '', refId: 'A', editorType: EditorType.SQL } as any}
        onChange={onChange}
        onRunQuery={jest.fn()}
        datasource={datasource}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Switch to compact view' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        editorType: EditorType.Builder,
        builderOptions: expect.objectContaining({
          database: 'otel_v2',
          table: 'otel_logs',
          queryType: QueryType.Logs,
        }),
      })
    );
  });

  it('confirms before replacing hand-written SQL with compact defaults', async () => {
    const datasource = newMockDatasource();
    datasource.settings.jsonData.configMode = 'single-table';
    datasource.settings.jsonData.signalType = 'logs';
    datasource.settings.jsonData.logs = {
      defaultDatabase: 'otel_v2',
      defaultTable: 'otel_logs',
      otelEnabled: true,
      otelVersion: '1.29.0',
    };
    const onChange = jest.fn();

    render(
      <CHQueryEditor
        query={{ pluginVersion: '', rawSql: 'SELECT 1', refId: 'A', editorType: EditorType.SQL }}
        onChange={onChange}
        onRunQuery={jest.fn()}
        datasource={datasource}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Switch to compact view' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Discard SQL changes?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Discard SQL and switch' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          editorType: EditorType.Builder,
          builderOptions: expect.objectContaining({
            database: 'otel_v2',
            table: 'otel_logs',
            queryType: QueryType.Logs,
          }),
        })
      )
    );
  });

  it('switches compact trace builder to SQL with traces query type', async () => {
    const datasource = newMockDatasource();
    datasource.settings.jsonData.configMode = 'single-table';
    datasource.settings.jsonData.signalType = 'traces';
    datasource.settings.jsonData.traces = {
      defaultDatabase: 'otel_v2',
      defaultTable: 'otel_traces',
      otelEnabled: true,
      otelVersion: '1.29.0',
    };
    datasource.fetchColumns = jest.fn(() => Promise.resolve([]));
    const onChange = jest.fn();

    render(
      <CHQueryEditor
        query={{
          pluginVersion,
          rawSql: 'SELECT 1',
          refId: 'A',
          editorType: EditorType.Builder,
          builderOptions: {
            database: 'otel_v2',
            table: 'otel_traces',
            queryType: QueryType.Traces,
          },
        }}
        onChange={onChange}
        onRunQuery={jest.fn()}
        datasource={datasource}
      />
    );
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: 'Open in SQL editor' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        editorType: EditorType.SQL,
        queryType: QueryType.Traces,
      })
    );
  });

  it('settles on a type change when the panel editor hands each change back', async () => {
    const datasource = newMockDatasource();
    datasource.settings.jsonData.logs = {
      defaultDatabase: 'otel',
      defaultTable: 'otel_logs',
      otelEnabled: true,
      otelVersion: 'latest',
    };
    datasource.settings.jsonData.traces = {
      defaultDatabase: 'otel',
      defaultTable: 'otel_traces',
      otelEnabled: true,
      otelVersion: 'latest',
    };
    datasource.fetchColumns = jest.fn(() => Promise.resolve([]));
    datasource.getColumnsCached = jest.fn(() => Promise.resolve([]));
    const traces: CHQuery = {
      pluginVersion,
      rawSql: '',
      refId: 'A',
      editorType: EditorType.Builder,
      builderOptions: {
        database: 'otel',
        table: 'otel_traces',
        queryType: QueryType.Traces,
        columns: [{ name: 'TraceId', hint: ColumnHint.TraceId }],
        filters: [],
        orderBy: [],
        limit: 1000,
        meta: {},
      },
    };
    let changes = 0;
    const Panel = () => {
      const [query, setQuery] = React.useState<CHQuery>(traces);
      // Takes each change in its own state, as the panel editor does: the editor sees it on its next
      // render, by when a change made in the same pass may already be in its state.
      const onChange = (next: CHQuery) => {
        changes++;
        // Stop handing changes back past any sane count, so a loop fails the test instead of hanging it.
        if (changes < 50) {
          setQuery(next);
        }
      };
      return <CHQueryEditor query={query} onChange={onChange} onRunQuery={jest.fn()} datasource={datasource} />;
    };
    render(<Panel />);
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    changes = 0;

    fireEvent.click(screen.getByLabelText('Logs'));
    await act(async () => new Promise((r) => setTimeout(r, 300)));
    const settled = changes;
    await act(async () => new Promise((r) => setTimeout(r, 300)));

    expect(changes).toBe(settled);
    expect(changes).toBeLessThan(10);
  });

  it('does not resync compact builder state for fresh equal builder options', async () => {
    const datasource = newMockDatasource();
    datasource.settings.jsonData.configMode = 'single-table';
    datasource.settings.jsonData.signalType = 'logs';
    datasource.settings.jsonData.logs = {
      defaultDatabase: 'otel_v2',
      defaultTable: 'otel_logs',
      otelEnabled: true,
      otelVersion: '1.29.0',
    };
    datasource.fetchColumns = jest.fn(() => Promise.resolve([]));
    const builderOptions = {
      database: 'otel_v2',
      table: 'otel_logs',
      queryType: QueryType.Logs,
      columns: [{ name: 'SeverityText', hint: ColumnHint.LogLevel }],
      filters: [],
    };
    const query = {
      pluginVersion,
      rawSql: 'SELECT 1',
      refId: 'A',
      editorType: EditorType.Builder,
      builderOptions,
    };
    const onChange = jest.fn();

    const result = render(
      <CHQueryEditor query={query} onChange={onChange} onRunQuery={jest.fn()} datasource={datasource} />
    );

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));

    result.rerender(
      <CHQueryEditor
        query={{ ...query, builderOptions: { ...builderOptions, filters: [] } }}
        onChange={onChange}
        onRunQuery={jest.fn()}
        datasource={datasource}
      />
    );

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  });

  // Every change the editor propagates must target the new table, never the carried-over one.
  it('converts a query carried over from another single-table logs data source in Explore', async () => {
    const datasource = newMockDatasource();
    datasource.settings.jsonData.configMode = 'single-table';
    datasource.settings.jsonData.signalType = 'logs';
    datasource.settings.jsonData.logs = {
      defaultDatabase: 'otel_v2',
      defaultTable: 'app_logs',
      otelEnabled: true,
      otelVersion: '1.29.0',
    };
    datasource.fetchColumns = jest.fn(() =>
      Promise.resolve([
        { name: 'Body', type: 'String', picklistValues: [] },
        { name: 'ServiceName', type: 'LowCardinality(String)', picklistValues: [] },
      ])
    );
    const serviceFilter = {
      filterType: 'custom',
      key: 'ServiceName',
      type: 'LowCardinality(String)',
      operator: FilterOperator.Equals,
      value: 'checkout',
      condition: 'AND',
    } as const;
    const onChange = jest.fn();
    const onRunQuery = jest.fn();

    render(
      <CHQueryEditor
        app={CoreApp.Explore}
        query={{
          pluginVersion,
          rawSql: 'SELECT Body FROM "otel_v2"."otel_logs"',
          refId: 'A',
          editorType: EditorType.Builder,
          builderOptions: {
            database: 'otel_v2',
            table: 'otel_logs',
            queryType: QueryType.Logs,
            columns: [{ name: 'Body', hint: ColumnHint.LogMessage }],
            filters: [serviceFilter],
            meta: { datasourceUid: 'other-logs-ds' },
          },
        }}
        onChange={onChange}
        onRunQuery={onRunQuery}
        datasource={datasource}
      />
    );

    await waitFor(() => expect(onRunQuery).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalled();
    for (const [changedQuery] of onChange.mock.calls) {
      expect(changedQuery.builderOptions.table).toBe('app_logs');
      expect(changedQuery.builderOptions.filters).toContainEqual(serviceFilter);
      expect(changedQuery.builderOptions.meta.datasourceUid).toBe(datasource.uid);
      expect(changedQuery.rawSql).toContain('"otel_v2"."app_logs"');
      expect(changedQuery.rawSql).toContain("ServiceName = 'checkout'");
    }
  });

  describe('recorded owner', () => {
    const ownLogsQuery = {
      pluginVersion,
      rawSql: 'SELECT Body FROM "otel_v2"."otel_logs"',
      refId: 'A',
      editorType: EditorType.Builder,
      builderOptions: {
        database: 'otel_v2',
        table: 'otel_logs',
        queryType: QueryType.Logs,
        columns: [{ name: 'Body', hint: ColumnHint.LogMessage }],
        filters: [],
      },
    };
    const singleTableLogsDatasource = () => {
      const datasource = newMockDatasource();
      datasource.settings.jsonData.configMode = 'single-table';
      datasource.settings.jsonData.signalType = 'logs';
      datasource.settings.jsonData.logs = {
        defaultDatabase: 'otel_v2',
        defaultTable: 'otel_logs',
        otelEnabled: true,
        otelVersion: '1.29.0',
      };
      datasource.fetchColumns = jest.fn(() => Promise.resolve([]));
      return datasource;
    };

    const classicDatasource = () => {
      const datasource = newMockDatasource();
      datasource.fetchDatabases = jest.fn(() => Promise.resolve(['otel_v2']));
      datasource.fetchTables = jest.fn(() => Promise.resolve(['otel_logs']));
      datasource.fetchColumns = jest.fn(() => Promise.resolve([]));
      return datasource;
    };

    it.each([
      ['a single-table', singleTableLogsDatasource],
      ['a classic', classicDatasource],
    ])('records %s data source on a query Explore opens without a record, without running it', async (_, build) => {
      const datasource = build();
      const onChange = jest.fn();
      const onRunQuery = jest.fn();

      render(
        <CHQueryEditor
          app={CoreApp.Explore}
          query={ownLogsQuery}
          onChange={onChange}
          onRunQuery={onRunQuery}
          datasource={datasource}
        />
      );

      await waitFor(() =>
        expect(onChange).toHaveBeenCalledWith(
          expect.objectContaining({
            builderOptions: expect.objectContaining({
              meta: expect.objectContaining({ datasourceUid: datasource.uid }),
            }),
          })
        )
      );
      expect(onRunQuery).not.toHaveBeenCalled();
    });

    // Explore feeds each change back as the new query. Recording the owner must settle instead of
    // trading the recorded and unrecorded options back and forth with that copy.
    it.each(['logs', 'traces'] as const)(
      'settles after switching a %s query from SQL to the compact view in Explore',
      async (signalType) => {
        const datasource = newMockDatasource();
        datasource.settings.jsonData.configMode = 'single-table';
        datasource.settings.jsonData.signalType = signalType;
        datasource.settings.jsonData[signalType] = {
          defaultDatabase: 'otel_v2',
          defaultTable: `otel_${signalType}`,
          otelEnabled: true,
          otelVersion: 'latest',
        };
        datasource.fetchColumns = jest.fn(() => Promise.resolve([]));
        const onChange = jest.fn();
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const ExploreRow = () => {
          const [query, setQuery] = React.useState<CHQuery>({
            pluginVersion,
            refId: 'A',
            editorType: EditorType.SQL,
            rawSql: '',
          });
          return (
            <CHQueryEditor
              app={CoreApp.Explore}
              query={query}
              onChange={(next) => {
                onChange(next);
                // Stop feeding changes back after a while, so a loop fails the count below
                // instead of rendering forever.
                if (onChange.mock.calls.length <= 30) {
                  setQuery(next);
                }
              }}
              onRunQuery={jest.fn()}
              datasource={datasource}
            />
          );
        };

        render(<ExploreRow />);
        fireEvent.click(screen.getByRole('button', { name: 'Switch to compact view' }));

        await waitFor(() =>
          expect(onChange).toHaveBeenLastCalledWith(
            expect.objectContaining({
              builderOptions: expect.objectContaining({
                meta: expect.objectContaining({ datasourceUid: datasource.uid }),
              }),
            })
          )
        );
        await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
        expect(onChange.mock.calls.length).toBeLessThan(10);
        expect(errorSpy).not.toHaveBeenCalledWith(
          expect.stringContaining('Maximum update depth exceeded'),
          expect.anything()
        );
        errorSpy.mockRestore();
      }
    );

    it('records nothing outside Explore, so saved queries do not change', async () => {
      const datasource = singleTableLogsDatasource();
      const onChange = jest.fn();

      render(
        <CHQueryEditor
          app={CoreApp.PanelEditor}
          query={ownLogsQuery}
          onChange={onChange}
          onRunQuery={jest.fn()}
          datasource={datasource}
        />
      );

      await waitFor(() => expect(screen.getByTestId('compact-mode-bar')).toBeInTheDocument());
      for (const [changedQuery] of onChange.mock.calls) {
        expect(changedQuery.builderOptions.meta?.datasourceUid).toBeUndefined();
      }
    });
  });

  it('syncs compact builder state when query filters change externally', async () => {
    const datasource = newMockDatasource();
    datasource.settings.jsonData.configMode = 'single-table';
    datasource.settings.jsonData.signalType = 'logs';
    datasource.settings.jsonData.logs = {
      defaultDatabase: 'otel_v2',
      defaultTable: 'otel_logs',
      otelEnabled: true,
      otelVersion: '1.29.0',
    };
    datasource.fetchColumns = jest.fn(() => Promise.resolve([]));
    const baseQuery = {
      pluginVersion,
      rawSql: 'SELECT 1',
      refId: 'A',
      editorType: EditorType.Builder,
      builderOptions: {
        database: 'otel_v2',
        table: 'otel_logs',
        queryType: QueryType.Logs,
        columns: [{ name: 'SeverityText', hint: ColumnHint.LogLevel }],
        filters: [],
      },
    };

    const result = render(
      <CHQueryEditor query={baseQuery} onChange={jest.fn()} onRunQuery={jest.fn()} datasource={datasource} />
    );

    expect(screen.queryByText('SeverityText')).not.toBeInTheDocument();

    result.rerender(
      <CHQueryEditor
        query={{
          ...baseQuery,
          rawSql: 'SELECT 2',
          builderOptions: {
            ...baseQuery.builderOptions,
            filters: [
              {
                condition: 'AND',
                key: 'SeverityText',
                type: 'string',
                filterType: 'custom',
                operator: FilterOperator.Equals,
                value: 'error',
              },
            ],
          },
        }}
        onChange={jest.fn()}
        onRunQuery={jest.fn()}
        datasource={datasource}
      />
    );

    await waitFor(() => expect(screen.getByText('SeverityText')).toBeInTheDocument());
    expect(screen.getByText('error')).toBeInTheDocument();
  });

  // Regression guard for the one-shot span-link `query` field (#1889 follow-up):
  // Grafana core injects a top-level `query` field when a span link is followed.
  // The editor must fold that trace id into the builder options and never spread
  // the injected field back out through onChange, otherwise the saved model stays
  // pinned to the linked trace after the user targets a different trace id.
  describe('span link one-shot query field', () => {
    const originalTraceId = 'a55d8be622a816047a902c60adedd776';
    const linkedTraceId = '4ea6a6e0d0525ed05ecc350d3cdd66b6';
    const userTraceId = 'c3b5f0a1d2e4968877665544332211ff';

    const spanLinkQuery = () => ({
      pluginVersion,
      refId: 'A',
      editorType: EditorType.Builder as const,
      rawSql: `SELECT "TraceId" as traceID FROM "otel"."otel_traces" WHERE traceID = '${originalTraceId}'`,
      builderOptions: {
        database: 'otel',
        table: 'otel_traces',
        queryType: QueryType.Traces,
        columns: [{ name: 'TraceId', hint: ColumnHint.TraceId }],
        meta: { isTraceIdMode: true, traceId: originalTraceId },
      },
      // Grafana core builds the span-link navigation target as { ...currentQuery, query: linkedTraceId }.
      query: linkedTraceId,
    });

    const newTraceDatasource = () => {
      const datasource = newMockDatasource();
      datasource.fetchColumns = jest.fn(() => Promise.resolve([]));
      datasource.fetchDatabases = jest.fn(() => Promise.resolve([]));
      datasource.fetchTables = jest.fn(() => Promise.resolve([]));
      jest.spyOn(datasource, 'peekTraceTimestampTable').mockReturnValue(false);
      jest.spyOn(datasource, 'hasTraceTimestampTable').mockResolvedValue(false);
      return datasource;
    };

    it('retargets a freshly injected span-link trace id and strips the one-shot field', async () => {
      const onChange = jest.fn();

      render(
        <CHQueryEditor
          query={spanLinkQuery()}
          onChange={onChange}
          onRunQuery={jest.fn()}
          datasource={newTraceDatasource()}
        />
      );
      await act(async () => {});

      expect(onChange).toHaveBeenCalled();
      const [propagated] = onChange.mock.calls[onChange.mock.calls.length - 1];
      expect('query' in propagated).toBe(false);
      expect(propagated.builderOptions?.meta?.traceId).toEqual(linkedTraceId);
      expect(propagated.rawSql).toContain(linkedTraceId);
      expect(propagated.rawSql).not.toContain(originalTraceId);
    });

    it('follows the user trace id after an edit instead of re-pinning the linked trace', async () => {
      const onChange = jest.fn();

      render(
        <CHQueryEditor
          query={spanLinkQuery()}
          onChange={onChange}
          onRunQuery={jest.fn()}
          datasource={newTraceDatasource()}
        />
      );
      await act(async () => {});

      const traceIdInput = screen.getByTestId(selectors.components.QueryBuilder.TraceIdInput.input);
      fireEvent.change(traceIdInput, { target: { value: userTraceId } });
      fireEvent.blur(traceIdInput);
      await act(async () => {});

      const [propagated] = onChange.mock.calls[onChange.mock.calls.length - 1];
      expect('query' in propagated).toBe(false);
      expect(propagated.builderOptions?.meta?.traceId).toEqual(userTraceId);
      expect(propagated.rawSql).toContain(userTraceId);
      expect(propagated.rawSql).not.toContain(linkedTraceId);
    });
  });
});
