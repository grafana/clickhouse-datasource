import { defaults } from 'lodash';

import React from 'react';
import { QueryEditorProps } from '@grafana/data';
import { Datasource } from '../data/CHDatasource';
import { defaultQuery, CHConfig, CHQuery } from '../types';
import { SQLEditor } from 'components/SQLEditor';

type Props = QueryEditorProps<Datasource, CHQuery, CHConfig>;

export const QueryEditor = (props: Props) => {
  const { query, onRunQuery, onChange, datasource } = props;

  const q = defaults(query, defaultQuery);

  return (
    <div className="gf-form">
      <SQLEditor datasource={datasource} onChange={onChange} onRunQuery={onRunQuery} query={q} />
    </div>
  );
};
