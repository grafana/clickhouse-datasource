import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { LimitEditor } from './LimitEditor';
import { selectors } from 'selectors';

describe('LimitEditor', () => {
  it('should render', () => {
    const result = render(<LimitEditor limit={10} onLimitChange={() => {}} />);
    expect(result.container.firstChild).not.toBeNull();
  });

  it('should call onLimitChange when limit is changed', () => {
    const onLimitChange = jest.fn();
    const result = render(<LimitEditor limit={10} onLimitChange={onLimitChange} />);
    expect(result.container.firstChild).not.toBeNull();

    const limitInput = result.getByTestId(selectors.components.QueryBuilder.LimitEditor.input);
    expect(limitInput).toBeInTheDocument();
    fireEvent.change(limitInput, { target: { value: 5 } });
    fireEvent.blur(limitInput);
    expect(limitInput).toHaveValue(5);
    expect(onLimitChange).toBeCalledTimes(1);
    expect(onLimitChange).toBeCalledWith(5);
  });

  it('follows a limit changed from outside the input', () => {
    // For example a query picked from query history, which reaches the builder through setAllOptions.
    const result = render(<LimitEditor limit={10} onLimitChange={() => {}} />);
    const limitInput = result.getByTestId(selectors.components.QueryBuilder.LimitEditor.input);

    result.rerender(<LimitEditor limit={250} onLimitChange={() => {}} />);

    expect(limitInput).toHaveValue(250);
  });
});
