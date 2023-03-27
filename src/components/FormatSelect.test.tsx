import React from 'react';
import { render } from '@testing-library/react';
import { FormatSelect } from './FormatSelect';
import { Format } from '../types';

describe('FormatSelect', () => {
  it('renders a format', () => {
    const result = render(<FormatSelect format={Format.TIMESERIES} onChange={() => {}} />);
    expect(result.container.firstChild).not.toBeNull();
  });
});
