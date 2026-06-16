import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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

  it('renders single-table logs configuration', () => {
    render(
      <ConfigEditor
        {...mockConfigEditorProps({
          configMode: 'single-table',
          signalType: 'logs',
          logs: {
            defaultDatabase: 'otel_v2',
            defaultTable: 'otel_logs',
            otelEnabled: true,
            otelVersion: '1.29.0',
          },
        })}
      />
    );

    expect(screen.getByText('Configuration Mode')).toBeInTheDocument();
    expect(screen.getByText('Signal type')).toBeInTheDocument();
    expect(screen.getByText('Logs Table & Schema')).toBeInTheDocument();
    expect(screen.getByDisplayValue('otel_v2')).toBeInTheDocument();
    expect(screen.getByDisplayValue('otel_logs')).toBeInTheDocument();
    expect(screen.getByText(allLabels.components.OtelVersionSelect.label)).toBeInTheDocument();
    expect(screen.getByText(allLabels.components.Config.LogsConfig.traceIdCorrelation.title)).toBeInTheDocument();
    expect(
      screen.getByText(allLabels.components.Config.LogsConfig.traceIdCorrelation.showLogLinks.label)
    ).toBeInTheDocument();
  });

  it('defaults to logs when switching to single-table mode', () => {
    const props = mockConfigEditorProps({ configMode: 'classic' });
    render(<ConfigEditor {...props} />);

    (props.onOptionsChange as jest.Mock).mockClear();
    fireEvent.click(screen.getByText('Single table'));

    expect(props.onOptionsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonData: expect.objectContaining({
          configMode: 'single-table',
          signalType: 'logs',
        }),
      })
    );
  });

  it('persists the single-table logs trace correlation setting', () => {
    const props = mockConfigEditorProps({
      configMode: 'single-table',
      signalType: 'logs',
      logs: {
        defaultTable: 'otel_logs',
        otelVersion: '1.29.0',
        showLogLinks: true,
      },
    });
    render(<ConfigEditor {...props} />);

    (props.onOptionsChange as jest.Mock).mockClear();
    const showLogLinksLabel = screen.getByText(
      allLabels.components.Config.LogsConfig.traceIdCorrelation.showLogLinks.label
    );
    const showLogLinksInput = showLogLinksLabel.closest('.gf-form')?.querySelector('input');

    expect(showLogLinksInput).toBeChecked();
    fireEvent.click(showLogLinksInput!);

    expect(props.onOptionsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonData: expect.objectContaining({
          logs: expect.objectContaining({
            showLogLinks: false,
          }),
        }),
      })
    );
  });
});
