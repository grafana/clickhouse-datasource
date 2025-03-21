import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SqlEditor } from './SqlEditor';
import * as ui from '@grafana/ui';
import { mockDatasource } from '__mocks__/datasource';
import { EditorType } from 'types/sql';

// Mock the Monaco editor types
const mockMonaco = {
  KeyMod: {
    CtrlCmd: 2048,
    Shift: 1024,
  },
  KeyCode: {
    Enter: 3
  },
  languages: {
    getLanguages: () => [],
    register: jest.fn(),
    setMonarchTokensProvider: jest.fn(),
    registerCompletionItemProvider: jest.fn(),
  }
};

// Mock the editor instance with all required methods
const mockEditor = (value: string) => ({
  getValue: () => value,
  getDomNode: () => ({
    style: { width: '100', height: '100' }
  }),
  getContentHeight: () => 100,
  layout: jest.fn(),
  onDidContentSizeChange: jest.fn(),
  onKeyUp: jest.fn(),
  addAction: jest.fn(),
  getModel: () => ({
    getValue: () => value,
    onDidChangeContent: jest.fn(),
  }),
  updateOptions: jest.fn(),
  setValue: jest.fn(),
  dispose: jest.fn(),
});

// Add monaco to the window object as it's expected by sqlProvider
(window as any).monaco = mockMonaco;

let mockEditorInstance: ReturnType<typeof mockEditor>;

jest.mock('@grafana/ui', () => ({
  ...jest.requireActual<typeof ui>('@grafana/ui'),
  CodeEditor: function CodeEditor({ onEditorDidMount, value }: { onEditorDidMount: any; value: string }) {
    React.useEffect(() => {
      if (onEditorDidMount) {
        mockEditorInstance = mockEditor(value);
        onEditorDidMount(mockEditorInstance, mockMonaco);
      }
    }, [onEditorDidMount, value]);

    return <div data-testid="code-editor">{value}</div>;
  },
}));

describe('SQL Editor', () => {
  beforeEach(() => {
    // Reset the mock editor instance before each test
    mockEditorInstance = undefined as any;
  });

  it('Should display sql in the editor', () => {
    const rawSql = 'foo';
    render(
      <SqlEditor
        query={{ pluginVersion: '', rawSql, refId: 'A', editorType: EditorType.SQL }}
        onChange={jest.fn()}
        onRunQuery={jest.fn()}
        datasource={mockDatasource}
      />
    );
    expect(screen.queryByText(rawSql)).toBeInTheDocument();
  });

  // This unit test checks that the shortcut was set and is associated with 'run-query'
  it('Should have the run-query action with the Ctrl + Enter keybinding', () => {
    const mockOnRunQuery = jest.fn();
    const rawSql = 'SELECT 1';

    render(
      <SqlEditor
        query={{ pluginVersion: '', rawSql, refId: 'A', editorType: EditorType.SQL }}
        onChange={jest.fn()}
        onRunQuery={mockOnRunQuery}
        datasource={mockDatasource}
      />
    );

    // Verify that we have a mock editor instance
    expect(mockEditorInstance).toBeDefined();

    // Get the addAction mock
    // It expects the id, label, keybindings and to run on mockOnRunQuery
    const addActionMock = mockEditorInstance.addAction as jest.Mock;

    // Verify addAction was called
    expect(addActionMock).toHaveBeenCalled();

    // Get the registered action
    const registeredAction = addActionMock.mock.calls[0][0];

    // Verify it's the run-query action
    expect(registeredAction.id).toBe('run-query');
    expect(registeredAction.label).toBe('Run Query');

    // Verify keybinding is correct
    expect(registeredAction.keybindings).toEqual([
      mockMonaco.KeyMod.CtrlCmd | mockMonaco.KeyCode.Enter,
    ]);
    expect(registeredAction.keybindings).not.toEqual([
      mockMonaco.KeyMod.Shift | mockMonaco.KeyCode.Enter,
    ]);

    // Trigger the action
    registeredAction.run();

    // Verify mockOnRunQuery was called once
    expect(mockOnRunQuery).toHaveBeenCalledTimes(1);
  });
});
