import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import { ServerAndEncryptionSection } from './ServerAndEncryptionSection';
import { createTestProps } from './helpers';
import { Protocol } from 'types/config';

describe('ServerAndEncryptionSection', () => {
  const onOptionsChangeMock = jest.fn();
  let consoleSpy: jest.SpyInstance;

  const defaultProps = createTestProps({
    options: {
      jsonData: {
        host: '',
        secure: false,
        protocol: Protocol.Native,
        port: undefined,
        pdcInjected: false,
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

  it('calls onOptionsChange when server host address is changed', () => {
    render(<ServerAndEncryptionSection {...defaultProps} />);

    const input = screen.getByTestId('clickhouse-v2-config-host-input');
    fireEvent.change(input, { target: { value: 'clickhouse-example.com' } });

    expect(onOptionsChangeMock).toHaveBeenCalled();
  });

  it('updates protocol on radio toggle', () => {
    render(<ServerAndEncryptionSection {...defaultProps} />);

    const httpOption = screen.getByRole('radio', { name: /http/i });
    fireEvent.click(httpOption);

    expect(onOptionsChangeMock).toHaveBeenCalled();
    expect(onOptionsChangeMock.mock.lastCall[0].jsonData.protocol).toBe(Protocol.Http);
  });

  it('calls onOptionsChange when server port is changed', () => {
    render(<ServerAndEncryptionSection {...defaultProps} />);

    const input = screen.getByTestId('clickhouse-v2-config-port-input');
    fireEvent.change(input, { target: { value: 9000 } });

    expect(onOptionsChangeMock).toHaveBeenCalled();
  });

  it('updates secure state on switch toggle', async () => {
    render(<ServerAndEncryptionSection {...defaultProps} />);

    const secureSwitch = screen.getByRole('checkbox', { name: /secure connection/i });
    await fireEvent.click(secureSwitch);

    expect(onOptionsChangeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        jsonData: expect.objectContaining({ secure: true }),
      })
    );
  });
});
