import React, { useMemo } from 'react';
import { css } from '@emotion/css';

import { Icon, IconButton, Stack, Tooltip, useTheme2 } from '@grafana/ui';

interface QueryToolboxProps {
  showTools?: boolean;
  onFormatCode?: () => void;
}

export function QueryToolbox({ showTools, onFormatCode }: QueryToolboxProps) {
  const theme = useTheme2();

  const styles = useMemo(() => {
    return {
      container: css({
        border: `1px solid ${theme.colors.border.medium}`,
        borderTop: 'none',
        padding: theme.spacing(0.5, 0.5, 0.5, 0.5),
        display: 'flex',
        flexGrow: 1,
        justifyContent: 'space-between',
        fontSize: theme.typography.bodySmall.fontSize,
      }),
      error: css({
        color: theme.colors.error.text,
        fontSize: theme.typography.bodySmall.fontSize,
        fontFamily: theme.typography.fontFamilyMonospace,
      }),
      valid: css({
        color: theme.colors.success.text,
      }),
      info: css({
        color: theme.colors.text.secondary,
      }),
      hint: css({
        color: theme.colors.text.disabled,
        whiteSpace: 'nowrap',
        cursor: 'help',
      }),
    };
  }, [theme]);

  let style = {};

  if (!showTools) {
    style = { height: 0, padding: 0, visibility: 'hidden' };
  }

  return (
    <div className={styles.container} style={style}>
      {showTools && (
        <div>
          <Stack>
            {onFormatCode && (
              <IconButton
                onClick={() => {
                  onFormatCode();
                }}
                name="brackets-curly"
                size="xs"
                tooltip="Format query"
              />
            )}
            <Tooltip content="Hit CTRL/CMD+Return to run query">
              <Icon className={styles.hint} name="keyboard" />
            </Tooltip>
          </Stack>
        </div>
      )}
    </div>
  );
}
