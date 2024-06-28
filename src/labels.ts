import { ColumnHint } from "types/queryBuilder";

export default {
  components: {
    Config: {
      ConfigEditor: {
        serverAddress: {
          label: 'Server address',
          placeholder: 'Server address',
          tooltip: 'ClickHouse host address',
          error: 'Server address required'
        },
        serverPort: {
          label: 'Server port',
          insecureNativePort: '9000',
          insecureHttpPort: '8123',
          secureNativePort: '9440',
          secureHttpPort: '8443',
          tooltip: 'ClickHouse server port',
          error: 'Port is required'
        },
        path: {
          label: 'HTTP URL Path',
          tooltip: 'Additional URL path for HTTP requests',
          placeholder: 'additional-path'
        },
        protocol: {
          label: 'Protocol',
          tooltip: 'Native or HTTP for server protocol',
        },
        username: {
          label: 'Username',
          placeholder: 'default',
          tooltip: 'ClickHouse username',
        },
        password: {
          label: 'Password',
          placeholder: 'password',
          tooltip: 'ClickHouse password',
        },
        tlsSkipVerify: {
          label: 'Skip TLS Verify',
          tooltip: 'Skip TLS Verify',
        },
        tlsClientAuth: {
          label: 'TLS Client Auth',
          tooltip: 'TLS Client Auth',
        },
        tlsAuthWithCACert: {
          label: 'With CA Cert',
          tooltip: 'Needed for verifying self-signed TLS Certs',
        },
        tlsCACert: {
          label: 'CA Cert',
          placeholder: 'CA Cert. Begins with -----BEGIN CERTIFICATE-----',
        },
        tlsClientCert: {
          label: 'Client Cert',
          placeholder: 'Client Cert. Begins with -----BEGIN CERTIFICATE-----',
        },
        tlsClientKey: {
          label: 'Client Key',
          placeholder: 'Client Key. Begins with -----BEGIN RSA PRIVATE KEY-----',
        },
        secure: {
          label: 'Secure Connection',
          tooltip: 'Toggle on if the connection is secure',
        },
        secureSocksProxy: {
          label: 'Enable Secure Socks Proxy',
          tooltip: 'Enable proxying the datasource connection through the secure socks proxy to a different network.',
        },
      },
      HttpHeadersConfig: {
        title: 'HTTP Headers',
        label: 'Custom HTTP Headers',
        description: 'Add Custom HTTP headers when querying the database',
        headerNameLabel: 'Header Name',
        headerNamePlaceholder: 'X-Custom-Header',
        insecureHeaderValueLabel: 'Header Value',
        secureHeaderValueLabel: 'Secure Header Value',
        secureLabel: 'Secure',
        addHeaderLabel: 'Add Header',
        forwardGrafanaHeaders: {
          label: 'Forward Grafana HTTP Headers',
          tooltip: 'Forward Grafana HTTP Headers to datasource.',
        },
      },
      AliasTableConfig: {
        title: 'Column Alias Tables',
        descriptionParts: ['Provide alias tables with a', '(`alias` String, `select` String, `type` String)', 'schema to use as a source for column selection.'],
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
          placeholder: 'default'
        },
        table: {
          label: 'Default table',
          description: 'the default table used by the query builder',
          name: 'defaultTable',
          placeholder: 'table'
        },
      },
      QuerySettingsConfig: {
        title: 'Query settings',
        dialTimeout: {
          label: 'Dial Timeout (seconds)',
          tooltip: 'Timeout in seconds for connection',
          name: 'dialTimeout',
          placeholder: '10',
        },
        queryTimeout: {
          label: 'Query Timeout (seconds)',
          tooltip: 'Timeout in seconds for read queries',
          name: 'queryTimeout',
          placeholder: '60',
        },
        validateSql: {
          label: 'Validate SQL',
          tooltip: 'Validate SQL in the editor.',
        }
      },
      TracesConfig: {
        title: 'Traces configuration',
        description: '(Optional) Default settings for trace queries',
        defaultDatabase: {
          label: 'Default trace database',
          description: 'the default database used by the trace query builder',
          name: 'defaultDatabase',
          placeholder: 'default'
        },
        defaultTable: {
          label: 'Default trace table',
          description: 'the default table used by the trace query builder',
          name: 'defaultTable',
          placeholder: 'otel_traces'
        },
        columns: {
         title: 'Default columns',
         description: 'Default columns for trace queries. Leave empty to disable.',
         
         traceId: {
          label: 'Trace ID column',
          tooltip: 'Column for the trace ID'
          },
          spanId: {
            label: 'Span ID column',
            tooltip: 'Column for the span ID'
          },
          parentSpanId: {
            label: 'Parent Span ID column',
            tooltip: 'Column for the parent span ID'
          },
          serviceName: {
            label: 'Service Name column',
            tooltip: 'Column for the service name'
          },
          operationName: {
            label: 'Operation Name column',
            tooltip: 'Column for the operation name'
          },
          startTime: {
            label: 'Start Time column',
            tooltip: 'Column for the start time'
          },
          durationTime: {
            label: 'Duration Time column',
            tooltip: 'Column for the duration time'
          },
          tags: {
            label: 'Tags column',
            tooltip: 'Column for the trace tags'
          },
          serviceTags: {
            label: 'Service Tags column',
            tooltip: 'Column for the service tags'
          }
        }
      },
      LogsConfig: {
        title: 'Logs configuration',
        description: '(Optional) default settings for log queries',
        defaultDatabase: {
          label: 'Default log database',
          description: 'the default database used by the logs query builder',
          name: 'defaultDatabase',
          placeholder: 'default'
        },
        defaultTable: {
          label: 'Default log table',
          description: 'the default table used by the logs query builder',
          name: 'defaultTable',
          placeholder: 'otel_logs'
        },
        columns: {
          title: 'Default columns',
          description: 'Default columns for log queries. Leave empty to disable.',
          
          time: {
           label: 'Time column',
           tooltip: 'Column for the log timestamp'
           },
           level: {
             label: 'Log Level column',
             tooltip: 'Column for the log level'
           },
           message: {
             label: 'Log Message column',
             tooltip: 'Column for log message'
           }
         }
      }
    },
    EditorTypeSwitcher: {
      label: 'Editor Type',
      tooltip: 'Switches between the raw SQL Editor and the Query Builder.',
      switcher: {
        title: 'Are you sure?',
        body: 'Queries that are too complex for the Query Builder will be altered.',
        confirmText: 'Continue',
        dismissText: 'Cancel',
      },
      cannotConvert: {
        title: 'Cannot convert',
        message: 'Do you want to delete your current query and use the query builder?',
        confirmText: 'Yes',
      },
    },
    expandBuilderButton: {
      label: 'Show full query',
      tooltip: 'Shows the full query builder'
    },
    QueryTypeSwitcher: {
      label: 'Query Type',
      tooltip: 'Sets the layout for the query builder',
      sqlTooltip: 'Sets the panel type for explore view'
    },
    DatabaseSelect: {
      label: 'Database',
      tooltip: 'ClickHouse database to query from',
      empty: '<select database>',
    },
    TableSelect: {
      label: 'Table',
      tooltip: 'ClickHouse table to query from',
      empty: '<select table>',
    },
    ColumnsEditor: {
      label: 'Columns',
      tooltip: 'A list of columns to include in the query'
    },
    OtelVersionSelect: {
      label: 'Use OTel',
      tooltip: 'Enables Open Telemetry schema versioning'
    },
    LimitEditor: {
      label: 'Limit',
      tooltip: 'Limits the number of rows returned by the query'
    },
    SqlPreview: {
      label: 'SQL Preview',
      tooltip: 'Preview of the generated SQL. You can safely switch to SQL Editor to customize the generated query',
    },
    AggregatesEditor: {
      label: 'Aggregates',
      tooltip: 'Aggregate functions to use',
      aliasLabel: 'as',
      aliasTooltip: 'alias for this aggregate function',
      addLabel: 'Aggregate',
    },
    OrderByEditor: {
      label: 'Order By',
      tooltip: 'Order by column',
      addLabel: 'Order By',
    },
    FilterEditor: {
      label: 'Filters',
      tooltip: `List of filters`,
      addLabel: 'Filter',
      mapKeyPlaceholder: 'map key'
    },
    GroupByEditor: {
      label: 'Group By',
      tooltip: 'Group the results by specific column',
    },
    LogsQueryBuilder: {
      logTimeColumn: {
        label: 'Time',
        tooltip: 'Column that contains the log timestamp'
      },
      logLevelColumn: {
        label: 'Log Level',
        tooltip: 'Column that contains the log level'
      },
      logMessageColumn: {
        label: 'Message',
        tooltip: 'Column that contains the log message'
      },
      liveView: {
        label: 'Live View',
        tooltip: 'Enable to update logs in real time'
      },
      logMessageFilter: {
        label: 'Message Filter',
        tooltip: 'Applies a LIKE filter to the log message body',
        clearButton: 'Clear'
      },
      logLevelFilter: {
        label: 'Level Filter',
        tooltip: 'Applies a filter to the log level'
      },
    },
    TimeSeriesQueryBuilder: {
      simpleQueryModeLabel: 'Simple',
      aggregateQueryModeLabel: 'Aggregate',
      builderModeLabel: 'Builder Mode',
      builderModeTooltip: 'Switches the query builder between the simple and aggregate modes',
      timeColumn: {
        label: 'Time',
        tooltip: 'Column to use for the time series'
      },
    },
    TableQueryBuilder: {
      simpleQueryModeLabel: 'Simple',
      aggregateQueryModeLabel: 'Aggregate',
      builderModeLabel: 'Builder Mode',
      builderModeTooltip: 'Switches the query builder between the simple and aggregate modes',
    },
    TraceQueryBuilder: {
      traceIdModeLabel: 'Trace ID',
      traceSearchModeLabel: 'Trace Search',
      traceModeLabel: 'Trace Mode',
      traceModeTooltip: 'Switches between trace ID and trace search mode',
      columnsSection: 'Columns',
      filtersSection: 'Filters',

      columns: {
        traceId: {
          label: 'Trace ID Column',
          tooltip: 'Column that contains the trace ID'
        },
        spanId: {
          label: 'Span ID Column',
          tooltip: 'Column that contains the span ID'
        },
        parentSpanId: {
          label: 'Parent Span ID Column',
          tooltip: 'Column that contains the parent span ID'
        },
        serviceName: {
          label: 'Service Name Column',
          tooltip: 'Column that contains the service name'
        },
        operationName: {
          label: 'Operation Name Column',
          tooltip: 'Column that contains the operation name'
        },
        startTime: {
          label: 'Start Time Column',
          tooltip: 'Column that contains the start time'
        },
        durationTime: {
          label: 'Duration Time Column',
          tooltip: 'Column that contains the duration time'
        },
        durationUnit: {
          label: 'Duration Unit',
          tooltip: 'The unit of time used for the duration time'
        },
        tags: {
          label: 'Tags Column',
          tooltip: 'Column that contains the trace tags'
        },
        serviceTags: {
          label: 'Service Tags Column',
          tooltip: 'Column that contains the service tags'
        },
        traceIdFilter: {
          label: 'Trace ID',
          tooltip: 'filter by a specific trace ID'
        }
      },
    }
  },
  types: {
    EditorType: {
      sql: 'SQL Editor',
      builder: 'Query Builder',
    },
    QueryType: {
      table: 'Table',
      logs: 'Logs',
      timeseries: 'Time Series',
      traces: 'Traces',
    },
    ColumnHint: {
      [ColumnHint.Time]: 'Time',

      [ColumnHint.LogLevel]: 'Level',
      [ColumnHint.LogMessage]: 'Message',

      [ColumnHint.TraceId]: 'Trace ID',
      [ColumnHint.TraceSpanId]: 'Span ID',
      [ColumnHint.TraceParentSpanId]: 'Parent Span ID',
      [ColumnHint.TraceServiceName]: 'Service Name',
      [ColumnHint.TraceOperationName]: 'Operation Name',
      [ColumnHint.TraceDurationTime]: 'Duration Time',
      [ColumnHint.TraceTags]: 'Tags',
      [ColumnHint.TraceServiceTags]: 'Service Tags',
    }
  }
}
