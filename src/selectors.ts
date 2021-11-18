import { E2ESelectors } from '@grafana/e2e-selectors';
export const Components = {
  ConfigEditor: {
    ServerAddress: {
      label: 'Server address',
      placeholder: 'Server address',
      tooltip: 'ClickHouse server address',
    },
    ServerPort: {
      label: 'Server port',
      placeholder: 'Server port',
      tooltip: 'ClickHouse server port. Typically this will be 9000 for ClickHouse.',
    },
    Username: {
      label: 'Username',
      placeholder: 'Username',
      tooltip: 'ClickHouse username',
    },
    Password: {
      label: 'Password',
      placeholder: 'Password',
      tooltip: 'ClickHouse password',
    },
    TLSSkipVerify: {
      label: 'Skip TLS Verify',
      tooltip: 'Skip TLS Verify',
    },
    TLSClientAuth: {
      label: 'TLS Client Auth',
      tooltip: 'TLS Client Auth',
    },
    TLSAuthWithCACert: {
      label: 'With CA Cert',
      tooltip: 'Needed for verifying self-signed TLS Certs',
    },
    TLSCACert: {
      label: 'CA Cert',
      placeholder: 'CA Cert. Begins with -----BEGIN CERTIFICATE-----',
    },
    TLSClientCert: {
      label: 'Client Cert',
      placeholder: 'Client Cert. Begins with -----BEGIN CERTIFICATE-----',
    },
    TLSClientKey: {
      label: 'Client Key',
      placeholder: 'Client Key. Begins with -----BEGIN RSA PRIVATE KEY-----',
    },
    DefaultDatabase: {
      label: 'Default database',
      placeholder: 'Default database',
      tooltip: 'Default database to be used. Can be empty.',
    },
  },
  QueryEditor: {
    CodeEditor: {
      input: () => '.monaco-editor textarea',
    },
  },
};
export const selectors: { components: E2ESelectors<typeof Components> } = {
  components: Components,
};
