import React, { useState } from 'react';
import { SelectableValue } from '@grafana/data';
import { RadioButtonGroup, ConfirmModal } from '@grafana/ui';
import { getQueryOptionsFromSql, getSQLFromQueryOptions } from './queryBuilder/utils';
import { selectors } from './../selectors';
import { CHQuery, QueryType, defaultCHBuilderQuery, SqlBuilderOptions, CHSQLQuery } from 'types';
import { isString } from 'lodash';

interface QueryTypeSwitcherProps {
  query: CHQuery;
  onChange: (query: CHQuery) => void;
}

export const QueryTypeSwitcher = ({ query, onChange }: QueryTypeSwitcherProps) => {
  const { options: queryTypeLabels, switcher, cannotConvert } = selectors.components.QueryEditor.Types;
  let queryType: QueryType =
    query.queryType ||
    ((query as CHSQLQuery).rawSql && !(query as CHQuery).queryType ? QueryType.SQL : QueryType.Builder);
  const [editor, setEditor] = useState<QueryType>(queryType);
  const [confirmModalState, setConfirmModalState] = useState<boolean>(false);
  const [cannotConvertModalState, setCannotConvertModalState] = useState<boolean>(false);
  const options: Array<SelectableValue<QueryType>> = [
    { label: queryTypeLabels.SQLEditor, value: QueryType.SQL },
    { label: queryTypeLabels.QueryBuilder, value: QueryType.Builder },
  ];
  const [errorMessage, setErrorMessage] = useState<string>('');
  const onQueryTypeChange = (queryType: QueryType, confirm = false) => {
    if (query.queryType === QueryType.SQL && queryType === QueryType.Builder && !confirm) {
      const queryOptionsFromSql = getQueryOptionsFromSql(query.rawSql);
      if (isString(queryOptionsFromSql)) {
        setCannotConvertModalState(true);
        setErrorMessage(queryOptionsFromSql);
      } else {
        setConfirmModalState(true);
      }
    } else {
      setEditor(queryType);
      let builderOptions: SqlBuilderOptions;
      switch (query.queryType) {
        case QueryType.Builder:
          builderOptions = query.builderOptions;
          break;
        case QueryType.SQL:
          builderOptions =
            (getQueryOptionsFromSql(query.rawSql) as SqlBuilderOptions) || defaultCHBuilderQuery.builderOptions;
          break;
        default:
          builderOptions = defaultCHBuilderQuery.builderOptions;
          break;
      }
      if (queryType === QueryType.SQL) {
        onChange({
          ...query,
          queryType,
          rawSql: getSQLFromQueryOptions(builderOptions),
          meta: { builderOptions },
          format: query.format,
          selectedFormat: query.selectedFormat,
        });
      } else if (queryType === QueryType.Builder) {
        onChange({ ...query, queryType, rawSql: getSQLFromQueryOptions(builderOptions), builderOptions });
      }
    }
  };
  const onConfirmQueryTypeChange = () => {
    onQueryTypeChange(QueryType.Builder, true);
    setConfirmModalState(false);
    setCannotConvertModalState(false);
  };
  return (
    <>
      <RadioButtonGroup size="sm" options={options} value={editor} onChange={(e) => onQueryTypeChange(e!)} />
      <ConfirmModal
        isOpen={confirmModalState}
        title={switcher.title}
        body={switcher.body}
        confirmText={switcher.confirmText}
        dismissText={switcher.dismissText}
        icon="exclamation-triangle"
        onConfirm={onConfirmQueryTypeChange}
        onDismiss={() => setConfirmModalState(false)}
      />
      <ConfirmModal
        title={cannotConvert.title}
        body={`${errorMessage} \nDo you want to delete your current query and use the query builder?`}
        isOpen={cannotConvertModalState}
        icon="exclamation-triangle"
        onConfirm={onConfirmQueryTypeChange}
        confirmText={switcher.confirmText}
        onDismiss={() => setCannotConvertModalState(false)}
      />
    </>
  );
};
