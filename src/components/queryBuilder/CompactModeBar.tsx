import React, { useEffect, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Icon, Input, useStyles2 } from '@grafana/ui';
import { SignalType } from 'types/config';

export type CompactMode = 'otel-logs' | 'otel-traces';

interface CompactModeBarProps {
  mode: CompactMode;
  searchText: string;
  onSearchChange: (text: string) => void;
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

export function getDefaultCompactMode(signalType: SignalType): CompactMode {
  return signalType === 'traces' ? 'otel-traces' : 'otel-logs';
}

export const CompactModeBar = (props: CompactModeBarProps) => {
  const { mode, searchText, onSearchChange } = props;
  const styles = useStyles2(getStyles);
  const [localSearch, setLocalSearch] = useState(searchText);

  useEffect(() => {
    setLocalSearch(searchText);
  }, [searchText]);

  if (mode === 'otel-traces') {
    return null;
  }

  return (
    <div className={styles.bar} data-testid="compact-mode-bar">
      <div className={styles.searchWrapper}>
        <Input
          value={localSearch}
          onChange={(e) => setLocalSearch(e.currentTarget.value)}
          onBlur={() => onSearchChange(localSearch)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onSearchChange(localSearch);
            }
          }}
          placeholder="Search log body text..."
          prefix={<Icon name="search" />}
        />
      </div>
    </div>
  );
};
