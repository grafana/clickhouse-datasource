import React from 'react';
import { render, screen } from '@testing-library/react';
import { ConfigEditor } from './CHConfigEditor';
import { mockConfigEditorProps } from '../__mocks__/ConfigEditor';
import { Components } from './../selectors';
import '@testing-library/jest-dom';
import { Protocol } from '../types';

jest.mock('@grafana/runtime', () => {
  const original = jest.requireActual('@grafana/runtime');
  return {
    ...original,
    config: { buildInfo: { version: '10.0.0' }, featureToggles: { secureSocksDSProxyEnabled: true } },
  };
});

describe('ConfigEditor', () => {
  it('new editor', () => {
    render(<ConfigEditor {...mockConfigEditorProps()} />);
    expect(screen.getByPlaceholderText(Components.ConfigEditor.ServerAddress.placeholder)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(Components.ConfigEditor.ServerPort.placeholder('false'))).toBeInTheDocument();
    expect(screen.getByPlaceholderText(Components.ConfigEditor.Username.placeholder)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(Components.ConfigEditor.Password.placeholder)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(Components.ConfigEditor.Path.placeholder)).toBeInTheDocument();
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
    expect(screen.getByPlaceholderText(Components.ConfigEditor.ServerAddress.placeholder)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(Components.ConfigEditor.ServerPort.placeholder('false'))).toBeInTheDocument();
    expect(screen.getByPlaceholderText(Components.ConfigEditor.Username.placeholder)).toBeInTheDocument();
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
          jsonData: { ...mockConfigEditorProps().options.jsonData, path },
        }}
      />
    );
    expect(screen.queryByPlaceholderText(Components.ConfigEditor.Path.placeholder)).toHaveValue(path);
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
    expect(screen.queryByPlaceholderText(Components.ConfigEditor.ServerPort.placeholder('true'))).toBeInTheDocument();
  });
  it('with protocol', async () => {
    render(
      <ConfigEditor
        {...mockConfigEditorProps()}
        options={{
          ...mockConfigEditorProps().options,
          jsonData: { ...mockConfigEditorProps().options.jsonData, protocol: Protocol.HTTP },
        }}
      />
    );
    expect(screen.getAllByLabelText('HTTP').pop()).toBeInTheDocument();
    expect(screen.getAllByLabelText('HTTP').pop()).toBeChecked();
  });
  it('without tlsCACert', async () => {
    render(<ConfigEditor {...mockConfigEditorProps()} />);
    expect(screen.queryByPlaceholderText(Components.ConfigEditor.TLSCACert.placeholder)).not.toBeInTheDocument();
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
    expect(screen.getByPlaceholderText(Components.ConfigEditor.TLSCACert.placeholder)).toBeInTheDocument();
  });
  it('without tlsAuth', async () => {
    render(<ConfigEditor {...mockConfigEditorProps()} />);
    expect(screen.queryByPlaceholderText(Components.ConfigEditor.TLSClientCert.placeholder)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(Components.ConfigEditor.TLSClientKey.placeholder)).not.toBeInTheDocument();
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
    expect(screen.getByPlaceholderText(Components.ConfigEditor.TLSClientCert.placeholder)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(Components.ConfigEditor.TLSClientKey.placeholder)).toBeInTheDocument();
  });
  it('with additional properties', async () => {
    const jsonDataOverrides = {
      defaultDatabase: 'default',
      queryTimeout: '100',
      timeout: '100',
      validate: true,
      enableSecureSocksProxy: true,
      customSettings: [{ setting: 'test-setting', value: 'test-value' }],
      forwardHeaders: true,
    };
    render(<ConfigEditor {...mockConfigEditorProps(jsonDataOverrides)} />);
    expect(screen.getByPlaceholderText(Components.ConfigEditor.DefaultDatabase.placeholder)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(Components.ConfigEditor.QueryTimeout.placeholder)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(Components.ConfigEditor.Timeout.placeholder)).toBeInTheDocument();
    expect(screen.getByText(Components.ConfigEditor.Validate.label)).toBeInTheDocument();
    expect(screen.getByText(Components.ConfigEditor.SecureSocksProxy.label)).toBeInTheDocument();
    expect(screen.getByDisplayValue(jsonDataOverrides.customSettings[0].setting)).toBeInTheDocument();
    expect(screen.getByDisplayValue(jsonDataOverrides.customSettings[0].value)).toBeInTheDocument();
    expect(screen.getByText(Components.ConfigEditor.ForwardHeaders.label)).toBeInTheDocument();
  });
});
