import { DataFrame, DataFrameType, DataQueryRequest, DataQueryResponse, Field, FieldType } from '@grafana/data';
import { CHQuery } from 'types/sql';
import { MetricFunction } from 'types/queryBuilder';
import { heatmapBucketLabel } from './metrics';
import { getBuilderOptions } from './utils';

const boundOf = (field: Field): number => {
  const bound = field.labels?.[heatmapBucketLabel] ?? '';
  return bound === '+Inf' ? Infinity : Number(bound);
};

/**
 * A histogram heatmap frame as the Heatmap panel reads it: the time field, then one field per
 * bucket named by its upper bound and ordered by it. The query returns the bound as the `le`
 * label of each value field.
 */
export const toHeatmapFrame = (frame: DataFrame): DataFrame => {
  const time = frame.fields.find((field) => field.type === FieldType.time);
  const buckets = frame.fields.filter(
    (field) => field.type === FieldType.number && field.labels?.[heatmapBucketLabel] !== undefined
  );
  if (!time || !buckets.length) {
    return frame;
  }
  const rows = buckets
    .sort((a, b) => boundOf(a) - boundOf(b))
    .map((field): Field => {
      const name = field.labels![heatmapBucketLabel];
      return { ...field, name, labels: undefined, config: { ...field.config, displayNameFromDS: name } };
    });
  return {
    ...frame,
    fields: [time, ...rows],
    meta: { ...frame.meta, type: DataFrameType.HeatmapRows },
  };
};

/** Turns the frames of histogram heatmap queries into heatmap frames. */
export const transformMetricHeatmapFrames = (
  request: DataQueryRequest<CHQuery>,
  response: DataQueryResponse
): DataQueryResponse => {
  const heatmapRefIds = new Set(
    request.targets
      .filter((target) => getBuilderOptions(target)?.metric?.fn === MetricFunction.Heatmap)
      .map((target) => target.refId)
  );
  if (!heatmapRefIds.size) {
    return response;
  }
  return {
    ...response,
    data: response.data.map((frame: DataFrame) => (heatmapRefIds.has(frame.refId!) ? toHeatmapFrame(frame) : frame)),
  };
};
