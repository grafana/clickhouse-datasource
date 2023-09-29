import React, { useState } from 'react';
import { SelectableValue } from '@grafana/data';
import { RadioButtonGroup, ConfirmModal, InlineFormLabel } from '@grafana/ui';
import { getQueryOptionsFromSql } from '../queryBuilder/utils';
import { generateSql } from 'data/sqlGenerator';
import labels from 'labels';
import { EditorType, CHQuery, defaultCHBuilderQuery } from 'types/sql';
import { QueryBuilderOptions } from 'types/queryBuilder';
import isString from 'lodash/isString';

interface CHEditorTypeSwitcherProps {
  query: CHQuery;
  onChange: (query: CHQuery) => void;
  onRunQuery: () => void;
}

const options: Array<SelectableValue<EditorType>> = [
  { label: labels.types.EditorType.sql, value: EditorType.SQL },
  { label: labels.types.EditorType.builder, value: EditorType.Builder },
];

/**
 * Component for switching between the SQL and Query Builder editors.
 */
export const EditorTypeSwitcher = (props: CHEditorTypeSwitcherProps) => {
  const { query, onChange } = props;
  const { label, tooltip, switcher, cannotConvert } = labels.components.EditorTypeSwitcher;
  const editorType: EditorType = query.editorType;
  const [editor, setEditor] = useState<EditorType>(editorType);
  const [confirmModalState, setConfirmModalState] = useState<boolean>(false);
  const [cannotConvertModalState, setCannotConvertModalState] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const onEditorTypeChange = (editorType: EditorType, confirm = false) => {
    // TODO: component state has updated, but not local state.
    if (query.editorType === EditorType.SQL && editorType === EditorType.Builder && !confirm) {
      const queryOptionsFromSql = getQueryOptionsFromSql(query.rawSql);
      if (isString(queryOptionsFromSql)) {
        setCannotConvertModalState(true);
        setErrorMessage(queryOptionsFromSql);
      } else {
        setConfirmModalState(true);
      }
    } else {
      setEditor(editorType);
      let builderOptions: QueryBuilderOptions;
      switch (query.editorType) {
        case EditorType.Builder:
          builderOptions = query.builderOptions;
          break;
        case EditorType.SQL:
          builderOptions =
            (getQueryOptionsFromSql(query.rawSql) as QueryBuilderOptions) || defaultCHBuilderQuery.builderOptions;
          break;
        default:
          builderOptions = defaultCHBuilderQuery.builderOptions;
          break;
      }
      if (editorType === EditorType.SQL) {
        onChange({
          ...query,
          editorType: EditorType.SQL,
          rawSql: generateSql(builderOptions),
          meta: { builderOptions },
        });
      } else if (editorType === EditorType.Builder) {
        onChange({
          ...query,
          editorType: EditorType.Builder,
          rawSql: generateSql(builderOptions),
          builderOptions
        });
      }
    }
  };
  const onConfirmEditorTypeChange = () => {
    onEditorTypeChange(EditorType.Builder, true);
    setConfirmModalState(false);
    setCannotConvertModalState(false);
  };
  return (
    <span>
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <RadioButtonGroup options={options} value={editor} onChange={e => onEditorTypeChange(e)} />
      <ConfirmModal
        isOpen={confirmModalState}
        title={switcher.title}
        body={switcher.body}
        confirmText={switcher.confirmText}
        dismissText={switcher.dismissText}
        icon="exclamation-triangle"
        onConfirm={onConfirmEditorTypeChange}
        onDismiss={() => setConfirmModalState(false)}
      />
      <ConfirmModal
        title={cannotConvert.title}
        body={`${errorMessage} \nDo you want to delete your current query and use the query builder?`}
        isOpen={cannotConvertModalState}
        icon="exclamation-triangle"
        onConfirm={onConfirmEditorTypeChange}
        confirmText={switcher.confirmText}
        onDismiss={() => setCannotConvertModalState(false)}
      />
    </span>
  );
};
