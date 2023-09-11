import React from 'react';
import { render } from '@testing-library/react';
// import { ColumnSelect } from './ColumnSelect';

describe('ColumnSelect', () => {
  it('renders correctly', () => {
    const result = render(
      <></>
      // <ColumnSelect
      // />
    );
    expect(result.container.firstChild).not.toBeNull();
  });
});
