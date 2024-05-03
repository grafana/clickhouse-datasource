import React from 'react';
import { SelectableValue } from '@grafana/data';
import { Button, InlineFormLabel, Select } from '@grafana/ui';
import {
  OrderBy,
  OrderByDirection,
  QueryBuilderOptions,
  TableColumn,
} from 'types/queryBuilder';
import allLabels from 'labels';
import { styles } from 'styles';
import { isAggregateQuery } from 'data/sqlGenerator';

interface OrderByItemProps {
  columnOptions: Array<SelectableValue<string>>;
  index: number,
  orderByItem: OrderBy;
  updateOrderByItem: (index: number, orderByItem: OrderBy) => void;
  removeOrderByItem: (index: number) => void;
}

const sortOptions = [
  { label: 'ASC', value: OrderByDirection.ASC },
  { label: 'DESC', value: OrderByDirection.DESC },
];

const OrderByItem = (props: OrderByItemProps) => {
  const { columnOptions, index, orderByItem, updateOrderByItem, removeOrderByItem } = props;

  return (
    <>
      <Select
        disabled={Boolean(orderByItem.hint)}
        placeholder={orderByItem.hint ? allLabels.types.ColumnHint[orderByItem.hint] : undefined}
        value={orderByItem.hint ? undefined : orderByItem.name}
        className={styles.Common.inlineSelect}
        width={36}
        options={columnOptions}
        onChange={e => updateOrderByItem(index, { ...orderByItem, name: e.value! })}
        allowCustomValue
        menuPlacement={'bottom'}
      />
      <Select<OrderByDirection>
        value={orderByItem.dir}
        className={styles.Common.inlineSelect}
        width={12}
        options={sortOptions}
        onChange={e => updateOrderByItem(index, { ...orderByItem, dir: e.value! })}
        menuPlacement={'bottom'}
      />
      <Button
        data-testid="query-builder-orderby-remove-button"
        className={styles.Common.smallBtn}
        variant="destructive"
        size="sm"
        icon="trash-alt"
        onClick={() => removeOrderByItem(index)}
      />
    </>
  );
};

interface OrderByEditorProps {
  orderByOptions: Array<SelectableValue<string>>;
  orderBy: OrderBy[];
  onOrderByChange: (orderBy: OrderBy[]) => void;
}
export const OrderByEditor = (props: OrderByEditorProps) => {
  const { orderByOptions, orderBy, onOrderByChange } = props;
  const { label, tooltip, addLabel } = allLabels.components.OrderByEditor;

  const addOrderByItem = () => {
    const nextOrderBy: OrderBy[] = orderBy.slice();
    nextOrderBy.push({ name: orderByOptions[0]?.value!, dir: OrderByDirection.ASC });
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

  if (orderByOptions.length === 0) {
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
        const key = `${index}-${orderByItem.name}-${orderByItem.hint || ''}-${orderByItem.dir}`;
        return (
          <div className="gf-form" key={key} data-testid="query-builder-orderby-item-wrapper">
            { index === 0 ? fieldLabel : fieldSpacer }
            <OrderByItem
              columnOptions={orderByOptions}
              index={index}
              orderByItem={orderByItem}
              updateOrderByItem={updateOrderByItem}
              removeOrderByItem={removeOrderByItem}
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

export const getOrderByOptions = (builder: QueryBuilderOptions, allColumns: readonly TableColumn[]): Array<SelectableValue<string>> => {
  let allOptions: Array<SelectableValue<string>> = [];

  if (isAggregateQuery(builder)) {
    builder.columns?.forEach(c => {
      allOptions.push({ label: c.alias || c.name, value: c.name });
    });

    builder.aggregates!.forEach(a => {
      let label = `${a.aggregateType}(${a.column})`;
      let value = label;

      if (a.alias) {
        label += ` as ${a.alias}`;
        value = a.alias;
      }

      allOptions.push({ label, value });
    });

    if (builder.groupBy && builder.groupBy.length > 0) {
      builder.groupBy.forEach(g => allOptions.push({ label: g, value: g }));
    }
  } else {
    allColumns.forEach(c => allOptions.push({ label: c.label || c.name, value: c.name }));
  }

  // Add selected value to the list if it does not exist.
  const allValues = new Set(allOptions.map(o => o.value));
  const customValues = builder.orderBy?.filter(o => !allValues.has(o.name));
  customValues?.forEach(o => allOptions.push({ label: o.name, value: o.name }));

  return allOptions;
};
