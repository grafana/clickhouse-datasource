export default {
  components: {
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
        confirmText: 'Yes',
      },
    },
    QueryTypeSwitcher: {
      label: 'Query Type',
      tooltip: 'Sets the layout for the query builder'
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
      label: 'OTEL Logs',
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

      fields: {
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
    }
  }
}
