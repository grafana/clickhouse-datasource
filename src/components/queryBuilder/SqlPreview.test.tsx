import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { SqlPreview } from './SqlPreview';

describe('SqlPreview', () => {
  it('renders correctly', () => {
    const result = render(<SqlPreview sql="" />);
    expect(result.container.firstChild).not.toBeNull();
  });

  it('renders compact actions', () => {
    const writeText = jest.fn();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const onEditAsSql = jest.fn();

    render(<SqlPreview sql="SELECT 1" compact onEditAsSql={onEditAsSql} />);

    expect(screen.getByText('SELECT 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('SELECT 1');

    fireEvent.click(screen.getByRole('button', { name: 'Edit as SQL' }));
    expect(onEditAsSql).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'SQL' }));
    expect(screen.queryByText('SELECT 1')).not.toBeInTheDocument();
  });
});
