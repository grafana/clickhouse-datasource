import React from 'react';
import { SelectableValue } from '@grafana/data';
import { Select } from '@grafana/ui';
import { selectors } from './../../selectors';
import { FullField } from 'types';
import { EditorField } from '@grafana/experimental';

interface LogLevelEditorProps {
  fieldsList: FullField[];
  onLogLevelFieldChange: (logLevelField: string) => void;
  logLevelField: string | null;
}

export const LogLevelFieldEditor = (props: LogLevelEditorProps) => {
  const { label, tooltip } = selectors.components.QueryEditor.QueryBuilder.LOG_LEVEL_FIELD;
  const columns: SelectableValue[] = (props.fieldsList || [])
    .filter((f) => f.name !== '*')
    .map((f) => ({ label: f.label, value: f.name }));
  return (
    <EditorField tooltip={tooltip} label={label}>
      <Select
        options={columns}
        width={25}
        onChange={(e) => props.onLogLevelFieldChange(e?.value ?? e)}
        value={props.logLevelField}
        isClearable={true}
      />
    </EditorField>
  );
};
