import { ColumnHint } from 'types/queryBuilder';

export default {
  components: {
    Config: {
      ConfigEditor: {
        serverAddress: {
          label: 'Server address',
          placeholder: 'Server address',
          tooltip: 'ClickHouse host address',
          error: 'Server address required',
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
        path: {
          label: 'HTTP URL Path',
          tooltip: 'Additional URL path for HTTP requests',
          placeholder: 'additional-path',
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
        enableRowLimit: {
          label: 'Enable row limit',
          testid: 'data-testid enable-row-limit-switch',
          tooltip:
            'Enable using the Grafana row limit setting to limit the number of rows returned from Clickhouse. Ensure the appropriate permissions are set for your user. Only supported for Grafana >= 11.0.0. Defaults to false.',
        },
        hideTableNameInAdhocFilters: {
          label: 'Hide table name in ad hoc filters',
          testid: 'data-testid hide-table-name-in-adhoc-filters-switch',
          tooltip:
            'Show only column names in ad hoc filter keys instead of the full "table.column" format. This simplifies the filter interface when working with schemas that have many tables. Defaults to false.',
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
        traceIdCorrelation: {
          title: 'Trace ID correlation',
          description: 'Options for showing links to correlated data.',

          showTraceLinks: {
            label: 'Show "View trace" links',
            tooltip: 'Show "View trace" links on trace_id/traceid fields.',
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

          filterTime: {
            label: 'Filter Time column',
            tooltip: 'A lower precision column for filtering logs by timestamp',
          },
          time: {
            label: 'Time column',
            tooltip: 'Column for the log timestamp, used for high precision sorting',
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
        traceIdCorrelation: {
          title: 'Trace ID correlation',
          description: 'Options for showing links to correlated data.',

          showLogLinks: {
            label: 'Show "View logs" links',
            tooltip: 'Show "View logs" links on trace_id/traceid fields.',
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
      tooltip: 'Shows the full query builder',
    },
    QueryTypeSwitcher: {
      label: 'Query Type',
      tooltip: 'Sets the layout for the query builder',
      sqlTooltip: 'Sets the panel type for explore view',
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
      tooltip: 'A list of columns to include in the query',
    },
    OtelVersionSelect: {
      label: 'Use OTel',
      tooltip: 'Enables Open Telemetry schema versioning',
    },
    LimitEditor: {
      label: 'Limit',
      tooltip: 'Limits the number of rows returned by the query',
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
      mapKeyPlaceholder: 'map key',
    },
    GroupByEditor: {
      label: 'Group By',
      tooltip: 'Group the results by specific column',
    },
    LogsQueryBuilder: {
      columnsHelp: {
        text: 'Map your table columns to the roles the logs panel expects. Each column is aliased in the generated SQL.',
        linkText: 'Learn about column roles',
        href: 'https://grafana.com/docs/plugins/grafana-clickhouse-datasource/latest/query-editor/#column-roles',
      },
      logTimeColumn: {
        label: 'Time',
        tooltip:
          'Primary log timestamp. Aliased to `timestamp` in the generated SQL. Common names: Timestamp, timestamp, event_time, @timestamp, created_at. OTel: Timestamp.',
      },
      logLevelColumn: {
        label: 'Log Level',
        tooltip:
          'Log severity. Aliased to `level` in the generated SQL. Common names: level, severity, severity_text, log_level. OTel: SeverityText.',
      },
      logMessageColumn: {
        label: 'Message',
        tooltip:
          'Log message body. Aliased to `body` in the generated SQL. Common names: message, msg, body, log_message. OTel: Body.',
      },
      liveView: {
        label: 'Live View',
        tooltip: 'Enable to update logs in real time',
      },
      logMessageFilter: {
        label: 'Message Filter',
        tooltip: 'Applies a LIKE filter to the log message body',
        clearButton: 'Clear',
      },
      logLevelFilter: {
        label: 'Level Filter',
        tooltip: 'Applies a filter to the log level',
      },
    },
    TimeSeriesQueryBuilder: {
      simpleQueryModeLabel: 'Simple',
      aggregateQueryModeLabel: 'Aggregate',
      builderModeLabel: 'Builder Mode',
      builderModeTooltip: 'Switches the query builder between the simple and aggregate modes',
      columnsHelp: {
        text: 'The Time column is required — it anchors the series to the panel time range. Other selected columns become value series.',
        linkText: 'Learn about column roles',
        href: 'https://grafana.com/docs/plugins/grafana-clickhouse-datasource/latest/query-editor/#column-roles',
      },
      timeColumn: {
        label: 'Time',
        tooltip:
          'Timestamp used to order and bucket the series. Must be a DateTime/DateTime64 column. Common names: time, timestamp, event_time. OTel: Timestamp.',
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
      columnsHelp: {
        text: 'Map your table columns to the roles the traces panel expects. Each column is aliased in the generated SQL.',
        linkText: 'Learn about column roles',
        href: '/docs/plugins/grafana-clickhouse-datasource/latest/query-editor/#column-roles',
      },

      columns: {
        traceId: {
          label: 'Trace ID Column',
          tooltip:
            'Identifier shared by all spans in a trace. Aliased to `traceID` in the generated SQL. Common names: trace_id, traceId. OTel: TraceId.',
        },
        spanId: {
          label: 'Span ID Column',
          tooltip:
            'Identifier for an individual span. Aliased to `spanID` in the generated SQL. Common names: span_id, spanId. OTel: SpanId.',
        },
        parentSpanId: {
          label: 'Parent Span ID Column',
          tooltip:
            'Parent span reference, empty for root spans. Aliased to `parentSpanID` in the generated SQL. Common names: parent_span_id, parentSpanId. OTel: ParentSpanId.',
        },
        serviceName: {
          label: 'Service Name Column',
          tooltip:
            'Name of the service that emitted the span. Aliased to `serviceName` in the generated SQL. Common names: service, service_name. OTel: ServiceName.',
        },
        operationName: {
          label: 'Operation Name Column',
          tooltip:
            'Name of the operation or endpoint. Aliased to `operationName` in the generated SQL. Common names: operation, operation_name, span_name. OTel: SpanName.',
        },
        startTime: {
          label: 'Start Time Column',
          tooltip:
            'Span start time. Used to filter by the panel time range. Must be a DateTime/DateTime64 column. Common names: start_time, timestamp. OTel: Timestamp.',
        },
        durationTime: {
          label: 'Duration Time Column',
          tooltip:
            'Span duration. Set the unit field to match your column (ns, ms, s, ...). Common names: duration, duration_ns, duration_ms. OTel: Duration.',
        },
        durationUnit: {
          label: 'Duration Unit',
          tooltip:
            'Unit used by your Duration column. OTel stores nanoseconds; other schemas often use milliseconds or seconds.',
        },
        tags: {
          label: 'Tags Column',
          tooltip:
            'Span attributes, typically a Map. Aliased to `tags` in the generated SQL. Common names: tags, attributes. OTel: SpanAttributes.',
        },
        serviceTags: {
          label: 'Service Tags Column',
          tooltip:
            'Resource-level attributes, typically a Map. Aliased to `serviceTags` in the generated SQL. Common names: resource, resource_attributes. OTel: ResourceAttributes.',
        },
        flattenNested: {
          label: 'Use Flatten Nested',
          tooltip: 'Enable if your traces table was created with flatten_nested=1',
        },
        eventsPrefix: {
          label: 'Events Prefix',
          tooltip: 'Prefix for the events column (OTel default: `Events`)',
        },
        linksPrefix: {
          label: 'Links Prefix',
          tooltip: 'Prefix for the trace references column (OTel default: `Links`)',
        },
        kind: {
          label: 'Kind Column',
          tooltip:
            'Kind of span (SERVER, CLIENT, PRODUCER, CONSUMER, INTERNAL). Common names: kind, span_kind. OTel: SpanKind.',
        },
        statusCode: {
          label: 'Status Code Column',
          tooltip:
            'Span status code (Ok, Error, Unset). Aliased to `statusCode` in the generated SQL. OTel: StatusCode.',
        },
        statusMessage: {
          label: 'Status Message Column',
          tooltip:
            'Human-readable status description for the span. Common names: status_message. OTel: StatusMessage.',
        },
        instrumentationLibraryName: {
          label: 'Library Name Column',
          tooltip:
            'Name of the instrumentation library (Optional). OTel: ScopeName or InstrumentationLibraryName.',
        },
        instrumentationLibraryVersion: {
          label: 'Library Version Column',
          tooltip:
            'Version of the instrumentation library (Optional). OTel: ScopeVersion or InstrumentationLibraryVersion.',
        },
        state: {
          label: 'State Column',
          tooltip: 'W3C trace state baggage passed alongside the trace. OTel: TraceState.',
        },
        traceIdFilter: {
          label: 'Trace ID',
          tooltip: 'filter by a specific trace ID',
        },
      },
    },
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
      [ColumnHint.FilterTime]: 'Filter Time',
      [ColumnHint.Time]: 'Time',

      [ColumnHint.ResourceAttributes]: 'Resource Attributes',
      [ColumnHint.ScopeAttributes]: 'Scope Attributes',
      [ColumnHint.LogAttributes]: 'Log Attributes',

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
      [ColumnHint.TraceStatusCode]: 'Status Code',
      [ColumnHint.TraceKind]: 'Kind',
      [ColumnHint.TraceStatusMessage]: 'Status Message',
      [ColumnHint.TraceInstrumentationLibraryName]: 'Instrumentation Library Name',
      [ColumnHint.TraceInstrumentationLibraryVersion]: 'Instrumentation Library Version',
      [ColumnHint.TraceState]: 'State',
    },
  },
};
