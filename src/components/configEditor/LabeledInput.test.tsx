import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { LabeledInput } from './LabeledInput';

describe('LabeledInput', () => {
  it('should render', () => {
    const result = render(<LabeledInput label='test' value='test' onChange={() => {}} />);
    expect(result.container.firstChild).not.toBeNull();
  });

  it('should call onChange when input is changed', async () => {
    const onChange = jest.fn();
    const result = render(<LabeledInput label='test' value='test' placeholder='test' onChange={onChange} />);
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText('test');
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('changed');
  });
});
