import React, { useRef, useState } from 'react';
import { InlineField, InlineFormLabel, Input } from '@grafana/ui';
import labels from 'labels';
import { selectors } from 'selectors';
import { parseMinIntervalMs } from 'data/queryInterval';

interface MinIntervalEditorProps {
  minInterval?: string;
  onMinIntervalChange: (minInterval: string) => void;
}

/**
 * Draft state for a min interval input: local while typing, committed on blur or
 * Enter, re-synced when Grafana replaces the query model underneath us (query
 * history, pane switches). Shared so the inline and compact layouts differ only
 * in their surrounding markup, never in behavior.
 */
export const useMinIntervalDraft = (minInterval: string | undefined, onCommit: (minInterval: string) => void) => {
  const propValue = minInterval || '';
  const [draft, setDraft] = useState<string>(propValue);
  const lastPropValue = useRef<string>(propValue);
  if (lastPropValue.current !== propValue) {
    lastPropValue.current = propValue;
    setDraft(propValue);
  }

  const invalid = draft.trim() !== '' && parseMinIntervalMs(draft) === undefined;

  const commit = () => {
    const trimmed = draft.trim();
    if (!invalid && trimmed !== propValue) {
      onCommit(trimmed);
    }
  };

  return { draft, setDraft, invalid, commit };
};

export const MinIntervalEditor = (props: MinIntervalEditorProps) => {
  const { draft, setDraft, invalid, commit } = useMinIntervalDraft(props.minInterval, props.onMinIntervalChange);
  const { label, tooltip, placeholder, error } = labels.components.MinIntervalEditor;

  return (
    <InlineField
      label={
        <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
          {label}
        </InlineFormLabel>
      }
      invalid={invalid}
      error={error}
    >
      <Input
        data-testid={selectors.components.QueryEditor.MinIntervalEditor.input}
        width={10}
        value={draft}
        invalid={invalid}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
          }
        }}
      />
    </InlineField>
  );
};
