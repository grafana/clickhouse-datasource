import React, { useEffect, useState } from 'react';
import defaultsDeep from 'lodash/defaultsDeep';
import { Datasource } from '../../data/CHDatasource';
import { TableSelect } from './TableSelect';
import { ModeEditor } from './ModeEditor';
import { FieldsEditor } from './Fields';
import { MetricsEditor } from './Metrics';
import { TimeFieldEditor } from './TimeField';
import { FiltersEditor, PredefinedFilter } from './Filters';
import { GroupByEditor } from './GroupBy';
import { getOrderByFields, OrderByEditor } from './OrderBy';
import { LimitEditor } from './Limit';
import {
  BuilderMetricField,
  BuilderMode,
  defaultCHBuilderQuery,
  Filter,
  FilterOperator,
  Format,
  FullField,
  OrderBy,
  SqlBuilderOptions,
  SqlBuilderOptionsTrend,
} from '../../types';
import { DatabaseSelect } from './DatabaseSelect';
import { isDateTimeType, isDateType } from './utils';
import { selectors } from '../../selectors';
import { LogLevelFieldEditor } from './LogLevelField';

interface QueryBuilderProps {
  builderOptions: SqlBuilderOptions;
  onBuilderOptionsChange: (builderOptions: SqlBuilderOptions) => void;
  datasource: Datasource;
  format: Format;
}

export const QueryBuilder = (props: QueryBuilderProps) => {
  const [baseFieldsList, setBaseFieldsList] = useState<FullField[]>([]);
  const builder = defaultsDeep(props.builderOptions, defaultCHBuilderQuery.builderOptions);
  useEffect(() => {
    const fetchBaseFields = async (database: string, table: string) => {
      props.datasource
        .fetchFieldsFull(database, table)
        .then(async (fields) => {
          fields.push({ name: '*', label: 'ALL', type: 'string', picklistValues: [] });
          setBaseFieldsList(fields);

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

    if (builder.table) {
      fetchBaseFields(builder.database, builder.table);
    }
    // We want to run this only when the table changes or first time load.
    // If we add 'builder.fields' / 'builder.groupBy' / 'builder.metrics' / 'builder.filters' to the deps array, this will be called every time query editor changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.datasource, builder.table]);

  const onDatabaseChange = (database = '') => {
    setBaseFieldsList([]);
    const queryOptions: SqlBuilderOptions = {
      ...builder,
      database,
      table: '',
      fields: [],
      filters: [],
      orderBy: [],
    };
    props.onBuilderOptionsChange(queryOptions);
  };

  const onTableChange = (table = '') => {
    const queryOptions: SqlBuilderOptions = {
      ...builder,
      table,
      fields: [],
      filters: [],
      orderBy: [],
    };
    props.onBuilderOptionsChange(queryOptions);
  };

  const onModeChange = (mode: BuilderMode) => {
    if (mode === BuilderMode.List) {
      const queryOptions: SqlBuilderOptions = { ...builder, mode, fields: builder.fields || [], orderBy: [] };
      props.onBuilderOptionsChange(queryOptions);
    } else if (mode === BuilderMode.Aggregate) {
      const queryOptions: SqlBuilderOptions = {
        ...builder,
        mode,
        orderBy: [],
        metrics: builder.metrics || [],
      };
      props.onBuilderOptionsChange(queryOptions);
    } else if (mode === BuilderMode.Trend) {
      const queryOptions: SqlBuilderOptionsTrend = {
        ...builder,
        mode: BuilderMode.Trend,
        timeField: builder.timeField || '',
        timeFieldType: builder.timeFieldType || 'datetime',
        metrics: builder.metrics || [],
      };
      props.onBuilderOptionsChange(queryOptions);
    }
  };

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
    const queryOptions: SqlBuilderOptions = { ...builder, timeField, timeFieldType };
    props.onBuilderOptionsChange(queryOptions);
  };

  const onLogLevelFieldChange = (logLevelField = '') => {
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
      <div className="gf-form">
        <DatabaseSelect datasource={props.datasource} value={builder.database} onChange={onDatabaseChange} />
        <ModeEditor mode={builder.mode} onModeChange={onModeChange} />
      </div>
      <div className="gf-form">
        <TableSelect
          datasource={props.datasource}
          database={builder.database}
          table={builder.table}
          onTableChange={onTableChange}
        />
      </div>
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
        // TODO: show only in the Explore mode
        builder.mode === BuilderMode.List && props.format === Format.LOGS && (
          <>
            <TimeFieldEditor
              timeField={builder.timeField}
              timeFieldType={builder.timeFieldType}
              onTimeFieldChange={onTimeFieldChange}
              fieldsList={fieldsList}
              timeFieldTypeCheckFn={isDateTimeType}
              labelAndTooltip={selectors.components.QueryEditor.QueryBuilder.LOGS_VOLUME_TIME_FIELD}
            />
            <LogLevelFieldEditor fieldsList={fieldsList} onLogLevelFieldChange={onLogLevelFieldChange} />
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
