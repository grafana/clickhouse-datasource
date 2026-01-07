import React from 'react';
import { render, fireEvent, renderHook } from '@testing-library/react';
import { HttpHeadersConfig, useConfiguredSecureHttpHeaders } from './HttpHeadersConfig';
import { selectors as allSelectors } from 'selectors';
import { CHHttpHeader } from 'types/config';
import { KeyValue } from '@grafana/data';

describe('HttpHeadersConfig', () => {
  const selectors = allSelectors.components.Config.HttpHeaderConfig;

  it('should render', () => {
    const result = render(
      <HttpHeadersConfig
        headers={[]}
        secureFields={{}}
        onHttpHeadersChange={() => {}}
        onForwardGrafanaHeadersChange={() => {}}
        onLogHeadersAsCommentChange={() => {}}
        onLogHeadersAsCommentRegexChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
  });

  it('should not call onHttpHeadersChange when header is added', () => {
    const onHttpHeadersChange = jest.fn();
    const onForwardGrafanaHeadersChange = jest.fn();
    const result = render(
      <HttpHeadersConfig
        headers={[]}
        secureFields={{}}
        onHttpHeadersChange={onHttpHeadersChange}
        onForwardGrafanaHeadersChange={onForwardGrafanaHeadersChange}
        onLogHeadersAsCommentChange={() => {}}
        onLogHeadersAsCommentRegexChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const addHeaderButton = result.getByTestId(selectors.addHeaderButton);
    expect(addHeaderButton).toBeInTheDocument();
    fireEvent.click(addHeaderButton);

    expect(onHttpHeadersChange).toHaveBeenCalledTimes(0);
  });

  it('should call onHttpHeadersChange when header is updated', () => {
    const onHttpHeadersChange = jest.fn();
    const onForwardGrafanaHeadersChange = jest.fn();
    const result = render(
      <HttpHeadersConfig
        headers={[]}
        secureFields={{}}
        onHttpHeadersChange={onHttpHeadersChange}
        onForwardGrafanaHeadersChange={onForwardGrafanaHeadersChange}
        onLogHeadersAsCommentChange={() => {}}
        onLogHeadersAsCommentRegexChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const addHeaderButton = result.getByTestId(selectors.addHeaderButton);
    expect(addHeaderButton).toBeInTheDocument();
    fireEvent.click(addHeaderButton);

    const headerEditor = result.getByTestId(selectors.headerEditor);
    expect(headerEditor).toBeInTheDocument();

    const headerNameInput = result.getByTestId(selectors.headerNameInput);
    expect(headerNameInput).toBeInTheDocument();
    fireEvent.change(headerNameInput, { target: { value: 'x-test ' } }); // with space in name
    fireEvent.blur(headerNameInput);
    expect(headerNameInput).toHaveValue('x-test ');
    expect(onHttpHeadersChange).toHaveBeenCalledTimes(1);

    const headerValueInput = result.getByTestId(selectors.headerValueInput);
    expect(headerValueInput).toBeInTheDocument();
    fireEvent.change(headerValueInput, { target: { value: 'test value' } });
    fireEvent.blur(headerValueInput);
    expect(headerValueInput).toHaveValue('test value');
    expect(onHttpHeadersChange).toHaveBeenCalledTimes(2);

    const headerSecureSwitch = result.getByTestId(selectors.headerSecureSwitch);
    expect(headerSecureSwitch).toBeInTheDocument();
    fireEvent.click(headerSecureSwitch);
    fireEvent.blur(headerSecureSwitch);
    expect(onHttpHeadersChange).toHaveBeenCalledTimes(3);

    const expected: CHHttpHeader[] = [
      { name: 'x-test', value: 'test value', secure: true }, // without space in name
    ];
    expect(onHttpHeadersChange).toHaveBeenCalledWith(expect.objectContaining(expected));
  });

  it('should call onHttpHeadersChange when header is removed', () => {
    const onHttpHeadersChange = jest.fn();
    const onForwardGrafanaHeadersChange = jest.fn();
    const result = render(
      <HttpHeadersConfig
        headers={[
          { name: 'x-test', value: 'test value', secure: false },
          { name: 'x-test-2', value: 'test value 2', secure: false },
        ]}
        secureFields={{}}
        onHttpHeadersChange={onHttpHeadersChange}
        onForwardGrafanaHeadersChange={onForwardGrafanaHeadersChange}
        onLogHeadersAsCommentChange={() => {}}
        onLogHeadersAsCommentRegexChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const removeHeaderButton = result.getAllByTestId(selectors.removeHeaderButton)[0]; // Get 1st
    expect(removeHeaderButton).toBeInTheDocument();
    fireEvent.click(removeHeaderButton);

    const expected: CHHttpHeader[] = [{ name: 'x-test-2', value: 'test value 2', secure: false }];
    expect(onHttpHeadersChange).toHaveBeenCalledTimes(1);
    expect(onHttpHeadersChange).toHaveBeenCalledWith(expect.objectContaining(expected));
  });
});

describe('useConfiguredSecureHttpHeaders', () => {
  it('returns unique set of secure header keys', async () => {
    const fields: KeyValue<boolean> = {
      otherKey: true,
      otherOtherKey: false,
      'secureHttpHeaders.a': true,
      'secureHttpHeaders.b': true,
      'secureHttpHeaders.c': false,
    };

    const hook = renderHook(() => useConfiguredSecureHttpHeaders(fields));
    const result = hook.result.current;

    expect(result.size).toBe(2);
    expect(result.has('a')).toBe(true);
    expect(result.has('b')).toBe(true);
    expect(result.has('c')).toBe(false);
  });
});

describe('forwardGrafanaHTTPHeaders', () => {
  const selectors = allSelectors.components.Config.HttpHeaderConfig;

  it('should call onForwardGrafanaHeadersChange when switch is clicked', () => {
    const onHttpHeadersChange = jest.fn();
    const onForwardGrafanaHeadersChange = jest.fn();
    const result = render(
      <HttpHeadersConfig
        headers={[]}
        secureFields={{}}
        onHttpHeadersChange={onHttpHeadersChange}
        onForwardGrafanaHeadersChange={onForwardGrafanaHeadersChange}
        onLogHeadersAsCommentChange={() => {}}
        onLogHeadersAsCommentRegexChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const forwardGrafanaHeadersSwitch = result.getByTestId(selectors.forwardGrafanaHeadersSwitch);
    expect(forwardGrafanaHeadersSwitch).toBeInTheDocument();
    fireEvent.click(forwardGrafanaHeadersSwitch);
    expect(onForwardGrafanaHeadersChange).toHaveBeenCalledTimes(1);
  });
});

describe('logHeadersAsComment', () => {
  const selectors = allSelectors.components.Config.HttpHeaderConfig;

  it('should call onLogHeadersAsCommentChange when switch is clicked', () => {
    const onHttpHeadersChange = jest.fn();
    const onForwardGrafanaHeadersChange = jest.fn();
    const onLogHeadersAsCommentChange = jest.fn();
    const result = render(
      <HttpHeadersConfig
        headers={[]}
        secureFields={{}}
        onHttpHeadersChange={onHttpHeadersChange}
        onForwardGrafanaHeadersChange={onForwardGrafanaHeadersChange}
        onLogHeadersAsCommentChange={onLogHeadersAsCommentChange}
        onLogHeadersAsCommentRegexChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const logHeadersAsCommentSwitch = result.getByTestId(selectors.logHeadersAsCommentSwitch);
    expect(logHeadersAsCommentSwitch).toBeInTheDocument();
    fireEvent.click(logHeadersAsCommentSwitch);
    expect(onLogHeadersAsCommentChange).toHaveBeenCalledTimes(1);
    expect(onLogHeadersAsCommentChange).toHaveBeenCalledWith(true);
  });

  it('should call onLogHeadersAsCommentRegexChange when input is changed', () => {
    const onHttpHeadersChange = jest.fn();
    const onForwardGrafanaHeadersChange = jest.fn();
    const onLogHeadersAsCommentChange = jest.fn();
    const onLogHeadersAsCommentRegexChange = jest.fn();
    const result = render(
      <HttpHeadersConfig
        headers={[]}
        secureFields={{}}
        logHeadersAsComment={true}
        onHttpHeadersChange={onHttpHeadersChange}
        onForwardGrafanaHeadersChange={onForwardGrafanaHeadersChange}
        onLogHeadersAsCommentChange={onLogHeadersAsCommentChange}
        onLogHeadersAsCommentRegexChange={onLogHeadersAsCommentRegexChange}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const logHeadersAsCommentRegexInput = result.getByTestId(selectors.logHeadersAsCommentRegexInput);
    expect(logHeadersAsCommentRegexInput).toBeInTheDocument();
    fireEvent.change(logHeadersAsCommentRegexInput, { target: { value: 'test' } });
    expect(onLogHeadersAsCommentRegexChange).toHaveBeenCalledTimes(1);
    expect(onLogHeadersAsCommentRegexChange).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ value: 'test' }),
      })
    );
  });
});
