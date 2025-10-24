import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { HttpHeadersConfigV2 } from './HttpHeadersConfigV2';
import { selectors } from 'selectors';
import { Protocol } from 'types/config';
import { createTestProps } from './helpers';

describe('HttpHeadersConfigV2', () => {
  const onHttpHeadersChange = jest.fn();
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

  const renderWith = (overrides?: Partial<React.ComponentProps<typeof HttpHeadersConfigV2>>) => {
    const props: React.ComponentProps<typeof HttpHeadersConfigV2> = {
      ...defaultProps,
      headers: [],
      forwardGrafanaHeaders: false,
      secureFields: {},
      onHttpHeadersChange,
      ...(overrides || {}),
    };
    return render(<HttpHeadersConfigV2 {...props} />);
  };

  beforeEach(() => {
    // Mock console.error to suppress React act() warnings
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('renders top label, Add header button, and forward checkbox', () => {
    renderWith();

    expect(screen.getByText(/custom http headers/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add header/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/forward grafana http headers to data source/i)).toBeInTheDocument();
  });

  it('adds a new header editor when Add header is clicked', () => {
    renderWith();

    const before = screen.queryAllByTestId(selectors.components.Config.HttpHeaderConfig.headerEditor).length;
    fireEvent.click(screen.getByTestId(selectors.components.Config.HttpHeaderConfig.addHeaderButton));
    const after = screen.getAllByTestId(selectors.components.Config.HttpHeaderConfig.headerEditor).length;

    expect(after).toBe(before + 1);
    expect(onHttpHeadersChange).not.toHaveBeenCalled();
  });

  it('renders any initial headers passed in', () => {
    renderWith({
      headers: [
        { name: 'X-Auth', value: 'abc', secure: false },
        { name: 'Foo', value: 'bar', secure: true },
      ],
    });

    const editors = screen.getAllByTestId(selectors.components.Config.HttpHeaderConfig.headerEditor);
    expect(editors.length).toBe(2);
    expect(screen.getAllByTestId(selectors.components.Config.HttpHeaderConfig.headerNameInput)[0]).toHaveValue(
      'X-Auth'
    );
    expect(screen.getAllByTestId(selectors.components.Config.HttpHeaderConfig.headerNameInput)[1]).toHaveValue('Foo');
  });

  it('removes a header and calls onHttpHeadersChange when Remove is clicked', () => {
    renderWith({
      headers: [
        { name: 'A', value: '1', secure: false },
        { name: 'B', value: '2', secure: false },
      ],
    });

    const before = screen.getAllByTestId(selectors.components.Config.HttpHeaderConfig.headerEditor).length;
    const removeButtons = screen.getAllByTestId('trash-alt');
    fireEvent.click(removeButtons[0]);

    expect(onHttpHeadersChange).toHaveBeenCalled();
    const next = onHttpHeadersChange.mock.lastCall?.[0];
    expect(next.length).toBe(before - 1);
    expect(next.find((h: any) => h.name === 'A')).toBeUndefined();
  });

  it('toggles "Forward Grafana headers" and calls onForwardGrafanaHeadersChange', () => {
    renderWith({ forwardGrafanaHeaders: false });

    const forwardCb = screen.getByLabelText(/forward grafana http headers to data source/i) as HTMLInputElement;
    fireEvent.click(forwardCb);

    expect(onOptionsChangeMock).toHaveBeenCalled();
    expect(onOptionsChangeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        jsonData: expect.objectContaining({ forwardGrafanaHeaders: true }),
      })
    );
  });

  describe('HttpHeadersConfigV2', () => {
    const onHttpHeadersChange = jest.fn();
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

    const renderWith = (overrides?: Partial<React.ComponentProps<typeof HttpHeadersConfigV2>>) => {
      const props: React.ComponentProps<typeof HttpHeadersConfigV2> = {
        ...defaultProps,
        headers: [],
        forwardGrafanaHeaders: false,
        secureFields: {},
        onHttpHeadersChange,
        ...(overrides || {}),
      };
      return render(<HttpHeadersConfigV2 {...props} />);
    };

    beforeEach(() => {
      // Mock console.error to suppress React act() warnings
      consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      jest.clearAllMocks();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('renders top label, Add header button, and forward checkbox', () => {
      renderWith();

      expect(screen.getByText(/custom http headers/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add header/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/forward grafana http headers to data source/i)).toBeInTheDocument();
    });

    it('adds a new header editor when Add header is clicked', () => {
      renderWith();

      const before = screen.queryAllByTestId(selectors.components.Config.HttpHeaderConfig.headerEditor).length;
      fireEvent.click(screen.getByTestId(selectors.components.Config.HttpHeaderConfig.addHeaderButton));
      const after = screen.getAllByTestId(selectors.components.Config.HttpHeaderConfig.headerEditor).length;

      expect(after).toBe(before + 1);
      expect(onHttpHeadersChange).not.toHaveBeenCalled();
    });

    it('renders any initial headers passed in', () => {
      renderWith({
        headers: [
          { name: 'X-Auth', value: 'abc', secure: false },
          { name: 'Foo', value: 'bar', secure: true },
        ],
      });

      const editors = screen.getAllByTestId(selectors.components.Config.HttpHeaderConfig.headerEditor);
      expect(editors.length).toBe(2);
      expect(screen.getAllByTestId(selectors.components.Config.HttpHeaderConfig.headerNameInput)[0]).toHaveValue(
        'X-Auth'
      );
      expect(screen.getAllByTestId(selectors.components.Config.HttpHeaderConfig.headerNameInput)[1]).toHaveValue('Foo');
    });

    it('removes a header and calls onHttpHeadersChange when Remove is clicked', () => {
      renderWith({
        headers: [
          { name: 'A', value: '1', secure: false },
          { name: 'B', value: '2', secure: false },
        ],
      });

      const before = screen.getAllByTestId(selectors.components.Config.HttpHeaderConfig.headerEditor).length;
      const removeButtons = screen.getAllByTestId('trash-alt');
      fireEvent.click(removeButtons[0]);

      expect(onHttpHeadersChange).toHaveBeenCalled();
      const next = onHttpHeadersChange.mock.lastCall?.[0];
      expect(next.length).toBe(before - 1);
      expect(next.find((h: any) => h.name === 'A')).toBeUndefined();
    });

    it('toggles "Forward Grafana headers" and updated forwardGrafanaHeaders value to true', () => {
      renderWith({ forwardGrafanaHeaders: false });

      const forwardCb = screen.getByLabelText(/forward grafana http headers to data source/i) as HTMLInputElement;
      fireEvent.click(forwardCb);

      expect(onOptionsChangeMock).toHaveBeenCalled();
      expect(onOptionsChangeMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          jsonData: expect.objectContaining({ forwardGrafanaHeaders: true }),
        })
      );
    });
  });
});
