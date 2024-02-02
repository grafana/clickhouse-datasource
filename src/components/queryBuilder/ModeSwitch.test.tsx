import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { ModeSwitch } from './ModeSwitch';

describe('ModeSwitch', () => {
  const labelA = 'A';
  const labelB = 'B';
  const label = 'test';
  const tooltip = 'tooltip';

  it('should render', () => {
    const result = render(
      <ModeSwitch
        labelA={labelA}
        labelB={labelB}
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
      <ModeSwitch
        labelA={labelA}
        labelB={labelB}
        value={false}
        onChange={onChange}
        label={label}
        tooltip={tooltip}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const buttonA = result.getByText(labelA);
    expect(buttonA).toBeInTheDocument();
    const buttonB = result.getByText(labelB);
    expect(buttonB).toBeInTheDocument();

    fireEvent.click(buttonB);
    expect(onChange).toBeCalledTimes(1);
    expect(onChange).toBeCalledWith(true);

    result.rerender(
      <ModeSwitch
        labelA={labelA}
        labelB={labelB}
        value={true}
        onChange={onChange}
        label={label}
        tooltip={tooltip}
      />
    );

    fireEvent.click(buttonA);
    expect(onChange).toBeCalledTimes(2);
    expect(onChange).toBeCalledWith(false);
  });
});
