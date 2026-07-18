import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { config } from '@grafana/runtime';
import { ConfigEditor } from './CHConfigEditor';
import { createValidationAPI } from './CHConfigEditorHooks';
import { mockConfigEditorProps } from '__mocks__/ConfigEditor';
import '@testing-library/jest-dom';
import { CHConfig, Protocol } from 'types/config';
import allLabels from 'labels';

jest.mock('@grafana/runtime', () => {
  const original = jest.requireActual('@grafana/runtime');
  return {
    ...original,
    config: { buildInfo: { version: '10.0.0' }, secureSocksDSProxyEnabled: true, featureToggles: {} },
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

  it('shows the required-field error on an empty host when config validation is not enabled', () => {
    // On a default install the clickHouseConfigValidation feature toggle is off,
    // so `validation` is undefined. The required host field must still show an
    // inline error when empty (structural fallback), as it did in v4.17.0.
    render(<ConfigEditor {...mockConfigEditorProps({ host: '' } as Partial<CHConfig>)} />);
    expect(screen.getByText(labels.serverAddress.error)).toBeInTheDocument();
  });

  it('hides the required-field error once the host is filled (no validation toggle)', () => {
    render(<ConfigEditor {...mockConfigEditorProps({ host: 'localhost' } as Partial<CHConfig>)} />);
    expect(screen.queryByText(labels.serverAddress.error)).not.toBeInTheDocument();
  });

  describe('with the clickHouseConfigValidation feature toggle enabled', () => {
    const featureToggles = config.featureToggles as Record<string, boolean | undefined>;

    beforeEach(() => {
      featureToggles.clickHouseConfigValidation = true;
    });

    afterEach(() => {
      delete featureToggles.clickHouseConfigValidation;
    });

    it('shows the required-field error on an empty host', () => {
      // Before Grafana 13.1 nothing calls validate() on the local
      // ValidationAPI, so field errors never populate. The structural empty
      // check must still surface the inline error.
      render(<ConfigEditor {...mockConfigEditorProps({ host: '' } as Partial<CHConfig>)} />);
      expect(screen.getByText(labels.serverAddress.error)).toBeInTheDocument();
    });

    it('shows the required-field error on an empty port', () => {
      render(<ConfigEditor {...mockConfigEditorProps({ host: 'localhost', port: 0 } as Partial<CHConfig>)} />);
      expect(screen.getByText(labels.serverPort.error)).toBeInTheDocument();
    });

    it('hides the required-field error once the host is filled', () => {
      render(<ConfigEditor {...mockConfigEditorProps({ host: 'localhost' } as Partial<CHConfig>)} />);
      expect(screen.queryByText(labels.serverAddress.error)).not.toBeInTheDocument();
    });

    it('prefers the validation API error message when one is set', () => {
      const validation = createValidationAPI();
      validation.setError('host', 'Custom validation error');
      render(<ConfigEditor {...mockConfigEditorProps({ host: '' } as Partial<CHConfig>)} validation={validation} />);
      expect(screen.getByText('Custom validation error')).toBeInTheDocument();
      expect(screen.queryByText(labels.serverAddress.error)).not.toBeInTheDocument();
    });
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

  describe('classic mode map keys discovery switch', () => {
    // dialTimeout keeps the collapsible "Additional settings" section
    // initially open so the query settings render.
    const overrides: Partial<CHConfig> = { dialTimeout: '10', enableMapKeysDiscovery: false };

    const getMapKeysSwitch = (): HTMLInputElement => {
      const labelText = screen.getByText(allLabels.components.Config.QuerySettingsConfig.enableMapKeysDiscovery.label);
      // The switch is inside a grafana-ui Field: the input lives in a sibling
      // of the label element, under the shared field container.
      const input = labelText.closest('label')?.parentElement?.parentElement?.querySelector('input[type="checkbox"]');
      if (!(input instanceof HTMLInputElement)) {
        throw new Error('map keys discovery switch not found');
      }
      return input;
    };

    it('reflects a stored enableMapKeysDiscovery=false', () => {
      render(<ConfigEditor {...mockConfigEditorProps(overrides)} />);
      expect(getMapKeysSwitch()).not.toBeChecked();
    });

    it('writes true when toggled back on', () => {
      const props = mockConfigEditorProps(overrides);
      render(<ConfigEditor {...props} />);

      (props.onOptionsChange as jest.Mock).mockClear();
      fireEvent.click(getMapKeysSwitch());

      expect(props.onOptionsChange).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonData: expect.objectContaining({
            enableMapKeysDiscovery: true,
          }),
        })
      );
    });
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
    // The switch is a grafana-ui InlineField: its container div is the direct
    // parent of the label, with the input in a sibling child container.
    const showLogLinksInput = showLogLinksLabel.closest('div')?.querySelector('input');

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
