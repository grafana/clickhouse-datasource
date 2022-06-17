import { E2ESelectors } from '@grafana/e2e-selectors';
export const Components = {
  ConfigEditor: {
    ServerAddress: {
      label: 'Server address',
      placeholder: 'Server TCP address',
      tooltip: 'ClickHouse native TCP server address',
    },
    ServerPort: {
      label: 'Server port',
      placeholder: (secure: string) => `Typically ${secure === 'true' ? '9440' : '9000'}`,
      tooltip: 'ClickHouse native TCP port. Typically 9000 for unsecure, 9440 for secure',
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
    Timeout: {
      label: 'Timeout (seconds)',
      placeholder: '10',
      tooltip: 'Timeout in seconds for connection and read queries',
    },
    Secure: {
      label: 'Secure Connection',
      tooltip: 'Toggle on if the connection is secure',
    },
    Validate: {
      label: 'Validate SQL',
      tooltip: 'Validate Sql in the editor.',
    },
  },
  QueryEditor: {
    CodeEditor: {
      input: () => '.monaco-editor textarea',
      container: 'data-testid-code-editor-container',
      Expand: 'data-testid-code-editor-expand-button',
    },
    Types: {
      label: 'Query Type',
      tooltip: 'Query Type',
      options: {
        SQLEditor: 'SQL Editor',
        QueryBuilder: 'Query Builder',
      },
      switcher: {
        title: 'Are you sure?',
        body: 'Queries that are too complex for the Query Builder will be altered.',
        confirmText: 'Continue',
        dismissText: 'Cancel',
      },
      cannotConvert: {
        title: 'Cannot convert',
        body: 'The query is too complex to convert to the visual query builder. Do you want to delete your current query and use the query builder?',
        confirmText: 'Yes',
      }
    },
    QueryBuilder: {
      TYPES: {
        label: 'Show as',
        tooltip: 'Show as',
        options: {
          LIST: 'Table',
          AGGREGATE: 'Aggregate',
          TREND: 'Time Series',
        },
      },
      DATABASE: {
        label: 'Database',
        tooltip: 'Clickhouse database to query from',
      },
      FROM: {
        label: 'Table',
        tooltip: 'Clickhouse table to query from',
      },
      SELECT: {
        label: 'Fields',
        tooltipTable: 'List of fields to show',
        tooltipAggregate: `List of metrics to show. Use any of the given aggregation along with the field`,
        ALIAS: {
          label: 'as',
          tooltip: 'alias',
        },
        AddLabel: 'Field',
        RemoveLabel: '',
      },
      AGGREGATES: {
        label: 'Aggregates',
        tooltipTable: 'Aggregate functions to use',
        tooltipAggregate: `Aggregate functions to use`,
        ALIAS: {
          label: 'as',
          tooltip: 'alias',
        },
        AddLabel: 'Aggregate',
        RemoveLabel: '',
      },
      WHERE: {
        label: 'Filters',
        tooltip: `List of filters`,
        AddLabel: 'Filter',
        RemoveLabel: '',
      },
      GROUP_BY: {
        label: 'Group by',
        tooltip: 'Group the results by specific field',
      },
      ORDER_BY: {
        label: 'Order by',
        tooltip: 'Order by field',
        AddLabel: 'Order by',
        RemoveLabel: '',
      },
      LIMIT: {
        label: 'Limit',
        tooltip: 'Number of records/results to show.',
      },
      TIME_FIELD: {
        label: 'Time field',
        tooltip: 'Select the time field for trending over time',
      },
      PREVIEW: {
        label: 'SQL Preview',
        tooltip: 'SQL Preview. You can safely switch to SQL Editor to customize the generated query',
      },
    },
  },
};
export const selectors: { components: E2ESelectors<typeof Components> } = {
  components: Components,
};
