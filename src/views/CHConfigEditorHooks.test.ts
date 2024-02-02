import { DataSourceSettings } from "@grafana/data";
import { renderHook } from "@testing-library/react";
import { CHConfig, CHHttpHeader, CHSecureConfig, Protocol } from "types/config";
import { onHttpHeadersChange, useConfigDefaults, useMigrateV3Config } from "./CHConfigEditorHooks";
import { pluginVersion } from "utils/version";

describe('useMigrateV3Config', () => {
  it('should not call onOptionsChange if no v3 fields are present', async () => {
    const onOptionsChange = jest.fn();
    const options = {
      jsonData: {
        host: 'new',
        dialTimeout: '8'
      }
    } as any as DataSourceSettings<CHConfig>;

    renderHook(opts => useMigrateV3Config(opts, onOptionsChange), { initialProps: options });

    expect(onOptionsChange).toHaveBeenCalledTimes(0);
  });

  it('should rename v3 fields to latest config names', async () => {
    const onOptionsChange = jest.fn();
    const options = {
      jsonData: {
        server: 'address',
        timeout: '8'
      }
    } as any as DataSourceSettings<CHConfig>;

    renderHook(opts => useMigrateV3Config(opts, onOptionsChange), { initialProps: options });

    const expectedOptions = {
      jsonData: {
        version: pluginVersion,
        host: 'address',
        dialTimeout: '8'
      }
    };
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange).toHaveBeenCalledWith(expect.objectContaining(expectedOptions));
  });

  it('should remove v3 fields without overwriting latest config names', async () => {
    const onOptionsChange = jest.fn();
    const options = {
      jsonData: {
        server: 'old',
        host: 'new',
        timeout: '6',
        dialTimeout: '8'
      }
    } as any as DataSourceSettings<CHConfig>;

    renderHook(opts => useMigrateV3Config(opts, onOptionsChange), { initialProps: options });

    const expectedOptions = {
      jsonData: {
        version: pluginVersion,
        host: 'new',
        dialTimeout: '8'
      }
    };
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange).toHaveBeenCalledWith(expect.objectContaining(expectedOptions));
  });
});

describe('onHttpHeadersChange', () => {
  it('should properly sort headers into secure/plain config fields', async () => {
    const onOptionsChange = jest.fn();
    const headers: CHHttpHeader[] = [
      {
        name: 'X-Existing-Auth-Header',
        value: '',
        secure: true
      },
      {
        name: 'X-Existing-Header',
        value: 'existing value',
        secure: false
      },
      {
        name: 'Authorization',
        value: 'secret1234',
        secure: true
      },
      {
        name: 'X-Custom-Header',
        value: 'plain text value',
        secure: false
      },
    ];
    const opts = {
      jsonData: {
        httpHeaders: [
          {
            name: 'X-Existing-Auth-Header',
            value: '',
            secure: true
          },
          {
            name: 'X-Existing-Header',
            value: 'existing value',
            secure: false
          },
        ]
      },
      secureJsonFields: {
        'secureHttpHeaders.X-Existing-Auth-Header': true
      },
    } as any as DataSourceSettings<CHConfig, CHSecureConfig>;

    onHttpHeadersChange(headers, opts, onOptionsChange);

    const expectedOptions = {
      jsonData: {
        httpHeaders: [
          {
            name: 'X-Existing-Auth-Header',
            value: '',
            secure: true
          },
          {
            name: 'X-Existing-Header',
            value: 'existing value',
            secure: false
          },
          {
            name: 'Authorization',
            value: '',
            secure: true
          },
          {
            name: 'X-Custom-Header',
            value: 'plain text value',
            secure: false
          },
        ]
      },
      secureJsonFields: {
        'secureHttpHeaders.X-Existing-Auth-Header': true,
        'secureHttpHeaders.Authorization': true
      },
      secureJsonData: {
        'secureHttpHeaders.Authorization': 'secret1234'
      }
    };
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange).toHaveBeenCalledWith(expect.objectContaining(expectedOptions));
  });
});

describe('useConfigDefaults', () => {
  it('should add plugin version', async () => {
    const onOptionsChange = jest.fn();
    const options = {
      jsonData: {
        protocol: Protocol.Native,
      }
    } as any as DataSourceSettings<CHConfig>;

    renderHook(opts => useConfigDefaults(opts, onOptionsChange), { initialProps: options });

    const expectedOptions = {
      jsonData: {
        version: pluginVersion,
        protocol: Protocol.Native,
      }
    };
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange).toHaveBeenCalledWith(expect.objectContaining(expectedOptions));
  });

  it('should overwrite plugin version', async () => {
    const onOptionsChange = jest.fn();
    const options = {
      jsonData: {
        version: '3.0.0',
        protocol: Protocol.Native,
      }
    } as any as DataSourceSettings<CHConfig>;

    renderHook(opts => useConfigDefaults(opts, onOptionsChange), { initialProps: options });

    const expectedOptions = {
      jsonData: {
        version: pluginVersion,
        protocol: Protocol.Native,
      }
    };
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange).toHaveBeenCalledWith(expect.objectContaining(expectedOptions));
  });

  it('should apply defaults for unset config fields', async () => {
    const onOptionsChange = jest.fn();
    const options = {
      jsonData: {
      }
    } as any as DataSourceSettings<CHConfig>;

    renderHook(opts => useConfigDefaults(opts, onOptionsChange), { initialProps: options });

    const expectedOptions = {
      jsonData: {
        version: pluginVersion,
        protocol: Protocol.Native,
      }
    };
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange).toHaveBeenCalledWith(expect.objectContaining(expectedOptions));
  });

  it('should not call onOptionsChange after defaults are already set', async () => {
    const onOptionsChange = jest.fn();
    const options = {
      jsonData: {
        pluginVersion,
        protocol: Protocol.Native
      }
    } as any as DataSourceSettings<CHConfig>;

    const hook = renderHook(opts => useConfigDefaults(opts, onOptionsChange), { initialProps: options });
    hook.rerender();

    expect(onOptionsChange).toHaveBeenCalledTimes(1);
  });
});
