import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Datasource } from 'data/CHDatasource';
import {
  FilterOperator,
  MetricFunction,
  MetricSeriesAggregation,
  MetricType,
  QueryBuilderOptions,
  QueryType,
} from 'types/queryBuilder';
import { selectors } from 'selectors';
import { keepSharedLabels, MetricsQueryEditor, parseQuantile, pickSummaryQuantiles } from './MetricsQueryEditor';
import { toMetricLabelFilter, getMetricLabelOptions } from './MetricLabelFilterEditor';

const editorSelectors = selectors.components.QueryBuilder.MetricsEditor;

const createDatasource = (): Datasource => {
  const datasource = {
    uid: 'metrics-ds',
    getDefaultMetricsDatabase: () => 'otel',
    getConfiguredMetricTables: () => ({
      gauge: 'otel_metrics_gauge',
      sum: 'otel_metrics_sum',
      histogram: 'otel_metrics_histogram',
      exponential_histogram: 'otel_metrics_exp_histogram',
      summary: 'otel_metrics_summary',
    }),
    resolveMetricTables: jest.fn(() =>
      Promise.resolve({ gauge: 'otel_metrics_gauge', sum: 'otel_metrics_sum', histogram: 'otel_metrics_histogram' })
    ),
    fetchMetricCatalog: jest.fn(() =>
      Promise.resolve([
        { name: 'http.server.requests', type: MetricType.Sum, unit: '1', description: 'Requests', isMonotonic: true },
        { name: 'system.cpu.utilization', type: MetricType.Gauge, unit: '1', description: 'CPU', isMonotonic: false },
      ])
    ),
    getMetricTableFeatures: jest.fn(() => Promise.resolve({ jsonAttributes: false })),
    fetchMetricLabelKeys: jest.fn(() => Promise.resolve([{ source: 'attribute', key: 'http.route' }])),
    fetchMetricLabelValues: jest.fn(() => Promise.resolve(['/a', '/b'])),
    fetchSummaryQuantiles: jest.fn(() => Promise.resolve([])),
    fetchMetricHealth: jest.fn(() => Promise.resolve({ exportInterval: 10, sharedSeries: 0, series: 4 })),
  } as unknown as Datasource;
  return datasource;
};

const emptyQuery: QueryBuilderOptions = { database: '', table: '', queryType: QueryType.Table };

const renderEditor = (builderOptions: QueryBuilderOptions, datasource = createDatasource()) => {
  const onQueryChange = jest.fn();
  const onRunQuery = jest.fn();
  const dispatch = jest.fn();
  const utils = render(
    <MetricsQueryEditor
      datasource={datasource}
      builderOptions={builderOptions}
      builderOptionsDispatch={dispatch}
      generatedSql=""
      onQueryChange={onQueryChange}
      onRunQuery={onRunQuery}
    />
  );
  return { ...utils, datasource, onQueryChange, onRunQuery, dispatch };
};

describe('MetricsQueryEditor', () => {
  it('turns a new query into an empty metrics query without running it', async () => {
    const { onQueryChange, onRunQuery } = renderEditor(emptyQuery);
    await waitFor(() => expect(onQueryChange).toHaveBeenCalled());
    const next = onQueryChange.mock.calls[0][0] as QueryBuilderOptions;
    expect(next.queryType).toBe(QueryType.TimeSeries);
    expect(next.database).toBe('otel');
    expect(next.metric?.name).toBe('');
    expect(onRunQuery).not.toHaveBeenCalled();
  });

  it('routes a picked metric to the table of its type with fitting defaults', async () => {
    const options: QueryBuilderOptions = {
      database: 'otel',
      table: '',
      queryType: QueryType.TimeSeries,
      metric: {
        name: '',
        type: MetricType.Gauge,
        fn: MetricFunction.Avg,
        aggregation: MetricSeriesAggregation.Avg,
        groupBy: [],
      },
    };
    const { datasource, onQueryChange, onRunQuery } = renderEditor(options);
    await waitFor(() => expect(datasource.fetchMetricCatalog).toHaveBeenCalled());
    const picker = screen.getByTestId(editorSelectors.metricPicker).querySelector('input')!;
    await waitFor(() => expect(picker).toHaveAttribute('placeholder', 'Search 2 metrics'));

    await userEvent.type(picker, 'http.server.requests');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => expect(onQueryChange).toHaveBeenCalled());
    const next = onQueryChange.mock.calls[onQueryChange.mock.calls.length - 1][0] as QueryBuilderOptions;
    expect(next.table).toBe('otel_metrics_sum');
    expect(next.metric).toMatchObject({
      name: 'http.server.requests',
      type: MetricType.Sum,
      isMonotonic: true,
      fn: MetricFunction.Rate,
      aggregation: MetricSeriesAggregation.Sum,
      jsonAttributes: false,
      minStep: 20,
    });
    expect(datasource.getMetricTableFeatures).toHaveBeenCalledWith('otel', 'otel_metrics_sum');
    expect(onRunQuery).toHaveBeenCalled();
  });

  it('points a query at the configured table of its metric type', async () => {
    const options: QueryBuilderOptions = {
      database: 'elsewhere',
      table: 'other_gauge_table',
      queryType: QueryType.TimeSeries,
      metric: {
        name: 'system.cpu.utilization',
        type: MetricType.Gauge,
        fn: MetricFunction.Avg,
        aggregation: MetricSeriesAggregation.Avg,
        groupBy: [],
      },
    };
    const { onQueryChange } = renderEditor(options);
    await waitFor(() => expect(onQueryChange).toHaveBeenCalled());
    expect(onQueryChange.mock.calls[0][0]).toMatchObject({ database: 'otel', table: 'otel_metrics_gauge' });
  });

  it('shows the type specific controls of a picked metric', async () => {
    const options: QueryBuilderOptions = {
      database: 'otel',
      table: 'otel_metrics_histogram',
      queryType: QueryType.TimeSeries,
      metric: {
        name: 'http.server.duration',
        type: MetricType.Histogram,
        fn: MetricFunction.Quantile,
        quantiles: [0.95],
        aggregation: MetricSeriesAggregation.Avg,
        groupBy: [],
      },
    };
    const { datasource } = renderEditor(options);
    await waitFor(() =>
      expect(datasource.fetchMetricLabelKeys).toHaveBeenCalledWith(
        'otel',
        'otel_metrics_histogram',
        'http.server.duration',
        undefined
      )
    );
    expect(screen.getByTestId(editorSelectors.quantilesPicker)).toBeInTheDocument();
    // Histogram quantiles merge buckets, so there is no cross-series aggregation to pick.
    expect(screen.queryByTestId(editorSelectors.aggregationPicker)).not.toBeInTheDocument();
    expect(screen.getByTestId(editorSelectors.groupByPicker)).toBeInTheDocument();
  });

  it('opens the label filter editor', async () => {
    const options: QueryBuilderOptions = {
      database: 'otel',
      table: 'otel_metrics_gauge',
      queryType: QueryType.TimeSeries,
      metric: {
        name: 'system.cpu.utilization',
        type: MetricType.Gauge,
        fn: MetricFunction.Avg,
        aggregation: MetricSeriesAggregation.Avg,
        groupBy: [],
      },
    };
    renderEditor(options);
    await userEvent.click(screen.getByTestId(editorSelectors.addFilterButton));
    expect(screen.getByTestId(editorSelectors.filterEditor)).toBeInTheDocument();
    expect(screen.getByTestId(editorSelectors.aggregationPicker)).toBeInTheDocument();
  });
});

describe('Min interval', () => {
  it('shows the automatic floor as placeholder', async () => {
    const options: QueryBuilderOptions = {
      database: 'otel',
      table: 'otel_metrics_gauge',
      queryType: QueryType.TimeSeries,
      metric: {
        name: 'system.cpu.utilization',
        type: MetricType.Gauge,
        fn: MetricFunction.Avg,
        aggregation: MetricSeriesAggregation.Avg,
        groupBy: [],
        minStep: 20,
      },
    };
    render(
      <MetricsQueryEditor
        datasource={createDatasource()}
        builderOptions={options}
        builderOptionsDispatch={jest.fn()}
        generatedSql=""
        onMinIntervalChange={jest.fn()}
      />
    );
    expect(await screen.findByPlaceholderText('auto (≥ 20s)')).toBeInTheDocument();
  });
});

describe('metric label helpers', () => {
  it('parses typed quantiles', () => {
    expect(parseQuantile('0.95')).toBe(0.95);
    expect(parseQuantile('95')).toBe(0.95);
    expect(parseQuantile('p99.9')).toBeCloseTo(0.999);
    expect(parseQuantile('abc')).toBeUndefined();
    expect(parseQuantile('150')).toBeUndefined();
  });

  it('builds filters for attributes and columns', () => {
    expect(
      toMetricLabelFilter({ source: 'resource', key: 'k8s.namespace.name' }, FilterOperator.Equals, 'prod')
    ).toEqual({
      filterType: 'custom',
      condition: 'AND',
      key: 'ResourceAttributes',
      mapKey: 'k8s.namespace.name',
      type: 'Map(LowCardinality(String), String)',
      operator: FilterOperator.Equals,
      value: 'prod',
    });
    expect(toMetricLabelFilter({ source: 'column', key: 'ServiceName' }, FilterOperator.In, ['a', 'b'])).toEqual({
      filterType: 'custom',
      condition: 'AND',
      key: 'ServiceName',
      type: 'LowCardinality(String)',
      operator: FilterOperator.In,
      value: ['a', 'b'],
    });
    expect(toMetricLabelFilter({ source: 'attribute', key: 'a' }, FilterOperator.Like, 'x', true).type).toBe('JSON');
  });

  it('groups and orders label options', () => {
    const options = getMetricLabelOptions([
      { source: 'attribute', key: 'b' },
      { source: 'resource', key: 'service.name' },
      { source: 'column', key: 'ServiceName' },
      { source: 'attribute', key: 'a' },
      { source: 'attribute', key: 'a' },
    ]);
    expect(options.map((o) => o.value)).toEqual([
      'column:ServiceName',
      'resource:service.name',
      'attribute:a',
      'attribute:b',
    ]);
    expect(options[1].group).toBe('Resource attributes');
  });
});

describe('keepSharedLabels', () => {
  it('drops group by labels and filters the new metric does not have', () => {
    const state = { source: 'attribute' as const, key: 'state' };
    const device = { source: 'attribute' as const, key: 'device' };
    const service = { source: 'column' as const, key: 'ServiceName' };
    const stateFilter = toMetricLabelFilter(state, FilterOperator.Equals, 'user');
    const deviceFilter = toMetricLabelFilter(device, FilterOperator.Equals, 'lo');
    const serviceFilter = toMetricLabelFilter(service, FilterOperator.Equals, 'grafana');
    expect(keepSharedLabels([state, device, service], [stateFilter, deviceFilter, serviceFilter], [device])).toEqual({
      groupBy: [device, service],
      filters: [deviceFilter, serviceFilter],
    });
  });
});

describe('pickSummaryQuantiles', () => {
  it('keeps reported quantiles and falls back to the highest one below the maximum', () => {
    expect(pickSummaryQuantiles([0.5, 0.95], [0, 0.25, 0.5, 0.75, 1])).toEqual([0.5]);
    expect(pickSummaryQuantiles([0.95], [0, 0.25, 0.5, 0.75, 1])).toEqual([0.75]);
    expect(pickSummaryQuantiles([0.95], [1])).toEqual([1]);
    expect(pickSummaryQuantiles([0.95], [])).toEqual([0.95]);
  });
});
