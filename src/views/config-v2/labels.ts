export default {
  components: {
    Config: {
      ConfigEditor: {
        serverAddress: {
          label: 'Server host address',
          placeholder: 'Enter URL',
        },
        protocol: {
          label: 'Protocol',
          description: 'Native or HTTP for server protocol',
          toggletip:
            'ClickHouse supports two server protocols: Native TCP and HTTP. Both protocols can be secured with TLS.\n\nNative TCP is the default and recommended option.\nHTTP is for servers configured to accept HTTP connections.',
        },
        serverPort: {
          label: 'Server port',
          insecureNativePort: '9000',
          insecureHttpPort: '8123',
          secureNativePort: '9440',
          secureHttpPort: '8443',
          tooltip: 'ClickHouse server port',
          error: 'Port is required',
        },
        secure: {
          label: 'Secure Connection',
          tooltip: 'Toggle on if the connection is secure',
        },
        path: {
          label: 'HTTP URL Path',
          tooltip: 'Additional URL path for HTTP requests',
          placeholder: 'additional-path',
        },
        // username: {
        //   label: 'Username',
        //   placeholder: 'default',
        //   tooltip: 'ClickHouse username',
        // },
        // password: {
        //   label: 'Password',
        //   placeholder: 'password',
        //   tooltip: 'ClickHouse password',
        // },
        // tlsSkipVerify: {
        //   label: 'Skip TLS Verify',
        //   tooltip: 'Skip TLS Verify',
        // },
        // tlsClientAuth: {
        //   label: 'TLS Client Auth',
        //   tooltip: 'TLS Client Auth',
        // },
        // tlsAuthWithCACert: {
        //   label: 'With CA Cert',
        //   tooltip: 'Needed for verifying self-signed TLS Certs',
        // },
        // tlsCACert: {
        //   label: 'CA Cert',
        //   placeholder: 'CA Cert. Begins with -----BEGIN CERTIFICATE-----',
        // },
        // tlsClientCert: {
        //   label: 'Client Cert',
        //   placeholder: 'Client Cert. Begins with -----BEGIN CERTIFICATE-----',
        // },
        // tlsClientKey: {
        //   label: 'Client Key',
        //   placeholder: 'Client Key. Begins with -----BEGIN RSA PRIVATE KEY-----',
        // },
        secureSocksProxy: {
          label: 'Enable Secure Socks Proxy',
          tooltip: 'Enable proxying the datasource connection through the secure socks proxy to a different network.',
        },
        enableRowLimit: {
          label: 'Enable row limit',
          testid: 'data-testid enable-row-limit-switch',
          tooltip:
            'Enable using the Grafana row limit setting to limit the number of rows returned from Clickhouse. Ensure the appropriate permissions are set for your user. Only supported for Grafana >= 11.0.0. Defaults to false.',
        },
      },
      AliasTableConfig: {
        title: 'Column Alias Tables',
        descriptionParts: [
          'Provide alias tables with a',
          '(`alias` String, `select` String, `type` String)',
          'schema to use as a source for column selection.',
        ],
        addTableLabel: 'Add Table',
        targetDatabaseLabel: 'Target Database',
        targetDatabasePlaceholder: '(optional)',
        targetTableLabel: 'Target Table',
        aliasDatabaseLabel: 'Alias Database',
        aliasDatabasePlaceholder: '(optional)',
        aliasTableLabel: 'Alias Table',
      },

      DefaultDatabaseTableConfig: {
        title: 'Default DB and table',
        database: {
          label: 'Default database',
          description: 'the default database used by the query builder',
          name: 'defaultDatabase',
          placeholder: 'default',
        },
        table: {
          label: 'Default table',
          description: 'the default table used by the query builder',
          name: 'defaultTable',
          placeholder: 'table',
        },
      },
      QuerySettingsConfig: {
        title: 'Query settings',
        connMaxLifetime: {
          label: 'Connection Max Lifetime (minutes)',
          name: 'connMaxLifetime',
          placeholder: '5',
          tooltip: 'Maximum lifetime of a connection in minutes',
        },
        dialTimeout: {
          label: 'Dial Timeout (seconds)',
          name: 'dialTimeout',
          placeholder: '10',
          tooltip: 'Timeout in seconds for connection',
        },
        maxIdleConns: {
          label: 'Max Idle Connections',
          name: 'maxIdleConns',
          placeholder: '25',
          tooltip: 'Maximum number of idle connections',
        },
        maxOpenConns: {
          label: 'Max Open Connections',
          name: 'maxOpenConns',
          placeholder: '50',
          tooltip: 'Maximum number of open connections',
        },
        queryTimeout: {
          label: 'Query Timeout (seconds)',
          name: 'queryTimeout',
          placeholder: '60',
          tooltip: 'Timeout in seconds for read queries',
        },
        validateSql: {
          label: 'Validate SQL',
          tooltip: 'Validate SQL in the editor.',
        },
      },
      TracesConfig: {
        title: 'Traces configuration',
        description: '(Optional) Default settings for trace queries',
        defaultDatabase: {
          label: 'Default trace database',
          description: 'the default database used by the trace query builder',
          name: 'defaultDatabase',
          placeholder: 'default',
        },
        defaultTable: {
          label: 'Default trace table',
          description: 'the default table used by the trace query builder',
          name: 'defaultTable',
        },
        columns: {
          title: 'Default columns',
          description: 'Default columns for trace queries. Leave empty to disable.',

          traceId: {
            label: 'Trace ID column',
            tooltip: 'Column for the trace ID',
          },
          spanId: {
            label: 'Span ID column',
            tooltip: 'Column for the span ID',
          },
          parentSpanId: {
            label: 'Parent Span ID column',
            tooltip: 'Column for the parent span ID',
          },
          serviceName: {
            label: 'Service Name column',
            tooltip: 'Column for the service name',
          },
          operationName: {
            label: 'Operation Name column',
            tooltip: 'Column for the operation name',
          },
          startTime: {
            label: 'Start Time column',
            tooltip: 'Column for the start time',
          },
          durationTime: {
            label: 'Duration Time column',
            tooltip: 'Column for the duration time',
          },
          tags: {
            label: 'Tags column',
            tooltip: 'Column for the trace tags',
          },
          serviceTags: {
            label: 'Service Tags column',
            tooltip: 'Column for the service tags',
          },
          flattenNested: {
            label: 'Use Flatten Nested',
            tooltip: 'Enable if your traces table was created with flatten_nested=1',
          },
          eventsPrefix: {
            label: 'Events prefix',
            tooltip: 'Prefix for the events column (Events.Timestamp, Events.Name, etc.)',
          },
          linksPrefix: {
            label: 'Links prefix',
            tooltip: 'Prefix for the trace references column (Links.TraceId, Links.TraceState, etc.)',
          },
          kind: {
            label: 'Kind column',
            tooltip: 'Column for the trace kind',
          },
          statusCode: {
            label: 'Status Code column',
            tooltip: 'Column for the trace status code',
          },
          statusMessage: {
            label: 'Status Message column',
            tooltip: 'Column for the trace status message',
          },
          instrumentationLibraryName: {
            label: 'Library Name column',
            tooltip: 'Column for the instrumentation library name',
          },
          instrumentationLibraryVersion: {
            label: 'Library Version column',
            tooltip: 'Column for the instrumentation library version',
          },
          state: {
            label: 'State column',
            tooltip: 'Column for the trace state',
          },
        },
      },
      LogsConfig: {
        title: 'Logs configuration',
        description: '(Optional) default settings for log queries',
        defaultDatabase: {
          label: 'Default log database',
          description: 'the default database used by the logs query builder',
          name: 'defaultDatabase',
          placeholder: 'default',
        },
        defaultTable: {
          label: 'Default log table',
          description: 'the default table used by the logs query builder',
          name: 'defaultTable',
        },
        columns: {
          title: 'Default columns',
          description: 'Default columns for log queries. Leave empty to disable.',

          time: {
            label: 'Time column',
            tooltip: 'Column for the log timestamp',
          },
          level: {
            label: 'Log Level column',
            tooltip: 'Column for the log level',
          },
          message: {
            label: 'Log Message column',
            tooltip: 'Column for log message',
          },
        },
        contextColumns: {
          title: 'Context columns',
          description:
            'These columns are used to narrow down a single log row to its original service/container/pod source. At least one is required for the log context feature to work.',

          selectContextColumns: {
            label: 'Auto-Select Columns',
            tooltip: 'When enabled, will always include context columns in log queries',
          },
          columns: {
            label: 'Context Columns',
            tooltip: "Comma separated list of column names to use for identifying a log's source",
            placeholder: 'Column name (enter key to add)',
          },
        },
      },
    },
  },
};
