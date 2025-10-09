import React from 'react';
import { Box, InlineField, LinkButton, Space, Stack, Text, useStyles2 } from '@grafana/ui';
import { CONFIG_SECTION_HEADERS, CONFIG_SECTION_HEADERS_WITH_PDC } from './constants';
import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';

interface LeftSidebarProps {
  pdcInjected: boolean;
}

export const LeftSidebar = ({ pdcInjected }: LeftSidebarProps) => {
  const headers = pdcInjected ? CONFIG_SECTION_HEADERS_WITH_PDC : CONFIG_SECTION_HEADERS;
  const styles = useStyles2(getStyles);

  return (
    <Stack>
      <Box flex={1} marginY={10}>
        <Box height="75px"></Box>
        <Text element="h4">Connect data source</Text>
        <Box paddingTop={2}>
          {headers.map((header, index) => (
            <div key={index} data-testid={`${header.label}-sidebar`}>
              <InlineField label={`${index + 1}`} className={styles.inlineField} labelWidth={3} grow>
                <LinkButton
                  variant="secondary"
                  fill="text"
                  onClick={(e) => {
                    e.preventDefault();
                    const target = document.getElementById(header.id);
                    if (target) {
                      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }}
                >
                  <div className={styles.sidebarText}>
                    <div className={styles.sidebarLabel}>{header.label}</div>
                    {header.isOptional && (
                      <div className={styles.sidebarOptional}>
                        <Text color="secondary" variant="bodySmall">
                          optional
                        </Text>
                      </div>
                    )}
                  </div>
                </LinkButton>
              </InlineField>
              <Space v={1} />
            </div>
          ))}
        </Box>
      </Box>
    </Stack>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  inlineField: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),
  sidebarText: css({
    display: 'flex',
    flexDirection: 'column',
  }),
  sidebarLabel: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
    lineHeight: 1,
  }),
  sidebarOptional: css({
    marginTop: 0,
    marginBottom: 0,
    lineHeight: 1,
  }),
});
