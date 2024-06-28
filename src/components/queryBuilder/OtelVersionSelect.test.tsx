import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { OtelVersionSelect } from './OtelVersionSelect';
import otel from 'otel';

describe('OtelVersionSelect', () => {
  const testVersion = otel.getLatestVersion();
  const testVersionName = testVersion.name;

  it('should render with empty properties', () => {
    const result = render(
      <OtelVersionSelect
        enabled={false}
        onEnabledChange={() => {}}
        selectedVersion=""
        onVersionChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
  });

  it('should render with valid properties', () => {
    const result = render(
      <OtelVersionSelect
        enabled={false}
        onEnabledChange={() => {}}
        selectedVersion={testVersion.version}
        onVersionChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByText(testVersionName)).toBeInTheDocument();
  });

  it('should call onEnabledChange when the switch is enabled', () => {
    const onEnabledChange = jest.fn();
    const result = render(
      <OtelVersionSelect
        enabled={false}
        onEnabledChange={onEnabledChange}
        selectedVersion={testVersion.version}
        onVersionChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const toggle = result.getByRole('checkbox');
    expect(toggle).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(onEnabledChange).toBeCalledTimes(1);
    expect(onEnabledChange).toBeCalledWith(true);
  });

  it('should call onEnabledChange when the switch is disabled', () => {
    const onEnabledChange = jest.fn();
    const result = render(
      <OtelVersionSelect
        enabled={true}
        onEnabledChange={onEnabledChange}
        selectedVersion={testVersion.version}
        onVersionChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const toggle = result.getByRole('checkbox');
    expect(toggle).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(onEnabledChange).toBeCalledTimes(1);
    expect(onEnabledChange).toBeCalledWith(false);
  });

  it('should call onVersionChange when a new version is selected', () => {
    const onVersionChange = jest.fn();
    const result = render(
      <OtelVersionSelect
        enabled={true}
        onEnabledChange={() => {}}
        selectedVersion={testVersion.version}
        onVersionChange={onVersionChange}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const select = result.getByRole('combobox');
    expect(select).toBeInTheDocument();
    fireEvent.keyDown(select, { key: 'ArrowDown' });
    fireEvent.keyDown(select, { key: 'Enter' });
    expect(onVersionChange).toBeCalledTimes(1);
    expect(onVersionChange).toBeCalledWith(expect.any(String));
  });

  it('should disable version selection when switch is disabled', () => {
    const result = render(
      <OtelVersionSelect
        enabled={false}
        onEnabledChange={() => {}}
        selectedVersion={testVersion.version}
        onVersionChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const select = result.getByRole('combobox', { hidden: true });
    expect(select).toBeDisabled();
  });
});
