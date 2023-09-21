import React from 'react';
import { BuilderMode, CHQuery, Format, QueryType, CHBuilderQuery } from '../types';
import { QueryTypeSwitcher } from 'components/QueryTypeSwitcher';
import { FormatSelect } from '../components/FormatSelect';
import { Button } from '@grafana/ui';
import { getFormat } from 'components/editor';
import { EditorHeader, FlexItem } from '@grafana/experimental';

interface QueryHeaderProps {
  query: CHQuery;
  onChange: (query: CHQuery) => void;
  onRunQuery: () => void;
}

export const QueryHeader = ({ query, onChange, onRunQuery }: QueryHeaderProps) => {
  React.useEffect(() => {
    if (typeof query.selectedFormat === 'undefined' && query.queryType === QueryType.SQL) {
      const selectedFormat = Format.AUTO;
      const format = getFormat(query.rawSql, selectedFormat);
      onChange({ ...query, selectedFormat, format });
    }
  }, [query, onChange]);

  const runQuery = () => {
    if (query.queryType === QueryType.SQL) {
      const format = getFormat(query.rawSql, query.selectedFormat);
      if (format !== query.format) {
        onChange({ ...query, format });
      }
    }
    onRunQuery();
  };

  const onFormatChange = (selectedFormat: Format) => {
    switch (query.queryType) {
      case QueryType.SQL:
        onChange({ ...query, format: getFormat(query.rawSql, selectedFormat), selectedFormat });
      case QueryType.Builder:
      default:
        if (selectedFormat === Format.AUTO) {
          let builderOptions = (query as CHBuilderQuery).builderOptions;
          const format = builderOptions && builderOptions.mode === BuilderMode.Trend ? Format.TIMESERIES : Format.TABLE;
          onChange({ ...query, format, selectedFormat });
        } else {
          onChange({ ...query, format: selectedFormat, selectedFormat });
        }
    }
  };

  return (
    <EditorHeader>
      <QueryTypeSwitcher query={query} onChange={onChange} />
      <FlexItem grow={1} />
      <Button variant="primary" icon="play" size="sm" onClick={runQuery}>
        Run query
      </Button>
      <FormatSelect format={query.selectedFormat ?? Format.AUTO} onChange={onFormatChange} />
    </EditorHeader>
  );
};
