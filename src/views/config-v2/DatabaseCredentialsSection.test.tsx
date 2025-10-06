import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import { DatabaseCredentialsSection } from './DatabaseCredentialsSection';
import { createTestProps } from './helpers';

describe('DatabaseCredentialsSection', () => {
  const onOptionsChangeMock = jest.fn();
  let consoleSpy: jest.SpyInstance;

  const defaultProps = createTestProps({
    options: {
      jsonData: {
        username: '',
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

  it('renders username and password fields', () => {
    render(<DatabaseCredentialsSection {...defaultProps} />);

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('calls onOptionsChange when username is changed', () => {
    render(<DatabaseCredentialsSection {...defaultProps} />);

    const usernameInput = screen.getByLabelText(/username/i);
    fireEvent.change(usernameInput, { target: { value: 'alice' } });

    expect(onOptionsChangeMock).toHaveBeenCalled();
    const lastArgs = onOptionsChangeMock.mock.lastCall?.[0];
    expect(lastArgs.jsonData?.username).toBe('alice');
  });

  it('calls onOptionsChange when password is changed', () => {
    render(<DatabaseCredentialsSection {...defaultProps} />);

    const passwordInput = screen.getByLabelText(/password/i);
    fireEvent.change(passwordInput, { target: { value: 'secret' } });

    expect(onOptionsChangeMock).toHaveBeenCalled();

    const lastArgs = onOptionsChangeMock.mock.lastCall?.[0];
    expect(lastArgs.secureJsonData?.password).toBe('secret');
  });

  it('resets password when Reset is clicked (isConfigured=true)', () => {
    const configuredProps = createTestProps({
      options: {
        jsonData: {
          username: 'bob',
        },
        secureJsonData: {
          password: 'configured',
        },
        secureJsonFields: {
          password: true,
        },
      },
      mocks: {
        onOptionsChange: onOptionsChangeMock,
      },
    });

    render(<DatabaseCredentialsSection {...configuredProps} />);

    const resetButton = screen.getByRole('button', { name: /reset/i });
    fireEvent.click(resetButton);

    expect(onOptionsChangeMock).toHaveBeenCalled();

    const lastArgs = onOptionsChangeMock.mock.lastCall?.[0];
    expect(lastArgs.secureJsonFields?.password).toBe(false);
    expect(lastArgs.secureJsonData?.password).toBe('');
  });
});
