import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { TracesConfig, TraceConfigProps } from './TracesConfig';
import allLabels from 'labels';
import { columnLabelToPlaceholder } from 'data/utils';
import { defaultCHAdditionalSettingsConfig } from 'types/config';

function defaultTraceConfigProps(): TraceConfigProps {
  return {
    tracesConfig: {},
    onDefaultDatabaseChange: () => {},
    onDefaultTableChange: () => {},
    onOtelEnabledChange: () => {},
    onOtelVersionChange: () => {},
    onTraceIdColumnChange: () => {},
    onSpanIdColumnChange: () => {},
    onOperationNameColumnChange: () => {},
    onParentSpanIdColumnChange: () => {},
    onServiceNameColumnChange: () => {},
    onDurationColumnChange: () => {},
    onDurationUnitChange: () => {},
    onStartTimeColumnChange: () => {},
    onTagsColumnChange: () => {},
    onServiceTagsColumnChange: () => {},
    onKindColumnChange: () => {},
    onStatusCodeColumnChange: () => {},
    onStatusMessageColumnChange: () => {},
    onStateColumnChange: () => {},
    onInstrumentationLibraryNameColumnChange: () => {},
    onInstrumentationLibraryVersionColumnChange: () => {},
    onFlattenNestedChange: () => {},
    onEventsColumnPrefixChange: () => {},
    onLinksColumnPrefixChange: () => {},
  };
}

describe('TracesConfig', () => {
  it('should render', () => {
    const result = render(<TracesConfig {...defaultTraceConfigProps()} />);
    expect(result.container.firstChild).not.toBeNull();
  });

  it('should call onDefaultDatabase when changed', () => {
    const onDefaultDatabaseChange = jest.fn();
    const result = render(
      <TracesConfig {...defaultTraceConfigProps()} onDefaultDatabaseChange={onDefaultDatabaseChange} />
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
    const result = render(<TracesConfig {...defaultTraceConfigProps()} onDefaultTableChange={onDefaultTableChange} />);
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(defaultCHAdditionalSettingsConfig.traces?.defaultTable!);
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onDefaultTableChange).toHaveBeenCalledTimes(1);
    expect(onDefaultTableChange).toHaveBeenCalledWith('changed');
  });

  it('should call onOtelEnabled when changed', async () => {
    const onOtelEnabledChange = jest.fn();
    const result = render(<TracesConfig {...defaultTraceConfigProps()} onOtelEnabledChange={onOtelEnabledChange} />);
    expect(result.container.firstChild).not.toBeNull();

    const input = (await result.findAllByRole('checkbox'))[0];
    expect(input).toBeInTheDocument();
    fireEvent.click(input);
    expect(onOtelEnabledChange).toHaveBeenCalledTimes(1);
    expect(onOtelEnabledChange).toHaveBeenCalledWith(true);
  });

  it('should call onOtelVersionChange when changed', () => {
    const onOtelVersionChange = jest.fn();
    const result = render(
      <TracesConfig
        {...defaultTraceConfigProps()}
        tracesConfig={{ otelEnabled: true }}
        onOtelVersionChange={onOtelVersionChange}
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
      <TracesConfig {...defaultTraceConfigProps()} onTraceIdColumnChange={onTraceIdColumnChange} />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(
      columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.traceId.label)
    );
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onTraceIdColumnChange).toHaveBeenCalledTimes(1);
    expect(onTraceIdColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onSpanIdColumnChange when changed', () => {
    const onSpanIdColumnChange = jest.fn();
    const result = render(<TracesConfig {...defaultTraceConfigProps()} onSpanIdColumnChange={onSpanIdColumnChange} />);
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(
      columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.spanId.label)
    );
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onSpanIdColumnChange).toHaveBeenCalledTimes(1);
    expect(onSpanIdColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onOperationNameColumnChange when changed', () => {
    const onOperationNameColumnChange = jest.fn();
    const result = render(
      <TracesConfig {...defaultTraceConfigProps()} onOperationNameColumnChange={onOperationNameColumnChange} />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(
      columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.operationName.label)
    );
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onOperationNameColumnChange).toHaveBeenCalledTimes(1);
    expect(onOperationNameColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onParentSpanIdColumnChange when changed', () => {
    const onParentSpanIdColumnChange = jest.fn();
    const result = render(
      <TracesConfig {...defaultTraceConfigProps()} onParentSpanIdColumnChange={onParentSpanIdColumnChange} />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(
      columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.parentSpanId.label)
    );
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onParentSpanIdColumnChange).toHaveBeenCalledTimes(1);
    expect(onParentSpanIdColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onServiceNameColumnChange when changed', () => {
    const onServiceNameColumnChange = jest.fn();
    const result = render(
      <TracesConfig {...defaultTraceConfigProps()} onServiceNameColumnChange={onServiceNameColumnChange} />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(
      columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.serviceName.label)
    );
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onServiceNameColumnChange).toHaveBeenCalledTimes(1);
    expect(onServiceNameColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onDurationColumnChange when changed', () => {
    const onDurationColumnChange = jest.fn();
    const result = render(
      <TracesConfig {...defaultTraceConfigProps()} onDurationColumnChange={onDurationColumnChange} />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(
      columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.durationTime.label)
    );
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onDurationColumnChange).toHaveBeenCalledTimes(1);
    expect(onDurationColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onDurationUnitChange when changed', () => {
    const onDurationUnitChange = jest.fn();
    const result = render(<TracesConfig {...defaultTraceConfigProps()} onDurationUnitChange={onDurationUnitChange} />);
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
      <TracesConfig {...defaultTraceConfigProps()} onStartTimeColumnChange={onStartTimeColumnChange} />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(
      columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.startTime.label)
    );
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onStartTimeColumnChange).toHaveBeenCalledTimes(1);
    expect(onStartTimeColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onTagsColumnChange when changed', () => {
    const onTagsColumnChange = jest.fn();
    const result = render(<TracesConfig {...defaultTraceConfigProps()} onTagsColumnChange={onTagsColumnChange} />);
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(
      columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.tags.label)
    );
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onTagsColumnChange).toHaveBeenCalledTimes(1);
    expect(onTagsColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onServiceTagsColumnChange when changed', () => {
    const onServiceTagsColumnChange = jest.fn();
    const result = render(
      <TracesConfig {...defaultTraceConfigProps()} onServiceTagsColumnChange={onServiceTagsColumnChange} />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(
      columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.serviceTags.label)
    );
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onServiceTagsColumnChange).toHaveBeenCalledTimes(1);
    expect(onServiceTagsColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onKindColumnChange when changed', () => {
    const onKindColumnChange = jest.fn();
    const result = render(<TracesConfig {...defaultTraceConfigProps()} onKindColumnChange={onKindColumnChange} />);
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(
      columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.kind.label)
    );
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onKindColumnChange).toHaveBeenCalledTimes(1);
    expect(onKindColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onStatusCodeColumnChange when changed', () => {
    const onStatusCodeColumnChange = jest.fn();
    const result = render(
      <TracesConfig {...defaultTraceConfigProps()} onStatusCodeColumnChange={onStatusCodeColumnChange} />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(
      columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.statusCode.label)
    );
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onStatusCodeColumnChange).toHaveBeenCalledTimes(1);
    expect(onStatusCodeColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onStatusMessageColumnChange when changed', () => {
    const onStatusMessageColumnChange = jest.fn();
    const result = render(
      <TracesConfig {...defaultTraceConfigProps()} onStatusMessageColumnChange={onStatusMessageColumnChange} />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(
      columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.statusMessage.label)
    );
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onStatusMessageColumnChange).toHaveBeenCalledTimes(1);
    expect(onStatusMessageColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onStateColumnChange when changed', () => {
    const onStateColumnChange = jest.fn();
    const result = render(<TracesConfig {...defaultTraceConfigProps()} onStateColumnChange={onStateColumnChange} />);
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(
      columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.state.label)
    );
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onStateColumnChange).toHaveBeenCalledTimes(1);
    expect(onStateColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onInstrumentationLibraryNameColumnChange when changed', () => {
    const onInstrumentationLibraryNameColumnChange = jest.fn();
    const result = render(
      <TracesConfig
        {...defaultTraceConfigProps()}
        onInstrumentationLibraryNameColumnChange={onInstrumentationLibraryNameColumnChange}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(
      columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.instrumentationLibraryName.label)
    );
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onInstrumentationLibraryNameColumnChange).toHaveBeenCalledTimes(1);
    expect(onInstrumentationLibraryNameColumnChange).toHaveBeenCalledWith('changed');
  });

  it('should call onInstrumentationLibraryVersionColumnChange when changed', () => {
    const onInstrumentationLibraryVersionColumnChange = jest.fn();
    const result = render(
      <TracesConfig
        {...defaultTraceConfigProps()}
        onInstrumentationLibraryVersionColumnChange={onInstrumentationLibraryVersionColumnChange}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(
      columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.instrumentationLibraryVersion.label)
    );
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onInstrumentationLibraryVersionColumnChange).toHaveBeenCalledTimes(1);
    expect(onInstrumentationLibraryVersionColumnChange).toHaveBeenCalledWith('changed');
  });

  // Commented out as it's broken post npm upgrade - needs investigation
  // it('should call onFlattenNestedChange when changed', async () => {
  //   const onFlattenNestedChange = jest.fn();
  //   const result = render(
  //     <TracesConfig {...defaultTraceConfigProps()} onFlattenNestedChange={onFlattenNestedChange} />
  //   );
  //   expect(result.container.firstChild).not.toBeNull();

  //   const input = (await result.findByLabelText(
  //     allLabels.components.Config.TracesConfig.columns.flattenNested.label
  //   )) as HTMLInputElement;
  //   expect(input).toBeInTheDocument();
  //   fireEvent.click(input);
  //   expect(onFlattenNestedChange).toHaveBeenCalledTimes(1);
  //   expect(onFlattenNestedChange).toHaveBeenCalledWith(true);
  // });

  it('should call onEventsColumnPrefixChange when changed', () => {
    const onEventsColumnPrefixChange = jest.fn();
    const result = render(
      <TracesConfig {...defaultTraceConfigProps()} onEventsColumnPrefixChange={onEventsColumnPrefixChange} />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(
      columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.eventsPrefix.label)
    );
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onEventsColumnPrefixChange).toHaveBeenCalledTimes(1);
    expect(onEventsColumnPrefixChange).toHaveBeenCalledWith('changed');
  });

  it('should call onLinksColumnPrefixChange when changed', () => {
    const onLinksColumnPrefixChange = jest.fn();
    const result = render(
      <TracesConfig {...defaultTraceConfigProps()} onLinksColumnPrefixChange={onLinksColumnPrefixChange} />
    );
    expect(result.container.firstChild).not.toBeNull();

    const input = result.getByPlaceholderText(
      columnLabelToPlaceholder(allLabels.components.Config.TracesConfig.columns.linksPrefix.label)
    );
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(onLinksColumnPrefixChange).toHaveBeenCalledTimes(1);
    expect(onLinksColumnPrefixChange).toHaveBeenCalledWith('changed');
  });
});
