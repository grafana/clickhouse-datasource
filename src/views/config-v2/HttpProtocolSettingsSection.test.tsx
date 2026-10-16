import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import { HttpProtocolSettingsSection } from './HttpProtocolSettingsSection';
import { createTestProps } from './helpers';
import { Protocol } from 'types/config';
import allLabels from './labelsV2';

describe('HttpProtocolSettingsSection', () => {
  const labels = allLabels.components.Config.ConfigEditor;
  const onOptionsChangeMock = jest.fn();
  let consoleSpy: jest.SpyInstance;

  const defaultProps = createTestProps({
    options: {
      jsonData: {
        protocol: Protocol.Http,
        path: '/',
        httpHeaders: [],
        forwardGrafanaHeaders: false,
      },
      secureJsonData: {},
      secureJsonFields: {},
    },
    mocks: {
      onOptionsChange: onOptionsChangeMock,
    },
  });

  beforeEach(() => {
    // Mock console.error to suppress React act() warnings
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('renders nothing when protocol is not HTTP', () => {
    render(
      <HttpProtocolSettingsSection
        {...defaultProps}
        options={{
          ...defaultProps.options,
          jsonData: { ...defaultProps.options.jsonData, protocol: Protocol.Native },
        }}
      />
    );

    expect(screen.queryByLabelText(/path/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /optional http settings/i })).toBeNull();
  });

  it('calls onOptionsChange when HTTP path is changed', () => {
    render(<HttpProtocolSettingsSection {...defaultProps} />);

    const pathInput = screen.getByLabelText(/path/i);
    fireEvent.change(pathInput, { target: { value: '/api' } });

    expect(onOptionsChangeMock).toHaveBeenCalled();
  });

  it('toggles Optional HTTP settings open/closed via the button (icon changes)', () => {
    render(<HttpProtocolSettingsSection {...defaultProps} />);

    expect(screen.getByTestId('angle-right')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /optional http settings/i }));

    expect(screen.getByTestId('angle-down')).toBeInTheDocument();
  });

  it('shows the stop canceled queries switch off by default under Optional HTTP settings', () => {
    render(<HttpProtocolSettingsSection {...defaultProps} />);

    expect(screen.queryByTestId(labels.killQueryOnCancel.testid)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /optional http settings/i }));

    expect(screen.getByText(labels.killQueryOnCancel.label)).toBeInTheDocument();
    expect(screen.getByTestId(labels.killQueryOnCancel.testid)).not.toBeChecked();
  });

  it('opens Optional HTTP settings with the switch on when killQueryOnCancel is stored', () => {
    render(
      <HttpProtocolSettingsSection
        {...defaultProps}
        options={{
          ...defaultProps.options,
          jsonData: { ...defaultProps.options.jsonData, killQueryOnCancel: true },
        }}
      />
    );

    expect(screen.getByTestId(labels.killQueryOnCancel.testid)).toBeChecked();
  });

  it('writes killQueryOnCancel when the switch is turned on', () => {
    render(<HttpProtocolSettingsSection {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /optional http settings/i }));

    fireEvent.click(screen.getByTestId(labels.killQueryOnCancel.testid));

    expect(onOptionsChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({ jsonData: expect.objectContaining({ killQueryOnCancel: true }) })
    );
  });
});
