import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { Datasource } from 'data/CHDatasource';
import { BuilderMode, ColumnHint, QueryBuilderOptions, QueryType } from 'types/queryBuilder';
import { NO_LOG_COLUMNS_NOTICE_DELAY_MS } from '../NoLogColumnsNotice';
import { LogsQueryBuilder } from './LogsQueryBuilder';

const mockColumns = jest.fn();
jest.mock('hooks/useColumns', () => ({ __esModule: true, default: (...args: unknown[]) => mockColumns(...args) }));
jest.mock('hooks/useFitQueryToTable', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('./logsQueryBuilderHooks', () => ({
  useDefaultFilters: jest.fn(),
  useDefaultLogColumnsByName: jest.fn(),
  useBackfillLogColumnTypes: jest.fn(),
  useDefaultTimeColumn: jest.fn(),
  useLogDefaultsOnMount: jest.fn(),
  useOtelColumns: jest.fn(),
}));
// The editors are not under test and need a full datasource to render.
jest.mock('../ColumnsEditor', () => ({ ColumnsEditor: () => null }));
jest.mock('../ColumnSelect', () => ({ ColumnSelect: () => null }));
jest.mock('../OtelVersionSelect', () => ({ OtelVersionSelect: () => null }));
jest.mock('../OrderByEditor', () => ({ OrderByEditor: () => null, getOrderByOptions: () => [] }));
jest.mock('../LimitEditor', () => ({ LimitEditor: () => null }));
jest.mock('../FilterEditor', () => ({ FiltersEditor: () => null }));

const datasource = {
  uid: 'logs-ds',
  getDefaultLogsColumns: jest.fn(() => new Map([['time', 'ts']])),
} as unknown as Datasource;

const options = (overrides: Partial<QueryBuilderOptions> = {}): QueryBuilderOptions => ({
  database: 'db',
  table: 'host_logs',
  queryType: QueryType.Logs,
  mode: BuilderMode.List,
  columns: [],
  ...overrides,
});

const renderBuilder = (builderOptions: QueryBuilderOptions) =>
  render(
    <LogsQueryBuilder datasource={datasource} builderOptions={builderOptions} builderOptionsDispatch={jest.fn()} />
  );

const advancePastDelay = () =>
  act(() => {
    jest.advanceTimersByTime(NO_LOG_COLUMNS_NOTICE_DELAY_MS);
  });

describe('LogsQueryBuilder no-columns notice', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockColumns.mockReturnValue([{ name: 'remote_addr', type: 'String', picklistValues: [] }]);
  });
  afterEach(() => jest.useRealTimers());

  it('shows the notice once the schema has loaded and no column is selected', () => {
    renderBuilder(options());
    expect(screen.queryByTestId('logs-no-columns-notice')).not.toBeInTheDocument();
    advancePastDelay();
    expect(screen.getByTestId('logs-no-columns-notice')).toHaveTextContent('host_logs');
  });

  it('shows no notice while the schema is loading', () => {
    mockColumns.mockReturnValue([]);
    renderBuilder(options());
    advancePastDelay();
    expect(screen.queryByTestId('logs-no-columns-notice')).not.toBeInTheDocument();
  });

  it('shows no notice when a column is selected', () => {
    renderBuilder(options({ columns: [{ name: 'ts', hint: ColumnHint.Time }] }));
    advancePastDelay();
    expect(screen.queryByTestId('logs-no-columns-notice')).not.toBeInTheDocument();
  });
});
