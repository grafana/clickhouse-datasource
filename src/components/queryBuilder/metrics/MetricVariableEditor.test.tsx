import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { Datasource } from 'data/CHDatasource';
import { MetricType } from 'types/queryBuilder';
import { MetricVariableEditor, MetricVariableFields } from './MetricVariableEditor';

const createDatasource = (): Datasource =>
  ({
    uid: 'metrics-ds',
    getDefaultMetricsDatabase: () => 'otel',
    resolveMetricTables: jest.fn(() => Promise.resolve({ sum: 'otel_metrics_sum' })),
    fetchMetricCatalog: jest.fn(() => Promise.resolve([])),
    fetchMetricLabelKeys: jest.fn(() => Promise.resolve([])),
  }) as unknown as Datasource;

const selected: MetricVariableFields = {
  queryType: 'metricLabelValues',
  metricName: 'http.server.requests',
  metricType: MetricType.Sum,
};

describe('MetricVariableEditor', () => {
  it('shows the errors of the table and metric lookups', async () => {
    const datasource = createDatasource();
    (datasource.resolveMetricTables as jest.Mock).mockRejectedValue(new Error('no tables'));
    (datasource.fetchMetricCatalog as jest.Mock).mockRejectedValue(new Error('no metrics'));
    render(<MetricVariableEditor datasource={datasource} query={selected} onChange={jest.fn()} />);

    await waitFor(() => expect(screen.getByText('no tables')).toBeInTheDocument());
    expect(screen.getByText('Could not list the metric tables')).toBeInTheDocument();
    expect(screen.getByText('Could not list the metrics')).toBeInTheDocument();
    expect(screen.getByText('no metrics')).toBeInTheDocument();
  });

  it('shows the error of the label lookup', async () => {
    const datasource = createDatasource();
    (datasource.fetchMetricLabelKeys as jest.Mock).mockRejectedValue(new Error('no labels'));
    render(<MetricVariableEditor datasource={datasource} query={selected} onChange={jest.fn()} />);

    await waitFor(() => expect(screen.getByText('no labels')).toBeInTheDocument());
    expect(screen.getByText('Could not list the metric labels')).toBeInTheDocument();
  });
});
