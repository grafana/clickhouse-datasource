import React from 'react';
import { ConfigSection, ConfigSubSection } from 'components/experimental/ConfigSection';
import { Field, Input } from '@grafana/ui';
import { CHMetricsConfig } from 'types/config';
import { defaultMetricsTables } from 'otel';
import allLabels from 'labels';

export interface MetricsConfigProps {
  metricsConfig?: CHMetricsConfig;
  onChange: (key: keyof CHMetricsConfig, value: string) => void;
}

const tableKeys: ReadonlyArray<keyof typeof defaultMetricsTables> = [
  'gaugeTable',
  'sumTable',
  'histogramTable',
  'exponentialHistogramTable',
  'summaryTable',
];

/**
 * Settings of a single-table data source with the metrics signal. The OTel ClickHouse exporter
 * writes one table per metric type with a fixed schema, so only the database and the table names
 * are configurable; the editor finds the table of each metric by itself.
 */
export const MetricsConfig = (props: MetricsConfigProps) => {
  const { metricsConfig, onChange } = props;
  const labels = allLabels.components.Config.MetricsConfig;

  return (
    <ConfigSection title={labels.title} description={labels.description}>
      <div id="metrics-config" />
      <Field label={labels.defaultDatabase.label} description={labels.defaultDatabase.description}>
        <Input
          name="metricsDefaultDatabase"
          width={40}
          value={metricsConfig?.defaultDatabase || ''}
          onChange={(e) => onChange('defaultDatabase', e.currentTarget.value)}
          aria-label={labels.defaultDatabase.label}
          placeholder={labels.defaultDatabase.placeholder}
        />
      </Field>
      <ConfigSubSection title={labels.tables.title} description={labels.tables.description}>
        {tableKeys.map((key) => (
          <Field key={key} label={labels.tables[key].label} description={labels.tables[key].description}>
            <Input
              name={key}
              width={40}
              value={metricsConfig?.[key] || ''}
              onChange={(e) => onChange(key, e.currentTarget.value)}
              aria-label={labels.tables[key].label}
              placeholder={defaultMetricsTables[key]}
            />
          </Field>
        ))}
      </ConfigSubSection>
    </ConfigSection>
  );
};
