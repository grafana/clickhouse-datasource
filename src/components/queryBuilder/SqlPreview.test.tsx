import React from 'react';
import { render } from '@testing-library/react';
import { SqlPreview } from './SqlPreview';

describe('SqlPreview', () => {
  it('renders correctly', () => {
    const result = render(<SqlPreview sql="" />);
    expect(result.container.firstChild).not.toBeNull();
  });
});
