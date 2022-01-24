import React, { useState } from 'react';
import { InlineFormLabel, MultiSelect } from '@grafana/ui';
import { SelectableValue } from '@grafana/data';
import { FullField } from './../../types';
import { selectors } from './../../selectors';
import { styles } from '../../styles';

interface FieldsEditorProps {
  fieldsList: FullField[];
  fields: string[];
  onFieldsChange: (fields: string[]) => void;
}
export const FieldsEditor = (props: FieldsEditorProps) => {
  const columns = (props.fieldsList || []).map((f) => ({ label: f.label, value: f.name }));
  const [isOpen, setIsOpen] = useState(false);
  const defaultFields: Array<SelectableValue<string>> = [];
  const [fields, setFields] = useState<string[]>(props.fields || []);
  const { label, tooltipTable } = selectors.components.QueryEditor.QueryBuilder.SELECT;
  const onFieldsChange = (fields: string[]) => {
    const cleanFields = cleanupFields(fields);
    setFields(cleanFields);
  };
  const cleanupFields = (fields: string[]): string[] => {
    if (
      defaultFields.map((d) => d.value).includes(fields[0]) ||
      defaultFields.map((d) => d.value).includes(fields[fields.length - 1])
    ) {
      fields = [fields[fields.length - 1]];
    }
    return fields;
  };
  const onUpdateField = () => {
    props.onFieldsChange(fields);
  };
  const onChange = (e: Array<SelectableValue<string>>): void => {
    setIsOpen(false);
    onFieldsChange(e.map((v) => v.value!));
  };
  return (
    <div className="gf-form">
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltipTable}>
        {label}
      </InlineFormLabel>
      <div data-testid="query-builder-fields-multi-select-container" className={styles.Common.selectWrapper}>
        <MultiSelect<string>
          options={[...columns, ...defaultFields]}
          value={fields && fields.length > 0 ? fields : []}
          isOpen={isOpen}
          onOpenMenu={() => setIsOpen(true)}
          onCloseMenu={() => setIsOpen(false)}
          onChange={onChange}
          onBlur={onUpdateField}
        />
      </div>
    </div>
  );
};
