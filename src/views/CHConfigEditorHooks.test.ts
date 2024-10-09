import { DataSourceSettings } from "@grafana/data";
import { renderHook } from "@testing-library/react";
import { CHConfig, CHHttpHeader, CHSecureConfig, Protocol } from "types/config";
import { onHttpHeadersChange, useConfigDefaults } from "./CHConfigEditorHooks";
import { pluginVersion } from "utils/version";
import { defaultLogsTable, defaultTraceTable } from "otel";

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
  const expectedDefaults: Partial<CHConfig> = {
    version: pluginVersion,
    protocol: Protocol.Native,
    logs: {
      defaultTable: defaultLogsTable,
      selectContextColumns: true,
      contextColumns: []
    },
    traces: {
      defaultTable: defaultTraceTable
    }
  };

  it('should rename v3 fields to latest config names', async () => {
    const onOptionsChange = jest.fn();
    const options = {
      jsonData: {
        server: 'address',
        timeout: '8'
      }
    } as any as DataSourceSettings<CHConfig>;

    renderHook(opts => useConfigDefaults(opts, onOptionsChange), { initialProps: options });

    const expectedOptions = {
      jsonData: {
        ...expectedDefaults,
        host: 'address',
        dialTimeout: '8'
      }
    };
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange).toHaveBeenCalledWith(expect.objectContaining(expectedOptions));
  });

  it('should rename v3 fields to latest config names if only server name is present', async () => {
    const onOptionsChange = jest.fn();
    const options = {
      jsonData: {
        server: 'address'
      }
    } as any as DataSourceSettings<CHConfig>;

    renderHook(opts => useConfigDefaults(opts, onOptionsChange), { initialProps: options });

    const expectedOptions = {
      jsonData: {
        ...expectedDefaults,
        host: 'address'
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

    renderHook(opts => useConfigDefaults(opts, onOptionsChange), { initialProps: options });

    const expectedOptions = {
      jsonData: {
        ...expectedDefaults,
        host: 'new',
        dialTimeout: '8'
      }
    };
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange).toHaveBeenCalledWith(expect.objectContaining(expectedOptions));
  });

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
        ...expectedDefaults,
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
        ...expectedDefaults,
        version: pluginVersion,
        protocol: Protocol.Native,
      }
    };
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange).toHaveBeenCalledWith(expect.objectContaining(expectedOptions));
  });

  it('should not overwrite existing settings', async () => {
    const onOptionsChange = jest.fn();
    const options = {
      jsonData: {
        host: 'existing',
        dialTimeout: 20,
        protocol: Protocol.Http,
        logs: {
          defaultTable: 'not_default_logs'
        },
        traces: {
          defaultTable: '' // empty
        }
      }
    } as any as DataSourceSettings<CHConfig>;

    renderHook(opts => useConfigDefaults(opts, onOptionsChange), { initialProps: options });

    const expectedOptions = {
      jsonData: {
        ...expectedDefaults,
        host: 'existing',
        dialTimeout: 20,
        protocol: Protocol.Http,
        logs: {
          defaultTable: 'not_default_logs'
        },
        traces: {
          defaultTable: ''
        }
      }
    };
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange).toHaveBeenCalledWith(expect.objectContaining(expectedOptions));
  });

  it('should apply defaults for unset config fields', async () => {
    const onOptionsChange = jest.fn();
    const options = {
      jsonData: {}
    } as any as DataSourceSettings<CHConfig>;

    renderHook(opts => useConfigDefaults(opts, onOptionsChange), { initialProps: options });

    const expectedOptions = {
      jsonData: { ...expectedDefaults }
    };
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange).toHaveBeenCalledWith(expect.objectContaining(expectedOptions));
  });

  it('should not call onOptionsChange after defaults are already set', async () => {
    const onOptionsChange = jest.fn();
    const options = {
      jsonData: {}
    } as any as DataSourceSettings<CHConfig>;

    const hook = renderHook(opts => useConfigDefaults(opts, onOptionsChange), { initialProps: options });
    hook.rerender();

    expect(onOptionsChange).toHaveBeenCalledTimes(1);
  });
});
