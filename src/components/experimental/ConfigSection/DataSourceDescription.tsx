import React from 'react';
import { cx, css } from '@emotion/css';
import { useTheme2 } from '@grafana/ui';

type Props = {
  dataSourceName: string;
  docsLink: string;
  hasRequiredFields?: boolean;
  className?: string;
};

export const DataSourceDescription = ({ dataSourceName, docsLink, hasRequiredFields = true, className }: Props) => {
  const theme = useTheme2();

  const styles = {
    container: css({
      p: {
        margin: 0,
      },
      'p + p': {
        marginTop: theme.spacing(2),
      },
    }),
    text: css({
      ...theme.typography.body,
      color: theme.colors.text.secondary,
      a: css({
        color: theme.colors.text.link,
        textDecoration: 'underline',
        '&:hover': {
          textDecoration: 'none',
        },
      }),
    }),
  };

  return (
    <div className={cx(styles.container, className)}>
      <p className={styles.text}>
        Before you can use the {dataSourceName} data source, you must configure it below or in the config file. For
        detailed instructions,{' '}
        <a href={docsLink} target="_blank" rel="noreferrer">
          view the documentation
        </a>
        .
      </p>
      {hasRequiredFields && (
        <p className={styles.text}>
          <i>Fields marked with * are required</i>
        </p>
      )}
    </div>
  );
};
