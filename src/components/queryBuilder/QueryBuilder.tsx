import React, { useState, useEffect } from 'react';
import defaultsDeep from 'lodash/defaultsDeep';
import { Datasource } from '../../data/CHDatasource';
import { TableSelect } from './TableSelect';
import { ModeEditor } from './ModeEditor';
import { FieldsEditor } from './Fields';
import { MetricsEditor } from './Metrics';
import { TimeFieldEditor } from './TimeField';
import { FiltersEditor } from './Filters';
import { GroupByEditor } from './GroupBy';
import { OrderByEditor, getOrderByFields } from './OrderBy';
import { LimitEditor } from './Limit';
import {
  SqlBuilderOptions,
  defaultCHBuilderQuery,
  OrderBy,
  BuilderMode,
  BuilderMetricField,
  BuilderMetricFieldAggregation,
  FullField,
  Filter,
  SqlBuilderOptionsTrend,
} from './../../types';
import { DatabaseSelect } from './DatabaseSelect';

interface QueryBuilderProps {
  builderOptions: SqlBuilderOptions;
  onBuilderOptionsChange: (builderOptions: SqlBuilderOptions) => void;
  datasource: Datasource;
}

export const QueryBuilder = (props: QueryBuilderProps) => {
  const [baseFieldsList, setBaseFieldsList] = useState<FullField[]>([]);
  const builder = defaultsDeep(props.builderOptions, defaultCHBuilderQuery.builderOptions);
  useEffect(() => {
    const fetchBaseFields = async (table: string) => {
      props.datasource
        .fetchFieldsFull(table)
        .then(async (fields) => {
          setBaseFieldsList(fields);
        })
        .catch((ex: any) => {
          console.error(ex);
          throw ex;
        });
    };
    
    if (builder.table) {
      fetchBaseFields(builder.table);
    }
    // We want to run this only when the table changes or first time load.
    // If we add 'builder.fields' / 'builder.groupBy' / 'builder.metrics' / 'builder.filters' to the deps array, this will be called every time query editor changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.datasource, builder.table]);

  const onDatabaseChange = (database = '') => {
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
        metrics: builder.metrics || [
          { field: 'Id', aggregation: BuilderMetricFieldAggregation.Count, alias: 'total_count' },
        ],
      };
      props.onBuilderOptionsChange(queryOptions);
    } else if (mode === BuilderMode.Trend) {
      const queryOptions: SqlBuilderOptionsTrend = {
        ...builder,
        mode: BuilderMode.Trend,
        timeField: builder.timeField || 'CreatedDate',
        timeFieldType: builder.timeFieldType || 'datetime',
        metrics: builder.metrics || [
          { field: 'Id', aggregation: BuilderMetricFieldAggregation.Count, alias: 'total_count' },
        ],
      };
      props.onBuilderOptionsChange(queryOptions);
    }
  };

  const onFieldsChange = (fields: string[] = []) => {
    const queryOptions: SqlBuilderOptions = { ...builder, fields };
    props.onBuilderOptionsChange(queryOptions);
  };

  const onMetricsChange = (
    metrics: BuilderMetricField[] = [
      { field: 'Id', aggregation: BuilderMetricFieldAggregation.Count, alias: 'total_count' },
    ]
  ) => {
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
      </div>
      <div className="gf-form">
        <TableSelect datasource={props.datasource} database={builder.database} table={builder.table} onTableChange={onTableChange} />
        <ModeEditor mode={builder.mode} onModeChange={onModeChange} />
      </div>
      {builder.mode === BuilderMode.List && (
        <FieldsEditor
          fields={builder.fields || []}
          onFieldsChange={onFieldsChange}
          fieldsList={fieldsList}
        />
      )}
      {(builder.mode === BuilderMode.Aggregate || builder.mode === BuilderMode.Trend) && (
        <MetricsEditor
          metrics={builder.metrics || []}
          onMetricsChange={onMetricsChange}
          fieldsList={fieldsList}
        />
      )}
      <FiltersEditor
        filters={builder.filters || []}
        onFiltersChange={onFiltersChange}
        fieldsList={fieldsList}
      />
      {builder.mode === BuilderMode.Trend && (
        <TimeFieldEditor
          timeField={builder.timeField}
          timeFieldType={builder.timeFieldType}
          onTimeFieldChange={onTimeFieldChange}
          fieldsList={fieldsList}
        />
      )}
      {builder.mode === BuilderMode.Aggregate && (
        <GroupByEditor
          groupBy={builder.groupBy || []}
          onGroupByChange={onGroupByChange}
          fieldsList={fieldsList}
        />
      )}
      {builder.mode !== BuilderMode.Trend && (
        <>
          <OrderByEditor
            orderBy={builder.orderBy || []}
            onOrderByItemsChange={onOrderByChange}
            fieldsList={getOrderByFields(builder, fieldsList)}
          />
          <LimitEditor limit={builder.limit || 20} onLimitChange={onLimitChange} />
        </>
      )}
    </>
  ) : null;
};
