import React from 'react';
import { SelectableValue } from '@grafana/data';
import { InlineField, InlineFieldRow, Select } from '@grafana/ui';
import { Datasource } from 'data/CHDatasource';
import useColumns from 'hooks/useColumns';
import useDatabases from 'hooks/useDatabases';
import useTables from 'hooks/useTables';
import useUniqueJSONPaths from 'hooks/useUniqueJSONPaths';
import useUniqueMapKeys from 'hooks/useUniqueMapKeys';
import labels from 'labels';

/**
 * How deep the cascading picker goes. Each level builds on the one above.
 *  - 'database': database picker only
 *  - 'table': database + table
 *  - 'column': database + table + column (default)
 *  - 'mapKey': database + table + column + map key (when the column is a Map
 *    type, or a JSON path when enableJsonPaths is set and the column is JSON)
 */
export type SchemaPickerLevel = 'database' | 'table' | 'column' | 'mapKey';

/** Selected schema parts. Downstream fields are cleared when an upstream field changes. */
export interface SchemaPickerValue {
  database?: string;
  table?: string;
  column?: string;
  /** Watched key: a Map key, or a dotted JSON path when the column is JSON. */
  mapKey?: string;
  /** Whether the selected column is a Map(...) type. Emitted on change so
   * consumers can reuse it instead of refetching the column metadata. */
  isMapColumn?: boolean;
}

export interface SchemaPickerProps {
  datasource: Datasource;
  value: SchemaPickerValue;
  onChange: (value: SchemaPickerValue) => void;
  /** How deep the cascade renders. Defaults to 'column'. */
  level?: SchemaPickerLevel;
  /** Override visible labels per level. */
  labels?: Partial<Record<SchemaPickerLevel, string>>;
  /**
   * At 'mapKey' depth, also offer the key picker for JSON columns, probing the
   * table for JSON paths. Off by default so consumers whose generated SQL has
   * no JSON path handling are unaffected.
   */
  enableJsonPaths?: boolean;
}

const LEVEL_ORDER: SchemaPickerLevel[] = ['database', 'table', 'column', 'mapKey'];
const MAP_TYPE_PREFIX = 'Map(';
const JSON_TYPE_PREFIX = 'JSON';
const LABEL_WIDTH = 20;

function levelIndex(level: SchemaPickerLevel): number {
  return LEVEL_ORDER.indexOf(level);
}

/**
 * Reusable cascading schema picker: Database -> Table -> Column -> Map Key.
 *
 * Reuses the existing schema-fetch hooks (useDatabases, useTables, useColumns,
 * useUniqueMapKeys, useUniqueJSONPaths) so it stays consistent with the rest of
 * the query builder.
 *
 * Usage: pick a depth via the `level` prop. Changing a parent value clears
 * every downstream selection in a single onChange emission.
 */
export const SchemaPicker = (props: SchemaPickerProps) => {
  const { datasource, value, onChange, level = 'column', labels: labelOverrides, enableJsonPaths = false } = props;
  const maxLevel = levelIndex(level);

  const databases = useDatabases(datasource);
  const tables = useTables(datasource, value.database || '');
  const columns = useColumns(datasource, value.database || '', value.table || '');

  const columnType = (name?: string): string | undefined => columns.find((c) => c.name === name)?.type;
  const columnIsMap = (name?: string): boolean => columnType(name)?.startsWith(MAP_TYPE_PREFIX) === true;
  const isMapColumn = columnIsMap(value.column);
  const isJsonColumn = enableJsonPaths && columnType(value.column)?.startsWith(JSON_TYPE_PREFIX) === true;
  const mapColumnName = isMapColumn && value.column ? value.column : '';
  const jsonColumnName = isJsonColumn && value.column ? value.column : '';
  const mapKeys = useUniqueMapKeys(datasource, mapColumnName, value.database || '', value.table || '');
  const jsonPaths = useUniqueJSONPaths(datasource, jsonColumnName, value.database || '', value.table || '');

  // Build the option lists. The Select component drops the controlled value when
  // it isn't present in the options, so append the current value if the fetched
  // list doesn't include it (e.g. loading a saved query before the list resolves).
  const databaseOptions: Array<SelectableValue<string>> = databases.map((d) => ({ label: d, value: d }));
  if (value.database && !databases.includes(value.database)) {
    databaseOptions.push({ label: value.database, value: value.database });
  }

  const tableOptions: Array<SelectableValue<string>> = tables.map((t) => ({ label: t, value: t }));
  if (value.table && !tables.includes(value.table)) {
    tableOptions.push({ label: value.table, value: value.table });
  }

  const columnOptions: Array<SelectableValue<string>> = columns.map((c) => ({
    label: c.name,
    value: c.name,
    description: c.type,
  }));
  if (value.column && !columns.some((c) => c.name === value.column)) {
    columnOptions.push({ label: value.column, value: value.column });
  }

  const availableKeys = isJsonColumn ? jsonPaths : mapKeys;
  const mapKeyOptions: Array<SelectableValue<string>> = availableKeys.map((k) => ({ label: k, value: k }));
  if (value.mapKey && !availableKeys.includes(value.mapKey)) {
    mapKeyOptions.push({ label: value.mapKey, value: value.mapKey });
  }

  const labelText = (key: SchemaPickerLevel, fallback: string): string => labelOverrides?.[key] ?? fallback;

  // Grafana passes `null` to onChange when a clearable Select is cleared, so guard
  // the dereference. Clearing a parent also clears every downstream selection.
  const handleDatabaseChange = (selected: SelectableValue<string> | null) => {
    onChange({ database: selected?.value || '', table: '', column: '', mapKey: '', isMapColumn: false });
  };

  const handleTableChange = (selected: SelectableValue<string> | null) => {
    onChange({ ...value, table: selected?.value || '', column: '', mapKey: '', isMapColumn: false });
  };

  const handleColumnChange = (selected: SelectableValue<string> | null) => {
    onChange({ ...value, column: selected?.value || '', mapKey: '', isMapColumn: columnIsMap(selected?.value) });
  };

  const handleMapKeyChange = (selected: SelectableValue<string> | null) => {
    onChange({ ...value, mapKey: selected?.value || '', isMapColumn });
  };

  const databaseTooltip = labels.components.DatabaseSelect.tooltip;
  const tableTooltip = labels.components.TableSelect.tooltip;

  const showTable = maxLevel >= 1;
  const showColumn = maxLevel >= 2;
  const showMapKey = maxLevel >= 3 && (isMapColumn || isJsonColumn) && Boolean(value.column);
  const mapKeyLabel = labelText('mapKey', isJsonColumn ? 'JSON Path' : 'Map Key');

  return (
    <>
      <InlineFieldRow>
        <InlineField
          label={labelText('database', labels.components.DatabaseSelect.label)}
          labelWidth={LABEL_WIDTH}
          tooltip={databaseTooltip}
          grow
        >
          <Select
            options={databaseOptions}
            value={value.database || null}
            onChange={handleDatabaseChange}
            menuPlacement={'bottom'}
            allowCustomValue
            isClearable
            placeholder={labels.components.DatabaseSelect.empty}
            aria-label={labelText('database', labels.components.DatabaseSelect.label)}
          />
        </InlineField>
      </InlineFieldRow>

      {showTable && (
        <InlineFieldRow>
          <InlineField
            label={labelText('table', labels.components.TableSelect.label)}
            labelWidth={LABEL_WIDTH}
            tooltip={tableTooltip}
            disabled={!value.database}
            grow
          >
            <Select
              options={tableOptions}
              value={value.table || null}
              onChange={handleTableChange}
              menuPlacement={'bottom'}
              allowCustomValue
              isClearable
              placeholder={labels.components.TableSelect.empty}
              aria-label={labelText('table', labels.components.TableSelect.label)}
            />
          </InlineField>
        </InlineFieldRow>
      )}

      {showColumn && (
        <InlineFieldRow>
          <InlineField label={labelText('column', 'Column')} labelWidth={LABEL_WIDTH} disabled={!value.table} grow>
            <Select
              options={columnOptions}
              value={value.column || null}
              onChange={handleColumnChange}
              menuPlacement={'bottom'}
              allowCustomValue
              isClearable
              placeholder={'<select column>'}
              aria-label={labelText('column', 'Column')}
            />
          </InlineField>
        </InlineFieldRow>
      )}

      {showMapKey && (
        <InlineFieldRow>
          <InlineField label={mapKeyLabel} labelWidth={LABEL_WIDTH} grow>
            <Select
              options={mapKeyOptions}
              value={value.mapKey || null}
              onChange={handleMapKeyChange}
              menuPlacement={'bottom'}
              allowCustomValue
              isClearable
              placeholder={'<select key>'}
              aria-label={mapKeyLabel}
            />
          </InlineField>
        </InlineFieldRow>
      )}
    </>
  );
};
