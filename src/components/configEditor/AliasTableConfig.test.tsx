import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { AliasTableConfig } from './AliasTableConfig';
import { selectors as allSelectors } from 'selectors';
import { AliasTableEntry } from 'types/config';

describe('AliasTableConfig', () => {
  const selectors = allSelectors.components.Config.AliasTableConfig;

  it('should render', () => {
    const result = render(<AliasTableConfig aliasTables={[]} onAliasTablesChange={() => {}} />);
    expect(result.container.firstChild).not.toBeNull();
  });

  it('should not call onAliasTablesChange when entry is added', () => {
    const onAliasTablesChange = jest.fn();
    const result = render(
      <AliasTableConfig
        aliasTables={[]}
        onAliasTablesChange={onAliasTablesChange}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const addEntryButton = result.getByTestId(selectors.addEntryButton);
    expect(addEntryButton).toBeInTheDocument();
    fireEvent.click(addEntryButton);
    
    expect(onAliasTablesChange).toHaveBeenCalledTimes(0);
  });

  it('should call onAliasTablesChange when entry is updated', () => {
    const onAliasTablesChange = jest.fn();
    const result = render(
      <AliasTableConfig
		aliasTables={[]}
		onAliasTablesChange={onAliasTablesChange}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const addEntryButton = result.getByTestId(selectors.addEntryButton);
    expect(addEntryButton).toBeInTheDocument();
    fireEvent.click(addEntryButton);
    
    const aliasEditor = result.getByTestId(selectors.aliasEditor);
    expect(aliasEditor).toBeInTheDocument();

    const targetDatabaseInput = result.getByTestId(selectors.targetDatabaseInput);
    expect(targetDatabaseInput).toBeInTheDocument();
    fireEvent.change(targetDatabaseInput, { target: { value: 'default ' } }); // with space in name
    fireEvent.blur(targetDatabaseInput);
    expect(targetDatabaseInput).toHaveValue('default ');
    expect(onAliasTablesChange).toHaveBeenCalledTimes(1);

    const targetTableInput = result.getByTestId(selectors.targetTableInput);
    expect(targetTableInput).toBeInTheDocument();
    fireEvent.change(targetTableInput, { target: { value: 'query_log' } });
    fireEvent.blur(targetTableInput);
    expect(targetTableInput).toHaveValue('query_log');
    expect(onAliasTablesChange).toHaveBeenCalledTimes(2);

	const aliasDatabaseInput = result.getByTestId(selectors.aliasDatabaseInput);
    expect(aliasDatabaseInput).toBeInTheDocument();
    fireEvent.change(aliasDatabaseInput, { target: { value: 'default_aliases ' } }); // with space in name
    fireEvent.blur(aliasDatabaseInput);
    expect(aliasDatabaseInput).toHaveValue('default_aliases ');
    expect(onAliasTablesChange).toHaveBeenCalledTimes(3);

    const aliasTableInput = result.getByTestId(selectors.aliasTableInput);
    expect(aliasTableInput).toBeInTheDocument();
    fireEvent.change(aliasTableInput, { target: { value: 'query_log_aliases' } });
    fireEvent.blur(aliasTableInput);
    expect(aliasTableInput).toHaveValue('query_log_aliases');
    expect(onAliasTablesChange).toHaveBeenCalledTimes(4);

    const expected: AliasTableEntry[] = [
      {
		targetDatabase: 'default', // without space in name
		targetTable: 'query_log',
		aliasDatabase: 'default_aliases', // without space in name
		aliasTable: 'query_log_aliases',
	  }
    ];
    expect(onAliasTablesChange).toHaveBeenCalledWith(expect.objectContaining(expected));
  });

  it('should call onAliasTablesChange when entry is removed', () => {
    const onAliasTablesChange = jest.fn();
    const result = render(
      <AliasTableConfig
        aliasTables={[
			{
				targetDatabase: '', targetTable: 'query_log',
				aliasDatabase: '', aliasTable: 'query_log_aliases'
			},
			{
				targetDatabase: '', targetTable: 'query_log2',
				aliasDatabase: '', aliasTable: 'query_log2_aliases'
			},
        ]}
        onAliasTablesChange={onAliasTablesChange}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const removeEntryButton = result.getAllByTestId(selectors.removeEntryButton)[0]; // Get 1st
    expect(removeEntryButton).toBeInTheDocument();
    fireEvent.click(removeEntryButton);
    
    const expected: AliasTableEntry[] = [
		{
			targetDatabase: '', targetTable: 'query_log2',
			aliasDatabase: '', aliasTable: 'query_log2_aliases'
		},
    ];
    expect(onAliasTablesChange).toHaveBeenCalledTimes(1);
    expect(onAliasTablesChange).toHaveBeenCalledWith(expect.objectContaining(expected));
  });
});
