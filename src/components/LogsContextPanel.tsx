import React from 'react';
import { Alert, Icon, IconName, Stack, useTheme2 } from '@grafana/ui';
import { css } from '@emotion/css';
import { LogContextColumn } from 'data/CHDatasource';
import { Components } from 'selectors';

const LogsContextPanelStyles = css`
  display: flex;
  justify-content: flex-start;
  flex-wrap: wrap;
  width: 100%;
`;

interface LogContextPanelProps {
  columns: LogContextColumn[];
  datasourceUid: string;
}

const LogsContextPanel = (props: LogContextPanelProps) => {
  const { columns, datasourceUid } = props;
  const theme = useTheme2();

  if (!columns || columns.length === 0) {
    return (
      <Alert data-testid={Components.LogsContextPanel.alert} title="" severity="warning">
        <Stack direction="column">
          <div>
            {
              'Unable to match any context columns. Make sure your query returns at least one log context column from your '
            }
            <a
              style={{ textDecoration: 'underline' }}
              href={`/connections/datasources/edit/${encodeURIComponent(datasourceUid)}#logs-config`}
            >
              ClickHouse Data Source settings
            </a>
          </div>
        </Stack>
      </Alert>
    );
  }

  return (
    <div className={LogsContextPanelStyles}>
      {columns.map((p) => (
        <LogContextKey
          key={p.name}
          name={p.name}
          value={p.value}
          primaryColor={theme.colors.secondary.main}
          primaryTextColor={theme.colors.text.primary}
          secondaryColor={theme.colors.background.secondary}
          secondaryTextColor={theme.colors.info.text}
        />
      ))}
    </div>
  );
};

/**
 * Roughly match an icon with the context column name.
 */
const iconMatcher = (contextName: string): IconName => {
  contextName = contextName.toLowerCase();

  if (contextName === 'db' || contextName === 'database' || contextName.includes('data')) {
    return 'database';
  } else if (contextName.includes('service')) {
    return 'building';
  } else if (
    contextName.includes('error') ||
    contextName.includes('warn') ||
    contextName.includes('critical') ||
    contextName.includes('fatal')
  ) {
    return 'exclamation-triangle';
  } else if (contextName.includes('user') || contextName.includes('admin')) {
    return 'user';
  } else if (contextName.includes('email')) {
    return 'at';
  } else if (contextName.includes('file')) {
    return 'file-alt';
  } else if (contextName.includes('bug')) {
    return 'bug';
  } else if (contextName.includes('search')) {
    return 'search';
  } else if (contextName.includes('tag')) {
    return 'tag-alt';
  } else if (contextName.includes('span') || contextName.includes('stack')) {
    return 'brackets-curly';
  }
  if (contextName === 'host' || contextName === 'hostname' || contextName.includes('host')) {
    return 'cloud';
  }
  if (contextName === 'url' || contextName.includes('url')) {
    return 'link';
  } else if (contextName.includes('container') || contextName.includes('pod')) {
    return 'cube';
  }

  return 'align-left';
};

interface LogContextKeyProps {
  name: string;
  value: string;
  primaryColor: string;
  primaryTextColor: string;
  secondaryColor: string;
  secondaryTextColor: string;
}

const LogContextKey = (props: LogContextKeyProps) => {
  const { name, value, primaryColor, primaryTextColor, secondaryColor, secondaryTextColor } = props;

  const styles = {
    container: css`
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 0.25em;
      color: ${primaryTextColor};
    `,
    containerLeft: css`
      display: flex;
      align-items: center;
      background-color: ${primaryColor};
      border-radius: 2px;
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;

      padding-top: 0.15em;
      padding-bottom: 0.15em;
      padding-left: 0.25em;
      padding-right: 0.25em;
    `,
    contextName: css`
      font-weight: bold;
      padding-left: 0.25em;
      user-select: all;
    `,
    contextValue: css`
      background-color: ${secondaryColor};
      color: ${secondaryTextColor};
      border-radius: 2px;
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
      user-select: all;
      font-family: monospace;

      padding-top: 0.15em;
      padding-bottom: 0.15em;
      padding-left: 0.25em;
      padding-right: 0.25em;
    `,
  };

  return (
    <div className={styles.container} data-testid={Components.LogsContextPanel.LogsContextKey}>
      <div className={styles.containerLeft}>
        <Icon name={iconMatcher(name)} size="md" />
        <div>test</div>
        <span className={styles.contextName}>{name}</span>
      </div>
      <span className={styles.contextValue}>{value}</span>
    </div>
  );
};

export default LogsContextPanel;

export const _testExports = {
  iconMatcher,
  LogContextKey,
};
