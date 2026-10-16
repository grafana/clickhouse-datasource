import { useEffect, useState } from 'react';
import { getBackendSrv } from '@grafana/runtime';

export interface InstanceSettings {
  allowClearTextJWTForwarding: boolean;
}

const defaultInstanceSettings: InstanceSettings = { allowClearTextJWTForwarding: false };

/**
 * Reads the instance-wide Grafana settings the backend reports for this data
 * source. Everything stays off until the backend says otherwise, including
 * when the data source is not saved yet or the call fails.
 */
export const useInstanceSettings = (uid?: string): InstanceSettings => {
  const [settings, setSettings] = useState<InstanceSettings>(defaultInstanceSettings);

  useEffect(() => {
    if (!uid) {
      setSettings(defaultInstanceSettings);
      return;
    }
    let cancelled = false;
    getBackendSrv()
      .get<Partial<InstanceSettings>>(
        `/api/datasources/uid/${encodeURIComponent(uid)}/resources/instance-settings`,
        undefined,
        undefined,
        { showErrorAlert: false }
      )
      .then((res) => {
        if (!cancelled) {
          setSettings({ allowClearTextJWTForwarding: res?.allowClearTextJWTForwarding === true });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSettings(defaultInstanceSettings);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return settings;
};
