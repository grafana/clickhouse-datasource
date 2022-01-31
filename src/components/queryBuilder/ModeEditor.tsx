import React from 'react';
import { RadioButtonGroup, InlineFormLabel } from '@grafana/ui';
import { BuilderMode } from 'types';
import { selectors } from './../../selectors';

interface ModeEditorProps {
  mode: BuilderMode;
  onModeChange: (mode: BuilderMode) => void;
}
export const ModeEditor = (props: ModeEditorProps) => {
  const { options, label, tooltip } = selectors.components.QueryEditor.QueryBuilder.TYPES;
  const modes = [
    { value: BuilderMode.List, label: options.LIST },
    { value: BuilderMode.Aggregate, label: options.AGGREGATE },
    { value: BuilderMode.Trend, label: options.TREND },
  ];
  return (
    <>
      <InlineFormLabel width={6} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <RadioButtonGroup<BuilderMode> options={modes} value={props.mode} onChange={(e) => props.onModeChange(e!)} />
    </>
  );
};
