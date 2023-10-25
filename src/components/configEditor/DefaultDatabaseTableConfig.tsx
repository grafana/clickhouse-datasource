import React from 'react';
import { ConfigSection } from '@grafana/experimental';
import { Input, Field } from '@grafana/ui';

interface DefaultDatabaseTableConfigProps {
  defaultDatabase?: string;
  defaultTable?: string;
  onDefaultDatabaseChange: (e: any) => void;
  onDefaultTableChange: (e: any) => void;
}

export const DefaultDatabaseTableConfig = (props: DefaultDatabaseTableConfigProps) => {
  const { defaultDatabase, defaultTable, onDefaultDatabaseChange, onDefaultTableChange } = props;
  return (
    <ConfigSection title="Default DB and table">
      <Field
        label={"Default database"}
        description={"the default database used by the query builder"}
      >
        <Input
          name="defaultDatabase"
          width={40}
          value={defaultDatabase || ''}
          onChange={onDefaultDatabaseChange}
          label="Default database"
          aria-label="Default database"
          placeholder="default"
        />
      </Field>
      <Field
        label={"Default table"}
        description={"The default table used by the query builder"}
      >
        <Input
          name="defaultTable"
          width={40}
          value={defaultTable || ''}
          onChange={onDefaultTableChange}
          label="Default table"
          aria-label="Default table"
          placeholder="table"
        />
      </Field>
    </ConfigSection>
  );
}
