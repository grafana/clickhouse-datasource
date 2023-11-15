import React, {  } from 'react';
import { Switch, Input, Field } from '@grafana/ui';
import { ConfigSection } from '@grafana/experimental';
import allLabels from 'labels';

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
  const labels = allLabels.components.Config.QuerySettingsConfig;

  return (
    <ConfigSection title={labels.title}>
      <Field label={labels.dialTimeout.label} description={labels.dialTimeout.tooltip}>
          <Input
            name={labels.dialTimeout.name}
            width={40}
            value={dialTimeout || ''}
            onChange={onDialTimeoutChange}
            label={labels.dialTimeout.label}
            aria-label={labels.dialTimeout.label}
            placeholder={labels.dialTimeout.placeholder}
            type="number"
          />
        </Field>
        <Field
          label={labels.queryTimeout.label}
          description={labels.queryTimeout.tooltip}
        >
          <Input
            name={labels.queryTimeout.name}
            width={40}
            value={queryTimeout || ''}
            onChange={onQueryTimeoutChange}
            label={labels.queryTimeout.label}
            aria-label={labels.queryTimeout.label}
            placeholder={labels.queryTimeout.placeholder}
            type="number"
          />
        </Field>
        <Field label={labels.validateSql.label} description={labels.validateSql.tooltip}>
          <Switch
            className="gf-form"
            value={validateSql || false}
            onChange={onValidateSqlChange}
            role='checkbox'
          />
        </Field>
    </ConfigSection>
  );
}
