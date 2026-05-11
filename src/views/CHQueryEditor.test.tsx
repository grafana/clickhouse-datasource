import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CHQueryEditor } from './CHQueryEditor';
import * as ui from '@grafana/ui';
import { mockDatasource, newMockDatasource } from '__mocks__/datasource';
import { EditorType } from 'types/sql';
import { QueryType } from 'types/queryBuilder';

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

    expect(screen.getByRole('button', { name: 'Query Builder' })).toBeInTheDocument();
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
        query={{ pluginVersion: '', rawSql: 'SELECT 1', refId: 'A', editorType: EditorType.SQL }}
        onChange={onChange}
        onRunQuery={jest.fn()}
        datasource={datasource}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Query Builder' }));

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
});
