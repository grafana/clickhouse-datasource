import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConfigurationModeSection } from './ConfigurationModeSection';
import { createTestProps } from './helpers';

describe('ConfigurationModeSection', () => {
  const onOptionsChangeMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('defaults to logs when switching to single source mode', () => {
    const props = createTestProps({
      options: {
        jsonData: {
          configMode: 'classic',
        },
      },
      mocks: {
        onOptionsChange: onOptionsChangeMock,
      },
    });

    render(<ConfigurationModeSection {...props} />);
    fireEvent.click(screen.getByText('Single source'));

    expect(onOptionsChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonData: expect.objectContaining({
          configMode: 'single-table',
          signalType: 'logs',
        }),
      })
    );
  });

  it('renders focused logs configuration in single source mode', () => {
    const props = createTestProps({
      options: {
        jsonData: {
          configMode: 'single-table',
          signalType: 'logs',
          logs: {
            defaultDatabase: 'otel_v2',
            defaultTable: 'otel_logs',
          },
        },
      },
      mocks: {
        onOptionsChange: onOptionsChangeMock,
      },
    });

    render(<ConfigurationModeSection {...props} />);

    expect(screen.getByText('Signal type')).toBeInTheDocument();
    expect(screen.getByText('Logs Table & Schema')).toBeInTheDocument();
    expect(screen.getByDisplayValue('otel_v2')).toBeInTheDocument();
    expect(screen.getByDisplayValue('otel_logs')).toBeInTheDocument();
    expect(screen.queryByText('Traces Table & Schema')).not.toBeInTheDocument();
  });

  it('updates the selected signal type', () => {
    const props = createTestProps({
      options: {
        jsonData: {
          configMode: 'single-table',
          signalType: 'logs',
        },
      },
      mocks: {
        onOptionsChange: onOptionsChangeMock,
      },
    });

    render(<ConfigurationModeSection {...props} />);
    fireEvent.click(screen.getByText('Traces'));

    expect(onOptionsChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonData: expect.objectContaining({
          configMode: 'single-table',
          signalType: 'traces',
        }),
      })
    );
  });

  it('does not render the focused source configuration in classic mode', () => {
    const props = createTestProps({
      options: {
        jsonData: {
          configMode: 'classic',
        },
      },
      mocks: {
        onOptionsChange: onOptionsChangeMock,
      },
    });

    render(<ConfigurationModeSection {...props} />);

    expect(screen.queryByText('Signal type')).not.toBeInTheDocument();
    expect(screen.queryByText('Logs Table & Schema')).not.toBeInTheDocument();
    expect(screen.queryByText('Traces Table & Schema')).not.toBeInTheDocument();
  });
});
