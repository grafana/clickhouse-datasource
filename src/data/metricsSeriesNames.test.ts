import { DataQueryRequest, FieldType, getFieldDisplayName, toDataFrame } from '@grafana/data';
import { CHQuery, EditorType } from 'types/sql';
import { MetricFunction, MetricSeriesAggregation, MetricType, QueryType } from 'types/queryBuilder';
import { transformMetricSeriesNames } from './metricsSeriesNames';

// A frame as the plugin returns it: one value field per series, all named after the metric.
const frame = (refId: string, labelValues: Array<Record<string, string> | undefined>) =>
  toDataFrame({
    refId,
    fields: [
      { name: 'time', type: FieldType.time, values: [1000, 2000] },
      ...labelValues.map((labels) => ({
        name: 'container.cpu.time',
        type: FieldType.number,
        labels,
        values: [1, 2],
      })),
    ],
  });

const query = (refId: string, fn: MetricFunction, groupByKeys: string[]): CHQuery =>
  ({
    refId,
    editorType: EditorType.Builder,
    rawSql: '',
    pluginVersion: '',
    builderOptions: {
      database: 'otel',
      table: 'otel_metrics_gauge',
      queryType: QueryType.TimeSeries,
      metric: {
        name: 'container.cpu.time',
        type: MetricType.Gauge,
        fn,
        aggregation: MetricSeriesAggregation.Avg,
        groupBy: groupByKeys.map((key) => ({ source: 'column', key })),
      },
    },
  }) as CHQuery;

const request = (...targets: CHQuery[]) => ({ targets }) as DataQueryRequest<CHQuery>;

const legendNames = (data: Array<ReturnType<typeof frame>>) =>
  data.map((dataFrame) => dataFrame.fields.slice(1).map((field) => getFieldDisplayName(field, dataFrame, data)));

describe('transformMetricSeriesNames', () => {
  const labelValues = [{ ServiceName: '' }, { ServiceName: 'checkout' }, { ServiceName: 'api' }];

  it('names series with an empty label after their missing label instead of numbering them', () => {
    expect(legendNames([frame('A', labelValues)])[0]).toEqual([
      'container.cpu.time 1',
      'container.cpu.time checkout',
      'container.cpu.time api',
    ]);

    const after = transformMetricSeriesNames(request(query('A', MetricFunction.Avg, ['ServiceName'])), {
      data: [frame('A', labelValues)],
    });
    expect(legendNames(after.data)[0]).toEqual([
      'container.cpu.time {ServiceName=""}',
      'container.cpu.time checkout',
      'container.cpu.time api',
    ]);
  });

  it('lists every group by label of a series without values', () => {
    const after = transformMetricSeriesNames(request(query('A', MetricFunction.Avg, ['ServiceName', 'ScopeName'])), {
      data: [frame('A', [{ ServiceName: '', ScopeName: '' }])],
    });
    expect(after.data[0].fields[1].config.displayNameFromDS).toBe(
      'container.cpu.time {ServiceName="", ScopeName=""}'
    );
  });

  it('keeps the name of a series that has a label value', () => {
    const after = transformMetricSeriesNames(request(query('A', MetricFunction.Avg, ['ServiceName'])), {
      data: [frame('A', [{ ServiceName: 'checkout' }])],
    });
    expect(after.data[0].fields[1].config.displayNameFromDS).toBeUndefined();
  });

  it('leaves heatmap queries and queries without a group by alone', () => {
    const after = transformMetricSeriesNames(
      request(query('A', MetricFunction.Heatmap, ['ServiceName']), query('B', MetricFunction.Avg, [])),
      { data: [frame('A', [{}]), frame('B', [undefined])] }
    );
    expect(after.data[0].fields[1].config.displayNameFromDS).toBeUndefined();
    expect(after.data[1].fields[1].config.displayNameFromDS).toBeUndefined();
  });

  it('leaves the response untouched when no series needs a name', () => {
    const response = { data: [frame('A', [{ ServiceName: 'checkout' }])] };
    expect(transformMetricSeriesNames(request(query('A', MetricFunction.Avg, ['ServiceName'])), response)).toBe(
      response
    );
  });

  it('leaves frames and fields of other queries alone', () => {
    const sqlFrame = toDataFrame({ fields: [{ name: 'count()', type: FieldType.number, values: [1] }] });
    const after = transformMetricSeriesNames(request(query('A', MetricFunction.Avg, ['ServiceName'])), {
      data: [frame('B', [{}]), sqlFrame],
    });
    expect(after.data[0].fields[1].config.displayNameFromDS).toBeUndefined();
    expect(after.data[1].fields[0].config.displayNameFromDS).toBeUndefined();
  });
});
