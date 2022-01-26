import React from 'react';
import { render } from '@testing-library/react';
import { GroupByEditor } from './GroupBy';

describe('GroupByEditor', () => {
  it('renders correctly', () => {
    const result = render(<GroupByEditor fieldsList={[]} groupBy={[]} onGroupByChange={() => {}} />);
    expect(result.container.firstChild).not.toBeNull();
  });
});
