import React, { useState } from 'react';
import { SelectableValue } from '@grafana/data';
import { InlineFormLabel, Select, Button, Input } from '@grafana/ui';
import { BuilderMetricField, BuilderMetricFieldAggregation, FullField } from './../../types';
import { selectors } from './../../selectors';
import { styles } from '../../styles';
import { EditorField, EditorFieldGroup } from '@grafana/experimental';

const MetricEditor = (props: {
  fieldsList: FullField[];
  index: number;
  metric: BuilderMetricField;
  metrics: BuilderMetricField[];
  onMetricsChange: (metrics: BuilderMetricField[]) => void;
}) => {
  const columns: SelectableValue[] = (props.fieldsList || []).map((f) => ({ label: f.label, value: f.name }));
  const [isOpen, setIsOpen] = useState(false);
  const { metric, index, metrics, onMetricsChange } = props;
  const [alias, setAlias] = useState(metric.alias || '');
  const { ALIAS } = selectors.components.QueryEditor.QueryBuilder.AGGREGATES;
  const aggregationTypes: Array<SelectableValue<BuilderMetricFieldAggregation>> = [
    { value: BuilderMetricFieldAggregation.Count, label: 'Count' },
    { value: BuilderMetricFieldAggregation.Sum, label: 'Sum' },
    { value: BuilderMetricFieldAggregation.Min, label: 'Min' },
    { value: BuilderMetricFieldAggregation.Max, label: 'Max' },
    { value: BuilderMetricFieldAggregation.Average, label: 'Average' },
    { value: BuilderMetricFieldAggregation.Any, label: 'Any' },
    // { value: BuilderMetricFieldAggregation.Count_Distinct, label: 'Distinct Count' },
  ];
  const onMetricFieldChange = (e: SelectableValue<string>) => {
    setIsOpen(false);
    const newMetrics: BuilderMetricField[] = [...metrics].map((o, i) => {
      return { ...o, field: i === index ? e.value! : o.field };
    });
    onMetricsChange(newMetrics);
  };
  const onMetricAggregationChange = (aggregation: BuilderMetricFieldAggregation) => {
    const newMetrics: BuilderMetricField[] = [...metrics].map((o, i) => {
      return { ...o, aggregation: i === index ? aggregation : o.aggregation };
    });
    onMetricsChange(newMetrics);
  };
  const onMetricAliasChange = () => {
    const newMetrics: BuilderMetricField[] = [...metrics].map((o, i) => {
      return { ...o, alias: i === index ? alias : o.alias };
    });
    onMetricsChange(newMetrics);
  };
  return (
    <EditorFieldGroup>
      <Select
        width={25}
        className={styles.Common.inlineSelect}
        options={aggregationTypes}
        onChange={(e) => onMetricAggregationChange(e.value!)}
        value={metric.aggregation}
      />
      <Select<string>
        width={25}
        className={styles.Common.inlineSelect}
        options={columns}
        isOpen={isOpen}
        onOpenMenu={() => setIsOpen(true)}
        onCloseMenu={() => setIsOpen(false)}
        onChange={onMetricFieldChange}
        value={metric.field}
      />
      <InlineFormLabel width={2} className="query-keyword">
        {ALIAS.label}
      </InlineFormLabel>
      <Input
        width={25}
        value={alias}
        onChange={(e) => setAlias(e.currentTarget.value)}
        onBlur={onMetricAliasChange}
        placeholder="alias"
      />
    </EditorFieldGroup>
  );
};

interface MetricsEditorProps {
  fieldsList: FullField[];
  metrics: BuilderMetricField[];
  onMetricsChange: (metrics: BuilderMetricField[]) => void;
}
export const MetricsEditor = (props: MetricsEditorProps) => {
  const { metrics, onMetricsChange, fieldsList = [] } = props;
  const { label, tooltipAggregate, AddLabel, RemoveLabel } = selectors.components.QueryEditor.QueryBuilder.AGGREGATES;
  const onMetricAdd = () => {
    const newMetric: BuilderMetricField = { field: '', aggregation: BuilderMetricFieldAggregation.Count };
    onMetricsChange([...metrics, newMetric]);
  };
  const onMetricRemove = (index: number) => {
    const newMetrics: BuilderMetricField[] = [...metrics];
    newMetrics.splice(index, 1);
    onMetricsChange(newMetrics);
  };
  return (
    <EditorField tooltip={tooltipAggregate} label={label}>
      <EditorFieldGroup>
        {metrics.map((metric, index) => {
          return (
            <div className="gf-form" key={index}>
              <MetricEditor
                fieldsList={fieldsList}
                index={index}
                metric={metric}
                metrics={metrics}
                onMetricsChange={onMetricsChange}
              />
              {metrics.length > 1 && (
                <Button
                  icon="trash-alt"
                  size="sm"
                  variant="destructive"
                  className={styles.Common.smallBtn}
                  onClick={() => onMetricRemove(index)}
                >
                  {RemoveLabel}
                </Button>
              )}
            </div>
          );
        })}
        <Button
          icon="plus-circle"
          size="sm"
          variant="secondary"
          className={styles.Common.smallBtn}
          onClick={onMetricAdd}
        >
          {AddLabel}
        </Button>
      </EditorFieldGroup>
    </EditorField>
  );
};
