import React, { useState } from 'react';
import { SelectableValue } from '@grafana/data';
import { InlineFormLabel, Select, Button, Input } from '@grafana/ui';
import { AggregateColumn, AggregateType, TableColumn } from 'types/queryBuilder';
import labels from 'labels';
import { selectors } from 'selectors';
import { styles } from 'styles';

interface AggregateProps {
  columnOptions: Array<SelectableValue<string>>;
  index: number,
  aggregate: AggregateColumn;
  updateAggregate: (index: number, aggregate: AggregateColumn) => void;
}

const aggregateOptions: Array<SelectableValue<AggregateType>> = [
  { label: 'Count', value: AggregateType.Count },
  { label: 'Sum', value: AggregateType.Sum },
  { label: 'Min', value: AggregateType.Min },
  { label: 'Max', value: AggregateType.Max },
  { label: 'Average', value: AggregateType.Average },
  { label: 'Any', value: AggregateType.Any },
  // { label: 'Distinct Count', value: AggregateType.Count_Distinct },
];

const Aggregate = (props: AggregateProps) => {
  const { columnOptions, index, aggregate, updateAggregate } = props;
  const [isOpen, setIsOpen] = useState(false);
  const [alias, setAlias] = useState(aggregate.alias || '');
  const { aliasLabel } = labels.components.AggregatesEditor;

  return (
    <>
      <Select
        width={20}
        className={styles.Common.inlineSelect}
        options={aggregateOptions}
        value={aggregate.aggregateType}
        onChange={e => updateAggregate(index, { ...aggregate, aggregateType: e.value! })}
        menuPlacement={'bottom'}
      />
      <Select<string>
        width={28}
        className={styles.Common.inlineSelect}
        options={columnOptions}
        isOpen={isOpen}
        onOpenMenu={() => setIsOpen(true)}
        onCloseMenu={() => setIsOpen(false)}
        onChange={e => updateAggregate(index, { ...aggregate, column: e.value! })}
        value={aggregate.column}
        menuPlacement={'bottom'}
      />
      <InlineFormLabel width={2} className="query-keyword">
        {aliasLabel}
      </InlineFormLabel>
      <Input
        width={20}
        value={alias}
        onChange={e => setAlias(e.currentTarget.value)}
        onBlur={e => updateAggregate(index, { ...aggregate, alias: e.currentTarget.value })}
        placeholder="alias"
      />
    </>
  );
};

interface AggregateEditorProps {
  allColumns: TableColumn[];
  aggregates: AggregateColumn[];
  onAggregatesChange: (aggregates: AggregateColumn[]) => void;
}
export const AggregateEditor = (props: AggregateEditorProps) => {
  const { allColumns, aggregates, onAggregatesChange } = props;
  const columnOptions: Array<SelectableValue<string>> = (allColumns || []).map(c => ({ label: c.name, value: c.name }));
  const { label, tooltip, addLabel } = labels.components.AggregatesEditor;

  const addAggregate = () => {
    const nextAggregates: AggregateColumn[] = aggregates.slice();
    nextAggregates.push({ column: '', aggregateType: AggregateType.Count });
    onAggregatesChange(nextAggregates);
  };
  const removeAggregate = (index: number) => {
    const nextAggregates: AggregateColumn[] = aggregates.slice();
    nextAggregates.splice(index, 1);
    onAggregatesChange(nextAggregates);
  };
  const updateAggregate = (index: number, aggregatesItem: AggregateColumn) => {
    const nextAggregates: AggregateColumn[] = aggregates.slice();
    nextAggregates[index] = aggregatesItem;
    onAggregatesChange(nextAggregates);
  };

  const fieldLabel = (
    <InlineFormLabel
      width={8}
      className="query-keyword"
      data-testid={selectors.components.QueryBuilder.AggregateEditor.sectionLabel}
      tooltip={tooltip}
    >
      {label}
    </InlineFormLabel>
  );
  const fieldSpacer = <div className={`width-8 ${styles.Common.firstLabel}`}></div>;

  return (
    <>
      {aggregates.map((aggregate, index) => {
        const key = `${index}-${aggregate.column}-${aggregate.aggregateType}-${aggregate.alias}`;
        return (
          <div className="gf-form" key={key} data-testid={selectors.components.QueryBuilder.AggregateEditor.itemWrapper}>
            { index === 0 ? fieldLabel : fieldSpacer }
            <Aggregate
              columnOptions={columnOptions}
              index={index}
              aggregate={aggregate}
              updateAggregate={updateAggregate}
            />
            <Button
              data-testid={selectors.components.QueryBuilder.AggregateEditor.itemRemoveButton}
              className={styles.Common.smallBtn}
              variant="destructive"
              size="sm"
              icon="trash-alt"
              onClick={() => removeAggregate(index)}
            />
          </div>
        );
      })}

      <div className="gf-form">
        {aggregates.length === 0 ? fieldLabel : fieldSpacer}
        <Button
          data-testid={selectors.components.QueryBuilder.AggregateEditor.addButton}
          icon="plus-circle"
          variant="secondary"
          size="sm"
          onClick={addAggregate}
          className={styles.Common.smallBtn}
        >
          {addLabel}
        </Button>
      </div>
    </>
  );
};
