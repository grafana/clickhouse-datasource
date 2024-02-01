import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { QuerySettingsConfig } from './QuerySettingsConfig';
import allLabels from 'labels';

describe('QuerySettingsConfig', () => {
  it('should render', () => {
    const result = render(
      <QuerySettingsConfig
        dialTimeout='10'
        queryTimeout='10'
        validateSql
        onDialTimeoutChange={() => {}}
        onQueryTimeoutChange={() => {}}
        onValidateSqlChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
  });

  it('should call onDialTimeout when changed', () => {
    const onDialTimeout = jest.fn();
    const result = render(
      <QuerySettingsConfig
        onDialTimeoutChange={onDialTimeout}
        onQueryTimeoutChange={() => {}}
        onValidateSqlChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(allLabels.components.Config.QuerySettingsConfig.dialTimeout.placeholder);
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.blur(input);
    expect(onDialTimeout).toBeCalledTimes(1);
    expect(onDialTimeout).toBeCalledWith(expect.any(Object));
  });

  it('should call onQueryTimeout when changed', () => {
    const onQueryTimeout = jest.fn();
    const result = render(
      <QuerySettingsConfig
        onDialTimeoutChange={() => {}}
        onQueryTimeoutChange={onQueryTimeout}
        onValidateSqlChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(allLabels.components.Config.QuerySettingsConfig.queryTimeout.placeholder);
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.blur(input);
    expect(onQueryTimeout).toBeCalledTimes(1);
    expect(onQueryTimeout).toBeCalledWith(expect.any(Object));
  });

  it('should call onValidateSqlChange when changed', () => {
    const onValidateSqlChange = jest.fn();
    const result = render(
      <QuerySettingsConfig
        onDialTimeoutChange={() => {}}
        onQueryTimeoutChange={() => {}}
        onValidateSqlChange={onValidateSqlChange}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByRole('checkbox');
    expect(input).toBeInTheDocument();
    fireEvent.click(input);
    expect(onValidateSqlChange).toBeCalledTimes(1);
    expect(onValidateSqlChange).toBeCalledWith(expect.any(Object));
  });
});
