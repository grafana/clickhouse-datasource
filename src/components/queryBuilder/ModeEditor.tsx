import React from 'react';
import { RadioButtonGroup } from '@grafana/ui';
import { BuilderMode } from 'types';
import { selectors } from './../../selectors';
import { EditorField } from '@grafana/experimental';

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
    <EditorField tooltip={tooltip} label={label}>
      <RadioButtonGroup<BuilderMode> options={modes} value={props.mode} onChange={(e) => props.onModeChange(e!)} />
    </EditorField>
  );
};
