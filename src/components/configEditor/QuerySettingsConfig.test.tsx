import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { QuerySettingsConfig } from './QuerySettingsConfig';
import allLabels from 'labels';

describe('QuerySettingsConfig', () => {
  it('should render', () => {
    const result = render(
      <QuerySettingsConfig
        connMaxLifetime={'5'}
        dialTimeout={'5'}
        maxIdleConns={'5'}
        maxOpenConns={'5'}
        queryTimeout={'5'}
        validateSql={true}
        onConnMaxIdleConnsChange={() => {}}
        onConnMaxLifetimeChange={() => {}}
        onConnMaxOpenConnsChange={() => {}}
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
        onConnMaxIdleConnsChange={() => {}}
        onConnMaxLifetimeChange={() => {}}
        onConnMaxOpenConnsChange={() => {}}
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
    expect(onDialTimeout).toHaveBeenCalledTimes(1);
    expect(onDialTimeout).toHaveBeenCalledWith(expect.any(Object));
  });

  it('should call onQueryTimeout when changed', () => {
    const onQueryTimeout = jest.fn();
    const result = render(
      <QuerySettingsConfig
        onConnMaxIdleConnsChange={() => {}}
        onConnMaxLifetimeChange={() => {}}
        onConnMaxOpenConnsChange={() => {}}
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
    expect(onQueryTimeout).toHaveBeenCalledTimes(1);
    expect(onQueryTimeout).toHaveBeenCalledWith(expect.any(Object));
  });

  it('should call onValidateSqlChange when changed', () => {
    const onValidateSqlChange = jest.fn();
    const result = render(
      <QuerySettingsConfig
        onConnMaxIdleConnsChange={() => {}}
        onConnMaxLifetimeChange={() => {}}
        onConnMaxOpenConnsChange={() => {}}
        onDialTimeoutChange={() => {}}
        onQueryTimeoutChange={() => {}}
        onValidateSqlChange={onValidateSqlChange}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByRole('checkbox');
    expect(input).toBeInTheDocument();
    fireEvent.click(input);
    expect(onValidateSqlChange).toHaveBeenCalledTimes(1);
    expect(onValidateSqlChange).toHaveBeenCalledWith(expect.any(Object));
  });

  it('should call onConnMaxIdleConnsChange when changed', () => {
    const onConnMaxIdleConnsChange = jest.fn();
    const result = render(
      <QuerySettingsConfig
        onConnMaxIdleConnsChange={onConnMaxIdleConnsChange}
        onConnMaxLifetimeChange={() => {}}
        onConnMaxOpenConnsChange={() => {}}
        onDialTimeoutChange={() => {}}
        onQueryTimeoutChange={() => {}}
        onValidateSqlChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(allLabels.components.Config.QuerySettingsConfig.maxIdleConns.placeholder);
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.blur(input);
    expect(onConnMaxIdleConnsChange).toHaveBeenCalledTimes(1);
    expect(onConnMaxIdleConnsChange).toHaveBeenCalledWith(expect.any(Object));
  });

  it('should call onConnMaxLifetimeChange when changed', () => {
    const onConnMaxLifetimeChange = jest.fn();
    const result = render(
      <QuerySettingsConfig
        onConnMaxIdleConnsChange={() => {}}
        onConnMaxLifetimeChange={onConnMaxLifetimeChange}
        onConnMaxOpenConnsChange={() => {}}
        onDialTimeoutChange={() => {}}
        onQueryTimeoutChange={() => {}}
        onValidateSqlChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(allLabels.components.Config.QuerySettingsConfig.connMaxLifetime.placeholder);
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.blur(input);
    expect(onConnMaxLifetimeChange).toHaveBeenCalledTimes(1);
    expect(onConnMaxLifetimeChange).toHaveBeenCalledWith(expect.any(Object));
  });

  it('should call onConnMaxOpenConnsChange when changed', () => {
    const onConnMaxOpenConnsChange = jest.fn();
    const result = render(
      <QuerySettingsConfig
        onConnMaxIdleConnsChange={() => {}}
        onConnMaxLifetimeChange={() => {}}
        onConnMaxOpenConnsChange={onConnMaxOpenConnsChange}
        onDialTimeoutChange={() => {}}
        onQueryTimeoutChange={() => {}}
        onValidateSqlChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(allLabels.components.Config.QuerySettingsConfig.maxOpenConns.placeholder);
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.blur(input);
    expect(onConnMaxOpenConnsChange).toHaveBeenCalledTimes(1);
    expect(onConnMaxOpenConnsChange).toHaveBeenCalledWith(expect.any(Object));
  });
});
