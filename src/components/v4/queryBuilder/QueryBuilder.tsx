import React, { useEffect, useState } from 'react';
import defaultsDeep from 'lodash/defaultsDeep';
import { Datasource } from '../../../data/CHDatasource';
import { FieldsEditor } from '../../queryBuilder/Fields';
import { MetricsEditor } from '../../queryBuilder/Metrics';
import { TimeFieldEditor } from '../../queryBuilder/TimeField';
import { FiltersEditor, PredefinedFilter } from '../../queryBuilder/Filters';
import { GroupByEditor } from '../../queryBuilder/GroupBy';
import { getOrderByFields, OrderByEditor } from '../../queryBuilder/OrderBy';
import { LimitEditor } from '../../queryBuilder/Limit';
import { QueryType, defaultCHBuilderQuery } from 'types/sql';
import {
  BuilderMetricField,
  BuilderMode,
  Filter,
  FilterOperator,
  FullField,
  OrderBy,
  SqlBuilderOptions,
} from 'types/queryBuilder';
import { isDateTimeType, isDateType } from '../../queryBuilder/utils';
import { selectors } from 'selectors';
import { LogLevelFieldEditor } from '../../queryBuilder/LogLevelField';
import { CoreApp } from '@grafana/data';
import useTableColumns from 'hooks/useTableColumns';
import { LogsQueryBuilder } from './views/LogsQueryBuilder';
import { TimeSeriesQueryBuilder } from './views/TimeSeriesQueryBuilder';

interface QueryBuilderProps {
  builderOptions: SqlBuilderOptions;
  onBuilderOptionsChange: (builderOptions: SqlBuilderOptions) => void;
  datasource: Datasource;
  queryType: QueryType;
  database: string;
  table: string;
  app: CoreApp | undefined;
}

export const QueryBuilder = (props: QueryBuilderProps) => {
  const { datasource, database, table, builderOptions, onBuilderOptionsChange } = props;
  const allColumns = useTableColumns(datasource, database, table);
  const builder = defaultsDeep(builderOptions, defaultCHBuilderQuery.builderOptions);

  useEffect(() => {
    if (builder.database === database) {
      return;
    }
    const queryOptions: SqlBuilderOptions = {
      ...builder,
      database,
      table: '',
      fields: [],
      filters: [],
      orderBy: [],
      timeField: undefined,
      logLevelField: undefined,
    };
    onBuilderOptionsChange(queryOptions);
  }, [builder, database, onBuilderOptionsChange]);
  useEffect(() => {
    if (builder.table === table) {
      return;
    }
    const queryOptions: SqlBuilderOptions = {
      ...builder,
      table: table,
      fields: [],
      filters: [],
      orderBy: [],
      timeField: undefined,
      logLevelField: undefined,
    };
    onBuilderOptionsChange(queryOptions);
  }, [builder, table, onBuilderOptionsChange]);

  return (
    <div>
      { props.queryType === QueryType.Table && <TimeSeriesQueryBuilder allColumns={allColumns} builderOptions={builder} onBuilderOptionsChange={onBuilderOptionsChange} /> }
      { props.queryType === QueryType.Logs && <LogsQueryBuilder allColumns={allColumns} builderOptions={builder} onBuilderOptionsChange={onBuilderOptionsChange} /> }
      { props.queryType === QueryType.TimeSeries && <TimeSeriesQueryBuilder allColumns={allColumns} builderOptions={builder} onBuilderOptionsChange={onBuilderOptionsChange} /> }
    </div>
  );
}

export const OldQueryBuilder = (props: QueryBuilderProps) => {
  const { onBuilderOptionsChange, database, table } = props;
  const [baseFieldsList, setBaseFieldsList] = useState<FullField[]>([]);
  const [timeField, setTimeField] = useState<string | null>(null);
  const [logLevelField, setLogLevelField] = useState<string | null>(null);
  const builder = defaultsDeep(props.builderOptions, defaultCHBuilderQuery.builderOptions);
  useEffect(() => {
    const fetchBaseFields = async (database: string, table: string) => {
      props.datasource
        .fetchFieldsFull(database, table)
        .then(async (fields) => {
          fields.push({ name: '*', label: 'ALL', type: 'string', picklistValues: [] });
          setBaseFieldsList(fields);

          // if no filters are set, we add a default one for the time range
          if (builder.filters?.length === 0) {
            const dateTimeFields = fields.filter((f) => isDateTimeType(f.type));
            if (dateTimeFields.length > 0) {
              const filter: Filter & PredefinedFilter = {
                operator: FilterOperator.WithInGrafanaTimeRange,
                filterType: 'custom',
                key: dateTimeFields[0].name,
                type: 'datetime',
                condition: 'AND',
                restrictToFields: dateTimeFields,
              };
              onFiltersChange([filter]);
            }
          }

          // When changing from SQL Editor to Query Builder, we need to find out if the
          // first value is a datetime or date, so we can change the mode to Time Series
          if (builder.fields?.length > 0) {
            const fieldName = builder.fields[0];
            const timeFields = fields.filter((f) => isDateType(f.type));
            const timeField = timeFields.find((x) => x.name === fieldName);
            if (timeField) {
              const queryOptions: SqlBuilderOptions = {
                ...builder,
                timeField: timeField.name,
                timeFieldType: timeField.type,
                mode: BuilderMode.Trend,
                fields: builder.fields.slice(1, builder.fields.length),
              };
              props.onBuilderOptionsChange(queryOptions);
            }
          }
        })
        .catch((ex: any) => {
          console.error(ex);
          throw ex;
        });
    };

    if (props.database && props.table) {
      fetchBaseFields(props.database, props.table);
    }
    // We want to run this only when the table changes or first time load.
    // If we add 'builder.fields' / 'builder.groupBy' / 'builder.metrics' / 'builder.filters' to the deps array, this will be called every time query editor changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.datasource, props.database, props.table]);

  useEffect(() => {
    if (builder.database === database) {
      return;
    }
    setBaseFieldsList([]);
    setTimeField(null);
    setLogLevelField(null);
    const queryOptions: SqlBuilderOptions = {
      ...builder,
      database,
      table: '',
      fields: [],
      filters: [],
      orderBy: [],
      timeField: undefined,
      logLevelField: undefined,
    };
    onBuilderOptionsChange(queryOptions);
  }, [builder, database, onBuilderOptionsChange]);
  useEffect(() => {
    if (builder.table === table) {
      return;
    }
    setTimeField(null);
    setLogLevelField(null);
    const queryOptions: SqlBuilderOptions = {
      ...builder,
      table,
      fields: [],
      filters: [],
      orderBy: [],
      timeField: undefined,
      logLevelField: undefined,
    };
    onBuilderOptionsChange(queryOptions);
  }, [builder, table, onBuilderOptionsChange]);

  // const onModeChange = (mode: BuilderMode) => {
  //   if (mode === BuilderMode.List) {
  //     const queryOptions: SqlBuilderOptions = { ...builder, mode, fields: builder.fields || [], orderBy: [] };
  //     props.onBuilderOptionsChange(queryOptions);
  //   } else if (mode === BuilderMode.Aggregate) {
  //     const queryOptions: SqlBuilderOptions = {
  //       ...builder,
  //       mode,
  //       orderBy: [],
  //       metrics: builder.metrics || [],
  //     };
  //     props.onBuilderOptionsChange(queryOptions);
  //   } else if (mode === BuilderMode.Trend) {
  //     const queryOptions: SqlBuilderOptionsTrend = {
  //       ...builder,
  //       mode: BuilderMode.Trend,
  //       timeField: builder.timeField || '',
  //       timeFieldType: builder.timeFieldType || 'datetime',
  //       metrics: builder.metrics || [],
  //     };
  //     props.onBuilderOptionsChange(queryOptions);
  //   }
  // };

  const onFieldsChange = (fields: string[] = []) => {
    const queryOptions: SqlBuilderOptions = { ...builder, fields };
    props.onBuilderOptionsChange(queryOptions);
  };

  const onMetricsChange = (metrics: BuilderMetricField[] = []) => {
    const queryOptions: SqlBuilderOptions = { ...builder, metrics };
    props.onBuilderOptionsChange(queryOptions);
  };

  const onFiltersChange = (filters: Filter[] = []) => {
    const queryOptions: SqlBuilderOptions = { ...builder, filters };
    props.onBuilderOptionsChange(queryOptions);
  };

  const onGroupByChange = (groupBy: string[] = []) => {
    const queryOptions: SqlBuilderOptions = { ...builder, groupBy };
    props.onBuilderOptionsChange(queryOptions);
  };

  const onTimeFieldChange = (timeField = '', timeFieldType = '') => {
    setTimeField(timeField);
    const queryOptions: SqlBuilderOptions = { ...builder, timeField, timeFieldType };
    props.onBuilderOptionsChange(queryOptions);
  };

  const onLogLevelFieldChange = (logLevelField = '') => {
    setLogLevelField(logLevelField);
    const queryOptions: SqlBuilderOptions = { ...builder, logLevelField };
    props.onBuilderOptionsChange(queryOptions);
  };

  const onOrderByChange = (orderBy: OrderBy[] = []) => {
    const queryOptions: SqlBuilderOptions = { ...builder, orderBy };
    props.onBuilderOptionsChange(queryOptions);
  };

  const onLimitChange = (limit = 20) => {
    const queryOptions: SqlBuilderOptions = { ...builder, limit };
    props.onBuilderOptionsChange(queryOptions);
  };

  const getFieldList = (): FullField[] => {
    const newArray: FullField[] = [];
    baseFieldsList.forEach((bf) => {
      newArray.push(bf);
    });
    return newArray;
  };
  const fieldsList = getFieldList();
  return builder ? (
    <>
      {/* <ModeEditor mode={builder.mode} onModeChange={onModeChange} /> */}
      {builder.mode === BuilderMode.Trend && (
        <TimeFieldEditor
          timeField={builder.timeField}
          timeFieldType={builder.timeFieldType}
          onTimeFieldChange={onTimeFieldChange}
          fieldsList={fieldsList}
          timeFieldTypeCheckFn={isDateType}
          labelAndTooltip={selectors.components.QueryEditor.QueryBuilder.TIME_FIELD}
        />
      )}
      {
        // Time and LogLevel fields selection for Logs Volume histogram in the Explore mode
        builder.mode === BuilderMode.List && props.queryType === QueryType.Logs && props.app === CoreApp.Explore && (
          <>
            <TimeFieldEditor
              timeField={timeField}
              timeFieldType={builder.timeFieldType}
              onTimeFieldChange={onTimeFieldChange}
              fieldsList={fieldsList}
              timeFieldTypeCheckFn={isDateTimeType}
              labelAndTooltip={selectors.components.QueryEditor.QueryBuilder.LOGS_VOLUME_TIME_FIELD}
            />
            <LogLevelFieldEditor
              logLevelField={logLevelField}
              fieldsList={fieldsList}
              onLogLevelFieldChange={onLogLevelFieldChange}
            />
          </>
        )
      }
      {builder.mode !== BuilderMode.Trend && (
        <FieldsEditor fields={builder.fields || []} onFieldsChange={onFieldsChange} fieldsList={fieldsList} />
      )}

      {(builder.mode === BuilderMode.Aggregate || builder.mode === BuilderMode.Trend) && (
        <MetricsEditor metrics={builder.metrics || []} onMetricsChange={onMetricsChange} fieldsList={fieldsList} />
      )}
      <FiltersEditor filters={builder.filters || []} onFiltersChange={onFiltersChange} fieldsList={fieldsList} />
      {(builder.mode === BuilderMode.Aggregate || builder.mode === BuilderMode.Trend) && (
        <GroupByEditor groupBy={builder.groupBy || []} onGroupByChange={onGroupByChange} fieldsList={fieldsList} />
      )}
      <>
        <OrderByEditor
          orderBy={builder.orderBy || []}
          onOrderByItemsChange={onOrderByChange}
          fieldsList={getOrderByFields(builder, fieldsList)}
        />
        <LimitEditor limit={builder.limit || 20} onLimitChange={onLimitChange} />
      </>
    </>
  ) : null;
};
