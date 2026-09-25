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

    it('shows username error on blur when empty and no validation API is present', () => {
      render(<DatabaseCredentialsSection {...emptyProps} />);

      fireEvent.blur(screen.getByLabelText(/username/i));

      expect(screen.getByText('Username is required')).toBeInTheDocument();
    });

    it('clears username error once the field is filled and no validation API is present', () => {
      const { rerender } = render(<DatabaseCredentialsSection {...emptyProps} />);

      fireEvent.blur(screen.getByLabelText(/username/i));
      expect(screen.getByText('Username is required')).toBeInTheDocument();

      rerender(<DatabaseCredentialsSection {...filledProps} />);

      expect(screen.queryByText('Username is required')).not.toBeInTheDocument();
    });

    it('shows inline error for username when validator is called with empty value', async () => {
      const validation = createMockValidation();
      render(<DatabaseCredentialsSection {...emptyProps} validation={validation} />);

      await act(async () => {
        validation.runValidator();
      });

      expect(screen.getByText('Username is required')).toBeInTheDocument();
    });

    it('shows no errors when all fields are filled', async () => {
      const validation = createMockValidation();
      render(<DatabaseCredentialsSection {...filledProps} validation={validation} />);

      await act(async () => {
        validation.runValidator();
      });

      expect(screen.queryByText('Username is required')).not.toBeInTheDocument();
    });

    it('still requires username when Forward OAuth Identity is enabled', async () => {
      // Username backs health checks and (when enabled) alert fallback, so it
      // must stay required even with oauthPassThru on — otherwise validation
      // passes but Save & test fails.
      const oauthEmptyProps = createTestProps({
        options: {
          jsonData: { username: '', oauthPassThru: true },
          secureJsonData: {},
          secureJsonFields: {},
        },
        mocks: { onOptionsChange: jest.fn() },
      });
      const validation = createMockValidation();
      render(<DatabaseCredentialsSection {...oauthEmptyProps} validation={validation} />);

      await act(async () => {
        validation.runValidator();
      });

      expect(screen.getByText('Username is required')).toBeInTheDocument();
    });
  });

  it('reflects oauthPassThru=true from jsonData', () => {
    const jwtProps = createTestProps({
      options: {
        jsonData: {
          username: 'default',
          oauthPassThru: true,
        },
        secureJsonData: {},
        secureJsonFields: {},
      },
      mocks: {
        onOptionsChange: onOptionsChangeMock,
      },
    });

    render(<DatabaseCredentialsSection {...jwtProps} />);

    const toggle = screen.getByRole('checkbox', { name: /^forward oauth identity/i });
    expect(toggle).toBeChecked();
  });

  it('sets allowCleartextJWTForwarding when toggled on, and hides it without oauthPassThru', () => {
    render(<DatabaseCredentialsSection {...defaultProps} />);
    expect(screen.queryByRole('checkbox', { name: /^allow cleartext jwt forwarding/i })).not.toBeInTheDocument();

    const jwtProps = createTestProps({
      options: {
        jsonData: {
          username: 'default',
          oauthPassThru: true,
        },
        secureJsonData: {},
        secureJsonFields: {},
      },
      mocks: {
        onOptionsChange: onOptionsChangeMock,
      },
    });

    render(<DatabaseCredentialsSection {...jwtProps} />);

    const toggle = screen.getByRole('checkbox', { name: /^allow cleartext jwt forwarding/i });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);

    const lastArgs = onOptionsChangeMock.mock.lastCall?.[0];
    expect(lastArgs.jsonData?.allowCleartextJWTForwarding).toBe(true);
  });

  it('sets oauthPassThru when toggled on', () => {
    render(<DatabaseCredentialsSection {...defaultProps} />);

    const toggle = screen.getByRole('checkbox', { name: /^forward oauth identity/i });
    fireEvent.click(toggle);

    expect(onOptionsChangeMock).toHaveBeenCalled();
    const lastArgs = onOptionsChangeMock.mock.lastCall?.[0];
    expect(lastArgs.jsonData?.oauthPassThru).toBe(true);
  });

  it('clears oauthPassThru when toggled off', () => {
    const jwtProps = createTestProps({
      options: {
        jsonData: {
          username: 'default',
          oauthPassThru: true,
        },
        secureJsonData: {},
        secureJsonFields: {},
      },
      mocks: {
        onOptionsChange: onOptionsChangeMock,
      },
    });

    render(<DatabaseCredentialsSection {...jwtProps} />);

    const toggle = screen.getByRole('checkbox', { name: /^forward oauth identity/i });
    fireEvent.click(toggle);

    expect(onOptionsChangeMock).toHaveBeenCalled();
    const lastArgs = onOptionsChangeMock.mock.lastCall?.[0];
    expect(lastArgs.jsonData?.oauthPassThru).toBe(false);
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
