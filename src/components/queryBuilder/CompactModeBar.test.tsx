import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { CompactModeBar } from './CompactModeBar';

const searchInput = () => screen.getByPlaceholderText('Search log body text...');

describe('CompactModeBar', () => {
  it('keeps typed text local until blur', () => {
    const onSearchChange = jest.fn();
    render(<CompactModeBar mode="otel-logs" searchText="" onSearchChange={onSearchChange} />);

    fireEvent.change(searchInput(), { target: { value: 'timeout' } });
    expect(onSearchChange).not.toHaveBeenCalled();

    fireEvent.blur(searchInput());
    expect(onSearchChange).toHaveBeenCalledWith('timeout');
  });

  it('follows search text changed from outside the input', () => {
    const { rerender } = render(<CompactModeBar mode="otel-logs" searchText="error" onSearchChange={() => {}} />);
    expect(searchInput()).toHaveValue('error');

    rerender(<CompactModeBar mode="otel-logs" searchText="warn" onSearchChange={() => {}} />);

    expect(searchInput()).toHaveValue('warn');
  });
});
