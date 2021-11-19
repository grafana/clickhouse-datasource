import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { SQLEditor } from './SQLEditor';
import { Components } from '../selectors';
import * as ui from '@grafana/ui';
import { mockDatasource } from '__mocks__/datasource';

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
      <SQLEditor
        query={{ rawSql, refId: 'A' }}
        onChange={jest.fn()}
        onRunQuery={jest.fn()}
        datasource={mockDatasource}
      />
    );
    expect(screen.queryByText(rawSql)).toBeInTheDocument();
  });
  it('Should Run Query', async () => {
    let value = 'test';
    const onChangeValue = jest.fn().mockImplementation(newValue => {
      value = newValue;
    });
    const onRunQuery = jest.fn();
    await act(async () => {
      render(
        <SQLEditor
          query={{ rawSql: value, refId: 'A' }}
          onChange={onChangeValue}
          onRunQuery={onRunQuery}
          datasource={mockDatasource}
        />
      );
      expect(screen.queryByText('test')).toBeInTheDocument();
      userEvent.click(screen.getByTestId(Components.QueryEditor.CodeEditor.Run));
      expect(onRunQuery).toHaveBeenCalledTimes(1);
    });
  });
});
