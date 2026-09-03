import React from 'react';
import { act, render, fireEvent, waitFor, within } from '@testing-library/react';
import { getDataSourceSrv } from '@grafana/runtime';
import { LogsConfig } from './LogsConfig';
import allLabels from 'labels';
import { columnLabelToPlaceholder } from 'data/utils';
import { defaultCHAdditionalSettingsConfig } from 'types/config';
import { TableColumn } from 'types/queryBuilder';
import { selectors } from 'selectors';

// Columns returned by the mocked datasource cache read. Includes a DateTime column (for the time
// roles), a couple of String columns (for level/message and as projectable columns), and a Map column.
const COLS: TableColumn[] = [
  { name: 'Timestamp', type: 'DateTime', label: 'Timestamp', picklistValues: [] },
  { name: 'Body', type: 'String', label: 'Body', picklistValues: [] },
  { name: 'SeverityText', type: 'String', label: 'SeverityText', picklistValues: [] },
  { name: 'LogAttributes', type: 'Map(String, String)', label: 'LogAttributes', picklistValues: [] },
];

// LogsConfig resolves the saved datasource via getDataSourceSrv().get(uid) and reads its column
// schema through the datasource cache (getColumnsCached) to render schema-backed controls. Mock the
// runtime so single-table mode gets a deterministic column list without a real datasource. The read
// is debounced 400ms in the component, so schema-backed waits below use a >=2000ms timeout.
// getDataSourceSrv is a jest.fn so individual tests can override the resolved datasource (e.g. an
// object without getColumnsCached, or a rejecting get) to exercise the fallback / guard paths.
const defaultDataSourceSrv = { get: async () => ({ getColumnsCached: async () => COLS }) };
jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getDataSourceSrv: jest.fn(),
}));

const mockGetDataSourceSrv = getDataSourceSrv as unknown as jest.Mock;

describe('LogsConfig', () => {
  beforeEach(() => {
    // Reset to the deterministic single-table schema before each test; the guard/fallback tests
    // override this with their own resolved value (or a rejection) as needed.
    mockGetDataSourceSrv.mockReset();
    mockGetDataSourceSrv.mockReturnValue(defaultDataSourceSrv);
  });

  it('should render', () => {
    const result = render(
      <LogsConfig
        logsConfig={{}}
        onDefaultDatabaseChange={() => {}}
        onDefaultTableChange={() => {}}
        onOtelEnabledChange={() => {}}
        onOtelVersionChange={() => {}}
        onFilterTimeColumnChange={() => {}}
        onTimeColumnChange={() => {}}
        onLevelColumnChange={() => {}}
        onMessageColumnChange={() => {}}
        onSelectContextColumnsChange={() => {}}
        onContextColumnsChange={() => {}}
        onShowLogLinksChange={() => {}}
        onAdditionalColumnsChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
  });

  it('should call onDefaultDatabase when changed', () => {
    const onDefaultDatabaseChange = jest.fn();
    const result = render(
      <LogsConfig
        logsConfig={{}}
        onDefaultDatabaseChange={onDefaultDatabaseChange}
        onDefaultTableChange={() => {}}
        onOtelEnabledChange={() => {}}
        onOtelVersionChange={() => {}}
        onFilterTimeColumnChange={() => {}}
        onTimeColumnChange={() => {}}
        onLevelColumnChange={() => {}}
        onMessageColumnChange={() => {}}
        onSelectContextColumnsChange={() => {}}
        onContextColumnsChange={() => {}}
        onShowLogLinksChange={() => {}}
        onAdditionalColumnsChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(allLabels.components.Config.LogsConfig.defaultDatabase.placeholder);
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onDefaultDatabaseChange).toHaveBeenCalledTimes(1);
    expect(onDefaultDatabaseChange).toHaveBeenCalledWith('changed');
  });

  it('should call onDefaultTable when changed', () => {
    const onDefaultTableChange = jest.fn();
    const result = render(
      <LogsConfig
        logsConfig={{}}
        onDefaultDatabaseChange={() => {}}
        onDefaultTableChange={onDefaultTableChange}
        onOtelEnabledChange={() => {}}
        onOtelVersionChange={() => {}}
        onFilterTimeColumnChange={() => {}}
        onTimeColumnChange={() => {}}
        onLevelColumnChange={() => {}}
        onMessageColumnChange={() => {}}
        onSelectContextColumnsChange={() => {}}
        onContextColumnsChange={() => {}}
        onShowLogLinksChange={() => {}}
        onAdditionalColumnsChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(defaultCHAdditionalSettingsConfig.logs?.defaultTable!);
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onDefaultTableChange).toHaveBeenCalledTimes(1);
    expect(onDefaultTableChange).toHaveBeenCalledWith('changed');
  });

  // Commented out as it's broken post npm upgrade - needs investigation
  // it('should call onOtelEnabled when changed', () => {
  //   const onOtelEnabledChange = jest.fn();
  //   const result = render(
  //     <LogsConfig
  //       logsConfig={{}}
  //       onDefaultDatabaseChange={() => {}}
  //       onDefaultTableChange={() => {}}
  //       onOtelEnabledChange={onOtelEnabledChange}
  //       onOtelVersionChange={() => {}}
  //       onTimeColumnChange={() => {}}
  //       onLevelColumnChange={() => {}}
  //       onMessageColumnChange={() => {}}
  //       onSelectContextColumnsChange={() => {}}
  //       onContextColumnsChange={() => {}}
  //     />
  //   );
  //   expect(result.container.firstChild).not.toBeNull();

  //   const checkboxes = result.getAllByRole('checkbox');
  //   expect(checkboxes).toHaveLength(2);
  //   const input = checkboxes[0];
  //   expect(input).toBeInTheDocument();
  //   fireEvent.click(input);
  //   expect(onOtelEnabledChange).toHaveBeenCalledTimes(1);
  //   expect(onOtelEnabledChange).toHaveBeenCalledWith(true);
  // });

  it('should call onOtelVersionChange when changed', () => {
    const onOtelVersionChange = jest.fn();
    const result = render(
      <LogsConfig
        logsConfig={{ otelEnabled: true }}
        onDefaultDatabaseChange={() => {}}
        onDefaultTableChange={() => {}}
        onOtelEnabledChange={() => {}}
        onOtelVersionChange={onOtelVersionChange}
        onFilterTimeColumnChange={() => {}}
        onTimeColumnChange={() => {}}
        onLevelColumnChange={() => {}}
        onMessageColumnChange={() => {}}
        onSelectContextColumnsChange={() => {}}
        onContextColumnsChange={() => {}}
        onShowLogLinksChange={() => {}}
        onAdditionalColumnsChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const select = result.getByRole('combobox');
    expect(select).toBeInTheDocument();
    fireEvent.keyDown(select, { key: 'ArrowDown' });
    fireEvent.keyDown(select, { key: 'Enter' });
    expect(onOtelVersionChange).toHaveBeenCalledTimes(2); // 2 from hook
    expect(onOtelVersionChange).toHaveBeenCalledWith(expect.any(String));
  });

  it('should call onFilterTimeColumnChange when changed', () => {
    const onFilterTimeColumnChange = jest.fn();
    const result = render(
      <LogsConfig
        logsConfig={{}}
        onDefaultDatabaseChange={() => {}}
        onDefaultTableChange={() => {}}
        onOtelEnabledChange={() => {}}
        onOtelVersionChange={() => {}}
        onFilterTimeColumnChange={onFilterTimeColumnChange}
        onTimeColumnChange={() => {}}
        onLevelColumnChange={() => {}}
        onMessageColumnChange={() => {}}
        onSelectContextColumnsChange={() => {}}
        onContextColumnsChange={() => {}}
        onShowLogLinksChange={() => {}}
        onAdditionalColumnsChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(
      columnLabelToPlaceholder(allLabels.components.Config.LogsConfig.columns.filterTime.label)
    );
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onFilterTimeColumnChange).toHaveBeenCalledTimes(1);
    expect(onFilterTimeColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onTimeColumnChange when changed', () => {
    const onTimeColumnChange = jest.fn();
    const result = render(
      <LogsConfig
        logsConfig={{}}
        onDefaultDatabaseChange={() => {}}
        onDefaultTableChange={() => {}}
        onOtelEnabledChange={() => {}}
        onOtelVersionChange={() => {}}
        onFilterTimeColumnChange={() => {}}
        onTimeColumnChange={onTimeColumnChange}
        onLevelColumnChange={() => {}}
        onMessageColumnChange={() => {}}
        onSelectContextColumnsChange={() => {}}
        onContextColumnsChange={() => {}}
        onShowLogLinksChange={() => {}}
        onAdditionalColumnsChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(
      columnLabelToPlaceholder(allLabels.components.Config.LogsConfig.columns.time.label)
    );
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onTimeColumnChange).toHaveBeenCalledTimes(1);
    expect(onTimeColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onLevelColumnChange when changed', () => {
    const onLevelColumnChange = jest.fn();
    const result = render(
      <LogsConfig
        logsConfig={{}}
        onDefaultDatabaseChange={() => {}}
        onDefaultTableChange={() => {}}
        onOtelEnabledChange={() => {}}
        onOtelVersionChange={() => {}}
        onFilterTimeColumnChange={() => {}}
        onTimeColumnChange={() => {}}
        onLevelColumnChange={onLevelColumnChange}
        onMessageColumnChange={() => {}}
        onSelectContextColumnsChange={() => {}}
        onContextColumnsChange={() => {}}
        onShowLogLinksChange={() => {}}
        onAdditionalColumnsChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(
      columnLabelToPlaceholder(allLabels.components.Config.LogsConfig.columns.level.label)
    );
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onLevelColumnChange).toHaveBeenCalledTimes(1);
    expect(onLevelColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onMessageColumnChange when changed', () => {
    const onMessageColumnChange = jest.fn();
    const result = render(
      <LogsConfig
        logsConfig={{}}
        onDefaultDatabaseChange={() => {}}
        onDefaultTableChange={() => {}}
        onOtelEnabledChange={() => {}}
        onOtelVersionChange={() => {}}
        onFilterTimeColumnChange={() => {}}
        onTimeColumnChange={() => {}}
        onLevelColumnChange={() => {}}
        onMessageColumnChange={onMessageColumnChange}
        onSelectContextColumnsChange={() => {}}
        onContextColumnsChange={() => {}}
        onShowLogLinksChange={() => {}}
        onAdditionalColumnsChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(
      columnLabelToPlaceholder(allLabels.components.Config.LogsConfig.columns.message.label)
    );
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onMessageColumnChange).toHaveBeenCalledTimes(1);
    expect(onMessageColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onShowLogLinksChange when toggled', async () => {
    const onShowLogLinksChange = jest.fn();
    const result = render(
      <LogsConfig
        logsConfig={{}}
        onDefaultDatabaseChange={() => {}}
        onDefaultTableChange={() => {}}
        onOtelEnabledChange={() => {}}
        onOtelVersionChange={() => {}}
        onFilterTimeColumnChange={() => {}}
        onTimeColumnChange={() => {}}
        onLevelColumnChange={() => {}}
        onMessageColumnChange={() => {}}
        onSelectContextColumnsChange={() => {}}
        onContextColumnsChange={() => {}}
        onShowLogLinksChange={onShowLogLinksChange}
        onAdditionalColumnsChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = await result.findByRole('switch', { name: /view logs/i });
    expect(input).toBeInTheDocument();
    fireEvent.click(input);
    expect(onShowLogLinksChange).toHaveBeenCalledTimes(1);
    expect(onShowLogLinksChange).toHaveBeenCalledWith(false);
  });

  describe('schema-backed controls (single-table mode)', () => {
    // No-op handlers for every callback so tests can override only what they assert on.
    const noopHandlers = {
      onDefaultDatabaseChange: () => {},
      onDefaultTableChange: () => {},
      onOtelEnabledChange: () => {},
      onOtelVersionChange: () => {},
      onFilterTimeColumnChange: () => {},
      onTimeColumnChange: () => {},
      onLevelColumnChange: () => {},
      onMessageColumnChange: () => {},
      onSelectContextColumnsChange: () => {},
      onContextColumnsChange: () => {},
      onShowLogLinksChange: () => {},
      onAdditionalColumnsChange: () => {},
    };

    // Placeholders the role text inputs use before the schema loads; once columns are fetched the
    // role fields become ColumnSelect dropdowns and these placeholders disappear.
    const rolePlaceholders = [
      columnLabelToPlaceholder(allLabels.components.Config.LogsConfig.columns.filterTime.label),
      columnLabelToPlaceholder(allLabels.components.Config.LogsConfig.columns.time.label),
      columnLabelToPlaceholder(allLabels.components.Config.LogsConfig.columns.level.label),
      columnLabelToPlaceholder(allLabels.components.Config.LogsConfig.columns.message.label),
    ];
    // Both the Columns field and the Context Columns field use TagsInput with this exact placeholder,
    // so it counts as 2 tags inputs in the fallback layout and 1 (only Context) once Columns becomes
    // the ColumnsEditor multiselect. That count is the robust signal for the Columns control type.
    const tagsPlaceholder = allLabels.components.Config.LogsConfig.columns.additionalColumns.placeholder;

    it('renders role fields as comboboxes immediately and Columns as a combobox once the schema resolves', async () => {
      const result = render(
        <LogsConfig
          {...noopHandlers}
          variant="single-table"
          uid="ds-uid"
          logsConfig={{ defaultTable: 'otel_logs', otelEnabled: false }}
        />
      );

      // A schema fetch will run (single-table + saved + a table), so the role fields are ColumnSelect
      // dropdowns from the first render, not text inputs, and stay that way regardless of the fetch.
      // That is the mid-edit-swap fix: the control shape never changes under the cursor.
      for (const placeholder of rolePlaceholders) {
        expect(result.queryByPlaceholderText(placeholder)).not.toBeInTheDocument();
      }
      // 4 role ColumnSelects, present before the debounced fetch resolves (OtelVersionSelect's Select
      // is disabled when otelEnabled is false, so it exposes no combobox role). The Columns field is
      // still the tags input at this point.
      expect(result.getAllByRole('combobox')).toHaveLength(4);

      // Once the debounced (400ms) schema read returns, the Columns field swaps from the tags input to
      // the ColumnsEditor multiselect: a 5th combobox appears and only the Context Columns tags input
      // remains (both tags inputs share the placeholder, so it drops from 2 to 1).
      await result.findByTestId(
        selectors.components.QueryBuilder.ColumnsEditor.multiSelectWrapper,
        {},
        { timeout: 2000 }
      );
      await waitFor(() => expect(result.getAllByRole('combobox')).toHaveLength(5), { timeout: 2000 });
      expect(result.getAllByPlaceholderText(tagsPlaceholder)).toHaveLength(1);
    });

    it('falls back to text inputs and the tags input when uid is absent (not single-table backed)', async () => {
      const result = render(
        <LogsConfig
          {...noopHandlers}
          variant="single-table"
          logsConfig={{ defaultTable: 'otel_logs', otelEnabled: false }}
        />
      );

      // No uid means the fetch guard returns early: role fields stay as text inputs and Columns stays
      // as the tags input. waitFor guards against any late state update flipping the controls.
      await waitFor(() => {
        expect(
          result.getByPlaceholderText(
            columnLabelToPlaceholder(allLabels.components.Config.LogsConfig.columns.time.label)
          )
        ).toBeInTheDocument();
      });
      for (const placeholder of rolePlaceholders) {
        expect(result.getByPlaceholderText(placeholder)).toBeInTheDocument();
      }
      // Columns stays a TagsInput here, so both it and Context Columns share the placeholder: 2 inputs.
      expect(result.getAllByPlaceholderText(tagsPlaceholder)).toHaveLength(2);
      // No schema-backed selects render in the fallback layout, and OtelVersionSelect's Select is
      // disabled (otelEnabled false), so no combobox is present at all.
      expect(result.queryAllByRole('combobox')).toHaveLength(0);
    });

    // T1: "Add all columns" must skip the columns already projected as role columns (time/level/
    // message) and the ones already in additionalColumns, and must skip collection- and time-typed
    // columns. What remains are the plain scalars, appended after the existing additionalColumns.
    it('excludes role columns, already-selected columns, Map and DateTime from "Add all columns"', async () => {
      // Schema returns the role columns, the already-selected ServiceName, two other scalars, a Map,
      // and a second DateTime. Only TraceId and SpanId should be newly added.
      const addAllCols: TableColumn[] = [
        { name: 'Timestamp', type: 'DateTime', label: 'Timestamp', picklistValues: [] },
        { name: 'SeverityText', type: 'String', label: 'SeverityText', picklistValues: [] },
        { name: 'Body', type: 'String', label: 'Body', picklistValues: [] },
        { name: 'ServiceName', type: 'String', label: 'ServiceName', picklistValues: [] },
        { name: 'TraceId', type: 'String', label: 'TraceId', picklistValues: [] },
        { name: 'SpanId', type: 'String', label: 'SpanId', picklistValues: [] },
        { name: 'LogAttributes', type: 'Map(String, String)', label: 'LogAttributes', picklistValues: [] },
        { name: 'EventTime', type: 'DateTime64(9)', label: 'EventTime', picklistValues: [] },
      ];
      mockGetDataSourceSrv.mockReturnValue({ get: async () => ({ getColumnsCached: async () => addAllCols }) });

      const onAdditionalColumnsChange = jest.fn();
      const result = render(
        <LogsConfig
          {...noopHandlers}
          variant="single-table"
          uid="ds-uid"
          logsConfig={{
            defaultTable: 'otel_logs',
            otelEnabled: false,
            timeColumn: 'Timestamp',
            levelColumn: 'SeverityText',
            messageColumn: 'Body',
            additionalColumns: ['ServiceName'],
          }}
          onAdditionalColumnsChange={onAdditionalColumnsChange}
        />
      );

      // Wait for the debounced (400ms) schema read to swap the Columns tags input for the
      // ColumnsEditor multiselect (a combobox appears inside its wrapper).
      const columnsWrapper = await result.findByTestId(
        selectors.components.QueryBuilder.ColumnsEditor.multiSelectWrapper,
        {},
        { timeout: 2000 }
      );
      await waitFor(
        () => {
          expect(within(columnsWrapper).getByRole('combobox')).toBeInTheDocument();
        },
        { timeout: 2000 }
      );

      // Open the ColumnsEditor menu; ArrowDown highlights the first option (the "Add all columns"
      // sentinel), Enter selects it, the same keyboard pattern ColumnsEditor.test.tsx uses. The
      // react-select menu renders its options at the document root, so the option text is queried on
      // the whole result rather than scoped to the wrapper.
      const multiSelect = within(columnsWrapper).getByRole('combobox');
      fireEvent.keyDown(multiSelect, { key: 'ArrowDown' });
      expect(result.getByText(allLabels.components.ColumnsEditor.addAllColumns)).toBeInTheDocument();
      fireEvent.keyDown(multiSelect, { key: 'Enter' });

      // Result excludes the role columns (Timestamp/SeverityText/Body), the Map, and both DateTime
      // columns; ServiceName stays (already present, not duplicated); TraceId and SpanId are added.
      expect(onAdditionalColumnsChange).toHaveBeenCalledTimes(1);
      expect(onAdditionalColumnsChange).toHaveBeenCalledWith(['ServiceName', 'TraceId', 'SpanId']);
    });

    // T2a: the resolved datasource has no getColumnsCached (older instance / wrong type). The guard
    // returns undefined, so the schema never loads and the Columns field stays the tags input.
    it('keeps the Columns field on the tags-input fallback when the resolved datasource lacks getColumnsCached', async () => {
      jest.useFakeTimers();
      mockGetDataSourceSrv.mockReturnValue({ get: async () => ({}) });

      const result = render(
        <LogsConfig
          {...noopHandlers}
          variant="single-table"
          uid="ds-uid"
          logsConfig={{ defaultTable: 'otel_logs', otelEnabled: false }}
        />
      );

      // Fire the 400ms debounce and let the guarded (undefined) promise settle. Advancing past the
      // debounce is what makes this exercise the fetch path rather than the identical first render.
      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      // The fetch produced no columns, so the Columns field stayed the tags input: no ColumnsEditor
      // multiselect, and both it and Context Columns share the placeholder (2 tags inputs). If the
      // fetch had returned columns the multiselect would be present, so this distinguishes the paths.
      // (Role fields are ColumnSelect regardless, per the mid-edit-swap fix, so combobox count is not
      // the fallback signal.)
      expect(
        result.queryByTestId(selectors.components.QueryBuilder.ColumnsEditor.multiSelectWrapper)
      ).not.toBeInTheDocument();
      expect(result.getAllByPlaceholderText(tagsPlaceholder)).toHaveLength(2);
      jest.useRealTimers();
    });

    // T2b: getDataSourceSrv().get() rejects. The .catch path clears the schema, so the Columns field
    // must stay the tags input without throwing or leaving an unhandled rejection.
    it('keeps the Columns field on the tags-input fallback when the datasource resolve rejects', async () => {
      jest.useFakeTimers();
      mockGetDataSourceSrv.mockReturnValue({ get: async () => Promise.reject(new Error('boom')) });

      const result = render(
        <LogsConfig
          {...noopHandlers}
          variant="single-table"
          uid="ds-uid"
          logsConfig={{ defaultTable: 'otel_logs', otelEnabled: false }}
        />
      );

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      expect(
        result.queryByTestId(selectors.components.QueryBuilder.ColumnsEditor.multiSelectWrapper)
      ).not.toBeInTheDocument();
      expect(result.getAllByPlaceholderText(tagsPlaceholder)).toHaveLength(2);
      jest.useRealTimers();
    });
  });
});
