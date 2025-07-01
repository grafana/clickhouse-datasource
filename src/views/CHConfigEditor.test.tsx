import React from 'react';
import { render, screen } from '@testing-library/react';
import { ConfigEditor } from './CHConfigEditor';
import { mockConfigEditorProps } from '__mocks__/ConfigEditor';
import '@testing-library/jest-dom';
import { Protocol } from 'types/config';
import allLabels from 'labels';

jest.mock('@grafana/runtime', () => {
  const original = jest.requireActual('@grafana/runtime');
  return {
    ...original,
    config: { buildInfo: { version: '10.0.0' }, secureSocksDSProxyEnabled: true },
  };
});

describe('ConfigEditor', () => {
  const labels = allLabels.components.Config.ConfigEditor;

  it('new editor', () => {
    render(<ConfigEditor {...mockConfigEditorProps()} />);
    expect(screen.getByPlaceholderText(labels.serverAddress.placeholder)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(labels.serverPort.insecureHttpPort)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(labels.username.placeholder)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(labels.password.placeholder)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(labels.path.placeholder)).toBeInTheDocument();
  });
  it('with password', async () => {
    render(
      <ConfigEditor
        {...mockConfigEditorProps()}
        options={{
          ...mockConfigEditorProps().options,
          secureJsonData: { password: 'foo' },
          secureJsonFields: { password: true },
        }}
      />
    );
    expect(screen.getByPlaceholderText(labels.serverAddress.placeholder)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(labels.serverPort.insecureHttpPort)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(labels.username.placeholder)).toBeInTheDocument();
    const a = screen.getByText('Reset');
    expect(a).toBeInTheDocument();
  });
  it('with path', async () => {
    const path = 'custom-path';
    render(
      <ConfigEditor
        {...mockConfigEditorProps()}
        options={{
          ...mockConfigEditorProps().options,
          jsonData: { ...mockConfigEditorProps().options.jsonData, path, protocol: Protocol.Http },
        }}
      />
    );
    expect(screen.queryByPlaceholderText(labels.path.placeholder)).toHaveValue(path);
  });
  it('with secure connection', async () => {
    render(
      <ConfigEditor
        {...mockConfigEditorProps()}
        options={{
          ...mockConfigEditorProps().options,
          jsonData: { ...mockConfigEditorProps().options.jsonData, secure: true },
        }}
      />
    );
    expect(screen.queryByPlaceholderText(labels.serverPort.secureHttpPort)).toBeInTheDocument();
  });
  it('with protocol', async () => {
    render(
      <ConfigEditor
        {...mockConfigEditorProps()}
        options={{
          ...mockConfigEditorProps().options,
          jsonData: { ...mockConfigEditorProps().options.jsonData, protocol: Protocol.Http },
        }}
      />
    );
    expect(screen.getAllByLabelText('HTTP').pop()).toBeInTheDocument();
    expect(screen.getAllByLabelText('HTTP').pop()).toBeChecked();
  });
  it('without tlsCACert', async () => {
    render(<ConfigEditor {...mockConfigEditorProps()} />);
    expect(screen.queryByPlaceholderText(labels.tlsCACert.placeholder)).not.toBeInTheDocument();
  });
  it('with tlsCACert', async () => {
    render(
      <ConfigEditor
        {...mockConfigEditorProps()}
        options={{
          ...mockConfigEditorProps().options,
          jsonData: { ...mockConfigEditorProps().options.jsonData, tlsAuthWithCACert: true },
        }}
      />
    );
    expect(screen.getByPlaceholderText(labels.tlsCACert.placeholder)).toBeInTheDocument();
  });
  it('without tlsAuth', async () => {
    render(<ConfigEditor {...mockConfigEditorProps()} />);
    expect(screen.queryByPlaceholderText(labels.tlsClientCert.placeholder)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(labels.tlsClientKey.placeholder)).not.toBeInTheDocument();
  });
  it('with tlsAuth', async () => {
    render(
      <ConfigEditor
        {...mockConfigEditorProps()}
        options={{
          ...mockConfigEditorProps().options,
          jsonData: { ...mockConfigEditorProps().options.jsonData, tlsAuth: true },
        }}
      />
    );
    expect(screen.getByPlaceholderText(labels.tlsClientCert.placeholder)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(labels.tlsClientKey.placeholder)).toBeInTheDocument();
  });
  it('with additional properties', async () => {
    const jsonDataOverrides = {
      defaultDatabase: 'default',
      queryTimeout: '100',
      dialTimeout: '100',
      validateSql: true,
      customSettings: [{ setting: 'test-setting', value: 'test-value' }],
      forwardGrafanaHeaders: true,
      enableRowLimit: true,
    };
    render(<ConfigEditor {...mockConfigEditorProps(jsonDataOverrides)} />);
    expect(screen.getByText(labels.secureSocksProxy.label)).toBeInTheDocument();
    expect(screen.getByDisplayValue(jsonDataOverrides.customSettings[0].setting)).toBeInTheDocument();
    expect(screen.getByDisplayValue(jsonDataOverrides.customSettings[0].value)).toBeInTheDocument();
    expect(screen.getByText(labels.enableRowLimit.label)).toBeInTheDocument();
    expect(screen.getByTestId(labels.enableRowLimit.testid)).toBeChecked();
  });
});
