import React, { useEffect, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Icon, Input, Select, useStyles2 } from '@grafana/ui';
import { Datasource } from 'data/CHDatasource';
import { SignalType } from 'types/config';

export type CompactMode = 'otel-logs' | 'otel-traces' | 'raw-sql';

interface CompactModeBarProps {
  datasource: Datasource;
  signalType: SignalType | undefined;
  mode: CompactMode | undefined;
  onModeChange: (mode: CompactMode) => void;
  searchText: string;
  onSearchChange: (text: string) => void;
  onSearchSubmit: () => void;
}

const getStyles = (theme: GrafanaTheme2) => ({
  bar: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(0.75)};
    padding: ${theme.spacing(0.5)} 0;
  `,
  searchWrapper: css`
    flex: 1;
    min-width: 200px;
  `,
});

export function getDefaultCompactMode(signalType: SignalType | undefined): CompactMode | undefined {
  if (signalType === 'logs') {
    return 'otel-logs';
  }
  if (signalType === 'traces') {
    return 'otel-traces';
  }
  return undefined;
}

export function getModeOptions(
  signalType: SignalType | undefined,
  datasource: Datasource
): Array<{ label: string; value: CompactMode; description?: string }> {
  const hasOtelLogs = Boolean(datasource.getLogsOtelVersion() && datasource.getDefaultLogsTable());
  const hasOtelTraces = Boolean(datasource.getTraceOtelVersion() && datasource.getDefaultTraceTable());
  const options: Array<{ label: string; value: CompactMode; description?: string }> = [];

  if (signalType === 'logs' || (!signalType && hasOtelLogs)) {
    options.push({ label: 'OTEL Logs', value: 'otel-logs' });
  }
  if (signalType === 'traces' || (!signalType && hasOtelTraces)) {
    options.push({ label: 'OTEL Traces', value: 'otel-traces' });
  }
  if (!signalType) {
    options.push({ label: 'Raw SQL', value: 'raw-sql' });
  }
  return options;
}

export const CompactModeBar = (props: CompactModeBarProps) => {
  const { datasource, signalType, mode, onModeChange, searchText, onSearchChange, onSearchSubmit } = props;
  const styles = useStyles2(getStyles);
  const [localSearch, setLocalSearch] = useState(searchText);
  const modeOptions = getModeOptions(signalType, datasource);
  const showModeDropdown = !signalType && modeOptions.length > 1;
  const isLogs = mode === 'otel-logs';

  useEffect(() => {
    setLocalSearch(searchText);
  }, [searchText]);

  if (!showModeDropdown && !isLogs) {
    return null;
  }

  return (
    <div className={styles.bar} data-testid="compact-mode-bar">
      {showModeDropdown && (
        <Select
          options={modeOptions}
          value={mode}
          onChange={(v) => v.value && onModeChange(v.value)}
          width={16}
          placeholder="Select mode..."
        />
      )}

      {isLogs && (
        <div className={styles.searchWrapper}>
          <Input
            value={localSearch}
            onChange={(e) => setLocalSearch(e.currentTarget.value)}
            onBlur={() => onSearchChange(localSearch)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSearchChange(localSearch);
                onSearchSubmit();
              }
            }}
            placeholder="Search log body text..."
            prefix={<Icon name="search" />}
          />
        </div>
      )}
    </div>
  );
};
