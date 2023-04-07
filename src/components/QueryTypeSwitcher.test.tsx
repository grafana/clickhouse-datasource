import React from 'react';
import { render } from '@testing-library/react';
import { QueryTypeSwitcher } from './QueryTypeSwitcher';
import { selectors } from '../selectors';
import { QueryType, CHQuery, CHSQLQuery, Format } from '../types';

const { options } = selectors.components.QueryEditor.Types;

describe('QueryTypeSwitcher', () => {
  it('renders default query', () => {
    const result = render(
      <QueryTypeSwitcher query={{ refId: 'A' } as CHQuery} onChange={() => {}} onRunQuery={() => {}} />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByLabelText(options.SQLEditor)).not.toBeChecked();
    expect(result.getByLabelText(options.QueryBuilder)).toBeChecked();
  });
  it('renders legacy query (query without query type)', () => {
    const result = render(
      <QueryTypeSwitcher
        query={{ refId: 'A', rawSql: 'hello' } as CHSQLQuery}
        onChange={() => {}}
        onRunQuery={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByLabelText(options.SQLEditor)).toBeChecked();
    expect(result.getByLabelText(options.QueryBuilder)).not.toBeChecked();
  });
  it('renders correctly SQL editor', () => {
    const result = render(
      <QueryTypeSwitcher
        query={{ refId: 'A', queryType: QueryType.SQL, rawSql: '', format: Format.TABLE, selectedFormat: Format.AUTO }}
        onChange={() => {}}
        onRunQuery={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByLabelText(options.SQLEditor)).toBeChecked();
    expect(result.getByLabelText(options.QueryBuilder)).not.toBeChecked();
  });
  it('renders correctly SQL Builder editor', () => {
    const result = render(
      <QueryTypeSwitcher
        query={{ refId: 'A', queryType: QueryType.Builder, rawSql: '' } as CHQuery}
        onChange={() => {}}
        onRunQuery={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByLabelText(options.SQLEditor)).not.toBeChecked();
    expect(result.getByLabelText(options.QueryBuilder)).toBeChecked();
  });
});
