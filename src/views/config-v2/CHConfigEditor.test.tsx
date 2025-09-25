import React from 'react';
import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';

import { ConfigEditor } from './CHConfigEditor';
import { createTestProps } from './helpers';

jest.mock('./LeftSidebar', () => ({
  LeftSidebar: () => <div data-testid="left-sidebar" />,
}));

jest.mock('./ServerAndEncryptionSection', () => ({
  ServerAndEncryptionSection: () => <div data-testid="server-encryption-section" />,
}));

describe('ConfigEditor', () => {
  const defaultProps = createTestProps({
    options: {
      jsonData: {},
      secureJsonData: {},
      secureJsonFields: {},
    },
    mocks: {
      onOptionsChange: jest.fn(),
    },
  });

  it('renders the LeftSideBar, ServerAndEncryptionSection, and HttpProtocolSettingsSection', () => {
    render(<ConfigEditor {...defaultProps} />);

    expect(screen.getByTestId('left-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('server-encryption-section')).toBeInTheDocument();
  });

  it.skip('shows the informational alert', () => {
    render(<ConfigEditor {...defaultProps} />);
    expect(screen.getByText(/You are viewing a new design/i)).toBeInTheDocument();
  });
});
