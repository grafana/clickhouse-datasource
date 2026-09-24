import React, { useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Button, Tooltip, useStyles2 } from '@grafana/ui';
import { Datasource } from 'data/CHDatasource';
import { Filter, SelectedColumn, TableColumn } from 'types/queryBuilder';
import { FilterPopover } from './FilterPopover';
import { FilterTagBar } from './FilterTagBar';

interface CompactFilterBarProps {
  datasource: Datasource;
  database: string;
  table: string;
  filters: Filter[];
  allColumns: readonly TableColumn[];
  selectedColumns?: readonly SelectedColumn[];
  onFiltersChange: (filters: Filter[]) => void;
  onToggleAdvanced?: () => void;
  advancedOpen?: boolean;
}

const getStyles = (theme: GrafanaTheme2) => ({
  row: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(0.5)};
    padding: ${theme.spacing(0.25)} 0;
    min-height: 32px;
  `,
  filters: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(0.5)};
    flex-wrap: wrap;
    flex: 1;
    min-width: 0;
  `,
  actions: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(0.5)};
    flex-shrink: 0;
    margin-left: auto;
  `,
});

export const CompactFilterBar = (props: CompactFilterBarProps) => {
  const {
    datasource,
    database,
    table,
    filters,
    allColumns,
    selectedColumns,
    onFiltersChange,
    onToggleAdvanced,
    advancedOpen,
  } = props;
  const styles = useStyles2(getStyles);
  const [showPopover, setShowPopover] = useState(false);
  const [editingFilterIndex, setEditingFilterIndex] = useState<number | undefined>();

  const onRemoveFilter = (index: number) => {
    onFiltersChange(filters.filter((_, filterIndex) => filterIndex !== index));
    if (editingFilterIndex === index) {
      setEditingFilterIndex(undefined);
      setShowPopover(false);
    }
  };

  const onAddFilter = (filter: Filter) => {
    if (editingFilterIndex === undefined) {
      onFiltersChange([...filters, filter]);
    } else {
      onFiltersChange(filters.map((existing, index) => (index === editingFilterIndex ? filter : existing)));
    }
    setEditingFilterIndex(undefined);
  };

  const onEditFilter = (index: number) => {
    setEditingFilterIndex(index);
    setShowPopover(true);
  };

  return (
    <div data-testid="compact-filter-bar">
      <div className={styles.row}>
        <div className={styles.filters}>
          <FilterTagBar
            filters={filters}
            selectedColumns={selectedColumns}
            onRemoveFilter={onRemoveFilter}
            onEditFilter={onEditFilter}
          />
          <Button
            icon="plus"
            variant="secondary"
            size="sm"
            fill="text"
            onClick={() => {
              setEditingFilterIndex(undefined);
              setShowPopover(!showPopover);
            }}
          >
            Add filter
          </Button>
          {onToggleAdvanced && (
            <Tooltip content={advancedOpen ? 'Hide order and limit options' : 'Show order and limit options'}>
              <Button
                icon="plus"
                aria-label={advancedOpen ? 'Hide order by' : 'Order by'}
                variant="secondary"
                size="sm"
                fill={advancedOpen ? 'solid' : 'text'}
                onClick={onToggleAdvanced}
              >
                Order by
              </Button>
            </Tooltip>
          )}
        </div>
      </div>
      {showPopover && (
        <FilterPopover
          datasource={datasource}
          database={database}
          table={table}
          allColumns={allColumns}
          selectedColumns={selectedColumns}
          onAddFilter={onAddFilter}
          filter={editingFilterIndex === undefined ? undefined : filters[editingFilterIndex]}
          onClose={() => setShowPopover(false)}
        />
      )}
    </div>
  );
};
