import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Button, Icon, InlineFormLabel, useStyles2 } from '@grafana/ui';
import labels from 'labels';

interface SqlPreviewProps {
  sql: string;
  compact?: boolean;
  onEditAsSql?: () => void;
}

const getStyles = (theme: GrafanaTheme2) => ({
  compactWrapper: css`
    border: 1px solid ${theme.colors.border.medium};
    border-radius: ${theme.shape.radius.default};
    margin-top: ${theme.spacing(0.75)};
    overflow: hidden;
  `,
  compactHeader: css`
    align-items: center;
    background: ${theme.colors.background.secondary};
    display: flex;
    justify-content: space-between;
    min-height: 32px;
    padding: 0 ${theme.spacing(1)};
  `,
  compactTitle: css`
    align-items: center;
    background: transparent;
    border: 0;
    color: ${theme.colors.text.primary};
    cursor: pointer;
    display: flex;
    font-weight: ${theme.typography.fontWeightMedium};
    gap: ${theme.spacing(0.5)};
    padding: 0;
  `,
  compactActions: css`
    align-items: center;
    display: flex;
    gap: ${theme.spacing(0.5)};
  `,
  compactSql: css`
    border-top: 1px solid ${theme.colors.border.weak};
    font-family: ${theme.typography.fontFamilyMonospace};
    margin: 0;
    max-height: 96px;
    overflow: auto;
    padding: ${theme.spacing(1)};
    white-space: pre-wrap;
    word-break: break-word;
  `,
});

export const SqlPreview = (props: SqlPreviewProps) => {
  const { sql, compact, onEditAsSql } = props;
  const { label, tooltip } = labels.components.SqlPreview;
  const styles = useStyles2(getStyles);
  const [isOpen, setIsOpen] = React.useState(!compact);

  const copySql = () => {
    void navigator.clipboard?.writeText(sql);
  };

  if (compact) {
    return (
      <div className={styles.compactWrapper}>
        <div className={styles.compactHeader}>
          <button className={styles.compactTitle} type="button" onClick={() => setIsOpen(!isOpen)}>
            <Icon name={isOpen ? 'angle-down' : 'angle-right'} />
            SQL
          </button>
          <div className={styles.compactActions}>
            <Button icon="copy" variant="secondary" size="sm" fill="text" onClick={copySql}>
              Copy
            </Button>
            {onEditAsSql && (
              <Button icon="pen" variant="secondary" size="sm" fill="text" onClick={onEditAsSql}>
                Open in SQL editor
              </Button>
            )}
          </div>
        </div>
        {isOpen && <pre className={styles.compactSql}>{sql}</pre>}
      </div>
    );
  }

  return (
    <div className="gf-form">
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <pre>{sql}</pre>
    </div>
  );
};
