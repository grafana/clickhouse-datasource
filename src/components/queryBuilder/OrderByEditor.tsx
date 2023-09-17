import React from 'react';
import { SelectableValue } from '@grafana/data';
import { Button, InlineFormLabel, Select } from '@grafana/ui';
import {
  OrderBy,
  OrderByDirection,
  QueryBuilderOptions,
  TableColumn,
  BuilderMode,
  AggregateColumn,
} from 'types/queryBuilder';
import allLabels from 'labels';
import { styles } from 'styles';

interface OrderByItemProps {
  columnOptions: Array<SelectableValue<string>>;
  index: number,
  orderByItem: OrderBy;
  updateOrderByItem: (index: number, orderByItem: OrderBy) => void;
}

const sortOptions = [
  { label: 'ASC', value: OrderByDirection.ASC },
  { label: 'DESC', value: OrderByDirection.DESC },
];

const OrderByItem = (props: OrderByItemProps) => {
  const { columnOptions, index, orderByItem, updateOrderByItem } = props;

  return (
    <>
      <Select
        value={orderByItem.name}
        className={styles.Common.inlineSelect}
        width={20}
        options={columnOptions}
        onChange={e => updateOrderByItem(index, { ...orderByItem, name: e.value! })}
        allowCustomValue={true}
        menuPlacement={'bottom'}
      ></Select>
      <Select<OrderByDirection>
        value={orderByItem.dir}
        className={styles.Common.inlineSelect}
        width={12}
        options={sortOptions}
        onChange={e => updateOrderByItem(index, { ...orderByItem, dir: e.value! })}
        menuPlacement={'bottom'}
      />
    </>
  );
};

interface OrderByEditorProps {
  allColumns: ReadonlyArray<TableColumn>;
  orderBy: OrderBy[];
  onOrderByChange: (orderBy: OrderBy[]) => void;
}
export const OrderByEditor = (props: OrderByEditorProps) => {
  const { allColumns, orderBy, onOrderByChange } = props;
  const columnOptions: Array<SelectableValue<string>> = allColumns.map(c => ({ label: c.name, value: c.name }));
  const { label, tooltip, addLabel } = allLabels.components.OrderByEditor;

  const addOrderByItem = () => {
    const nextOrderBy: OrderBy[] = orderBy.slice();
    nextOrderBy.push({ name: allColumns[0]?.name, dir: OrderByDirection.ASC });
    onOrderByChange(nextOrderBy);
  };
  const removeOrderByItem = (index: number) => {
    const nextOrderBy: OrderBy[] = orderBy.slice();
    nextOrderBy.splice(index, 1);
    onOrderByChange(nextOrderBy);
  };
  const updateOrderByItem = (index: number, orderByItem: OrderBy) => {
    const nextOrderBy: OrderBy[] = orderBy.slice();
    nextOrderBy[index] = orderByItem;
    onOrderByChange(nextOrderBy);
  };

  if (allColumns.length === 0) {
    return null;
  }

  const fieldLabel = (
    <InlineFormLabel
      width={8}
      className="query-keyword"
      data-testid="query-builder-orderby-item-label"
      tooltip={tooltip}
    >
      {label}
    </InlineFormLabel>
  );
  const fieldSpacer = <div className={`width-8 ${styles.Common.firstLabel}`}></div>;

  return (
    <>
      {orderBy.map((orderByItem, index) => {
        const key = `${index}-${orderByItem.name}-${orderByItem.dir}`;
        return (
          <div className="gf-form" key={key} data-testid="query-builder-orderby-item-wrapper">
            { index === 0 ? fieldLabel : fieldSpacer }
            <OrderByItem
              columnOptions={columnOptions}
              index={index}
              orderByItem={orderByItem}
              updateOrderByItem={updateOrderByItem}
            />
            <Button
              data-testid="query-builder-orderby-remove-button"
              className={styles.Common.smallBtn}
              variant="destructive"
              size="sm"
              icon="trash-alt"
              onClick={() => removeOrderByItem(index)}
            />
          </div>
        );
      })}

      <div className="gf-form">
        {orderBy.length === 0 ? fieldLabel : fieldSpacer}
        <Button
          data-testid="query-builder-orderby-add-button"
          icon="plus-circle"
          variant="secondary"
          size="sm"
          onClick={addOrderByItem}
          className={styles.Common.smallBtn}
        >
          {addLabel}
        </Button>
      </div>
    </>
  );
};

export const getOrderByFields = (
  builder: QueryBuilderOptions,
  allColumns: ReadonlyArray<TableColumn>
): Array<SelectableValue<string>> => {
  let values: Array<SelectableValue<string>> | Array<{ value: string; label: string }> = [];
  switch (builder.mode) {
    case BuilderMode.Aggregate:
      values = [
        ...(builder.columns || []).map((g) => {
          return { value: g.name, label: g.name };
        }),
        ...((builder.aggregates as AggregateColumn[]) || []).map((m) => {
          return { value: `${m.aggregateType}(${m.column})`, label: `${m.aggregateType}(${m.column})` };
        }),
        ...((builder.groupBy as string[]) || []).map((g) => {
          return { value: g, label: g };
        }),
      ];
      break;
    case BuilderMode.List:
    default:
      values = allColumns.map((m) => {
        return { label: m.name, value: m.name };
      });
  }
  // Add selected value to the list if it does not exist.
  builder.orderBy
    ?.filter(x => !values.some((y: { value: string; label: string } | SelectableValue<string>) => y.value === x.name))
    .forEach(x => values.push({ value: x.name, label: x.name }));
  return values;
};
