import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import { HttpProtocolSettingsSection } from './HttpProtocolSettingsSection';
import { createTestProps } from './helpers';
import { Protocol } from 'types/config';

describe('HttpProtocolSettingsSection', () => {
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
        onSwitchToggle={jest.fn()}
      />
    );

    expect(screen.queryByLabelText(/path/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /optional http settings/i })).toBeNull();
  });

  it('calls onOptionsChange when HTTP path is changed', () => {
    render(<HttpProtocolSettingsSection {...defaultProps} onSwitchToggle={jest.fn()} />);

    const pathInput = screen.getByLabelText(/path/i);
    fireEvent.change(pathInput, { target: { value: '/api' } });

    expect(onOptionsChangeMock).toHaveBeenCalled();
  });

  it('toggles Optional HTTP settings open/closed via the button (icon changes)', () => {
    render(<HttpProtocolSettingsSection {...defaultProps} onSwitchToggle={jest.fn()} />);

    expect(screen.getByTestId('angle-right')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /optional http settings/i }));

    expect(screen.getByTestId('angle-down')).toBeInTheDocument();
  });

  it('calls onSwitchToggle with forwardGrafanaHeaders=true when checked', () => {
    const onSwitchToggleMock = jest.fn();

    render(<HttpProtocolSettingsSection {...defaultProps} onSwitchToggle={onSwitchToggleMock} />);

    fireEvent.click(screen.getByRole('button', { name: /optional http settings/i }));

    const forwardHeadersCheckbox = screen.getByRole('checkbox', {
      name: /forward grafana http headers to data source/i,
    });

    fireEvent.click(forwardHeadersCheckbox);

    expect(onSwitchToggleMock).toHaveBeenLastCalledWith('forwardGrafanaHeaders', true);
  });
});
