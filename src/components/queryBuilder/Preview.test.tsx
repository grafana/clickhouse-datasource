import React from 'react';
import { render } from '@testing-library/react';
import { Preview } from './Preview';

describe('Preview', () => {
  it('renders correctly', () => {
    const result = render(<Preview sql="" />);
    expect(result.container.firstChild).not.toBeNull();
  });
});
