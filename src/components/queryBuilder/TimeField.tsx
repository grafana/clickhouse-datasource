import React from 'react';
import { SelectableValue } from '@grafana/data';
import { Select } from '@grafana/ui';
import { selectors } from './../../selectors';
import { FullField } from 'types';
import { EditorField } from '@grafana/experimental';

interface TimeFieldEditorProps {
  fieldsList: FullField[];
  timeField: string | null;
  timeFieldType: string;
  onTimeFieldChange: (timeField: string, timeFieldType: string) => void;
  timeFieldTypeCheckFn: (type: string) => boolean;
  labelAndTooltip: typeof selectors.components.QueryEditor.QueryBuilder.TIME_FIELD;
}

export const TimeFieldEditor = (props: TimeFieldEditorProps) => {
  const { label, tooltip } = props.labelAndTooltip;
  const columns: SelectableValue[] = (props.fieldsList || [])
    .filter((f) => props.timeFieldTypeCheckFn(f.type))
    .map((f) => ({ label: f.label, value: f.name }));
  const getColumnType = (columnName: string): string => {
    const matchedColumn = props.fieldsList.find((f) => f.name === columnName);
    return matchedColumn ? matchedColumn.type : '';
  };
  return (
    <EditorField tooltip={tooltip} label={label}>
      <Select
        options={columns}
        width={25}
        onChange={(e) => props.onTimeFieldChange(e.value, getColumnType(e.value))}
        value={props.timeField}
      />
    </EditorField>
  );
};
