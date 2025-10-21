import { css } from '@emotion/css';

import { GrafanaTheme2 } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { Protocol } from 'types/config';

export const DB_SETTINGS_LABEL_WIDTH = 18;
export const CONTAINER_MIN_WIDTH = '450px';

export const CONFIG_SECTION_HEADERS = [
  { label: 'Server and encryption', id: 'server', isOpen: true, isOptional: false },
  { label: 'Database credentials', id: 'credentials', isOpen: true, isOptional: false },
  { label: 'TLS/SSL settings', id: 'tls', isOpen: false, isOptional: true },
  { label: 'Private data source connect', id: 'additional', isOpen: false, isOptional: true },
  { label: 'Save & test', id: `${selectors.pages.DataSource.saveAndTest}`, isOpen: undefined, isOptional: null },
];

export const CONFIG_SECTION_HEADERS_WITH_PDC = [
  { label: 'Server and encryption', id: 'server', isOpen: true, isOptional: false },
  { label: 'Database credentials', id: 'credentials', isOpen: true, isOptional: false },
  { label: 'TLS/SSL settings', id: 'tls', isOpen: false, isOptional: true },
  { label: 'Additional settings', id: 'additional', isOpen: false, isOptional: true },
  { label: 'Private data source connect', id: 'pdc', isOpen: false, isOptional: true },
  { label: 'Save & test', id: `${selectors.pages.DataSource.saveAndTest}`, isOpen: undefined, isOptional: null },
];

export const PROTOCOL_OPTIONS = [
  { label: 'Native', value: Protocol.Native },
  { label: 'HTTP', value: Protocol.Http },
];

export const getInlineLabelStyles = (theme: GrafanaTheme2, transparent = false, width?: number | 'auto') => {
  return {
    label: css({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexShrink: 0,
      padding: theme.spacing(0, 1),
      backgroundColor: transparent ? 'transparent' : theme.colors.background.secondary,
      height: theme.spacing(theme.components.height.md),
      lineHeight: theme.spacing(theme.components.height.md),
      marginRight: theme.spacing(0.5),
      borderRadius: theme.shape.radius.default,
      border: 'none',
      width: '220px',
      color: theme.colors.text.primary,
    }),
  };
};
