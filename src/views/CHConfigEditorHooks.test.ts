import { DataSourceSettings } from "@grafana/data";
import { renderHook } from "@testing-library/react";
import { CHConfig } from "types/config";
import { useMigrateV3Config } from "./CHConfigEditorHooks";

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
        host: 'new',
        dialTimeout: '8'
      }
    };
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange).toHaveBeenCalledWith(expect.objectContaining(expectedOptions));
  });
});
