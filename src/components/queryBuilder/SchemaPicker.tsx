import React from 'react';
import { SelectableValue } from '@grafana/data';
import { InlineFormLabel, Select } from '@grafana/ui';
import { Datasource } from 'data/CHDatasource';
import useColumns from 'hooks/useColumns';
import useDatabases from 'hooks/useDatabases';
import useTables from 'hooks/useTables';
import useUniqueMapKeys from 'hooks/useUniqueMapKeys';
import labels from 'labels';
import { styles } from 'styles';

/**
 * How deep the cascading picker goes. Each level builds on the one above.
 *  - 'database': database picker only
 *  - 'table': database + table
 *  - 'column': database + table + column (default)
 *  - 'mapKey': database + table + column + map key (when the column is a Map type)
 */
export type SchemaPickerLevel = 'database' | 'table' | 'column' | 'mapKey';

/** Selected schema parts. Downstream fields are cleared when an upstream field changes. */
export interface SchemaPickerValue {
  database?: string;
  table?: string;
  column?: string;
  mapKey?: string;
}

export interface SchemaPickerProps {
  datasource: Datasource;
  value: SchemaPickerValue;
  onChange: (value: SchemaPickerValue) => void;
  /** How deep the cascade renders. Defaults to 'column'. */
  level?: SchemaPickerLevel;
  /** Override visible labels per level. */
  labels?: Partial<Record<SchemaPickerLevel, string>>;
}

const LEVEL_ORDER: SchemaPickerLevel[] = ['database', 'table', 'column', 'mapKey'];
const MAP_TYPE_PREFIX = 'Map(';

function levelIndex(level: SchemaPickerLevel): number {
  return LEVEL_ORDER.indexOf(level);
}

/**
 * Reusable cascading schema picker: Database -> Table -> Column -> Map Key.
 *
 * Reuses the existing schema-fetch hooks (useDatabases, useTables, useColumns,
 * useUniqueMapKeys) so it stays consistent with the rest of the query builder.
 *
 * Usage: pick a depth via the `level` prop. Changing a parent value clears
 * every downstream selection in a single onChange emission.
 */
export const SchemaPicker = (props: SchemaPickerProps) => {
  const { datasource, value, onChange, level = 'column', labels: labelOverrides } = props;
  const maxLevel = levelIndex(level);

  const databases = useDatabases(datasource);
  const tables = useTables(datasource, value.database || '');
  const columns = useColumns(datasource, value.database || '', value.table || '');

  const selectedColumn = columns.find((c) => c.name === value.column);
  const isMapColumn = selectedColumn ? selectedColumn.type.startsWith(MAP_TYPE_PREFIX) : false;
  const mapColumnName = isMapColumn && value.column ? value.column : '';
  const mapKeys = useUniqueMapKeys(datasource, mapColumnName, value.database || '', value.table || '');

  const labelText = (key: SchemaPickerLevel, fallback: string): string => labelOverrides?.[key] ?? fallback;

  const handleDatabaseChange = (selected: SelectableValue<string>) => {
    onChange({ database: selected.value || '', table: '', column: '', mapKey: '' });
  };

  const handleTableChange = (selected: SelectableValue<string>) => {
    onChange({ ...value, table: selected.value || '', column: '', mapKey: '' });
  };

  const handleColumnChange = (selected: SelectableValue<string>) => {
    onChange({ ...value, column: selected.value || '', mapKey: '' });
  };

  const handleMapKeyChange = (selected: SelectableValue<string>) => {
    onChange({ ...value, mapKey: selected.value || '' });
  };

  const databaseTooltip = labels.components.DatabaseSelect.tooltip;
  const tableTooltip = labels.components.TableSelect.tooltip;

  const showTable = maxLevel >= 1;
  const showColumn = maxLevel >= 2;
  const showMapKey = maxLevel >= 3 && isMapColumn && Boolean(value.column);

  return (
    <>
      <div className="gf-form">
        <InlineFormLabel width={10} className="query-keyword" tooltip={databaseTooltip}>
          {labelText('database', labels.components.DatabaseSelect.label)}
        </InlineFormLabel>
        <Select
          className={`width-15 ${styles.Common.inlineSelect}`}
          options={databases.map((d) => ({ label: d, value: d }))}
          value={value.database || null}
          onChange={handleDatabaseChange}
          menuPlacement={'bottom'}
          allowCustomValue
          isClearable
          placeholder={labels.components.DatabaseSelect.empty}
          aria-label={labelText('database', labels.components.DatabaseSelect.label)}
        />
      </div>

      {showTable && (
        <div className="gf-form">
          <InlineFormLabel width={10} className="query-keyword" tooltip={tableTooltip}>
            {labelText('table', labels.components.TableSelect.label)}
          </InlineFormLabel>
          <Select
            className={`width-15 ${styles.Common.inlineSelect}`}
            options={tables.map((t) => ({ label: t, value: t }))}
            value={value.table || null}
            onChange={handleTableChange}
            menuPlacement={'bottom'}
            allowCustomValue
            isClearable
            disabled={!value.database}
            placeholder={labels.components.TableSelect.empty}
            aria-label={labelText('table', labels.components.TableSelect.label)}
          />
        </div>
      )}

      {showColumn && (
        <div className="gf-form">
          <InlineFormLabel width={10} className="query-keyword">
            {labelText('column', 'Column')}
          </InlineFormLabel>
          <Select
            className={`width-15 ${styles.Common.inlineSelect}`}
            options={columns.map((c) => ({ label: c.name, value: c.name, description: c.type }))}
            value={value.column || null}
            onChange={handleColumnChange}
            menuPlacement={'bottom'}
            allowCustomValue
            isClearable
            disabled={!value.table}
            placeholder={'<select column>'}
            aria-label={labelText('column', 'Column')}
          />
        </div>
      )}

      {showMapKey && (
        <div className="gf-form">
          <InlineFormLabel width={10} className="query-keyword">
            {labelText('mapKey', 'Map Key')}
          </InlineFormLabel>
          <Select
            className={`width-15 ${styles.Common.inlineSelect}`}
            options={mapKeys.map((k) => ({ label: k, value: k }))}
            value={value.mapKey || null}
            onChange={handleMapKeyChange}
            menuPlacement={'bottom'}
            allowCustomValue
            isClearable
            placeholder={'<select key>'}
            aria-label={labelText('mapKey', 'Map Key')}
          />
        </div>
      )}
    </>
  );
};
