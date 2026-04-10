import { DataSourceSettings, KeyValue } from '@grafana/data';
import { useEffect, useRef } from 'react';
import { CHConfig, CHHttpHeader, CHSecureConfig, defaultCHAdditionalSettingsConfig, Protocol } from 'types/config';
import { pluginVersion } from 'utils/version';

/**
 * Mirrors the DataSourceConfigValidationAPI interface from @grafana/data.
 * Defined locally because the type is not yet re-exported from the package index.
 */
export interface ValidationAPI {
  registerValidation: (validator: () => Promise<boolean> | boolean) => () => void;
  validate: () => Promise<boolean>;
  isValid: () => boolean;
  getErrors: () => Record<string, string>;
  setError: (field: string, message: string) => void;
  clearError: (field: string) => void;
}

/**
 * Handles saving HTTP headers to Grafana config.
 *
 * All header keys go to the unsecure config.
 * If the header is marked as secure, its value goes to the
 * secure json config where it is hidden.
 */
export const onHttpHeadersChange = (
  headers: CHHttpHeader[],
  options: DataSourceSettings<CHConfig, CHSecureConfig>,
  onOptionsChange: (opts: DataSourceSettings<CHConfig, CHSecureConfig>) => void
) => {
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
      httpHeaders,
    },
    secureJsonFields: {
      ...options.secureJsonFields,
      ...secureHttpHeaderKeys,
    },
    secureJsonData: {
      ...options.secureJsonData,
      ...secureHttpHeaderValues,
    },
  });
};

/**
 * Applies default settings and migrations to config options.
 */
export const useConfigDefaults = (
  options: DataSourceSettings<CHConfig>,
  onOptionsChange: (opts: DataSourceSettings<CHConfig>) => void
) => {
  const appliedDefaults = useRef<boolean>(false);
  useEffect(() => {
    if (appliedDefaults.current) {
      return;
    }

    const jsonData = { ...options.jsonData };
    jsonData.version = pluginVersion; // Always overwrite version

    // v3 Migration

    const v3ServerField = (jsonData as any)['server'];
    if (v3ServerField && !jsonData.host) {
      jsonData.host = v3ServerField;
    }
    delete (jsonData as any)['server'];

    const v3TimeoutField = (jsonData as any)['timeout'];
    if (v3TimeoutField && !jsonData.dialTimeout) {
      jsonData.dialTimeout = v3TimeoutField;
    }
    delete (jsonData as any)['timeout'];

    // Defaults

    if (!jsonData.protocol) {
      jsonData.protocol = Protocol.Native;
    }

    if (!jsonData.logs || jsonData.logs.defaultTable === undefined) {
      jsonData.logs = {
        ...jsonData.logs,
        defaultTable: defaultCHAdditionalSettingsConfig.logs?.defaultTable,
        selectContextColumns: true,
        contextColumns: [],
      };
    }

    if (!jsonData.traces || jsonData.traces.defaultTable === undefined) {
      jsonData.traces = {
        ...jsonData.traces,
        defaultTable: defaultCHAdditionalSettingsConfig.traces?.defaultTable,
      };
    }

    onOptionsChange({
      ...options,
      jsonData,
    });
    appliedDefaults.current = true;
  }, [options, onOptionsChange]);
};

/**
 * Factory that creates a local DataSourceConfigValidationAPI instance.
 *
 * Used when Grafana core does not yet pass props.validation down to the config
 * editor. Config editors should prefer props.validation when present and fall
 * back to a memoised instance created by this factory:
 *
 *   const validationAPI = useMemo(() => props.validation ?? createValidationAPI(), [props.validation]);
 *
 * Validators registered via registerValidation are run in order when
 * validate() is called. setError / clearError let components push field-level
 * errors imperatively (e.g. on blur or after an async check).
 */
export const createValidationAPI = (): ValidationAPI => {
  const validators = new Set<() => Promise<boolean> | boolean>();
  const errors: Record<string, string> = {};

  return {
    registerValidation(validator: () => Promise<boolean> | boolean): () => void {
      validators.add(validator);
      return () => validators.delete(validator);
    },

    async validate(): Promise<boolean> {
      const results = await Promise.all(Array.from(validators).map((v) => Promise.resolve(v())));
      return results.every(Boolean);
    },

    isValid(): boolean {
      return Object.keys(errors).length === 0;
    },

    getErrors(): Record<string, string> {
      return errors;
    },

    setError(field: string, message: string): void {
      errors[field] = message;
    },

    clearError(field: string): void {
      delete errors[field];
    },
  };
};
