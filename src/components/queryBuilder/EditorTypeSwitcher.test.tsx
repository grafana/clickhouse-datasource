import React from 'react';
import { render, waitFor } from '@testing-library/react';
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
          rawSql: '',
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
        query={
          {
            pluginVersion: '',
            refId: 'A',
            editorType: EditorType.Builder,
            rawSql: '',
          } as CHQuery
        }
        onChange={() => {}}
        onRunQuery={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByLabelText(options.SQLEditor)).not.toBeChecked();
    expect(result.getByLabelText(options.QueryBuilder)).toBeChecked();
  });

  it('should show cannot convert modal when switching from SQL to Builder and SQL is invalid', () => {
    const query = {
      refId: 'A',
      editorType: EditorType.SQL,
      rawSql: 'INVALID SQL',
      queryType: 'table',
    } as unknown as CHQuery;

    const { getByLabelText, getByText } = render(
      <EditorTypeSwitcher query={query} onChange={() => {}} onRunQuery={() => {}} />
    );

    getByLabelText(options.QueryBuilder).click();

    expect(getByText(labels.components.EditorTypeSwitcher.cannotConvert.title)).toBeInTheDocument();
  });

  it('should show confirm modal when switching from SQL to Builder and SQL is valid', () => {
    const query = {
      refId: 'A',
      editorType: EditorType.SQL,
      rawSql: 'SELECT * FROM testTable',
      queryType: 'table',
    } as unknown as CHQuery;

    const { getByLabelText, getByText } = render(
      <EditorTypeSwitcher query={query} onChange={() => {}} onRunQuery={() => {}} />
    );

    getByLabelText(options.QueryBuilder).click();

    expect(getByText(labels.components.EditorTypeSwitcher.switcher.title)).toBeInTheDocument();
    expect(getByText(labels.components.EditorTypeSwitcher.switcher.body)).toBeInTheDocument();
  });

  it('should fire onChange after selecting Continue', async () => {
    const query = {
      refId: 'A',
      editorType: EditorType.SQL,
      rawSql: 'SELECT * FROM testTable',
      queryType: 'table',
    } as unknown as CHQuery;

    const onChangeMock = jest.fn();

    const { getByLabelText, getByText } = render(
      <EditorTypeSwitcher query={query} onChange={onChangeMock} onRunQuery={() => {}} />
    );

    getByLabelText(options.QueryBuilder).click();

    const continueButton = getByText('Continue');
    continueButton.click();
    await waitFor(() => expect(onChangeMock).toHaveBeenCalled());
  });

  it('should not fire onChange after selecting Cancel', async () => {
    const query = {
      refId: 'A',
      editorType: EditorType.SQL,
      rawSql: 'SELECT * FROM testTable',
      queryType: 'table',
    } as unknown as CHQuery;

    const onChangeMock = jest.fn();

    const { getByLabelText, getByText } = render(
      <EditorTypeSwitcher query={query} onChange={onChangeMock} onRunQuery={() => {}} />
    );

    getByLabelText(options.QueryBuilder).click();

    const continueButton = getByText('Cancel');
    continueButton.click();
    await waitFor(() => expect(onChangeMock).not.toHaveBeenCalled());
  });
});
