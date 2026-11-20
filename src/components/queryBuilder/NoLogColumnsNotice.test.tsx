import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { BuilderMode, ColumnHint, QueryBuilderOptions, QueryType } from 'types/queryBuilder';
import { NO_LOG_COLUMNS_NOTICE_DELAY_MS, NoLogColumnsNotice, hasNoLogColumns } from './NoLogColumnsNotice';

const column = { name: 'c', type: 'String', picklistValues: [] };
const options = (overrides: Partial<QueryBuilderOptions> = {}): QueryBuilderOptions => ({
  database: 'db',
  table: 't',
  queryType: QueryType.Logs,
  mode: BuilderMode.List,
  columns: [],
  ...overrides,
});

describe('hasNoLogColumns', () => {
  it('is true for a logs query with no selected columns once the schema has loaded', () => {
    expect(hasNoLogColumns(options(), [column])).toBe(true);
    expect(hasNoLogColumns(options({ columns: undefined }), [column])).toBe(true);
  });

  it('is false while the schema is still loading', () => {
    expect(hasNoLogColumns(options(), [])).toBe(false);
  });

  it('is false when a column is selected', () => {
    expect(hasNoLogColumns(options({ columns: [{ name: 'c', hint: ColumnHint.Time }] }), [column])).toBe(false);
  });

  it('is false for other query types', () => {
    expect(hasNoLogColumns(options({ queryType: QueryType.Table }), [column])).toBe(false);
  });
});

describe('NoLogColumnsNotice', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('names the table and links to the logs settings of the datasource', () => {
    render(<NoLogColumnsNotice datasourceUid="a b" table="host_logs" />);
    act(() => {
      jest.advanceTimersByTime(NO_LOG_COLUMNS_NOTICE_DELAY_MS);
    });
    expect(screen.getByTestId('logs-no-columns-notice')).toHaveTextContent('host_logs');
    expect(screen.getByRole('link')).toHaveAttribute('href', '/connections/datasources/edit/a%20b#logs-config');
  });

  it('does not flash while default columns are still being applied', () => {
    const { unmount } = render(<NoLogColumnsNotice datasourceUid="uid" table="host_logs" />);
    expect(screen.queryByTestId('logs-no-columns-notice')).not.toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(NO_LOG_COLUMNS_NOTICE_DELAY_MS - 1);
    });
    expect(screen.queryByTestId('logs-no-columns-notice')).not.toBeInTheDocument();

    // Unmounted before the delay (columns arrived): the notice never shows.
    unmount();
    act(() => {
      jest.advanceTimersByTime(NO_LOG_COLUMNS_NOTICE_DELAY_MS);
    });
    expect(screen.queryByTestId('logs-no-columns-notice')).not.toBeInTheDocument();
  });
});
