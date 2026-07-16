import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Combobox, ComboboxOption, Input, useStyles2 } from '@grafana/ui';
import { OrderBy, OrderByDirection, QueryBuilderOptions, TableColumn } from 'types/queryBuilder';

interface CompactAdvancedProps {
  builderOptions: QueryBuilderOptions;
  allColumns: readonly TableColumn[];
  onOrderByChange: (orderBy: OrderBy[]) => void;
  onLimitChange: (limit: number) => void;
}

const getStyles = (theme: GrafanaTheme2) => ({
  row: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1)};
    padding: ${theme.spacing(0.5)} 0;
    flex-wrap: wrap;
  `,
  item: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(0.5)};
  `,
  label: css`
    font-size: ${theme.typography.bodySmall.fontSize};
    color: ${theme.colors.text.secondary};
    font-weight: ${theme.typography.fontWeightMedium};
    white-space: nowrap;
  `,
});

export const CompactAdvanced = (props: CompactAdvancedProps) => {
  const { builderOptions, allColumns, onOrderByChange, onLimitChange } = props;
  const styles = useStyles2(getStyles);
  const orderBy = builderOptions.orderBy || [];
  const limit = builderOptions.limit || 1000;
  const columnOptions: Array<ComboboxOption<string>> = allColumns.map((column) => ({
    label: column.label || column.name,
    value: column.name,
  }));
  const directionOptions: Array<ComboboxOption<OrderByDirection>> = [
    { label: 'ASC', value: OrderByDirection.ASC },
    { label: 'DESC', value: OrderByDirection.DESC },
  ];
  const currentOrderCol = orderBy.length > 0 ? orderBy[0].name : undefined;
  const currentOrderDir = orderBy.length > 0 ? orderBy[0].dir : OrderByDirection.DESC;

  return (
    <div className={styles.row} data-testid="compact-advanced">
      <div className={styles.item}>
        <span className={styles.label}>Order by</span>
        <Combobox
          options={columnOptions}
          value={currentOrderCol || null}
          onChange={(option) => {
            if (option) {
              onOrderByChange([{ name: option.value, dir: currentOrderDir }]);
            } else {
              onOrderByChange([]);
            }
          }}
          width={20}
          placeholder="Column..."
          isClearable
        />
        <Combobox
          options={directionOptions}
          value={currentOrderDir}
          onChange={(option) => {
            if (currentOrderCol) {
              onOrderByChange([{ name: currentOrderCol, dir: option.value }]);
            }
          }}
          width={10}
        />
      </div>

      <div className={styles.item}>
        <span className={styles.label}>Limit</span>
        <Input
          type="number"
          value={limit}
          width={10}
          onChange={(event) => {
            const value = parseInt(event.currentTarget.value, 10);
            if (!isNaN(value) && value > 0) {
              onLimitChange(value);
            }
          }}
        />
      </div>
    </div>
  );
};
