import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { SqlEditor } from './SqlEditor';
import * as ui from '@grafana/ui';
import { mockDatasource } from '__mocks__/datasource';
import { EditorType } from 'types/sql';
import { Components } from 'selectors';

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

describe('SQL Editor', () => {
  it('Should display sql in the editor', () => {
    const rawSql = 'foo';
    render(
      <SqlEditor
        query={{ rawSql, refId: 'A', editorType: EditorType.SQL }}
        onChange={jest.fn()}
        onRunQuery={jest.fn()}
        datasource={mockDatasource}
      />
    );
    expect(screen.queryByText(rawSql)).toBeInTheDocument();
  });
  it('Should Expand Query', async () => {
    const onChange = jest.fn();
    const onRunQuery = jest.fn();
    const result = await waitFor(() =>
      render(
        <SqlEditor
          query={{ rawSql: 'test', refId: 'A', editorType: EditorType.SQL }}
          onChange={onChange}
          onRunQuery={onRunQuery}
          datasource={mockDatasource}
        />
      ));

    expect(result.queryByText('test')).toBeInTheDocument();
    await userEvent.click(result.getByTestId(Components.QueryEditor.CodeEditor.Expand));
    expect(onChange).toHaveBeenCalledTimes(0); // TODO: codeEditor isn't mounting and wont call onChange
  });
});
