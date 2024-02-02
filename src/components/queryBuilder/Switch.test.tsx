import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { Switch } from './Switch';

describe('Switch', () => {
  const label = 'test';
  const tooltip = 'tooltip';

  it('should render', () => {
    const result = render(
      <Switch
        value={false}
        onChange={() => {}}
        label={label}
        tooltip={tooltip}
      />
    );

    expect(result.container.firstChild).not.toBeNull();
  });

  it('should call onChange when mode is changed', () => {
    const onChange = jest.fn();
    const result = render(
      <Switch
        value={false}
        onChange={onChange}
        label={label}
        tooltip={tooltip}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const checkbox = result.getByRole("checkbox");
    expect(checkbox).toBeInTheDocument();

    fireEvent.click(checkbox);
    expect(onChange).toBeCalledTimes(1);
    expect(onChange).toBeCalledWith(true);

    result.rerender(
      <Switch
        value={true}
        onChange={onChange}
        label={label}
        tooltip={tooltip}
      />
    );

    fireEvent.click(checkbox);
    expect(onChange).toBeCalledTimes(2);
    expect(onChange).toBeCalledWith(false);
  });
});
