import React from 'react';
import { render } from '@testing-library/react';
import { ModeEditor } from './ModeEditor';
import { BuilderMode } from 'types';

describe('ModeEditor', () => {
  it('renders correctly', () => {
    const result = render(<ModeEditor mode={BuilderMode.List} onModeChange={() => {}} />);
    expect(result.container.firstChild).not.toBeNull();
  });
});
