import React, { useState } from 'react';
import { InlineFormLabel, MultiSelect } from '@grafana/ui';
import { SelectableValue } from '@grafana/data';
import { TableColumn } from 'types/queryBuilder';
import selectors from 'v4/selectors';
import { styles } from 'styles';

interface GroupByEditorProps {
  allColumns: TableColumn[];
  groupBy: string[];
  onGroupByChange: (groupBy: string[]) => void;
}

export const GroupByEditor = (props: GroupByEditorProps) => {
  const { allColumns, groupBy, onGroupByChange } = props;
  const [isOpen, setIsOpen] = useState(false);
  const { label, tooltip } = selectors.components.GroupByEditor;
  const options: Array<SelectableValue<string>> = (allColumns || []).map(c => ({ label: c.name, value: c.name }));

  const onChange = (selection: Array<SelectableValue<string>>) => {
    setIsOpen(false);
    onGroupByChange(selection.map(s => s.value!));
  };

  return (
    <div className="gf-form">
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <div data-testid="query-builder-group-by-multi-select-container" className={styles.Common.selectWrapper}>
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
