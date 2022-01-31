import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CHQueryEditor } from './CHQueryEditor';
import * as ui from '@grafana/ui';
import { mockDatasource } from '__mocks__/datasource';
import { QueryType } from 'types';

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
        query={{ rawSql, refId: 'A', format: 1, queryType: QueryType.SQL }}
        onChange={jest.fn()}
        onRunQuery={jest.fn()}
        datasource={mockDatasource}
      />
    );
    expect(screen.queryByText(rawSql)).toBeInTheDocument();
  });
});
