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
    Protocol: {
      label: 'Protocol',
      tooltip: 'Native or HTTP for transport',
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
      label: 'Dial Timeout (seconds)',
      placeholder: '10',
      tooltip: 'Timeout in seconds for connection',
    },
    QueryTimeout: {
      label: 'Query Timeout (seconds)',
      placeholder: '60',
      tooltip: 'Timeout in seconds for read queries',
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
    Format: {
      label: 'Format',
      tooltip: 'Query Type',
      options: {
        AUTO: 'Auto',
        TABLE: 'Table',
        TIME_SERIES: 'Time Series',
        LOGS: 'Logs',
        TRACE: 'Trace',
      },
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
        confirmText: 'Yes',
      },
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
      LOGS_VOLUME_TIME_FIELD: {
        label: 'Time field',
        tooltip: 'Select the time field for logs volume histogram. If not selected, the histogram will not be shown',
      },
      LOG_LEVEL_FIELD: {
        label: 'Log level field',
        tooltip: 'Select the field to extract log level information from'
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
