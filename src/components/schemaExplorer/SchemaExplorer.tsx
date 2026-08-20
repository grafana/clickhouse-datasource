import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GrafanaTheme2, SelectableValue } from '@grafana/data';
import { Button, Checkbox, FilterInput, InlineField, Select, Stack, useStyles2 } from '@grafana/ui';
import { Datasource } from 'data/CHDatasource';
import { getTimeColumnCandidates, resolveTimeColumn } from 'data/schemaExplorer';
import useDatabases from 'hooks/useDatabases';
import useTables from 'hooks/useTables';
import useTableEngines from 'hooks/useTableEngines';
import { useColumnsState } from 'hooks/useColumns';
import { TableColumn } from 'types/queryBuilder';
import { SchemaExplorerState } from 'types/sql';
import labels from 'labels';
import { selectors } from 'selectors';
import { css } from '@emotion/css';

export const MIN_COLUMNS_LOADING_MS = 500;

/** Scrolls the selected row into view within its own pane. */
const scrollRowIntoView = (row: HTMLDivElement | null) => {
  const list = row?.parentElement;
  if (!row || !list) {
    return;
  }

  const top = row.offsetTop - list.offsetTop;
  const bottom = top + row.offsetHeight;
  if (top >= list.scrollTop && bottom <= list.scrollTop + list.clientHeight) {
    return;
  }

  list.scrollTop = Math.max(0, top - (list.clientHeight - row.offsetHeight) / 2);
};

/** Scrolls to the selected row once per selection. */
const useScrollToSelection = (selected: string | undefined, listContents: readonly string[]) => {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const lastScrolledTo = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!selected || lastScrolledTo.current === selected || !rowRef.current) {
      return;
    }

    lastScrolledTo.current = selected;
    scrollRowIntoView(rowRef.current);
  }, [selected, listContents]);

  return rowRef;
};

/**
 * Holds `active` true for at least `ms` once it goes true, so a fast fetch doesn't flash
 * a loading state for a few frames. A duration already longer than `ms` isn't delayed further.
 */
const useMinimumDuration = (active: boolean, ms: number): boolean => {
  const [held, setHeld] = useState(active);
  const startedAt = useRef<number | undefined>(active ? Date.now() : undefined);

  useEffect(() => {
    if (active) {
      startedAt.current = Date.now();
      setHeld(true);
      return;
    }

    if (startedAt.current === undefined) {
      setHeld(false);
      return;
    }

    const remaining = ms - (Date.now() - startedAt.current);
    if (remaining <= 0) {
      setHeld(false);
      return;
    }

    let ignore = false;
    const timer = setTimeout(() => {
      if (!ignore) {
        setHeld(false);
      }
    }, remaining);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [active, ms]);

  return held;
};

const getStyles = (theme: GrafanaTheme2) => ({
  panes: css`
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: ${theme.spacing(1)};
  `,
  pane: css`
    display: flex;
    flex-direction: column;
    border: 1px solid ${theme.colors.border.medium};
    border-radius: ${theme.shape.radius.default};
    padding: ${theme.spacing(1)};
  `,
  paneTitle: css`
    font-weight: ${theme.typography.fontWeightMedium};
    margin-bottom: ${theme.spacing(0.5)};
  `,
  list: css`
    height: 260px;
    overflow-y: auto;
    margin-top: ${theme.spacing(0.5)};
  `,
  row: css`
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: ${theme.spacing(1)};
    padding: ${theme.spacing(0.5)} ${theme.spacing(1)};
    cursor: pointer;
    border-radius: ${theme.shape.radius.default};
    &:hover {
      background: ${theme.colors.action.hover};
    }
  `,
  rowActive: css`
    background: ${theme.colors.action.selected};
  `,
  rowName: css`
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  secondaryLabel: css`
    color: ${theme.colors.text.secondary};
    font-size: calc(${theme.typography.bodySmall.fontSize} - 1pt);
    font-style: italic;
    flex: 0 8 auto;
    max-width: 45%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  columnsHeader: css`
    display: flex;
    justify-content: space-between;
    align-items: center;
  `,
  columnRow: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: ${theme.spacing(0.75)};
    padding: ${theme.spacing(0.25)} ${theme.spacing(1)};
  `,
  emptyHint: css`
    color: ${theme.colors.text.secondary};
    font-style: italic;
    padding: ${theme.spacing(0.5)} ${theme.spacing(1)};
  `,
  actionBar: css`
    display: flex;
    align-items: flex-end;
    gap: ${theme.spacing(1)};
    margin-top: ${theme.spacing(1)};
  `,
});

interface SchemaExplorerProps {
  datasource: Datasource;
  state: SchemaExplorerState;
  onStateChange: (state: SchemaExplorerState, columns: readonly TableColumn[]) => void;
  onSendToBuilder: (
    database: string,
    table: string,
    selectedColumns: string[],
    timeColumn: string,
    columns: readonly TableColumn[]
  ) => void;
  onSendToSql: (
    database: string,
    table: string,
    selectedColumns: string[],
    timeColumn: string,
    columns: readonly TableColumn[]
  ) => void;
}

export const SchemaExplorer = (props: SchemaExplorerProps) => {
  const { datasource, state, onStateChange, onSendToBuilder, onSendToSql } = props;
  const { database, table } = state;
  const selectedColumns = state.selectedColumns || [];
  const styles = useStyles2(getStyles);
  const l = labels.components.SchemaExplorer;
  const s = selectors.components.SchemaExplorer;

  const databases = useDatabases(datasource);
  const tables = useTables(datasource, database || '');
  const tableEngines = useTableEngines(datasource, database || '');
  const { columns: fetchedColumns, loading: fetchLoading } = useColumnsState(datasource, database || '', table || '');
  const columnsLoading = useMinimumDuration(fetchLoading, MIN_COLUMNS_LOADING_MS);
  const columns = columnsLoading ? [] : fetchedColumns;

  const [databaseSearch, setDatabaseSearch] = useState('');
  const [tableSearch, setTableSearch] = useState('');

  const filteredDatabases = useMemo(
    () => databases.filter((d) => d.toLowerCase().includes(databaseSearch.toLowerCase())),
    [databases, databaseSearch]
  );
  const filteredTables = useMemo(
    () => tables.filter((t) => t.toLowerCase().includes(tableSearch.toLowerCase())),
    [tables, tableSearch]
  );

  const timeColumnOptions: Array<SelectableValue<string>> = [
    { label: l.timeColumn.noneOption, value: '' },
    ...getTimeColumnCandidates(columns).map((c) => ({ label: c.name, value: c.name })),
  ];
  const effectiveTimeColumn =
    state.timeColumn ?? resolveTimeColumn(datasource, database || '', table || '', columns) ?? '';

  const emit = (next: SchemaExplorerState) => onStateChange(next, columns);

  const selectDatabase = (db: string) =>
    emit({ database: db, table: undefined, selectedColumns: [], timeColumn: undefined });

  const selectTable = (t: string) => emit({ ...state, table: t, selectedColumns: [], timeColumn: undefined });

  const toggleColumn = (name: string, checked: boolean) => {
    const next = checked ? [...selectedColumns, name] : selectedColumns.filter((c) => c !== name);
    emit({ ...state, selectedColumns: next });
  };

  // Persist the resolved default so the generated SQL never depends on re-resolving it.
  useEffect(() => {
    if (!table || columnsLoading || state.timeColumn !== undefined || columns.length === 0) {
      return;
    }

    emit({ ...state, timeColumn: effectiveTimeColumn });
  });

  const hasTable = Boolean(table);
  const selectedDatabaseRef = useScrollToSelection(database, filteredDatabases);
  const selectedTableRef = useScrollToSelection(table, filteredTables);

  return (
    <div data-testid={s.container}>
      <div className={styles.panes}>
        <div className={styles.pane} data-testid={s.databasesPane}>
          <div className={styles.paneTitle}>{l.databases.title}</div>
          <FilterInput
            value={databaseSearch}
            onChange={setDatabaseSearch}
            placeholder={l.databases.searchPlaceholder}
          />
          <div className={styles.list} data-testid={s.list}>
            {filteredDatabases.length === 0 && <div className={styles.emptyHint}>{l.databases.empty}</div>}
            {filteredDatabases.map((db) => (
              <div
                key={db}
                ref={db === database ? selectedDatabaseRef : undefined}
                data-testid={s.row}
                className={`${styles.row} ${db === database ? styles.rowActive : ''}`}
                onClick={() => selectDatabase(db)}
              >
                {db}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.pane} data-testid={s.tablesPane}>
          <div className={styles.paneTitle}>{l.tables.title}</div>
          <FilterInput value={tableSearch} onChange={setTableSearch} placeholder={l.tables.searchPlaceholder} />
          <div className={styles.list} data-testid={s.list}>
            {!database && <div className={styles.emptyHint}>{l.tables.emptyNoDatabase}</div>}
            {database && filteredTables.length === 0 && <div className={styles.emptyHint}>{l.tables.empty}</div>}
            {filteredTables.map((t) => (
              <div
                key={t}
                ref={t === table ? selectedTableRef : undefined}
                data-testid={s.row}
                className={`${styles.row} ${t === table ? styles.rowActive : ''}`}
                onClick={() => selectTable(t)}
              >
                <span className={styles.rowName} title={t}>
                  {t}
                </span>
                {tableEngines[t] && (
                  <span className={styles.secondaryLabel} title={tableEngines[t]}>
                    {tableEngines[t]}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.pane} data-testid={s.columnsPane}>
          <div className={styles.columnsHeader}>
            <div className={styles.paneTitle}>{l.columns.title}</div>
            <Stack gap={1}>
              <Button
                size="sm"
                fill="text"
                disabled={!hasTable || columnsLoading}
                onClick={() => emit({ ...state, selectedColumns: columns.map((c) => c.name) })}
              >
                {l.columns.selectAll}
              </Button>
              <Button
                size="sm"
                fill="text"
                disabled={!hasTable || columnsLoading}
                onClick={() => emit({ ...state, selectedColumns: [] })}
              >
                {l.columns.clear}
              </Button>
            </Stack>
          </div>
          <div className={styles.list} data-testid={s.list}>
            {!table && <div className={styles.emptyHint}>{l.columns.emptyNoTable}</div>}
            {table && columnsLoading && <div className={styles.emptyHint}>{l.columns.loading}</div>}
            {table && !columnsLoading && columns.length === 0 && (
              <div className={styles.emptyHint}>{l.columns.empty}</div>
            )}
            {columns.map((c) => (
              <div key={c.name} className={styles.columnRow}>
                <Checkbox
                  value={selectedColumns.includes(c.name)}
                  onChange={(e) => toggleColumn(c.name, e.currentTarget.checked)}
                  label={c.name}
                />
                <span className={styles.secondaryLabel} title={c.type}>
                  {c.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.actionBar}>
        <InlineField label={l.timeColumn.label} tooltip={l.timeColumn.tooltip} disabled={!hasTable || columnsLoading}>
          <Select
            inputId={s.timeColumnSelect}
            data-testid={s.timeColumnSelect}
            value={columnsLoading ? null : effectiveTimeColumn}
            placeholder={columnsLoading ? l.timeColumn.loading : undefined}
            isLoading={columnsLoading}
            options={timeColumnOptions}
            onChange={(v) => emit({ ...state, timeColumn: v.value ?? '' })}
            disabled={!hasTable || columnsLoading}
            width={30}
          />
        </InlineField>
        <Button
          variant="primary"
          disabled={!hasTable || columnsLoading}
          data-testid={s.sendToSqlButton}
          onClick={() => onSendToSql(database!, table!, selectedColumns, effectiveTimeColumn, columns)}
        >
          {l.sendToSql}
        </Button>
        <Button
          variant="secondary"
          disabled={!hasTable || columnsLoading}
          data-testid={s.sendToBuilderButton}
          onClick={() => onSendToBuilder(database!, table!, selectedColumns, effectiveTimeColumn, columns)}
        >
          {l.sendToBuilder}
        </Button>
      </div>
    </div>
  );
};
