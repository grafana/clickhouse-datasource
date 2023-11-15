import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { DefaultDatabaseTableConfig } from './DefaultDatabaseTableConfig';
import allLabels from 'labels';

describe('DefaultDatabaseTableConfig', () => {
  it('should render', () => {
    const result = render(<DefaultDatabaseTableConfig defaultDatabase='' defaultTable='' onDefaultDatabaseChange={() => {}} onDefaultTableChange={() => {}} />);
    expect(result.container.firstChild).not.toBeNull();
  });

  it('should call onDefaultDatabaseChange when default database is changed', () => {
    const onDefaultDatabaseChange = jest.fn();
    const result = render(<DefaultDatabaseTableConfig defaultDatabase='' defaultTable='' onDefaultDatabaseChange={onDefaultDatabaseChange} onDefaultTableChange={() => {}} />);
    expect(result.container.firstChild).not.toBeNull();

    const databaseInput = result.getByLabelText(allLabels.components.Config.DefaultDatabaseTableConfig.database.label);
    expect(databaseInput).toBeInTheDocument();
    fireEvent.change(databaseInput, { target: { value: 'test' } });
    fireEvent.blur(databaseInput);
    expect(onDefaultDatabaseChange).toBeCalledTimes(1);
    expect(onDefaultDatabaseChange).toBeCalledWith(expect.any(Object));
  });

  it('should call onDefaultTableChange when default table is changed', () => {
    const onDefaultTableChange = jest.fn();
    const result = render(<DefaultDatabaseTableConfig defaultDatabase='' defaultTable='' onDefaultDatabaseChange={() => {}} onDefaultTableChange={onDefaultTableChange} />);
    expect(result.container.firstChild).not.toBeNull();

    const tableInput = result.getByLabelText(allLabels.components.Config.DefaultDatabaseTableConfig.table.label);
    expect(tableInput).toBeInTheDocument();
    fireEvent.change(tableInput, { target: { value: 'test' } });
    fireEvent.blur(tableInput);
    expect(onDefaultTableChange).toBeCalledTimes(1);
    expect(onDefaultTableChange).toBeCalledWith(expect.any(Object));
  });
});
