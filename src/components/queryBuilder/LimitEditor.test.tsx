import React from 'react';
import { render } from '@testing-library/react';
import { LimitEditor } from './Limit';

describe('LimitEditor', () => {
  it('renders correctly', () => {
    const result = render(<LimitEditor limit={10} onLimitChange={() => {}} />);
    expect(result.container.firstChild).not.toBeNull();
  });
});
