import React from 'react';
import { screen, render } from '@testing-library/react';
import { ConfigSubSection } from './ConfigSubSection';

describe('<ConfigSubSection />', () => {
  it('should render title as <h3>', () => {
    render(
      <ConfigSubSection title="Test title">
        <div>Content</div>
      </ConfigSubSection>
    );

    expect(screen.getByText('Test title').tagName).toBe('H6');
  });
});
