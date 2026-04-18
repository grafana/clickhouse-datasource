import React from 'react';
import { Icon } from '@grafana/ui';
import { css } from '@emotion/css';

interface ColumnRolesHelpProps {
  text: string;
  linkText: string;
  href: string;
  testIdWrapper: string;
  testIdLink: string;
}

const styles = {
  wrapper: css`
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 4px 0 8px 0;
    font-size: 12px;
    opacity: 0.85;
  `,
  link: css`
    text-decoration: underline;
  `,
};

/**
 * Small inline note rendered above the Columns section of the query builder
 * views, giving a one-line description of the column-role concept and a link
 * to the in-repo documentation page that enumerates the role → SQL alias
 * mapping.
 */
export const ColumnRolesHelp = (props: ColumnRolesHelpProps) => {
  const { text, linkText, href, testIdWrapper, testIdLink } = props;
  return (
    <div className={styles.wrapper} data-testid={testIdWrapper}>
      <Icon name="info-circle" size="sm" />
      <span>
        {text}{' '}
        <a className={styles.link} href={href} target="_blank" rel="noreferrer" data-testid={testIdLink}>
          {linkText}
        </a>
      </span>
    </div>
  );
};
