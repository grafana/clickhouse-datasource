import React, { useState } from 'react';
import { Icon, Input, Tooltip } from '@grafana/ui';
import { TimeUnit } from 'types/queryBuilder';
import allLabels from 'labels';
import {
  formatFromStoredUnit,
  nanosecondsToStoredUnit,
  parseDurationInput,
  storedUnitAbbreviation,
} from './durationInput';

export interface DurationFilterInputProps {
  value: number;
  rawInput?: string;
  storedUnit: TimeUnit;
  onChange: (next: { value: number; rawInput: string }) => void;
}

/**
 * Numeric filter editor tailored for trace-duration columns. Accepts unit
 * suffixes (ns, us/µs, ms, s) and a bare number (interpreted as nanoseconds),
 * converting the parsed value into the column's configured stored unit before
 * dispatching. The raw text is preserved via `rawInput` for round-trip UX.
 */
export const DurationFilterInput = (props: DurationFilterInputProps) => {
  const { value, rawInput, storedUnit, onChange } = props;
  const initial = rawInput ?? (value ? formatFromStoredUnit(value, storedUnit) : '');
  const [text, setText] = useState<string>(initial);
  const [invalid, setInvalid] = useState<boolean>(false);
  const { tooltip } = allLabels.components.FilterEditor.durationFilter;

  const commit = () => {
    if (text.trim().length === 0) {
      setInvalid(false);
      onChange({ value: 0, rawInput: '' });
      return;
    }
    const parsed = parseDurationInput(text);
    if ('error' in parsed) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const stored = nanosecondsToStoredUnit(parsed.nanoseconds, storedUnit);
    onChange({ value: stored, rawInput: text.trim() });
  };

  return (
    <div data-testid="query-builder-filters-duration-value-container">
      <Input
        data-testid="query-builder-filters-duration-value-input"
        type="text"
        value={text}
        invalid={invalid}
        onChange={(e) => setText(e.currentTarget.value)}
        onBlur={commit}
        width={30}
        suffix={
          <Tooltip content={tooltip} placement="top">
            <span
              data-testid="query-builder-filters-duration-value-suffix"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              {storedUnitAbbreviation(storedUnit)}
              <Icon name="info-circle" size="sm" />
            </span>
          </Tooltip>
        }
      />
    </div>
  );
};
