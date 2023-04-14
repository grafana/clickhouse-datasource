import React from 'react';
import { SelectableValue } from '@grafana/data';
import { InlineFormLabel, Select } from '@grafana/ui';
import { selectors } from './../../selectors';
import { FullField } from 'types';

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
    <div className="gf-form">
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <Select
        options={columns}
        width={20}
        onChange={(e) => props.onLogLevelFieldChange(e?.value ?? e)}
        menuPlacement={'bottom'}
        value={props.logLevelField}
        isClearable={true}
      />
    </div>
  );
};
