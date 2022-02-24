import React from 'react';
import { render } from '@testing-library/react';
import { QueryBuilder } from './QueryBuilder';
import { Datasource } from '../../data/CHDatasource';
import { BuilderMode } from 'types';

describe('QueryBuilder', () => {
  it('renders correctly', () => {
    const setState = jest.fn();
    const mockDs = { settings: { jsonData: {} } } as Datasource;
    mockDs.fetchFieldsFull = jest.fn(() => {
      setState();
      return Promise.resolve([]);
    });
    mockDs.fetchEntities = jest.fn(() => Promise.resolve([]));
    const useStateMock: any = (initState: any) => [initState, setState];
    jest.spyOn(React, 'useState').mockImplementation(useStateMock);
    const result = render(
      <QueryBuilder
        builderOptions={{
          mode: BuilderMode.List,
          database: 'db',
          table: 'foo',
          fields: [],
        }}
        onBuilderOptionsChange={() => {}}
        datasource={mockDs}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
  });
});
