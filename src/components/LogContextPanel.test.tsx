import React from 'react';
import { render } from '@testing-library/react';
import LogsContextPanel, { _testExports } from './LogsContextPanel';
import { Components } from 'selectors';

describe('LogsContextPanel', () => {
  it('shows an alert when no columns are matched', () => {
    const result = render(<LogsContextPanel columns={[]} datasourceUid="test-uid" />);
    expect(result.getByTestId(Components.LogsContextPanel.alert)).toBeInTheDocument();
  });

  it('renders LogContextKey components for each column', () => {
    const mockColumns = [
      { name: 'host', value: '127.0.0.1' },
      { name: 'service', value: 'test-api' },
    ];

    const result = render(<LogsContextPanel columns={mockColumns} datasourceUid="test-uid" />);

    expect(result.getAllByTestId(Components.LogsContextPanel.LogsContextKey)).toHaveLength(2);
    expect(result.getByText('host')).toBeInTheDocument();
    expect(result.getByText('127.0.0.1')).toBeInTheDocument();
    expect(result.getByText('service')).toBeInTheDocument();
    expect(result.getByText('test-api')).toBeInTheDocument();
  });
});

describe('LogContextKey', () => {
  const LogContextKey = _testExports.LogContextKey;

  it('renders the expected keys', () => {
    const props = {
      name: 'testName',
      value: 'testValue',
      primaryColor: '#000',
      primaryTextColor: '#aaa',
      secondaryColor: '#111',
      secondaryTextColor: '#bbb',
    };

    
    const result = render(<LogContextKey {...props} />);

    expect(result.getByTestId(Components.LogsContextPanel.LogsContextKey)).toBeInTheDocument();
    expect(result.getByText('testName')).toBeInTheDocument();
    expect(result.getByText('testValue')).toBeInTheDocument();
  });
});

describe('iconMatcher', () => {
  const iconMatcher = _testExports.iconMatcher;

  it('returns correct icons for different context names', () => {
    expect(iconMatcher('database')).toBe('database');
    expect(iconMatcher('???')).toBe('align-left');
  });
});
