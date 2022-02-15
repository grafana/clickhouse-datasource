import React from 'react';
import { SelectableValue } from '@grafana/data';
import { Button, InlineFormLabel, Select } from '@grafana/ui';
import {
  OrderBy,
  OrderByDirection,
  SqlBuilderOptions,
  FullField,
  BuilderMode,
  BuilderMetricField,
  SqlBuilderOptionsAggregate,
} from './../../types';
import { selectors } from './../../selectors';
import { styles } from '../../styles';

const OrderByItem = (props: {
  index: number;
  fieldsList: Array<SelectableValue<string>>;
  orderBy: OrderBy[];
  orderByItem: OrderBy;
  onOrderByItemsChange: (orderBy: OrderBy[]) => void;
}) => {
  const columns: SelectableValue[] = props.fieldsList || [];
  const { index, orderByItem } = props;
  const sortOptions = [
    { value: OrderByDirection.ASC, label: 'ASC' },
    { value: OrderByDirection.DESC, label: 'DESC' },
  ];
  const onOrderBySortFieldUpdate = (name: string) => {
    const orderByItems: OrderBy[] = [...props.orderBy].map((o, i) => {
      return { ...o, name: i === index ? name : o.name };
    });
    props.onOrderByItemsChange(orderByItems);
  };
  const onOrderBySortDirectionUpdate = (direction: OrderByDirection) => {
    const orderByItems: OrderBy[] = [...props.orderBy].map((o, i) => {
      return { ...o, dir: i === index ? direction : o.dir };
    });
    props.onOrderByItemsChange(orderByItems);
  };
  return (
    <>
      <Select
        value={orderByItem.name}
        className={styles.Common.inlineSelect}
        width={20}
        options={columns}
        onChange={(e) => onOrderBySortFieldUpdate(e.value!)}
        allowCustomValue={true}
        menuPlacement={'bottom'}
      ></Select>
      <Select<OrderByDirection>
        value={orderByItem.dir}
        className={styles.Common.inlineSelect}
        width={12}
        options={sortOptions}
        onChange={(e) => onOrderBySortDirectionUpdate(e.value!)}
        menuPlacement={'bottom'}
      />
    </>
  );
};

interface OrderByEditorProps {
  fieldsList: Array<SelectableValue<string>>;
  orderBy: OrderBy[];
  onOrderByItemsChange: (orderBy: OrderBy[]) => void;
}
export const OrderByEditor = (props: OrderByEditorProps) => {
  const columns: SelectableValue[] = props.fieldsList || [];
  const { label, tooltip, AddLabel, RemoveLabel } = selectors.components.QueryEditor.QueryBuilder.ORDER_BY;
  const onOrderByAdd = () => {
    const orderByItems: OrderBy[] = [...props.orderBy];
    orderByItems.push({
      name: columns[0]?.value || 'Name',
      dir: OrderByDirection.ASC,
    });
    props.onOrderByItemsChange(orderByItems);
  };
  const onOrderByRemove = (index: number) => {
    const orderByItems: OrderBy[] = [...props.orderBy];
    orderByItems.splice(index, 1);
    props.onOrderByItemsChange(orderByItems);
  };
  return columns.length === 0 ? null : (
    <>
      {props.orderBy.length === 0 ? (
        <div className="gf-form">
          <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
            {label}
          </InlineFormLabel>
          <Button
            data-testid="query-builder-orderby-add-button"
            icon="plus-circle"
            variant="secondary"
            size="sm"
            onClick={onOrderByAdd}
            className={styles.Common.smallBtn}
          >
            {AddLabel}
          </Button>
        </div>
      ) : (
        <>
          {props.orderBy.map((o, index) => {
            return (
              <div className="gf-form" key={index} data-testid="query-builder-orderby-item-wrapper">
                {index === 0 ? (
                  <InlineFormLabel
                    width={8}
                    className="query-keyword"
                    data-testid="query-builder-orderby-item-label"
                    tooltip={tooltip}
                  >
                    {label}
                  </InlineFormLabel>
                ) : (
                  <div className={`width-8 ${styles.Common.firstLabel}`}></div>
                )}
                <OrderByItem
                  index={index}
                  orderBy={props.orderBy}
                  orderByItem={o}
                  onOrderByItemsChange={props.onOrderByItemsChange}
                  fieldsList={props.fieldsList}
                />
                <Button
                  data-testid="query-builder-orderby-remove-button"
                  className={styles.Common.smallBtn}
                  variant="destructive"
                  size="sm"
                  icon="trash-alt"
                  onClick={() => onOrderByRemove(index)}
                >
                  {RemoveLabel}
                </Button>
              </div>
            );
          })}
          <div className="gf-form">
            <div className={`width-8 ${styles.Common.firstLabel}`}></div>
            <Button
              data-testid="query-builder-orderby-inline-add-button"
              icon="plus-circle"
              variant="secondary"
              size="sm"
              onClick={onOrderByAdd}
              className={styles.Common.smallBtn}
            >
              {AddLabel}
            </Button>
          </div>
        </>
      )}
    </>
  );
};

export const getOrderByFields = (
  builder: SqlBuilderOptions,
  fieldsList: FullField[]
): Array<SelectableValue<string>> => {
  let values: Array<SelectableValue<string>> | Array<{ value: string; label: string }> = [];
  switch (builder.mode) {
    case BuilderMode.Aggregate:
      values = [
        ...(builder.fields || []).map((g) => {
          return { value: g, label: g };
        }),
        ...((builder.metrics as BuilderMetricField[]) || []).map((m) => {
          return { value: `${m.aggregation}(${m.field})`, label: `${m.aggregation}(${m.field})` };
        }),
        ...((builder.groupBy as string[]) || []).map((g) => {
          return { value: g, label: g };
        }),
      ];
      break;
    case BuilderMode.List:
    default:
      values = fieldsList.map((m) => {
        return { value: m.name, label: m.label };
      });
  }
  // Add selected value to the list if it does not exist.
  (builder as SqlBuilderOptionsAggregate).orderBy?.forEach((x) => {
    if (!values.some((y) => y.value === x.name)) {
      values.push({ value: x.name, label: x.name });
    }
  });
  return values;
};
