import React from 'react';
import { render } from '@testing-library/react';
import { TableSelect } from './TableSelect';
import { Datasource } from '../../data/CHDatasource';

describe('TableSelect', () => {
  it('renders correctly', () => {
    const setState = jest.fn();
    const mockDs = {} as Datasource;
    mockDs.fetchEntities = jest.fn(() => Promise.resolve([]));
    const useStateMock: any = (initState: any) => [initState, setState];
    jest.spyOn(React, 'useState').mockImplementation(useStateMock);
    const result = render(<TableSelect table="" onTableChange={() => {}} datasource={mockDs} />);
    expect(result.container.firstChild).not.toBeNull();
  });
});
