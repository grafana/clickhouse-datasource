import { ColumnHint, Filter, QueryBuilderOptions, QueryType, SelectedColumn } from "types/queryBuilder";
import { CHBuilderQuery, CHQuery, CHSqlQuery, EditorType } from "types/sql";
import { isVersionGtOrEq, pluginVersion } from "utils/version";
import { mapGrafanaFormatToQueryType } from "./utils";

export type AnyCHQuery = Partial<CHQuery> & {[k: string]: any};
export type AnyQueryBuilderOptions = Partial<QueryBuilderOptions> & {[k: string]: any};

/**
 * Takes a CHQuery and transforms it to the latest interface.
 * Returns undefined if no migration is applied.
 */
export const migrateCHQuery = (savedQuery: CHQuery): CHQuery | undefined => {
  if (savedQuery.rawSql === undefined) {
    return undefined;
  }

  if (isV3CHQuery(savedQuery)) {
    return migrateV3CHQuery(savedQuery);
  }

  return undefined;
};

/**
 * Takes v3 CHQuery and returns a version compatible with the latest editor.
 */
const migrateV3CHQuery = (savedQuery: AnyCHQuery): CHQuery => {
  // Builder Query
  if (savedQuery['queryType'] === 'builder') {
    const builderQuery: CHBuilderQuery = {
      ...savedQuery,
      pluginVersion,
      editorType: EditorType.Builder,
      builderOptions: migrateV3QueryBuilderOptions(savedQuery['builderOptions'] || {}),
      rawSql: savedQuery.rawSql || '',
      refId: savedQuery.refId || '',
      format: savedQuery.format,
      meta: {}
    };

    if (savedQuery?.meta?.timezone) {
      builderQuery.meta!.timezone = savedQuery.meta.timezone;
    }

    // delete unwanted properties from v3
    delete (builderQuery as any)['queryType'];
    delete (builderQuery as any)['selectedFormat'];

    return builderQuery;
  }

  // Raw SQL Query
  const rawSqlQuery: CHSqlQuery = {
    ...savedQuery,
    pluginVersion,
    editorType: EditorType.SQL,
    rawSql: savedQuery.rawSql || '',
    refId: savedQuery.refId || '',
    format: savedQuery.format,
    queryType: mapGrafanaFormatToQueryType(savedQuery.format),
    meta: {}
  };

  if (savedQuery.expand) {
    rawSqlQuery.expand = savedQuery.expand;
  }

  if (savedQuery.meta) {
    const meta = (savedQuery.meta as any);
    if (meta.timezone) {
      rawSqlQuery.meta!.timezone = meta.timezone;
    }

    if (meta.builderOptions) {
      rawSqlQuery.meta!.builderOptions = migrateV3QueryBuilderOptions(meta.builderOptions);
    }
  }

  // delete unwanted properties from v3
  delete (rawSqlQuery as any)['builderOptions'];
  delete (rawSqlQuery as any)['selectedFormat'];

  return rawSqlQuery;
};

/**
 * Takes v3 options and returns a version compatible with the latest builder.
 */
const migrateV3QueryBuilderOptions = (savedOptions: AnyQueryBuilderOptions): QueryBuilderOptions => {
  const mapped: QueryBuilderOptions = {
    database: savedOptions.database || '',
    table: savedOptions.table || '',
    queryType: getV3QueryType(savedOptions)
  };

  if (savedOptions.mode) {
    mapped.mode = savedOptions.mode;
  }

  if (savedOptions['fields'] || Array.isArray(savedOptions['fields'])) {
    const oldColumns: string[] = savedOptions['fields'];
    const timeField: string = savedOptions['timeField'];
    const timeFieldType: string = savedOptions['timeFieldType'];
    const logLevelField: string = savedOptions['logLevelField'];

    mapped.columns = oldColumns.map((colName: string) => {
      const result: SelectedColumn = {
        name: colName,
      };

      if (colName === timeField) {
        result.hint = ColumnHint.Time;
        if (timeFieldType) {
          result.type = timeFieldType;
        }
      } else if (colName === logLevelField) {
        result.hint = ColumnHint.LogLevel;
      }

      return result;
    });
  }

  if (savedOptions['metrics'] || Array.isArray(savedOptions['metrics'])) {
    const oldAggregates: any[] = savedOptions['metrics'];
    mapped.aggregates = oldAggregates.map(agg => ({
      aggregateType: agg['aggregation'],
      column: agg['field'],
      alias: agg['alias']
    }));
  }

  if (savedOptions.filters || Array.isArray(savedOptions.filters)) {
    const oldFilters: Filter[] = savedOptions.filters;
    const timeField: string = savedOptions['timeField'];
    const logLevelField: string = savedOptions['logLevelField'];

    mapped.filters = oldFilters.map((filter: Filter) => {
      const result: Filter = {
        ...filter
      };

      if (filter.key === timeField) {
        result.hint = ColumnHint.Time;
      } else if (filter.key === logLevelField) {
        result.hint = ColumnHint.LogLevel;
      }

      return result;
    });
  }

  if (savedOptions.groupBy || Array.isArray(savedOptions.groupBy)) {
    mapped.groupBy = savedOptions.groupBy;
  }

  if (savedOptions.orderBy || Array.isArray(savedOptions.orderBy)) {
    mapped.orderBy = savedOptions.orderBy;
  }

  if (savedOptions.limit !== undefined && savedOptions.limit >= 0) {
    mapped.limit = savedOptions.limit;
  }

  return mapped;
};


/**
 * Checks if CHQuery is from <= v3 options.
 */
const isV3CHQuery = (savedQuery: AnyCHQuery): boolean => {
  // pluginVersion was added in v4
  const oldPluginVersion = !savedQuery['pluginVersion'] || !isVersionGtOrEq(savedQuery.pluginVersion, '4.0.0');
  const oldQueryType = savedQuery['queryType'] === 'sql' || savedQuery['queryType'] === 'builder';
  return oldPluginVersion || oldQueryType;
};

/**
 * Takes v3 options and returns the optimal QueryType. Defaults to QueryType.Table.
 */
const getV3QueryType = (savedOptions: AnyQueryBuilderOptions): QueryType => {
  if (savedOptions['timeField']) {
    return QueryType.TimeSeries;
  } else if (savedOptions['logLevelField']) {
    return QueryType.Logs;
  }

  return QueryType.Table;
};
