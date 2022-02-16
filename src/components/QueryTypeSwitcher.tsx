import React, { useState } from 'react';
import { SelectableValue } from '@grafana/data';
import { RadioButtonGroup, ConfirmModal, InlineFormLabel } from '@grafana/ui';
import { getQueryOptionsFromSql, getSQLFromQueryOptions } from './queryBuilder/utils';
import { selectors } from './../selectors';
import { CHQuery, QueryType, defaultCHBuilderQuery, SqlBuilderOptions, CHSQLQuery, Format } from 'types';

interface QueryTypeSwitcherProps {
  query: CHQuery;
  onChange: (query: CHQuery) => void;
  onRunQuery: () => void;
}

export const QueryTypeSwitcher = (props: QueryTypeSwitcherProps) => {
  const { query, onChange } = props;
  const { label, tooltip, options: queryTypeLabels, switcher } = selectors.components.QueryEditor.Types;
  let queryType: QueryType =
    query.queryType ||
    ((query as CHSQLQuery).rawSql && !(query as CHQuery).queryType ? QueryType.SQL : QueryType.Builder);
  const [editor, setEditor] = useState<QueryType>(queryType);
  const [confirmModalState, setConfirmModalState] = useState<boolean>(false);
  const options: Array<SelectableValue<QueryType>> = [
    { label: queryTypeLabels.SQLEditor, value: QueryType.SQL },
    { label: queryTypeLabels.QueryBuilder, value: QueryType.Builder },
  ];
  const onQueryTypeChange = (queryType: QueryType, confirm = false) => {
    if (query.queryType === QueryType.SQL && queryType === QueryType.Builder && !confirm) {
      setConfirmModalState(true);
    } else {
      setEditor(queryType);
      let builderOptions: SqlBuilderOptions;
      switch (query.queryType) {
        case QueryType.Builder:
          builderOptions = query.builderOptions;
          break;
        case QueryType.SQL:
          builderOptions = getQueryOptionsFromSql(query.rawSql) || defaultCHBuilderQuery.builderOptions;
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
          format: Format.TABLE,
        });
      } else if (queryType === QueryType.Builder) {
        onChange({ ...query, queryType, rawSql: getSQLFromQueryOptions(builderOptions), builderOptions });
      }
    }
  };
  const onConfirmQueryTypeChange = () => {
    onQueryTypeChange(QueryType.Builder, true);
    setConfirmModalState(false);
  };
  return (
    <>
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <RadioButtonGroup options={options} value={editor} onChange={(e) => onQueryTypeChange(e!)} />
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
    </>
  );
};
