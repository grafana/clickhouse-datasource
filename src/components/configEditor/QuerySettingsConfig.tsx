import React, { FormEvent } from 'react';
import { Switch, Input, Field } from '@grafana/ui';
import { ConfigSection } from 'components/experimental/ConfigSection';
import allLabels from 'labels';

interface QuerySettingsConfigProps {
  connMaxLifetime?: string;
  dialTimeout?: string;
  maxIdleConns?: string;
  maxOpenConns?: string;
  queryTimeout?: string;
  validateSql?: boolean;
  onConnMaxIdleConnsChange: (e: FormEvent<HTMLInputElement>) => void;
  onConnMaxLifetimeChange: (e: FormEvent<HTMLInputElement>) => void;
  onConnMaxOpenConnsChange: (e: FormEvent<HTMLInputElement>) => void;
  onDialTimeoutChange: (e: FormEvent<HTMLInputElement>) => void;
  onQueryTimeoutChange: (e: FormEvent<HTMLInputElement>) => void;
  onValidateSqlChange: (e: FormEvent<HTMLInputElement>) => void;
}

export const QuerySettingsConfig = (props: QuerySettingsConfigProps) => {
  const {
    connMaxLifetime,
    dialTimeout,
    maxIdleConns,
    maxOpenConns,
    queryTimeout,
    validateSql,
    onConnMaxIdleConnsChange,
    onConnMaxLifetimeChange,
    onConnMaxOpenConnsChange,
    onDialTimeoutChange,
    onQueryTimeoutChange,
    onValidateSqlChange,
  } = props;

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
      <Field label={labels.queryTimeout.label} description={labels.queryTimeout.tooltip}>
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
      <Field label={labels.connMaxLifetime.label} description={labels.connMaxLifetime.tooltip}>
        <Input
          name={labels.connMaxLifetime.name}
          width={40}
          value={connMaxLifetime || ''}
          onChange={onConnMaxLifetimeChange}
          label={labels.connMaxLifetime.label}
          aria-label={labels.connMaxLifetime.label}
          placeholder={labels.connMaxLifetime.placeholder}
          type="number"
        />
      </Field>
      <Field label={labels.maxIdleConns.label} description={labels.maxIdleConns.tooltip}>
        <Input
          name={labels.maxIdleConns.name}
          width={40}
          value={maxIdleConns || ''}
          onChange={onConnMaxIdleConnsChange}
          label={labels.maxIdleConns.label}
          aria-label={labels.maxIdleConns.label}
          placeholder={labels.maxIdleConns.placeholder}
          type="number"
        />
      </Field>
      <Field label={labels.maxOpenConns.label} description={labels.maxOpenConns.tooltip}>
        <Input
          name={labels.maxOpenConns.name}
          width={40}
          value={maxOpenConns || ''}
          onChange={onConnMaxOpenConnsChange}
          label={labels.maxOpenConns.label}
          aria-label={labels.maxOpenConns.label}
          placeholder={labels.maxOpenConns.placeholder}
          type="number"
        />
      </Field>

      <Field label={labels.validateSql.label} description={labels.validateSql.tooltip}>
        <Switch className="gf-form" value={validateSql || false} onChange={onValidateSqlChange} role="checkbox" />
      </Field>
    </ConfigSection>
  );
};
