import React, {  } from 'react';
import { Switch, Input, Field } from '@grafana/ui';
import { Components } from 'selectors';
import { ConfigSection } from '@grafana/experimental';

interface QuerySettingsConfigProps {
  dialTimeout?: string;
  queryTimeout?: string;
  validateSql?: boolean;
  onDialTimeoutChange: (e: any) => void;
  onQueryTimeoutChange: (e: any) => void;
  onValidateSqlChange: (e: any) => void;
}

export const QuerySettingsConfig = (props: QuerySettingsConfigProps) => {
  const { dialTimeout, queryTimeout, validateSql, onDialTimeoutChange, onQueryTimeoutChange, onValidateSqlChange } = props;
  return (
    <ConfigSection title="Query settings">
      <Field label={Components.ConfigEditor.DialTimeout.label} description={Components.ConfigEditor.DialTimeout.tooltip}>
          <Input
            name="dialTimeout"
            width={40}
            value={dialTimeout || ''}
            onChange={onDialTimeoutChange}
            label={Components.ConfigEditor.DialTimeout.label}
            aria-label={Components.ConfigEditor.DialTimeout.label}
            placeholder={Components.ConfigEditor.DialTimeout.placeholder}
            type="number"
          />
        </Field>
        <Field
          label={Components.ConfigEditor.QueryTimeout.label}
          description={Components.ConfigEditor.QueryTimeout.tooltip}
        >
          <Input
            name="queryTimeout"
            width={40}
            value={queryTimeout || ''}
            onChange={onQueryTimeoutChange}
            label={Components.ConfigEditor.QueryTimeout.label}
            aria-label={Components.ConfigEditor.QueryTimeout.label}
            placeholder={Components.ConfigEditor.QueryTimeout.placeholder}
            type="number"
          />
        </Field>
        <Field label={Components.ConfigEditor.ValidateSql.label} description={Components.ConfigEditor.ValidateSql.tooltip}>
          <Switch
            className="gf-form"
            value={validateSql || false}
            onChange={onValidateSqlChange}
          />
        </Field>
    </ConfigSection>
  );
}
