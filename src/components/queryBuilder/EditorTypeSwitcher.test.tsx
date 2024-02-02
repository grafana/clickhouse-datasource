import React from 'react';
import { render } from '@testing-library/react';
import { EditorTypeSwitcher } from './EditorTypeSwitcher';
import { CHQuery, CHSqlQuery, EditorType } from 'types/sql';
import labels from 'labels';

const options = {
  SQLEditor: labels.types.EditorType.sql,
  QueryBuilder: labels.types.EditorType.builder,
};

describe('EditorTypeSwitcher', () => {
  it('should render default query', () => {
    const result = render(
      <EditorTypeSwitcher
        query={{ refId: 'A', editorType: EditorType.Builder } as CHQuery}
        onChange={() => {}}
        onRunQuery={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByLabelText(options.SQLEditor)).not.toBeChecked();
    expect(result.getByLabelText(options.QueryBuilder)).toBeChecked();
  });

  it('should render legacy query (query without query type)', () => {
    const result = render(
      <EditorTypeSwitcher
        query={{ refId: 'A', rawSql: 'hello', editorType: EditorType.SQL } as CHSqlQuery}
        onChange={() => {}}
        onRunQuery={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByLabelText(options.SQLEditor)).toBeChecked();
    expect(result.getByLabelText(options.QueryBuilder)).not.toBeChecked();
  });

  it('should render SQL editor', () => {
    const result = render(
      <EditorTypeSwitcher
        query={{
          pluginVersion: '',
          refId: 'A',
          editorType: EditorType.SQL,
          rawSql: ''
        }}
        onChange={() => {}}
        onRunQuery={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByLabelText(options.SQLEditor)).toBeChecked();
    expect(result.getByLabelText(options.QueryBuilder)).not.toBeChecked();
  });

  it('should render Query Builder', () => {
    const result = render(
      <EditorTypeSwitcher
        query={{
            pluginVersion: '',
            refId: 'A',
            editorType: EditorType.Builder,
            rawSql: ''
        } as CHQuery}
        onChange={() => {}}
        onRunQuery={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByLabelText(options.SQLEditor)).not.toBeChecked();
    expect(result.getByLabelText(options.QueryBuilder)).toBeChecked();
  });
});
