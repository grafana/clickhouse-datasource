import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { TracesConfig } from './TracesConfig';
import allLabels from 'labels';

const labelToPlaceholder = (l: string) => l.toLowerCase().replace(/ /g, '_');

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
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(allLabels.components.Config.TracesConfig.defaultDatabase.placeholder);
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onDefaultDatabaseChange).toBeCalledTimes(1);
    expect(onDefaultDatabaseChange).toBeCalledWith('changed');
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
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(allLabels.components.Config.TracesConfig.defaultTable.placeholder);
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onDefaultTableChange).toBeCalledTimes(1);
    expect(onDefaultTableChange).toBeCalledWith('changed');
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
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByRole('checkbox');
    expect(input).toBeInTheDocument();
    fireEvent.click(input);
    expect(onOtelEnabledChange).toBeCalledTimes(1);
    expect(onOtelEnabledChange).toBeCalledWith(true);
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
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const select = result.getByRole('combobox');
    expect(select).toBeInTheDocument();
    fireEvent.keyDown(select, { key: 'ArrowDown' });
    fireEvent.keyDown(select, { key: 'Enter' });
    expect(onOtelVersionChange).toBeCalledTimes(2); // 2 from hook
    expect(onOtelVersionChange).toBeCalledWith(expect.any(String));
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
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(labelToPlaceholder(allLabels.components.Config.TracesConfig.columns.traceId.label));
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onTraceIdColumnChange).toBeCalledTimes(1);
    expect(onTraceIdColumnChange).toBeCalledWith('changed');
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
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(labelToPlaceholder(allLabels.components.Config.TracesConfig.columns.spanId.label));
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onSpanIdColumnChange).toBeCalledTimes(1);
    expect(onSpanIdColumnChange).toBeCalledWith('changed');
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
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(labelToPlaceholder(allLabels.components.Config.TracesConfig.columns.operationName.label));
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onOperationNameColumnChange).toBeCalledTimes(1);
    expect(onOperationNameColumnChange).toBeCalledWith('changed');
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
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(labelToPlaceholder(allLabels.components.Config.TracesConfig.columns.parentSpanId.label));
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onParentSpanIdColumnChange).toBeCalledTimes(1);
    expect(onParentSpanIdColumnChange).toBeCalledWith('changed');
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
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(labelToPlaceholder(allLabels.components.Config.TracesConfig.columns.serviceName.label));
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onServiceNameColumnChange).toBeCalledTimes(1);
    expect(onServiceNameColumnChange).toBeCalledWith('changed');
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
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(labelToPlaceholder(allLabels.components.Config.TracesConfig.columns.durationTime.label));
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onDurationColumnChange).toBeCalledTimes(1);
    expect(onDurationColumnChange).toBeCalledWith('changed');
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
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const select = result.getByRole('combobox');
    expect(select).toBeInTheDocument();
    fireEvent.keyDown(select, { key: 'ArrowDown' });
    fireEvent.keyDown(select, { key: 'Enter' });
    expect(onDurationUnitChange).toBeCalledTimes(1);
    expect(onDurationUnitChange).toBeCalledWith(expect.any(String));
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
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(labelToPlaceholder(allLabels.components.Config.TracesConfig.columns.startTime.label));
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onStartTimeColumnChange).toBeCalledTimes(1);
    expect(onStartTimeColumnChange).toBeCalledWith('changed');
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
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(labelToPlaceholder(allLabels.components.Config.TracesConfig.columns.tags.label));
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onTagsColumnChange).toBeCalledTimes(1);
    expect(onTagsColumnChange).toBeCalledWith('changed');
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
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(labelToPlaceholder(allLabels.components.Config.TracesConfig.columns.serviceTags.label));
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onServiceTagsColumnChange).toBeCalledTimes(1);
    expect(onServiceTagsColumnChange).toBeCalledWith('changed');
  });
});
