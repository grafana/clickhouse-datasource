import React from 'react';
import { screen, render } from '@testing-library/react';
import { ConfigSection } from './ConfigSection';

describe('<ConfigSection />', () => {
  it('should render title as <h3>', () => {
    render(
      <ConfigSection title="Test title">
        <div>Content</div>
      </ConfigSection>
    );

    expect(screen.getByText('Test title').tagName).toBe('H3');
  });
});
