import React from "react";
import { TimeUnit } from "types/queryBuilder";
import allLabels from 'labels';
import { InlineFormLabel, Select } from '@grafana/ui';
import { SelectableValue } from '@grafana/data';
import { styles } from 'styles';

interface DurationUnitSelectProps {
  unit: TimeUnit;
  onChange: (u: TimeUnit) => void;
  disabled?: boolean;
  inline?: boolean;
};

const durationUnitOptions: ReadonlyArray<SelectableValue<TimeUnit>> = [
  { label: TimeUnit.Seconds, value: TimeUnit.Seconds },
  { label: TimeUnit.Milliseconds, value: TimeUnit.Milliseconds },
  { label: TimeUnit.Microseconds, value: TimeUnit.Microseconds },
  { label: TimeUnit.Nanoseconds, value: TimeUnit.Nanoseconds },
];

export const DurationUnitSelect = (props: DurationUnitSelectProps) => {
  const { unit, onChange, disabled, inline } = props;
  const { label, tooltip } = allLabels.components.TraceQueryBuilder.columns.durationUnit;

  return (
    <div className="gf-form">
      <InlineFormLabel width={12} className={`query-keyword ${inline ? styles.QueryEditor.inlineField : ''}`} tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <Select<TimeUnit>
        disabled={disabled}
        options={durationUnitOptions as Array<SelectableValue<TimeUnit>>}
        value={unit}
        onChange={v => onChange(v.value!)}
        width={inline ? 25 : 30}
        menuPlacement={'bottom'}
      />
    </div>
  );
};
