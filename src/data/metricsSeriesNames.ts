import { DataFrame, DataQueryRequest, DataQueryResponse, Field, FieldType } from '@grafana/data';
import { CHQuery } from 'types/sql';
import { MetricFunction } from 'types/queryBuilder';
import { getMetricLabelAliases } from './metrics';
import { getBuilderOptions } from './utils';

/**
 * Grafana names a series after the value of its single label and falls back to numbering the
 * field (`container.cpu.time 1`) when that value is empty. The plugin's long-to-wide conversion
 * keeps the empty label, so the series can be named with its empty labels explicitly instead,
 * which reads as a missing label rather than an instance number.
 */
const nameWithEmptyLabels = (name: string, aliases: readonly string[]): string =>
  `${name} {${aliases.map((alias) => `${alias}=""`).join(', ')}}`;

const hasLabelValue = (field: Field): boolean =>
  Boolean(field.labels && Object.values(field.labels).some((value) => value.length > 0));

/**
 * Resolves the group by label names of each metric query, keyed by refId. Heatmap frames are
 * named by their bucket bounds, and a query without a group by has a single, unique series.
 */
const getGroupByAliases = (request: DataQueryRequest<CHQuery>): Map<string, string[]> => {
  const aliasesByRefId = new Map<string, string[]>();
  for (const target of request.targets) {
    const metric = getBuilderOptions(target)?.metric;
    if (!metric || metric.fn === MetricFunction.Heatmap || !metric.groupBy.length) {
      continue;
    }
    aliasesByRefId.set(target.refId, getMetricLabelAliases(metric.groupBy));
  }
  return aliasesByRefId;
};

/** Names metric series whose group by labels are all empty, so the legend shows the missing labels. */
export const transformMetricSeriesNames = (
  request: DataQueryRequest<CHQuery>,
  response: DataQueryResponse
): DataQueryResponse => {
  const aliasesByRefId = getGroupByAliases(request);
  if (!aliasesByRefId.size) {
    return response;
  }

  return {
    ...response,
    data: response.data.map((frame: DataFrame) => {
      const aliases = aliasesByRefId.get(frame.refId!);
      if (!aliases) {
        return frame;
      }
      return {
        ...frame,
        fields: frame.fields.map((field) => {
          if (field.type !== FieldType.number || hasLabelValue(field)) {
            return field;
          }
          return {
            ...field,
            config: { ...field.config, displayNameFromDS: nameWithEmptyLabels(field.name, aliases) },
          };
        }),
      };
    }),
  };
};
