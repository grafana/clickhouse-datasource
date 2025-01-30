import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { TracesConfig } from './TracesConfig';
import allLabels from 'labels';
import { columnLabelToPlaceholder } from 'data/utils';
import { defaultTraceTable } from 'otel';

describe('TracesConfig', () => {
  it('should render', () => {
    const result = render(
      <TracesConfig
        tracesConfig={{}}
        onDefaultDatabaseChange={() => {}}
        onDefaultTableChange={() => {}}
        onOtelEnabledChange={() => {}}
        onOtelVersionChange={() => {}}
        onTraceIdColumnChange={() => {}}
        onSpanIdColumnChange={() => {}}
        onOperationNameColumnChange={() => {}}
        onParentSpanIdColumnChange={() => {}}
        onServiceNameColumnChange={() => {}}
        onDurationColumnChange={() => {}}
        onDurationUnitChange={() => {}}
        onStartTimeColumnChange={() => {}}
        onTagsColumnChange={() => {}}
        onServiceTagsColumnChange={() => {}}
        onEventsColumnPrefixChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
  });

  it('should call onDefaultDatabase when changed', () => {
    const onDefaultDatabaseChange = jest.fn();
    const result = render(
      <TracesConfig
        tracesConfig={{}}
        onDefaultDatabaseChange={onDefaultDatabaseChange}
        onDefaultTableChange={() => {}}
        onOtelEnabledChange={() => {}}
        onOtelVersionChange={() => {}}
        onTraceIdColumnChange={() => {}}
        onSpanIdColumnChange={() => {}}
        onOperationNameColumnChange={() => {}}
        onParentSpanIdColumnChange={() => {}}
        onServiceNameColumnChange={() => {}}
        onDurationColumnChange={() => {}}
        onDurationUnitChange={() => {}}
        onStartTimeColumnChange={() => {}}
        onTagsColumnChange={() => {}}
        onServiceTagsColumnChange={() => {}}
        onEventsColumnPrefixChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(allLabels.components.Config.TracesConfig.defaultDatabase.placeholder);
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onDefaultDatabaseChange).toHaveBeenCalledTimes(1);
    expect(onDefaultDatabaseChange).toHaveBeenCalledWith('changed');
  });

  it('should call onDefaultTable when changed', () => {
    const onDefaultTableChange = jest.fn();
    const result = render(
      <TracesConfig
        tracesConfig={{}}
        onDefaultDatabaseChange={() => {}}
        onDefaultTableChange={onDefaultTableChange}
        onOtelEnabledChange={() => {}}
        onOtelVersionChange={() => {}}
        onTraceIdColumnChange={() => {}}
        onSpanIdColumnChange={() => {}}
        onOperationNameColumnChange={() => {}}
        onParentSpanIdColumnChange={() => {}}
        onServiceNameColumnChange={() => {}}
        onDurationColumnChange={() => {}}
        onDurationUnitChange={() => {}}
        onStartTimeColumnChange={() => {}}
        onTagsColumnChange={() => {}}
        onServiceTagsColumnChange={() => {}}
        onEventsColumnPrefixChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(defaultTraceTable);
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onDefaultTableChange).toHaveBeenCalledTimes(1);
    expect(onDefaultTableChange).toHaveBeenCalledWith('changed');
  });

  it('should call onOtelEnabled when changed', () => {
    const onOtelEnabledChange = jest.fn();
    const result = render(
      <TracesConfig
        tracesConfig={{}}
        onDefaultDatabaseChange={() => {}}
        onDefaultTableChange={() => {}}
        onOtelEnabledChange={onOtelEnabledChange}
        onOtelVersionChange={() => {}}
        onTraceIdColumnChange={() => {}}
        onSpanIdColumnChange={() => {}}
        onOperationNameColumnChange={() => {}}
        onParentSpanIdColumnChange={() => {}}
        onServiceNameColumnChange={() => {}}
        onDurationColumnChange={() => {}}
        onDurationUnitChange={() => {}}
        onStartTimeColumnChange={() => {}}
        onTagsColumnChange={() => {}}
        onServiceTagsColumnChange={() => {}}
        onEventsColumnPrefixChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByRole('checkbox');
    expect(input).toBeInTheDocument();
    fireEvent.click(input);
    expect(onOtelEnabledChange).toHaveBeenCalledTimes(1);
    expect(onOtelEnabledChange).toHaveBeenCalledWith(true);
  });

  it('should call onOtelVersionChange when changed', () => {
    const onOtelVersionChange = jest.fn();
    const result = render(
      <TracesConfig
        tracesConfig={{ otelEnabled: true }}
        onDefaultDatabaseChange={() => {}}
        onDefaultTableChange={() => {}}
        onOtelEnabledChange={() => {}}
        onOtelVersionChange={onOtelVersionChange}
        onTraceIdColumnChange={() => {}}
        onSpanIdColumnChange={() => {}}
        onOperationNameColumnChange={() => {}}
        onParentSpanIdColumnChange={() => {}}
        onServiceNameColumnChange={() => {}}
        onDurationColumnChange={() => {}}
        onDurationUnitChange={() => {}}
        onStartTimeColumnChange={() => {}}
        onTagsColumnChange={() => {}}
        onServiceTagsColumnChange={() => {}}
        onEventsColumnPrefixChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const select = result.getByRole('combobox');
    expect(select).toBeInTheDocument();
    fireEvent.keyDown(select, { key: 'ArrowDown' });
    fireEvent.keyDown(select, { key: 'Enter' });
    expect(onOtelVersionChange).toHaveBeenCalledTimes(2); // 2 from hook
    expect(onOtelVersionChange).toHaveBeenCalledWith(expect.any(String));
  });

  it('should call onTraceIdColumnChange when changed', () => {
    const onTraceIdColumnChange = jest.fn();
    const result = render(
      <TracesConfig
        tracesConfig={{}}
        onDefaultDatabaseChange={() => {}}
        onDefaultTableChange={() => {}}
        onOtelEnabledChange={() => {}}
        onOtelVersionChange={() => {}}
        onTraceIdColumnChange={onTraceIdColumnChange}
        onSpanIdColumnChange={() => {}}
        onOperationNameColumnChange={() => {}}
        onParentSpanIdColumnChange={() => {}}
        onServiceNameColumnChange={() => {}}
        onDurationColumnChange={() => {}}
        onDurationUnitChange={() => {}}
        onStartTimeColumnChange={() => {}}
        onTagsColumnChange={() => {}}
        onServiceTagsColumnChange={() => {}}
        onEventsColumnPrefixChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.traceId.label));
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onTraceIdColumnChange).toHaveBeenCalledTimes(1);
    expect(onTraceIdColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onSpanIdColumnChange when changed', () => {
    const onSpanIdColumnChange = jest.fn();
    const result = render(
      <TracesConfig
        tracesConfig={{}}
        onDefaultDatabaseChange={() => {}}
        onDefaultTableChange={() => {}}
        onOtelEnabledChange={() => {}}
        onOtelVersionChange={() => {}}
        onTraceIdColumnChange={() => {}}
        onSpanIdColumnChange={onSpanIdColumnChange}
        onOperationNameColumnChange={() => {}}
        onParentSpanIdColumnChange={() => {}}
        onServiceNameColumnChange={() => {}}
        onDurationColumnChange={() => {}}
        onDurationUnitChange={() => {}}
        onStartTimeColumnChange={() => {}}
        onTagsColumnChange={() => {}}
        onServiceTagsColumnChange={() => {}}
        onEventsColumnPrefixChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.spanId.label));
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onSpanIdColumnChange).toHaveBeenCalledTimes(1);
    expect(onSpanIdColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onOperationNameColumnChange when changed', () => {
    const onOperationNameColumnChange = jest.fn();
    const result = render(
      <TracesConfig
        tracesConfig={{}}
        onDefaultDatabaseChange={() => {}}
        onDefaultTableChange={() => {}}
        onOtelEnabledChange={() => {}}
        onOtelVersionChange={() => {}}
        onTraceIdColumnChange={() => {}}
        onSpanIdColumnChange={() => {}}
        onOperationNameColumnChange={onOperationNameColumnChange}
        onParentSpanIdColumnChange={() => {}}
        onServiceNameColumnChange={() => {}}
        onDurationColumnChange={() => {}}
        onDurationUnitChange={() => {}}
        onStartTimeColumnChange={() => {}}
        onTagsColumnChange={() => {}}
        onServiceTagsColumnChange={() => {}}
        onEventsColumnPrefixChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.operationName.label));
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onOperationNameColumnChange).toHaveBeenCalledTimes(1);
    expect(onOperationNameColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onParentSpanIdColumnChange when changed', () => {
    const onParentSpanIdColumnChange = jest.fn();
    const result = render(
      <TracesConfig
        tracesConfig={{}}
        onDefaultDatabaseChange={() => {}}
        onDefaultTableChange={() => {}}
        onOtelEnabledChange={() => {}}
        onOtelVersionChange={() => {}}
        onTraceIdColumnChange={() => {}}
        onSpanIdColumnChange={() => {}}
        onOperationNameColumnChange={() => {}}
        onParentSpanIdColumnChange={onParentSpanIdColumnChange}
        onServiceNameColumnChange={() => {}}
        onDurationColumnChange={() => {}}
        onDurationUnitChange={() => {}}
        onStartTimeColumnChange={() => {}}
        onTagsColumnChange={() => {}}
        onServiceTagsColumnChange={() => {}}
        onEventsColumnPrefixChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.parentSpanId.label));
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onParentSpanIdColumnChange).toHaveBeenCalledTimes(1);
    expect(onParentSpanIdColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onServiceNameColumnChange when changed', () => {
    const onServiceNameColumnChange = jest.fn();
    const result = render(
      <TracesConfig
        tracesConfig={{}}
        onDefaultDatabaseChange={() => {}}
        onDefaultTableChange={() => {}}
        onOtelEnabledChange={() => {}}
        onOtelVersionChange={() => {}}
        onTraceIdColumnChange={() => {}}
        onSpanIdColumnChange={() => {}}
        onOperationNameColumnChange={() => {}}
        onParentSpanIdColumnChange={() => {}}
        onServiceNameColumnChange={onServiceNameColumnChange}
        onDurationColumnChange={() => {}}
        onDurationUnitChange={() => {}}
        onStartTimeColumnChange={() => {}}
        onTagsColumnChange={() => {}}
        onServiceTagsColumnChange={() => {}}
        onEventsColumnPrefixChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.serviceName.label));
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onServiceNameColumnChange).toHaveBeenCalledTimes(1);
    expect(onServiceNameColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onDurationColumnChange when changed', () => {
    const onDurationColumnChange = jest.fn();
    const result = render(
      <TracesConfig
        tracesConfig={{}}
        onDefaultDatabaseChange={() => {}}
        onDefaultTableChange={() => {}}
        onOtelEnabledChange={() => {}}
        onOtelVersionChange={() => {}}
        onTraceIdColumnChange={() => {}}
        onSpanIdColumnChange={() => {}}
        onOperationNameColumnChange={() => {}}
        onParentSpanIdColumnChange={() => {}}
        onServiceNameColumnChange={() => {}}
        onDurationColumnChange={onDurationColumnChange}
        onDurationUnitChange={() => {}}
        onStartTimeColumnChange={() => {}}
        onTagsColumnChange={() => {}}
        onServiceTagsColumnChange={() => {}}
        onEventsColumnPrefixChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.durationTime.label));
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onDurationColumnChange).toHaveBeenCalledTimes(1);
    expect(onDurationColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onDurationUnitChange when changed', () => {
    const onDurationUnitChange = jest.fn();
    const result = render(
      <TracesConfig
        tracesConfig={{}}
        onDefaultDatabaseChange={() => {}}
        onDefaultTableChange={() => {}}
        onOtelEnabledChange={() => {}}
        onOtelVersionChange={() => {}}
        onTraceIdColumnChange={() => {}}
        onSpanIdColumnChange={() => {}}
        onOperationNameColumnChange={() => {}}
        onParentSpanIdColumnChange={() => {}}
        onServiceNameColumnChange={() => {}}
        onDurationColumnChange={() => {}}
        onDurationUnitChange={onDurationUnitChange}
        onStartTimeColumnChange={() => {}}
        onTagsColumnChange={() => {}}
        onServiceTagsColumnChange={() => {}}
        onEventsColumnPrefixChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const select = result.getByRole('combobox');
    expect(select).toBeInTheDocument();
    fireEvent.keyDown(select, { key: 'ArrowDown' });
    fireEvent.keyDown(select, { key: 'Enter' });
    expect(onDurationUnitChange).toHaveBeenCalledTimes(1);
    expect(onDurationUnitChange).toHaveBeenCalledWith(expect.any(String));
  });

  it('should call onStartTimeColumnChange when changed', () => {
    const onStartTimeColumnChange = jest.fn();
    const result = render(
      <TracesConfig
        tracesConfig={{}}
        onDefaultDatabaseChange={() => {}}
        onDefaultTableChange={() => {}}
        onOtelEnabledChange={() => {}}
        onOtelVersionChange={() => {}}
        onTraceIdColumnChange={() => {}}
        onSpanIdColumnChange={() => {}}
        onOperationNameColumnChange={() => {}}
        onParentSpanIdColumnChange={() => {}}
        onServiceNameColumnChange={() => {}}
        onDurationColumnChange={() => {}}
        onDurationUnitChange={() => {}}
        onStartTimeColumnChange={onStartTimeColumnChange}
        onTagsColumnChange={() => {}}
        onServiceTagsColumnChange={() => {}}
        onEventsColumnPrefixChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.startTime.label));
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onStartTimeColumnChange).toHaveBeenCalledTimes(1);
    expect(onStartTimeColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onTagsColumnChange when changed', () => {
    const onTagsColumnChange = jest.fn();
    const result = render(
      <TracesConfig
        tracesConfig={{}}
        onDefaultDatabaseChange={() => {}}
        onDefaultTableChange={() => {}}
        onOtelEnabledChange={() => {}}
        onOtelVersionChange={() => {}}
        onTraceIdColumnChange={() => {}}
        onSpanIdColumnChange={() => {}}
        onOperationNameColumnChange={() => {}}
        onParentSpanIdColumnChange={() => {}}
        onServiceNameColumnChange={() => {}}
        onDurationColumnChange={() => {}}
        onDurationUnitChange={() => {}}
        onStartTimeColumnChange={() => {}}
        onTagsColumnChange={onTagsColumnChange}
        onServiceTagsColumnChange={() => {}}
        onEventsColumnPrefixChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.tags.label));
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onTagsColumnChange).toHaveBeenCalledTimes(1);
    expect(onTagsColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onServiceTagsColumnChange when changed', () => {
    const onServiceTagsColumnChange = jest.fn();
    const result = render(
      <TracesConfig
        tracesConfig={{}}
        onDefaultDatabaseChange={() => {}}
        onDefaultTableChange={() => {}}
        onOtelEnabledChange={() => {}}
        onOtelVersionChange={() => {}}
        onTraceIdColumnChange={() => {}}
        onSpanIdColumnChange={() => {}}
        onOperationNameColumnChange={() => {}}
        onParentSpanIdColumnChange={() => {}}
        onServiceNameColumnChange={() => {}}
        onDurationColumnChange={() => {}}
        onDurationUnitChange={() => {}}
        onStartTimeColumnChange={() => {}}
        onTagsColumnChange={() => {}}
        onServiceTagsColumnChange={onServiceTagsColumnChange}
        onEventsColumnPrefixChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.serviceTags.label));
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onServiceTagsColumnChange).toHaveBeenCalledTimes(1);
    expect(onServiceTagsColumnChange).toHaveBeenCalledWith('changed');
  });
});
