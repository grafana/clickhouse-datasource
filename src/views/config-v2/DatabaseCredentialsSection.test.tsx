import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';

import { DatabaseCredentialsSection } from './DatabaseCredentialsSection';
import { createMockValidation, createTestProps } from './helpers';

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

  describe('validation', () => {
    const emptyProps = createTestProps({
      options: {
        jsonData: { username: '' },
        secureJsonData: {},
        secureJsonFields: {},
      },
      mocks: { onOptionsChange: jest.fn() },
    });

    const filledProps = createTestProps({
      options: {
        jsonData: { username: 'default' },
        secureJsonData: {},
        secureJsonFields: {},
      },
      mocks: { onOptionsChange: jest.fn() },
    });

    it('shows inline error for username when validator is called with empty value', async () => {
      const validation = createMockValidation();
      render(<DatabaseCredentialsSection {...emptyProps} validation={validation} />);

      await act(async () => { validation.runValidator(); });

      expect(screen.getByText('Username is required')).toBeInTheDocument();
    });

    it('shows no errors when all fields are filled', async () => {
      const validation = createMockValidation();
      render(<DatabaseCredentialsSection {...filledProps} validation={validation} />);

      await act(async () => { validation.runValidator(); });

      expect(screen.queryByText('Username is required')).not.toBeInTheDocument();
    });
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
