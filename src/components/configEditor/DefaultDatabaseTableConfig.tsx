import React, { SyntheticEvent } from 'react';
import { ConfigSection } from 'components/experimental/ConfigSection';
import { Input, Field } from '@grafana/ui';
import allLabels from 'labels';

interface DefaultDatabaseTableConfigProps {
  defaultDatabase?: string;
  defaultTable?: string;
  onDefaultDatabaseChange: (e: SyntheticEvent<HTMLInputElement | HTMLSelectElement, Event>) => void;
  onDefaultTableChange: (e: SyntheticEvent<HTMLInputElement | HTMLSelectElement, Event>) => void;
}

export const DefaultDatabaseTableConfig = (props: DefaultDatabaseTableConfigProps) => {
  const { defaultDatabase, defaultTable, onDefaultDatabaseChange, onDefaultTableChange } = props;
  const labels = allLabels.components.Config.DefaultDatabaseTableConfig;

  return (
    <ConfigSection title={labels.title}>
      <Field
        label={labels.database.label}
        description={labels.database.description}
      >
        <Input
          name={labels.database.name}
          width={40}
          value={defaultDatabase || ''}
          onChange={onDefaultDatabaseChange}
          label={labels.database.label}
          aria-label={labels.database.label}
          placeholder={labels.database.placeholder}
          type="text"
        />
      </Field>
      <Field
        label={labels.table.label}
        description={labels.table.description}
      >
        <Input
          name={labels.table.name}
          width={40}
          value={defaultTable || ''}
          onChange={onDefaultTableChange}
          label={labels.table.label}
          aria-label={labels.table.label}
          placeholder={labels.table.placeholder}
          type="text"
        />
      </Field>
    </ConfigSection>
  );
}
