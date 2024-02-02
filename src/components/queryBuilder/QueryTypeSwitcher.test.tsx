import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { QueryTypeSwitcher } from './QueryTypeSwitcher';
import labels from 'labels';
import { QueryType } from 'types/queryBuilder';

const options = {
  Table: labels.types.QueryType.table,
  Logs: labels.types.QueryType.logs,
  TimeSeries: labels.types.QueryType.timeseries,
  Traces: labels.types.QueryType.traces,
};

describe('QueryTypeSwitcher', () => {
  it('should render with default props', () => {
    const result = render(
      <QueryTypeSwitcher
        queryType={QueryType.Table}
        onChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByLabelText(options.Table)).toBeChecked();
    expect(result.getByLabelText(options.Logs)).not.toBeChecked();
    expect(result.getByLabelText(options.TimeSeries)).not.toBeChecked();
    expect(result.getByLabelText(options.Traces)).not.toBeChecked();
  });

  it('should call onChange when a new option is selected', async () => {
    const onChange = jest.fn();
    const result = render(
      <QueryTypeSwitcher
        queryType={QueryType.Table}
        onChange={onChange}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
    const timeSeriesButton = result.getByLabelText(options.TimeSeries);
    expect(timeSeriesButton).toBeInTheDocument();
    fireEvent.click(timeSeriesButton);
    expect(onChange).toBeCalledTimes(1);
    expect(onChange).toBeCalledWith(QueryType.TimeSeries);
  });
});
