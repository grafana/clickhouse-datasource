import React, { useState } from 'react';
import { InlineFormLabel, MultiSelect } from '@grafana/ui';
import { SelectableValue } from '@grafana/data';
import { TableColumn } from 'types/queryBuilder';
import labels from 'labels';
import { styles } from 'styles';
import { selectors } from 'selectors';

interface GroupByEditorProps {
  allColumns: readonly TableColumn[];
  groupBy: string[];
  onGroupByChange: (groupBy: string[]) => void;
}

export const GroupByEditor = (props: GroupByEditorProps) => {
  const { allColumns, groupBy, onGroupByChange } = props;
  const [isOpen, setIsOpen] = useState(false);
  const { label, tooltip } = labels.components.GroupByEditor;
  const options: Array<SelectableValue<string>> = allColumns.map(c => ({ label: c.name, value: c.name }));

  const onChange = (selection: Array<SelectableValue<string>>) => {
    setIsOpen(false);
    onGroupByChange(selection.map(s => s.value!));
  };

  return (
    <div className="gf-form">
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <div data-testid={selectors.components.QueryBuilder.GroupByEditor.multiSelectWrapper} className={styles.Common.selectWrapper}>
        <MultiSelect
          options={options}
          isOpen={isOpen}
          onOpenMenu={() => setIsOpen(true)}
          onCloseMenu={() => setIsOpen(false)}
          value={groupBy}
          onChange={onChange}
          allowCustomValue={true}
          menuPlacement={'bottom'}
        />
      </div>
    </div>
  );
};
