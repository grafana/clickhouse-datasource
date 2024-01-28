import React from 'react';
import { render } from '@testing-library/react';
import { selectors } from 'selectors';
import TraceIdInput from './TraceIdInput';
import userEvent from '@testing-library/user-event';

describe('TraceIdInput', () => {
  it('should render', () => {
    const result = render(<TraceIdInput traceId="" onChange={() => {}} />);
    expect(result.container.firstChild).not.toBeNull();
  });

  it('should call onChange when ID is changed', async () => {
    const onChange = jest.fn();
    const result = render(<TraceIdInput traceId="" onChange={onChange} />);
    expect(result.container.firstChild).not.toBeNull();

    const idInput = result.getByTestId(selectors.components.QueryBuilder.TraceIdInput.input);
    expect(idInput).toBeInTheDocument();
    await userEvent.type(idInput, 'test');
    idInput.blur();
    expect(idInput).toHaveValue('test');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('test');
  });
});
