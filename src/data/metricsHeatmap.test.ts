import { DataFrameType, DataQueryRequest, FieldType, toDataFrame } from '@grafana/data';
import { CHQuery, EditorType } from 'types/sql';
import { MetricFunction, MetricSeriesAggregation, MetricType, QueryType } from 'types/queryBuilder';
import { toHeatmapFrame, transformMetricHeatmapFrames } from './metricsHeatmap';

const bucket = (le: string, values: number[]) => ({
  name: 'latency',
  type: FieldType.number,
  labels: { le },
  values,
});

const frame = (refId: string) =>
  toDataFrame({
    refId,
    fields: [
      { name: 'time', type: FieldType.time, values: [1000, 2000] },
      bucket('+Inf', [0, 1]),
      bucket('0.5', [2, 3]),
      bucket('0.05', [4, 5]),
      bucket('1', [6, 7]),
    ],
  });

const query = (refId: string, fn: MetricFunction): CHQuery =>
  ({
    refId,
    editorType: EditorType.Builder,
    rawSql: '',
    pluginVersion: '',
    builderOptions: {
      database: 'otel',
      table: 'otel_metrics_histogram',
      queryType: QueryType.TimeSeries,
      metric: {
        name: 'latency',
        type: MetricType.Histogram,
        fn,
        aggregation: MetricSeriesAggregation.Sum,
        groupBy: [],
      },
    },
  }) as CHQuery;

describe('toHeatmapFrame', () => {
  it('names bucket fields by bound, in bound order, as heatmap rows', () => {
    const result = toHeatmapFrame(frame('A'));
    expect(result.meta?.type).toBe(DataFrameType.HeatmapRows);
    expect(result.fields.map((f) => f.name)).toEqual(['time', '0.05', '0.5', '1', '+Inf']);
    expect(result.fields[1].values).toEqual([4, 5]);
    expect(result.fields[1].labels).toBeUndefined();
    expect(result.fields[4].config.displayNameFromDS).toBe('+Inf');
  });

  it('leaves frames without bucket fields alone', () => {
    const plain = toDataFrame({ fields: [{ name: 'time', type: FieldType.time, values: [1] }] });
    expect(toHeatmapFrame(plain)).toBe(plain);
  });
});

describe('transformMetricHeatmapFrames', () => {
  it('changes only the frames of heatmap queries', () => {
    const request = {
      targets: [query('A', MetricFunction.Heatmap), query('B', MetricFunction.Quantile)],
    } as DataQueryRequest<CHQuery>;
    const result = transformMetricHeatmapFrames(request, { data: [frame('A'), frame('B')] });
    expect(result.data[0].meta?.type).toBe(DataFrameType.HeatmapRows);
    expect(result.data[1].meta?.type).toBeUndefined();
  });
});
