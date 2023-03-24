import React from 'react';
import { InlineFormLabel, Select } from '@grafana/ui';
import { selectors } from './../selectors';
import { Format } from '../types';
import { styles } from '../styles';

export type Props = { format: Format; value?: string; onChange: (format: Format) => void };

export const FormatSelect = (props: Props) => {
  const { onChange, format } = props;
  const { label, tooltip, options: formatLabels } = selectors.components.QueryEditor.Format;
  return (
    <div className="gf-form">
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <Select<Format>
        className={`width-8 ${styles.Common.inlineSelect}`}
        onChange={(e) => onChange(e.value!)}
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
        menuPlacement={'bottom'}
        allowCustomValue={false}
      />
    </div>
  );
};
