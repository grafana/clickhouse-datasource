import React from 'react';
import { SelectableValue } from '@grafana/data';
import { InlineFormLabel, Select } from '@grafana/ui';
import { selectors } from './../../selectors';
import { FullField } from 'types';

interface TimeFieldEditorProps {
  fieldsList: FullField[];
  timeField: string;
  timeFieldType: string;
  onTimeFieldChange: (timeField: string, timeFieldType: string) => void;
}

export const TimeFieldEditor = (props: TimeFieldEditorProps) => {
  const { label, tooltip } = selectors.components.QueryEditor.QueryBuilder.TIME_FIELD;
  const columns: SelectableValue[] = (props.fieldsList || [])
    .filter((f) => f.type.toLowerCase() === 'datetime' || f.type.toLowerCase() === 'date')
    .map((f) => ({ label: f.label, value: f.name }));
  const getColumnType = (columnName: string): string => {
    const matchedColumn = props.fieldsList.find((f) => f.name === columnName);
    return matchedColumn ? matchedColumn.type : '';
  };
  return (
    <div className="gf-form">
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <Select
        options={columns}
        width={20}
        onChange={(e) => props.onTimeFieldChange(e.value, getColumnType(e.value))}
        value={props.timeField}
      />
    </div>
  );
};
