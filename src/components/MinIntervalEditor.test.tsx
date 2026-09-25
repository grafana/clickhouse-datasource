import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MinIntervalEditor } from './MinIntervalEditor';
import labels from 'labels';
import { selectors } from 'selectors';

const input = () => screen.getByTestId(selectors.components.QueryEditor.MinIntervalEditor.input);

describe('MinIntervalEditor', () => {
  it('renders the current value', () => {
    render(<MinIntervalEditor minInterval="5m" onMinIntervalChange={() => {}} />);
    expect(input()).toHaveValue('5m');
  });

  it('commits a valid duration on blur', () => {
    const onMinIntervalChange = jest.fn();
    render(<MinIntervalEditor onMinIntervalChange={onMinIntervalChange} />);

    fireEvent.change(input(), { target: { value: '1m' } });
    fireEvent.blur(input());

    expect(onMinIntervalChange).toHaveBeenCalledTimes(1);
    expect(onMinIntervalChange).toHaveBeenCalledWith('1m');
  });

  it('commits an empty value to clear the override', () => {
    const onMinIntervalChange = jest.fn();
    render(<MinIntervalEditor minInterval="5m" onMinIntervalChange={onMinIntervalChange} />);

    fireEvent.change(input(), { target: { value: '' } });
    fireEvent.blur(input());

    expect(onMinIntervalChange).toHaveBeenCalledWith('');
  });

  it.each(['soon', '60', '5minutes', '1.5m', '1h30m', '1M', '366d'])(
    'rejects %s without committing',
    (value: string) => {
      const onMinIntervalChange = jest.fn();
      render(<MinIntervalEditor onMinIntervalChange={onMinIntervalChange} />);

      fireEvent.change(input(), { target: { value } });
      fireEvent.blur(input());

      expect(onMinIntervalChange).not.toHaveBeenCalled();
      expect(screen.getByText(labels.components.MinIntervalEditor.error)).toBeInTheDocument();
    }
  );

  it('does not re-commit an unchanged value', () => {
    const onMinIntervalChange = jest.fn();
    render(<MinIntervalEditor minInterval="5m" onMinIntervalChange={onMinIntervalChange} />);

    fireEvent.blur(input());

    expect(onMinIntervalChange).not.toHaveBeenCalled();
  });
});
