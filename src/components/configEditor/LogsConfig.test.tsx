import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { LogsConfig } from './LogsConfig';
import allLabels from 'labels';
import { columnLabelToPlaceholder } from 'data/utils';
import { defaultCHAdditionalSettingsConfig } from 'types/config';
import { TableColumn } from 'types/queryBuilder';

// Columns returned by the mocked datasource fetch. Includes a DateTime column (for the time roles),
// a couple of String columns (for level/message and as projectable columns), and a Map column.
const COLS: TableColumn[] = [
  { name: 'Timestamp', type: 'DateTime', label: 'Timestamp', picklistValues: [] },
  { name: 'Body', type: 'String', label: 'Body', picklistValues: [] },
  { name: 'SeverityText', type: 'String', label: 'SeverityText', picklistValues: [] },
  { name: 'LogAttributes', type: 'Map(String, String)', label: 'LogAttributes', picklistValues: [] },
];

// LogsConfig resolves the saved datasource via getDataSourceSrv().get(uid) and reads its column
// schema (fetchColumns) to render schema-backed controls. Mock the runtime so single-table mode gets
// a deterministic column list without a real datasource.
jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getDataSourceSrv: () => ({
    get: async () => ({ fetchColumns: async () => COLS }),
  }),
}));

describe('LogsConfig', () => {
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

    it('renders role fields and Columns as comboboxes after the schema fetch resolves', async () => {
      const result = render(
        <LogsConfig
          {...noopHandlers}
          variant="single-table"
          uid="ds-uid"
          logsConfig={{ defaultTable: 'otel_logs', otelEnabled: false }}
        />
      );

      // The fetch resolves in a useEffect, so wait for the role text inputs to be replaced. Their
      // disappearance means renderRoleColumn switched from LabeledInput (textbox) to ColumnSelect.
      await waitFor(() => {
        expect(result.queryByPlaceholderText(rolePlaceholders[0])).not.toBeInTheDocument();
      });
      for (const placeholder of rolePlaceholders) {
        expect(result.queryByPlaceholderText(placeholder)).not.toBeInTheDocument();
      }

      // The Columns field is now the ColumnsEditor multiselect, so only the Context Columns tags input
      // remains (both share the placeholder above); it drops from 2 tags inputs to 1.
      expect(result.getAllByPlaceholderText(tagsPlaceholder)).toHaveLength(1);

      // The 4 role ColumnSelects + the ColumnsEditor multiselect = 5 comboboxes. (OtelVersionSelect's
      // Select is disabled when otelEnabled is false and so exposes no combobox role.)
      expect(result.getAllByRole('combobox')).toHaveLength(5);
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
  });
});
