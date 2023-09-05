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
    },
    TableSelect: {
      label: 'Table',
      tooltip: 'ClickHouse table to query from',
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
      builderModeTooltip: 'Switches the query builder between the simple and aggregate modes'
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
      timeSeries: 'Time Series',
      traces: 'Traces',
    }
  }
}
