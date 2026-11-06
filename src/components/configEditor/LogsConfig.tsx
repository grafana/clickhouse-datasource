import React, { useEffect, useState } from 'react';
import { getDataSourceSrv } from '@grafana/runtime';
import { ConfigSection, ConfigSubSection } from 'components/experimental/ConfigSection';
import { Input, Field, InlineField, InlineFormLabel, TagsInput, Text } from '@grafana/ui';
import { OtelVersionSelect } from 'components/queryBuilder/OtelVersionSelect';
import { ColumnsEditor } from 'components/queryBuilder/ColumnsEditor';
import { ColumnSelect } from 'components/queryBuilder/ColumnSelect';
import { ColumnHint, SelectedColumn, TableColumn } from 'types/queryBuilder';
import { columnFilterDateTime, columnFilterString } from 'data/columnFilters';
import otel from 'otel';
import { LabeledInput } from './LabeledInput';
import { CHLogsConfig, ConfigMode, defaultCHAdditionalSettingsConfig } from 'types/config';
import { Datasource } from 'data/CHDatasource';
import allLabels from 'labels';
import { columnLabelToPlaceholder } from 'data/utils';
import { Switch } from 'components/queryBuilder/Switch';

interface LogsConfigProps {
  logsConfig?: CHLogsConfig;
  variant?: ConfigMode;
  // Datasource uid, used to fetch the configured table's real columns so the Columns field can be a
  // schema-backed multiselect. Absent (or unsaved) datasources fall back to a free-text column list.
  uid?: string;
  onDefaultDatabaseChange: (v: string) => void;
  onDefaultTableChange: (v: string) => void;
  onOtelEnabledChange: (v: boolean) => void;
  onOtelVersionChange: (v: string) => void;
  onFilterTimeColumnChange: (v: string) => void;
  onTimeColumnChange: (v: string) => void;
  onLevelColumnChange: (v: string) => void;
  onMessageColumnChange: (v: string) => void;
  onSelectContextColumnsChange: (v: boolean) => void;
  onContextColumnsChange: (v: string[]) => void;
  onShowLogLinksChange: (v: boolean) => void;
  onAdditionalColumnsChange: (v: string[]) => void;
}

export const LogsConfig = (props: LogsConfigProps) => {
  const {
    onDefaultDatabaseChange,
    onDefaultTableChange,
    onOtelEnabledChange,
    onOtelVersionChange,
    onFilterTimeColumnChange,
    onTimeColumnChange,
    onLevelColumnChange,
    onMessageColumnChange,
    onSelectContextColumnsChange,
    onContextColumnsChange,
    onShowLogLinksChange,
    onAdditionalColumnsChange,
  } = props;
  let {
    defaultDatabase,
    defaultTable,
    otelEnabled,
    otelVersion,
    filterTimeColumn,
    timeColumn,
    levelColumn,
    messageColumn,
    selectContextColumns,
    contextColumns,
    showLogLinks,
    additionalColumns,
  } = props.logsConfig || {};
  const labels = allLabels.components.Config.LogsConfig;
  const sectionLabels = props.variant === 'single-table' ? labels.variants.singleTable : labels;

  const otelConfig = otel.getVersion(otelVersion);
  if (otelEnabled && otelConfig) {
    filterTimeColumn = otelConfig.logColumnMap.get(ColumnHint.FilterTime);
    timeColumn = otelConfig.logColumnMap.get(ColumnHint.Time);
    levelColumn = otelConfig.logColumnMap.get(ColumnHint.LogLevel);
    messageColumn = otelConfig.logColumnMap.get(ColumnHint.LogMessage);
  }

  const onContextColumnsChangeTrimmed = (columns: string[]) =>
    onContextColumnsChange(columns.map((c) => c.trim()).filter((c) => c));

  const onAdditionalColumnsChangeTrimmed = (columns: string[]) =>
    onAdditionalColumnsChange(columns.map((c) => c.trim()).filter((c) => c));

  // Fetch the configured table's real columns so the Columns field can be a schema-backed
  // multiselect (single-table mode only). Resolving the datasource by uid works once it is saved;
  // before that, or when no table is set, the field falls back to a free-text list below.
  const isSingleTable = props.variant === 'single-table';
  const [fetchedColumns, setFetchedColumns] = useState<readonly TableColumn[]>([]);
  useEffect(() => {
    let ignore = false;
    if (!isSingleTable || !props.uid || !defaultTable) {
      setFetchedColumns([]);
      return;
    }
    // Debounce so typing the database/table name does not fire a schema read per keystroke, and read
    // through the datasource's column cache so repeated edits of the same table reuse a prior fetch.
    // getDataSourceSrv() is the supported way to resolve a saved datasource instance; the runtime
    // marks the singleton (and .get) deprecated in favor of an unstable API, so keep the stable
    // singleton until a stable replacement ships.
    const handle = setTimeout(() => {
      /* eslint-disable @typescript-eslint/no-deprecated */
      getDataSourceSrv()
        .get(props.uid)
        .then((ds) => {
          // getDataSourceSrv returns a generic DataSourceApi; this plugin's instance exposes the cache.
          const datasourceInstance = ds as Datasource; // [as-cast: allow]
          if (typeof datasourceInstance?.getColumnsCached !== 'function') {
            return undefined;
          }
          return datasourceInstance.getColumnsCached(defaultDatabase || undefined, defaultTable);
        })
        .then((cols) => {
          if (!ignore && cols) {
            setFetchedColumns(cols);
          }
        })
        .catch(() => {
          if (!ignore) {
            setFetchedColumns([]);
          }
        });
      /* eslint-enable @typescript-eslint/no-deprecated */
    }, 400);
    return () => {
      ignore = true;
      clearTimeout(handle);
    };
  }, [isSingleTable, props.uid, defaultDatabase, defaultTable]);

  // The Columns field manages the extra projected columns (additionalColumns). Role columns
  // (time/level/message) are configured separately and projected via their roles, so Add all skips
  // them to avoid double projection.
  const roleColumnNames = new Set(
    [filterTimeColumn, timeColumn, levelColumn, messageColumn].filter((c): c is string => Boolean(c))
  );
  const selectedColumns: SelectedColumn[] = (additionalColumns || []).map((name) => ({
    name,
    type: fetchedColumns.find((c) => c.name === name)?.type,
  }));
  // Trim on both paths: ColumnsEditor's select allows custom values, so a pasted `ServiceName ` would
  // otherwise be stored untrimmed here while the TagsInput fallback trims via onAdditionalColumnsChangeTrimmed.
  const onSelectedColumnsChange = (cols: SelectedColumn[]) => onAdditionalColumnsChangeTrimmed(cols.map((c) => c.name));
  const onAddAllColumns = (toAdd: SelectedColumn[]) => {
    const existing = new Set(additionalColumns || []);
    const names = toAdd.map((c) => c.name).filter((n) => !roleColumnNames.has(n) && !existing.has(n));
    onAdditionalColumnsChange([...(additionalColumns || []), ...names]);
  };

  // A configured column that does not exist on the table breaks every logs query with "Unknown
  // expression identifier". Once the schema is known, flag any configured columns that are missing
  // from it (comparing the base name so map sub-column access like `col['key']` still resolves).
  const unknownColumns =
    fetchedColumns.length > 0
      ? (additionalColumns || []).filter((name) => !fetchedColumns.some((c) => c.name === name.split('[')[0]))
      : [];

  // Role column fields: a schema-backed single-select (like the query builder) whenever a schema fetch
  // will happen (single-table + saved + a table set), falling back to a typed input otherwise. The
  // control type is chosen from whether a fetch WILL run, not from whether it has resolved, so the
  // field never swaps shape mid-edit when the debounced fetch returns. ColumnSelect shows the current
  // value and allows a typed value, so it works with empty options and with expression-based roles.
  const willFetchSchema = isSingleTable && Boolean(props.uid) && Boolean(defaultTable);
  const renderRoleColumn = (
    hint: ColumnHint,
    value: string | undefined,
    onChange: (v: string) => void,
    columnFilterFn: (c: TableColumn) => boolean,
    fieldLabels: { label: string; tooltip: string }
  ) => {
    if (willFetchSchema) {
      return (
        <ColumnSelect
          disabled={otelEnabled}
          allColumns={fetchedColumns}
          selectedColumn={
            value ? { name: value, type: fetchedColumns.find((c) => c.name === value)?.type, hint } : undefined
          }
          onColumnChange={(c) => onChange(c?.name || '')}
          columnFilterFn={columnFilterFn}
          columnHint={hint}
          label={fieldLabels.label}
          tooltip={fieldLabels.tooltip}
          wide
        />
      );
    }
    return (
      <LabeledInput
        disabled={otelEnabled}
        label={fieldLabels.label}
        placeholder={columnLabelToPlaceholder(fieldLabels.label)}
        tooltip={fieldLabels.tooltip}
        value={value || ''}
        onChange={onChange}
      />
    );
  };

  return (
    <ConfigSection title={sectionLabels.title} description={sectionLabels.description}>
      <div id="logs-config" />
      <Field label={labels.defaultDatabase.label} description={labels.defaultDatabase.description}>
        <Input
          name={labels.defaultDatabase.name}
          width={40}
          value={defaultDatabase || ''}
          onChange={(e) => onDefaultDatabaseChange(e.currentTarget.value)}
          label={labels.defaultDatabase.label}
          aria-label={labels.defaultDatabase.label}
          placeholder={labels.defaultDatabase.placeholder}
        />
      </Field>
      <Field label={labels.defaultTable.label} description={labels.defaultTable.description}>
        <Input
          name={labels.defaultTable.name}
          width={40}
          value={defaultTable || ''}
          onChange={(e) => onDefaultTableChange(e.currentTarget.value)}
          label={labels.defaultTable.label}
          aria-label={labels.defaultTable.label}
          placeholder={defaultCHAdditionalSettingsConfig.logs?.defaultTable!}
        />
      </Field>
      <ConfigSubSection title={labels.columns.title} description={labels.columns.description}>
        <OtelVersionSelect
          enabled={otelEnabled || false}
          selectedVersion={otelVersion || ''}
          onEnabledChange={onOtelEnabledChange}
          onVersionChange={onOtelVersionChange}
          wide
        />
        {renderRoleColumn(
          ColumnHint.FilterTime,
          filterTimeColumn,
          onFilterTimeColumnChange,
          columnFilterDateTime,
          labels.columns.filterTime
        )}
        {renderRoleColumn(ColumnHint.Time, timeColumn, onTimeColumnChange, columnFilterDateTime, labels.columns.time)}
        {renderRoleColumn(
          ColumnHint.LogLevel,
          levelColumn,
          onLevelColumnChange,
          columnFilterString,
          labels.columns.level
        )}
        {renderRoleColumn(
          ColumnHint.LogMessage,
          messageColumn,
          onMessageColumnChange,
          columnFilterString,
          labels.columns.message
        )}
        {fetchedColumns.length > 0 ? (
          <ColumnsEditor
            allColumns={fetchedColumns}
            selectedColumns={selectedColumns}
            onSelectedColumnsChange={onSelectedColumnsChange}
            showAddAllOption
            onAddAllColumns={onAddAllColumns}
            label={labels.columns.additionalColumns.label}
            tooltip={labels.columns.additionalColumns.tooltip}
            width={12}
          />
        ) : (
          <InlineField
            label={
              <InlineFormLabel width={12} className="query-keyword" tooltip={labels.columns.additionalColumns.tooltip}>
                {labels.columns.additionalColumns.label}
              </InlineFormLabel>
            }
          >
            <TagsInput
              placeholder={labels.columns.additionalColumns.placeholder}
              tags={additionalColumns || []}
              onChange={onAdditionalColumnsChangeTrimmed}
              width={60}
            />
          </InlineField>
        )}
        <Text variant="bodySmall" color="secondary">
          {labels.columns.additionalColumns.description}
        </Text>
        {unknownColumns.length > 0 && (
          <Text variant="bodySmall" color="error">
            {`Not found in ${defaultTable}: ${unknownColumns.join(', ')}. These will fail log queries until corrected.`}
          </Text>
        )}
      </ConfigSubSection>
      <br />
      <ConfigSubSection title={labels.traceIdCorrelation.title} description={labels.traceIdCorrelation.description}>
        <Switch
          label={labels.traceIdCorrelation.showLogLinks.label}
          tooltip={labels.traceIdCorrelation.showLogLinks.tooltip}
          value={showLogLinks ?? true}
          onChange={onShowLogLinksChange}
          wide
        />
      </ConfigSubSection>
      <br />
      <ConfigSubSection title={labels.contextColumns.title} description={labels.contextColumns.description}>
        <Switch
          label={labels.contextColumns.selectContextColumns.label}
          tooltip={labels.contextColumns.selectContextColumns.tooltip}
          value={selectContextColumns || false}
          onChange={onSelectContextColumnsChange}
          wide
        />
        <InlineField
          label={
            <InlineFormLabel width={12} className="query-keyword" tooltip={labels.contextColumns.columns.tooltip}>
              {labels.contextColumns.columns.label}
            </InlineFormLabel>
          }
        >
          <TagsInput
            placeholder={labels.contextColumns.columns.placeholder}
            tags={contextColumns || []}
            onChange={onContextColumnsChangeTrimmed}
            width={60}
          />
        </InlineField>
      </ConfigSubSection>
    </ConfigSection>
  );
};
