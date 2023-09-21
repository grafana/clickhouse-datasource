import React from 'react';
import { selectors } from './../selectors';
import { Format } from '../types';
import { InlineSelect } from '@grafana/experimental';

export type Props = { format: Format; value?: string; onChange: (format: Format) => void };

export const FormatSelect = (props: Props) => {
  const { onChange, format } = props;
  const { options: formatLabels } = selectors.components.QueryEditor.Format;
  return (
    <InlineSelect
      label="Format as"
      options={[
        {
          label: formatLabels.AUTO,
          value: Format.AUTO,
        },
        {
          label: formatLabels.TABLE,
          value: Format.TABLE,
        },
        {
          label: formatLabels.TIME_SERIES,
          value: Format.TIMESERIES,
        },
        {
          label: formatLabels.LOGS,
          value: Format.LOGS,
        },
        {
          label: formatLabels.TRACE,
          value: Format.TRACE,
        },
      ]}
      value={format}
      onChange={(e) => onChange(e.value!)}
    />
  );
};
