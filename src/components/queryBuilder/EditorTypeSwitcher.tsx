import React, { useState } from 'react';
import { SelectableValue } from '@grafana/data';
import { RadioButtonGroup, ConfirmModal, InlineFormLabel } from '@grafana/ui';
import { getQueryOptionsFromSql } from '../queryBuilder/utils';
import { generateSql } from 'data/sqlGenerator';
import labels from 'labels';
import { EditorType, CHQuery, defaultCHBuilderQuery } from 'types/sql';
import { QueryBuilderOptions } from 'types/queryBuilder';
import { mapQueryTypeToGrafanaFormat } from 'data/utils';
import { Datasource } from 'data/CHDatasource';

interface CHEditorTypeSwitcherProps {
  query: CHQuery;
  onChange: (query: CHQuery) => void;
  onRunQuery: () => void;
  datasource?: Datasource;
}

const options: Array<SelectableValue<EditorType>> = [
  { label: labels.types.EditorType.sql, value: EditorType.SQL },
  { label: labels.types.EditorType.builder, value: EditorType.Builder },
];

/**
 * Component for switching between the SQL and Query Builder editors.
 */
export const EditorTypeSwitcher = (props: CHEditorTypeSwitcherProps) => {
  const { datasource, query, onChange } = props;
  const { label, tooltip, switcher, cannotConvert } = labels.components.EditorTypeSwitcher;
  const editorType: EditorType = query.editorType || EditorType.Builder;
  const [confirmModalState, setConfirmModalState] = useState<boolean>(false);
  const [cannotConvertModalState, setCannotConvertModalState] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const onEditorTypeChange = (editorType: EditorType, confirmed = false) => {
    // TODO: component state has updated, but not local state.
    if (query.editorType === EditorType.SQL && editorType === EditorType.Builder && !confirmed) {
      try {
        getQueryOptionsFromSql(query.rawSql, query.queryType, datasource);
        setConfirmModalState(true);
      } catch (err) {
        setCannotConvertModalState(true);
        setErrorMessage((err as Error).message);
      }
    } else {
      let builderOptions: QueryBuilderOptions;
      switch (query.editorType) {
        case EditorType.Builder:
          builderOptions = query.builderOptions;
          break;
        case EditorType.SQL:
          builderOptions = getQueryOptionsFromSql(query.rawSql, query.queryType, datasource) as QueryBuilderOptions;
          break;
        default:
          builderOptions = defaultCHBuilderQuery.builderOptions;
          break;
      }
      if (editorType === EditorType.SQL) {
        onChange({
          ...query,
          editorType: EditorType.SQL,
          queryType: builderOptions.queryType,
          rawSql: generateSql(builderOptions),
          format: mapQueryTypeToGrafanaFormat(builderOptions.queryType),
          meta: { builderOptions },
        });
      } else if (editorType === EditorType.Builder) {
        onChange({
          ...query,
          editorType: EditorType.Builder,
          queryType: builderOptions.queryType,
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
      <RadioButtonGroup options={options} value={editorType} onChange={e => onEditorTypeChange(e)} />
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
        body={`${errorMessage}\n${cannotConvert.message}`}
        isOpen={cannotConvertModalState}
        icon="exclamation-triangle"
        onConfirm={onConfirmEditorTypeChange}
        confirmText={switcher.confirmText}
        onDismiss={() => setCannotConvertModalState(false)}
      />
    </span>
  );
};
