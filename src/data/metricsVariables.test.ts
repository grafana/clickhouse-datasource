import {
  Filter,
  FilterOperator,
  MetricFunction,
  MetricSeriesAggregation,
  MetricType,
  QueryType,
} from 'types/queryBuilder';
import {
  getFilterMetricLabel,
  getMetricFilterDisplayName,
  getMetricFilterSql,
  getMetricLabelValuesVariableSql,
  getMetricNamesVariableSql,
  getVariableName,
} from './metrics';
import { generateSql } from './sqlGenerator';
import { generateVariableSql } from './CHVariableSupport';
import { toMetricLabelFilter } from 'components/queryBuilder/metrics/MetricLabelFilterEditor';

const service = { source: 'column', key: 'ServiceName' } as const;
const pod = { source: 'resource', key: 'k8s.pod.name' } as const;
const route = { source: 'attribute', key: 'http.route' } as const;

describe('getVariableName', () => {
  it.each([
    ['$service', 'service'],
    ['${service}', 'service'],
    ['${service:csv}', 'service'],
    ['[[service]]', 'service'],
    [' $service ', 'service'],
  ])('reads %s', (value, name) => {
    expect(getVariableName(value)).toBe(name);
  });

  it.each(['service', 'a$service', '$service-x', '', 42])('ignores %s', (value) => {
    expect(getVariableName(value)).toBeUndefined();
  });
});

describe('getFilterMetricLabel', () => {
  it('maps filters back to labels', () => {
    expect(getFilterMetricLabel(toMetricLabelFilter(pod, FilterOperator.Equals, 'x'))).toEqual(pod);
    expect(getFilterMetricLabel(toMetricLabelFilter(service, FilterOperator.Equals, 'x'))).toEqual(service);
    expect(
      getFilterMetricLabel({ ...toMetricLabelFilter(pod, FilterOperator.Equals, 'x'), mapKey: '' })
    ).toBeUndefined();
  });
});

describe('getMetricFilterSql', () => {
  it('lists a variable with singlequote and drops the filter for All', () => {
    expect(getMetricFilterSql([toMetricLabelFilter(service, FilterOperator.Equals, '$service')])).toBe(
      '($__conditionalAll("ServiceName" IN (${service:singlequote}), $service))'
    );
    expect(getMetricFilterSql([toMetricLabelFilter(pod, FilterOperator.NotEquals, '${pod}')])).toBe(
      "($__conditionalAll(ResourceAttributes['k8s.pod.name'] NOT IN (${pod:singlequote}), $pod))"
    );
  });

  it('mixes variables and values in IN lists', () => {
    expect(getMetricFilterSql([toMetricLabelFilter(route, FilterOperator.In, ['/cart', '$route'])])).toBe(
      "(Attributes['http.route'] IN ('/cart', ${route:singlequote}))"
    );
  });

  it('skips the All shortcut for keys that would break its argument parsing', () => {
    const odd = { source: 'attribute', key: 'a,b' } as const;
    expect(getMetricFilterSql([toMetricLabelFilter(odd, FilterOperator.Equals, '$x')])).toBe(
      "(Attributes['a,b'] IN (${x:singlequote}))"
    );
  });

  it('reads JSON attributes', () => {
    expect(getMetricFilterSql([toMetricLabelFilter(route, FilterOperator.Equals, '$route', true)], true)).toBe(
      "($__conditionalAll(ifNull(Attributes.`http`.`route`::Nullable(String), '') IN (${route:singlequote}), $route))"
    );
  });

  it('keeps plain filters and other operators as builder filters', () => {
    const filters: Filter[] = [
      toMetricLabelFilter(route, FilterOperator.Equals, '/cart'),
      toMetricLabelFilter(route, FilterOperator.Like, '$route'),
      toMetricLabelFilter(service, FilterOperator.Equals, '$service'),
    ];
    expect(getMetricFilterSql(filters)).toBe(
      "(( Attributes['http.route'] = '/cart' ) AND ( Attributes['http.route'] LIKE '%$route%' )) AND " +
        '($__conditionalAll("ServiceName" IN (${service:singlequote}), $service))'
    );
    expect(getMetricFilterSql([])).toBe('');
  });

  it('applies to metrics queries', () => {
    const sql = generateSql({
      database: 'otel',
      table: 'otel_metrics_gauge',
      queryType: QueryType.TimeSeries,
      filters: [toMetricLabelFilter(service, FilterOperator.Equals, '$service')],
      metric: {
        name: 'cpu',
        type: MetricType.Gauge,
        fn: MetricFunction.Avg,
        aggregation: MetricSeriesAggregation.Avg,
        groupBy: [],
      },
    });
    expect(sql).toContain(
      'WHERE MetricName = \'cpu\' AND TimeUnix >= $__fromTime AND TimeUnix <= $__toTime AND ($__conditionalAll("ServiceName" IN (${service:singlequote}), $service))'
    );
  });
});

describe('variable queries', () => {
  it('lists metric names across tables', () => {
    expect(getMetricNamesVariableSql('otel', ['g', 's'])).toBe(
      'SELECT DISTINCT name FROM (' +
        'SELECT MetricName AS name FROM "otel"."g" WHERE TimeUnix >= greatest($__fromTime, subtractHours($__toTime, 6)) AND TimeUnix <= $__toTime GROUP BY name UNION ALL ' +
        'SELECT MetricName AS name FROM "otel"."s" WHERE TimeUnix >= greatest($__fromTime, subtractHours($__toTime, 6)) AND TimeUnix <= $__toTime GROUP BY name' +
        ') ORDER BY name ASC'
    );
    expect(getMetricNamesVariableSql('otel', [])).toBe('');
  });

  it('lists label values for a metric, chained to another variable', () => {
    expect(
      getMetricLabelValuesVariableSql('otel', ['s'], pod, {
        metricName: 'http.server.request.count',
        filters: [toMetricLabelFilter(service, FilterOperator.Equals, '$service')],
      })
    ).toBe(
      'SELECT DISTINCT value FROM (SELECT DISTINCT toString(ResourceAttributes[\'k8s.pod.name\']) AS value FROM "otel"."s" ' +
        "WHERE MetricName = 'http.server.request.count' AND TimeUnix >= greatest($__fromTime, subtractHours($__toTime, 6)) AND TimeUnix <= $__toTime " +
        'AND ($__conditionalAll("ServiceName" IN (${service:singlequote}), $service))' +
        ") WHERE value != '' ORDER BY value ASC LIMIT 10000"
    );
  });

  it('lists label values of every metric table without a metric', () => {
    const sql = getMetricLabelValuesVariableSql('otel', ['g', 's'], service);
    expect(sql).toContain('SELECT DISTINCT toString("ServiceName") AS value FROM "otel"."g" WHERE TimeUnix');
    expect(sql).toContain(' UNION ALL SELECT DISTINCT toString("ServiceName") AS value FROM "otel"."s"');
    expect(sql).not.toContain('MetricName =');
    expect(getMetricLabelValuesVariableSql('otel', [], service)).toBe('');
  });

  it('generates the SQL of the metrics variable types', () => {
    expect(
      generateVariableSql({ refId: 'v', queryType: 'metricNames', database: 'otel', metricTables: ['g'] }, 'default')
    ).toContain('FROM "otel"."g"');
    expect(
      generateVariableSql(
        { refId: 'v', queryType: 'metricLabelValues', metricTables: ['s'], metricLabel: pod, metricName: 'm' },
        'otel'
      )
    ).toContain('toString(ResourceAttributes[\'k8s.pod.name\']) AS value FROM "otel"."s" WHERE MetricName = \'m\'');
    expect(generateVariableSql({ refId: 'v', queryType: 'metricLabelValues', metricTables: ['s'] }, 'otel')).toBe('');
  });
});

describe('getMetricFilterDisplayName', () => {
  it('names filter chips by label key', () => {
    expect(getMetricFilterDisplayName(toMetricLabelFilter(pod, FilterOperator.Equals, 'x'))).toBe('k8s.pod.name');
    expect(getMetricFilterDisplayName(toMetricLabelFilter(service, FilterOperator.Equals, 'x'))).toBe('ServiceName');
  });
});
