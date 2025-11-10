import { E2ESelectors } from '@grafana/e2e-selectors';
export const Components = {
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
        tooltip: 'ClickHouse database to query from',
      },
      FROM: {
        label: 'Table',
        tooltip: 'ClickHouse table to query from',
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
        tooltip: 'Select the field to extract log level information from',
      },
      PREVIEW: {
        label: 'SQL Preview',
        tooltip: 'SQL Preview. You can safely switch to SQL Editor to customize the generated query',
      },
    },
  },
  Config: {
    HttpHeaderConfig: {
      headerEditor: 'config__http-header-config__header-editor',
      addHeaderButton: 'config__http-header-config__add-header-button',
      removeHeaderButton: 'config__http-header-config__remove-header-button',
      headerSecureSwitch: 'config__http-header-config__header-secure-switch',
      headerNameInput: 'config__http-header-config__header-name-input',
      headerValueInput: 'config__http-header-config__header-value-input',
      forwardGrafanaHeadersSwitch: 'config__http-header-config__forward-grafana-headers-switch',
    },
    AliasTableConfig: {
      aliasEditor: 'config__alias-table-config__alias-editor',
      addEntryButton: 'config__alias-table-config__add-entry-button',
      removeEntryButton: 'config__alias-table-config__remove-entry-button',
      targetDatabaseInput: 'config__alias-table-config__target-database-input',
      targetTableInput: 'config__alias-table-config__target-table-input',
      aliasDatabaseInput: 'config__alias-table-config__alias-database-input',
      aliasTableInput: 'config__alias-table-config__alias-table-input',
    },
  },
  LogsContextPanel: {
    alert: 'logs-context-panel__alert',
    LogsContextKey: 'logs-context-panel__logs-context-key',
  },
  QueryBuilder: {
    expandBuilderButton: 'query-builder__expand-builder-button',
    LogsQueryBuilder: {
      LogMessageLikeInput: {
        input: 'query-builder__logs-query-builder__log-message-like-input__input',
      },
    },
    AggregateEditor: {
      sectionLabel: 'query-builder__aggregate-editor__section-label',
      itemWrapper: 'query-builder__aggregate-editor__item-wrapper',
      itemRemoveButton: 'query-builder__aggregate-editor-item-remove-button',
      addButton: 'query-builder__aggregate-editor__add-button',
    },
    ColumnsEditor: {
      multiSelectWrapper: 'query-builder__columns-editor__multi-select-wrapper',
    },
    GroupByEditor: {
      multiSelectWrapper: 'query-builder__group-by__multi-select-wrapper',
    },
    LimitEditor: {
      input: 'query-builder__limit-editor__input',
    },
    TraceIdInput: {
      input: 'query-builder__trace-id-input__input',
    },
  },
};
export const selectors: { components: E2ESelectors<typeof Components> } = {
  components: Components,
};
