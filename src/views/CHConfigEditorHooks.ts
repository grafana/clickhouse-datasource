import { DataSourceSettings, KeyValue } from "@grafana/data";
import { useEffect, useRef } from "react";
import { CHConfig, CHHttpHeader, CHSecureConfig } from "types/config";
// import { getLatestVersion } from "otel";
import { pluginVersion } from "utils/version";

/**
 * Migrates v3 config to latest config schema.
 * Copies and removes old "server" to "host" field
 * Copies and removes old "timeout" to "dialTimeout" field
 */
export const useMigrateV3Config = (options: DataSourceSettings<CHConfig, CHSecureConfig>, onOptionsChange: (opts: DataSourceSettings<CHConfig, CHSecureConfig>) => void) => {
  const { jsonData } = options;
  const v3ServerField = (jsonData as any)['server'];
  const v3TimeoutField = (jsonData as any)['timeout'];

  const migrated = useRef<boolean>(!v3ServerField && !v3TimeoutField);
  useEffect(() => {
    if (migrated.current) {
      return;
    }
    const nextJsonOptions = { ...options.jsonData };
    nextJsonOptions.version = pluginVersion;

    if (v3ServerField && !nextJsonOptions.host) {
      nextJsonOptions.host = v3ServerField;
    }
    delete (nextJsonOptions as any)['server'];

    if (v3TimeoutField && !nextJsonOptions.dialTimeout) {
      nextJsonOptions.dialTimeout = v3TimeoutField;
    }
    delete (nextJsonOptions as any)['timeout'];

    onOptionsChange({
      ...options,
      jsonData: nextJsonOptions,
    });
    migrated.current = true;
  }, [v3ServerField, v3TimeoutField, options, onOptionsChange]);
};

/**
 * Handles saving HTTP headers to Grafana config.
 * 
 * All header keys go to the unsecure config.
 * If the header is marked as secure, its value goes to the
 * secure json config where it is hidden.
 */
export const onHttpHeadersChange = (headers: CHHttpHeader[], options: DataSourceSettings<CHConfig, CHSecureConfig>, onOptionsChange: (opts: DataSourceSettings<CHConfig, CHSecureConfig>) => void) => {
  const httpHeaders: CHHttpHeader[] = [];
  const secureHttpHeaderKeys: KeyValue<boolean> = {};
  const secureHttpHeaderValues: KeyValue<string> = {};

  for (let header of headers) {
    if (!header.name) {
      continue;
    }

    if (header.secure) {
      const key = `secureHttpHeaders.${header.name}`;
      secureHttpHeaderKeys[key] = true;

      if (header.value) {
        secureHttpHeaderValues[key] = header.value;
        header.value = '';
      }
    }

    httpHeaders.push(header);
  }

  const currentSecureJsonFields: KeyValue<boolean> = { ...options.secureJsonFields };
  for (let key in currentSecureJsonFields) {
    if (!secureHttpHeaderKeys[key] && key.startsWith('secureHttpHeaders.')) {
      // Remove key from secureJsonData when it is no longer present in header config
      secureHttpHeaderKeys[key] = false;
      secureHttpHeaderValues[key] = '';
    }
  }

  onOptionsChange({
    ...options,
    jsonData: {
      ...options.jsonData,
      httpHeaders
    },
    secureJsonFields: {
      ...options.secureJsonFields,
      ...secureHttpHeaderKeys
    },
    secureJsonData: {
      ...options.secureJsonData,
      ...secureHttpHeaderValues
    },
  });
}

/**
 * Applies default settings to config options.
 */
export const useConfigDefaults = (options: DataSourceSettings<CHConfig>, onOptionsChange: (opts: DataSourceSettings<CHConfig>) => void) => {
  const appliedDefaults = useRef<boolean>(false);
  useEffect(() => {
    if (appliedDefaults.current) {
      return;
    }

    const jsonData = { ...options.jsonData };
    jsonData.version = pluginVersion; // Always overwrite version
    // const latestOtelVersion = getLatestVersion();

    // TODO: Should OTel be enabled by default for new datasources?

    if (!jsonData.logs) {
      jsonData.logs = {
        // defaultTable: latestOtelVersion.logsTable,
        // otelEnabled: true,
        // otelVersion: latestOtelVersion.version
      };
    }

    if (!jsonData.traces) {
      jsonData.traces = {
        // defaultTable: latestOtelVersion.traceTable,
        // otelEnabled: true,
        // otelVersion: latestOtelVersion.version
      };
    }

    onOptionsChange({
      ...options,
      jsonData,
    });
    appliedDefaults.current = true;
  }, [options, onOptionsChange]);
}
