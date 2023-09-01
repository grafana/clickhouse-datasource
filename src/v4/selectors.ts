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
