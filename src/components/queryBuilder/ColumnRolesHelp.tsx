import React from 'react';
import { Box, Icon, Text, TextLink } from '@grafana/ui';

interface ColumnRolesHelpProps {
  text: string;
  linkText: string;
  href: string;
  testIdWrapper: string;
  testIdLink: string;
}

/**
 * Small inline note rendered above the Columns section of the query builder
 * views, giving a one-line description of the column-role concept and a link
 * to the in-repo documentation page that enumerates the role → SQL alias
 * mapping.
 */
export const ColumnRolesHelp = (props: ColumnRolesHelpProps) => {
  const { text, linkText, href, testIdWrapper, testIdLink } = props;
  return (
    <Box display="flex" alignItems="center" gap={0.5} marginTop={0.5} marginBottom={1} data-testid={testIdWrapper}>
      <Text variant="bodySmall" color="secondary">
        <Icon name="info-circle" size="sm" />
      </Text>
      <Text variant="bodySmall" color="secondary">
        {text}{' '}
        <TextLink href={href} external inline variant="bodySmall" color="secondary" data-testid={testIdLink}>
          {linkText}
        </TextLink>
      </Text>
    </Box>
  );
};
