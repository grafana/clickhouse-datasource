import { DataSourceSettings } from "@grafana/data";
import { useEffect, useRef } from "react";
import { CHConfig } from "types/config";

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
    if (!migrated.current) {
      const nextJsonOptions = { ...options.jsonData };

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
    }
  }, [v3ServerField, v3TimeoutField, options, onOptionsChange]);
};
