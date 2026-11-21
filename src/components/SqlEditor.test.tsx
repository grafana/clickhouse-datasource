import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SqlEditor } from './SqlEditor';
import * as ui from '@grafana/ui';
import { mockDatasource } from '__mocks__/datasource';
import { EditorType } from 'types/sql';
import { selectors } from 'selectors';
import { getDefaultTimeRange, LoadingState } from '@grafana/data';
import { CheckOutcome } from './sqlServerCheck';

const mockQueryCheck = { check: jest.fn<Promise<CheckOutcome>, [string]>(), cancel: jest.fn() };
jest.mock('./sqlServerCheck', () => ({ createSqlServerCheck: () => mockQueryCheck }));

const mockCompletionDispose = jest.fn();
const mockFormattingDispose = jest.fn();

// Mock the Monaco editor types
const mockMonaco = {
  KeyMod: {
    CtrlCmd: 2048,
    Shift: 1024,
  },
  KeyCode: {
    Enter: 3,
  },
  MarkerSeverity: {
    Error: 8,
    Warning: 4,
  },
  editor: {
    setModelMarkers: jest.fn(),
  },
  languages: {
    getLanguages: () => [],
    register: jest.fn(),
    setMonarchTokensProvider: jest.fn(),
    registerCompletionItemProvider: jest.fn(() => ({ dispose: mockCompletionDispose })),
    registerDocumentFormattingEditProvider: jest.fn(() => ({ dispose: mockFormattingDispose })),
  },
};

// Mock the editor instance with all required methods
const mockEditor = (value: string) => ({
  getValue: () => value,
  getDomNode: () => ({
    style: { width: '100', height: '100' },
  }),
  getContentHeight: () => 100,
  layout: jest.fn(),
  onDidContentSizeChange: jest.fn(),
  onDidChangeModelContent: jest.fn(),
  onDidChangeCursorPosition: jest.fn(),
  onKeyUp: jest.fn(),
  addAction: jest.fn(),
  getModel: () => ({
    getValue: () => value,
    onDidChangeContent: jest.fn(),
  }),
  updateOptions: jest.fn(),
  setValue: jest.fn(),
  dispose: jest.fn(),
  getPosition: () => ({ lineNumber: 1, column: 1 }),
});

// Add monaco to the window object as it's expected by sqlProvider
(window as any).monaco = mockMonaco;

let mockEditorInstance: ReturnType<typeof mockEditor>;

jest.mock('@grafana/ui', () => ({
  ...jest.requireActual<typeof ui>('@grafana/ui'),
  CodeEditor: function CodeEditor({
    onEditorDidMount,
    onEditorWillUnmount,
    value,
  }: {
    onEditorDidMount: any;
    onEditorWillUnmount?: () => void;
    value: string;
  }) {
    React.useEffect(() => {
      if (onEditorDidMount) {
        mockEditorInstance = mockEditor(value);
        onEditorDidMount(mockEditorInstance, mockMonaco);
      }
      return () => {
        onEditorWillUnmount?.();
      };
    }, [onEditorDidMount, onEditorWillUnmount, value]);

    return <div data-testid="code-editor">{value}</div>;
  },
}));

describe('SQL Editor', () => {
  beforeEach(() => {
    // Reset the mock editor instance before each test
    mockEditorInstance = undefined as any;
    mockCompletionDispose.mockClear();
    mockFormattingDispose.mockClear();
    mockMonaco.languages.registerCompletionItemProvider.mockClear();
    mockMonaco.languages.registerDocumentFormattingEditProvider.mockClear();
    mockMonaco.editor.setModelMarkers.mockClear();
    mockQueryCheck.check.mockReset();
    mockQueryCheck.cancel.mockReset();
  });

  const renderEditor = (rawSql: string) =>
    render(
      <SqlEditor
        query={{ pluginVersion: '', rawSql, refId: 'A', editorType: EditorType.SQL }}
        onChange={jest.fn()}
        onRunQuery={jest.fn()}
        datasource={mockDatasource}
      />
    );
  const editText = async () => {
    const onContentChange = (mockEditorInstance.onDidChangeModelContent as jest.Mock).mock.calls[0][0];
    onContentChange();
    await act(async () => {
      jest.advanceTimersByTime(800);
    });
  };

  describe('checking the text with the server', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('asks once typing pauses, not when the editor opens, and marks what it reports', async () => {
      const marker = { startLineNumber: 1, startColumn: 8, endLineNumber: 1, endColumn: 18, message: 'Unknown column' };
      mockQueryCheck.check.mockResolvedValue({ kind: 'names', markers: [marker] });

      renderEditor('SELECT ServiceNme FROM otel_logs');
      expect(mockQueryCheck.check).not.toHaveBeenCalled();

      await editText();
      expect(mockQueryCheck.check).toHaveBeenCalledWith('SELECT ServiceNme FROM otel_logs');
      expect(mockMonaco.editor.setModelMarkers).toHaveBeenLastCalledWith(expect.anything(), 'clickhouse-query-check', [
        { ...marker, severity: 8, source: 'ClickHouse' },
      ]);
    });

    it('marks an unknown name under the cursor once the cursor moves off it', async () => {
      const typed = { startLineNumber: 1, startColumn: 8, endLineNumber: 1, endColumn: 10, message: 'Unknown "cn"' };
      const other = { startLineNumber: 1, startColumn: 16, endLineNumber: 1, endColumn: 19, message: 'Unknown "tbl"' };
      mockQueryCheck.check.mockResolvedValue({ kind: 'names', markers: [typed, other] });
      renderEditor('SELECT cn FROM tbl');
      // The cursor sits right after `cn`, which is still being typed.
      mockEditorInstance.getPosition = () => ({ lineNumber: 1, column: 10 });

      await editText();
      expect(mockMonaco.editor.setModelMarkers).toHaveBeenLastCalledWith(expect.anything(), 'clickhouse-query-check', [
        { ...other, severity: 8, source: 'ClickHouse' },
      ]);

      // Moving inside the name keeps it held back; moving off it marks it.
      const onCursorChange = (mockEditorInstance.onDidChangeCursorPosition as jest.Mock).mock.calls[0][0];
      const callsAfterCheck = mockMonaco.editor.setModelMarkers.mock.calls.length;
      onCursorChange({ position: { lineNumber: 1, column: 9 } });
      expect(mockMonaco.editor.setModelMarkers).toHaveBeenCalledTimes(callsAfterCheck);
      onCursorChange({ position: { lineNumber: 1, column: 12 } });
      expect(mockMonaco.editor.setModelMarkers).toHaveBeenLastCalledWith(expect.anything(), 'clickhouse-query-check', [
        { ...typed, severity: 8, source: 'ClickHouse' },
        { ...other, severity: 8, source: 'ClickHouse' },
      ]);
    });

    it('drops a held-back name when the text changes', async () => {
      const typed = { startLineNumber: 1, startColumn: 8, endLineNumber: 1, endColumn: 10, message: 'Unknown "cn"' };
      mockQueryCheck.check.mockResolvedValue({ kind: 'names', markers: [typed] });
      renderEditor('SELECT cn FROM tbl');
      mockEditorInstance.getPosition = () => ({ lineNumber: 1, column: 10 });
      await editText();

      const onContentChange = (mockEditorInstance.onDidChangeModelContent as jest.Mock).mock.calls[0][0];
      onContentChange();
      mockMonaco.editor.setModelMarkers.mockClear();
      const onCursorChange = (mockEditorInstance.onDidChangeCursorPosition as jest.Mock).mock.calls[0][0];
      onCursorChange({ position: { lineNumber: 1, column: 12 } });
      expect(mockMonaco.editor.setModelMarkers).not.toHaveBeenCalled();
    });

    it('shows a syntax error ahead of the cursor as a warning', async () => {
      const marker = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 7, message: 'Syntax error' };
      mockQueryCheck.check.mockResolvedValue({ kind: 'syntax', marker, atEnd: false });

      renderEditor('SELECT');
      await editText();
      expect(mockMonaco.editor.setModelMarkers).toHaveBeenLastCalledWith(expect.anything(), 'clickhouse-query-check', [
        { ...marker, severity: 4, source: 'ClickHouse' },
      ]);
    });

    it('asks nothing when Validate SQL is turned off', async () => {
      mockDatasource.settings.jsonData.validateSql = false;
      try {
        renderEditor('SELECT 1');
        await editText();
        expect(mockQueryCheck.check).not.toHaveBeenCalled();
      } finally {
        delete mockDatasource.settings.jsonData.validateSql;
      }
    });
  });

  it('marks where the last run failed, and clears the marker when the text changes', () => {
    const rawSql =
      "SELECT toStartOfInterval(Timestamp, INTERVAL 1 HOUR) AS t\n  concat(ServiceName, ' ', SeverityText) AS s\nFROM otel_logs";
    const message =
      "error querying the database: code: 62, message: Syntax error: failed at position 61 (concat) (line 2, col 3): concat(ServiceName, ' ', SeverityText) AS s. Expected one of: token, Comma, FROM";

    render(
      <SqlEditor
        query={{ pluginVersion: '', rawSql, refId: 'A', editorType: EditorType.SQL }}
        onChange={jest.fn()}
        onRunQuery={jest.fn()}
        datasource={mockDatasource}
        data={{
          state: LoadingState.Error,
          series: [],
          timeRange: getDefaultTimeRange(),
          errors: [{ refId: 'A', message }],
        }}
      />
    );

    expect(mockMonaco.editor.setModelMarkers).toHaveBeenLastCalledWith(expect.anything(), 'clickhouse-query-error', [
      expect.objectContaining({ startLineNumber: 2, startColumn: 3, endColumn: 9, severity: 8, source: 'ClickHouse' }),
    ]);

    const onContentChange = (mockEditorInstance.onDidChangeModelContent as jest.Mock).mock.calls[0][0];
    onContentChange();
    expect(mockMonaco.editor.setModelMarkers).toHaveBeenLastCalledWith(expect.anything(), 'clickhouse-query-error', []);
  });

  it('marks an unknown column the last run named', () => {
    const rawSql = 'SELECT ServiceNme FROM otel_logs';
    const message =
      "error querying the database: code: 47, message: Unknown expression identifier `ServiceNme`. Maybe you meant: ['ServiceName']. In scope SELECT ServiceNme FROM otel_logs";

    render(
      <SqlEditor
        query={{ pluginVersion: '', rawSql, refId: 'A', editorType: EditorType.SQL }}
        onChange={jest.fn()}
        onRunQuery={jest.fn()}
        datasource={mockDatasource}
        data={{
          state: LoadingState.Error,
          series: [],
          timeRange: getDefaultTimeRange(),
          errors: [{ refId: 'A', message }],
        }}
      />
    );

    expect(mockMonaco.editor.setModelMarkers).toHaveBeenLastCalledWith(expect.anything(), 'clickhouse-query-error', [
      expect.objectContaining({
        startLineNumber: 1,
        startColumn: 8,
        endColumn: 18,
        message: 'Unknown column "ServiceNme". Did you mean "ServiceName"?',
      }),
    ]);
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

  it('commits a min interval without rewriting format, then re-runs the query', () => {
    const rawSql = 'select 1';
    const onChange = jest.fn();
    const onRunQuery = jest.fn();

    render(
      <SqlEditor
        // No queryType, and a non-default format: the shape a provisioned or
        // hand-authored SQL model has. saveChanges would reset format to Table.
        query={{ pluginVersion: '', rawSql, refId: 'A', editorType: EditorType.SQL, format: 2 }}
        onChange={onChange}
        onRunQuery={onRunQuery}
        datasource={mockDatasource}
      />
    );

    const input = screen.getByTestId(selectors.components.QueryEditor.MinIntervalEditor.input);
    fireEvent.change(input, { target: { value: '5m' } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ minInterval: '5m', format: 2, editorType: EditorType.SQL })
    );
    expect(onRunQuery).toHaveBeenCalledTimes(1);
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
    expect(registeredAction.keybindings).toEqual([mockMonaco.KeyMod.CtrlCmd | mockMonaco.KeyCode.Enter]);
    expect(registeredAction.keybindings).not.toEqual([mockMonaco.KeyMod.Shift | mockMonaco.KeyCode.Enter]);

    // Trigger the action
    registeredAction.run(mockEditorInstance);

    // Verify mockOnRunQuery was called once
    expect(mockOnRunQuery).toHaveBeenCalledTimes(1);
  });

  it('disposes Monaco language providers when the editor unmounts', () => {
    const rawSql = 'SELECT 1';

    const { unmount } = render(
      <SqlEditor
        query={{ pluginVersion: '', rawSql, refId: 'A', editorType: EditorType.SQL }}
        onChange={jest.fn()}
        onRunQuery={jest.fn()}
        datasource={mockDatasource}
      />
    );

    expect(mockMonaco.languages.registerCompletionItemProvider).toHaveBeenCalledTimes(1);
    expect(mockMonaco.languages.registerDocumentFormattingEditProvider).toHaveBeenCalledTimes(1);
    expect(mockCompletionDispose).not.toHaveBeenCalled();
    expect(mockFormattingDispose).not.toHaveBeenCalled();

    unmount();

    expect(mockCompletionDispose).toHaveBeenCalledTimes(1);
    expect(mockFormattingDispose).toHaveBeenCalledTimes(1);
  });
});
