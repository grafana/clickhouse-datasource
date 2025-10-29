import { selectors } from '@grafana/e2e-selectors';
import { Protocol } from 'types/config';

export const CONTAINER_MIN_WIDTH = '450px';

export const CONFIG_SECTION_HEADERS = [
  { label: 'Server and encryption', id: 'server', isOpen: true, isOptional: false },
  { label: 'Database credentials', id: 'credentials', isOpen: true, isOptional: false },
  { label: 'TLS/SSL settings', id: 'tls', isOpen: false, isOptional: true },
  { label: 'Additional settings', id: 'additional', isOpen: false, isOptional: true },
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
