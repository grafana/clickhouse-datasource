import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { EditorTypeSwitcher } from './EditorTypeSwitcher';
import { CHQuery, CHSqlQuery, EditorType } from 'types/sql';
import { migrateCHQuery } from 'data/migration';
import labels from 'labels';

const options = {
  SQLEditor: labels.types.EditorType.sql,
  QueryBuilder: labels.types.EditorType.builder,
  SchemaExplorer: labels.types.EditorType.schema,
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

  it('should render Schema Explorer option', () => {
    const result = render(
      <EditorTypeSwitcher
        query={{ refId: 'A', editorType: EditorType.Builder } as CHQuery}
        onChange={() => {}}
        onRunQuery={() => {}}
      />
    );
    expect(result.getByLabelText(options.SchemaExplorer)).not.toBeChecked();
  });

  it('should switch from Query Builder to Schema Explorer', () => {
    const builderOptions = {
      database: 'db1',
      table: 'table1',
      queryType: 'table',
    };

    const query = {
      refId: 'A',
      editorType: EditorType.Builder,
      rawSql: 'SELECT * FROM db1.table1',
      builderOptions,
    } as unknown as CHQuery;

    const onChangeMock = jest.fn();

    const { getByLabelText } = render(
      <EditorTypeSwitcher query={query} onChange={onChangeMock} onRunQuery={() => {}} />
    );

    getByLabelText(options.SchemaExplorer).click();

    expect(onChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        editorType: EditorType.Schema,
        rawSql: 'SELECT * FROM db1.table1',
        meta: { builderOptions },
        schemaExplorer: { database: 'db1', table: 'table1' },
      })
    );
    expect(onChangeMock.mock.calls[0][0].builderOptions).toBeUndefined();
  });

  it('should keep rawSql verbatim when switching from Schema Explorer to SQL Editor', () => {
    const query = {
      refId: 'A',
      editorType: EditorType.Schema,
      rawSql: 'SELECT "col1" FROM "db1"."table1" LIMIT 1000',
      meta: { builderOptions: { database: 'db1', table: 'table1', queryType: 'table', columns: [] } },
    } as unknown as CHQuery;

    const onChangeMock = jest.fn();

    const { getByLabelText } = render(
      <EditorTypeSwitcher query={query} onChange={onChangeMock} onRunQuery={() => {}} />
    );

    getByLabelText(options.SQLEditor).click();

    expect(onChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        editorType: EditorType.SQL,
        rawSql: 'SELECT "col1" FROM "db1"."table1" LIMIT 1000',
      })
    );
  });

  it('should restore builderOptions from meta when switching from Schema Explorer to Query Builder', () => {
    const builderOptions = {
      database: 'db1',
      table: 'table1',
      queryType: 'table',
      columns: [{ name: 'col1', type: 'String' }],
    };

    const query = {
      refId: 'A',
      editorType: EditorType.Schema,
      rawSql: 'SELECT "col1" FROM "db1"."table1" LIMIT 1000',
      meta: { builderOptions },
    } as unknown as CHQuery;

    const onChangeMock = jest.fn();

    const { getByLabelText } = render(
      <EditorTypeSwitcher query={query} onChange={onChangeMock} onRunQuery={() => {}} />
    );

    getByLabelText(options.QueryBuilder).click();

    expect(onChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        editorType: EditorType.Builder,
        builderOptions,
      })
    );
  });

  it('stamps pluginVersion when switching from Builder to Schema', () => {
    const builderOptions = {
      database: 'db1',
      table: 'table1',
      queryType: 'table',
    };

    const query = {
      refId: 'A',
      editorType: EditorType.Builder,
      rawSql: 'SELECT * FROM db1.table1',
      builderOptions,
    } as unknown as CHQuery;

    const onChangeMock = jest.fn();

    const { getByLabelText } = render(
      <EditorTypeSwitcher query={query} onChange={onChangeMock} onRunQuery={() => {}} />
    );

    getByLabelText(options.SchemaExplorer).click();

    const emitted = onChangeMock.mock.calls[0][0];
    expect(emitted.pluginVersion).toBeTruthy();
    expect(migrateCHQuery(emitted).editorType).toBe(EditorType.Schema);
  });

  it('stamps pluginVersion when switching from Schema to Builder', () => {
    const builderOptions = {
      database: 'db1',
      table: 'table1',
      queryType: 'table',
      columns: [{ name: 'col1', type: 'String' }],
    };

    const query = {
      refId: 'A',
      editorType: EditorType.Schema,
      rawSql: 'SELECT "col1" FROM "db1"."table1" LIMIT 1000',
      meta: { builderOptions },
    } as unknown as CHQuery;

    const onChangeMock = jest.fn();

    const { getByLabelText } = render(
      <EditorTypeSwitcher query={query} onChange={onChangeMock} onRunQuery={() => {}} />
    );

    getByLabelText(options.QueryBuilder).click();

    const emitted = onChangeMock.mock.calls[0][0];
    expect(emitted.pluginVersion).toBeTruthy();
    expect(migrateCHQuery(emitted).editorType).toBe(EditorType.Builder);
  });

  it('stamps pluginVersion when switching from Schema to SQL', () => {
    const query = {
      refId: 'A',
      editorType: EditorType.Schema,
      rawSql: 'SELECT "col1" FROM "db1"."table1" LIMIT 1000',
      meta: { builderOptions: { database: 'db1', table: 'table1', queryType: 'table', columns: [] } },
    } as unknown as CHQuery;

    const onChangeMock = jest.fn();

    const { getByLabelText } = render(
      <EditorTypeSwitcher query={query} onChange={onChangeMock} onRunQuery={() => {}} />
    );

    getByLabelText(options.SQLEditor).click();

    const emitted = onChangeMock.mock.calls[0][0];
    expect(emitted.pluginVersion).toBeTruthy();
    expect(migrateCHQuery(emitted).editorType).toBe(EditorType.SQL);
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
