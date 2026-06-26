import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CHQueryEditor } from './CHQueryEditor';
import * as ui from '@grafana/ui';
import { mockDatasource, newMockDatasource } from '__mocks__/datasource';
import { EditorType } from 'types/sql';
import { ColumnHint, QueryType } from 'types/queryBuilder';
import { pluginVersion } from 'utils/version';

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
      `WITH 'abc' as trace_id, ` +
      `(SELECT min(Start) FROM "otel"."otel_traces_trace_id_ts" WHERE TraceId = trace_id) as trace_start, ` +
      `(SELECT max(End) + 1 FROM "otel"."otel_traces_trace_id_ts" WHERE TraceId = trace_id) as trace_end ` +
      `SELECT "TraceId" as traceID FROM "otel"."otel_traces" ` +
      `WHERE traceID = trace_id AND "Timestamp" >= trace_start AND "Timestamp" <= trace_end`;

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
});
