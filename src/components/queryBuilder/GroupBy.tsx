import React, { useState } from 'react';
import { MultiSelect } from '@grafana/ui';
import { SelectableValue } from '@grafana/data';
import { FullField } from './../../types';
import { selectors } from './../../selectors';
import { EditorField } from '@grafana/experimental';

interface GroupByEditorProps {
  fieldsList: FullField[];
  groupBy: string[];
  onGroupByChange: (groupBy: string[]) => void;
}
export const GroupByEditor = (props: GroupByEditorProps) => {
  const columns: SelectableValue[] = (props.fieldsList || []).map((f) => ({ label: f.label, value: f.name }));
  const [isOpen, setIsOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<string[]>(props.groupBy || []);
  const { label, tooltip } = selectors.components.QueryEditor.QueryBuilder.GROUP_BY;
  const onChange = (e: Array<SelectableValue<string>>) => {
    setIsOpen(false);
    setGroupBy(e.map((item) => item.value!));
  };
  // Add selected value to the list if it does not exist.
  groupBy.filter((x) => !columns.some((y) => y.value === x)).forEach((x) => columns.push({ value: x, label: x }));
  return (
    <EditorField tooltip={tooltip} label={label}>
      <MultiSelect
        options={columns}
        placeholder="Choose"
        isOpen={isOpen}
        onOpenMenu={() => setIsOpen(true)}
        onCloseMenu={() => setIsOpen(false)}
        onChange={onChange}
        onBlur={() => props.onGroupByChange(groupBy)}
        value={groupBy}
        allowCustomValue={true}
        width={25}
      />
    </EditorField>
  );
};
