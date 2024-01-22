import { DataSourceSettings } from "@grafana/data";
// import { getLatestVersion } from "otel";
import { useEffect, useRef } from "react";
import { CHConfig } from "types/config";
import { pluginVersion } from "utils/version";

/**
 * Migrates v3 config to latest config schema.
 * Copies and removes old "server" to "host" field
 * Copies and removes old "timeout" to "dialTimeout" field
 */
export const useMigrateV3Config = (options: DataSourceSettings<CHConfig>, onOptionsChange: (opts: DataSourceSettings<CHConfig>) => void) => {
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
      // jsonData.logs = {
      //   defaultTable: latestOtelVersion.logsTable,
      //   otelEnabled: true,
      //   otelVersion: latestOtelVersion.version
      // };
    }

    if (!jsonData.traces) {
      // jsonData.traces = {
      //   defaultTable: latestOtelVersion.traceTable,
      //   otelEnabled: true,
      //   otelVersion: latestOtelVersion.version
      // };
    }

    onOptionsChange({
      ...options,
      jsonData,
    });
    appliedDefaults.current = true;
  }, [options, onOptionsChange]);
};
