import React, { act } from 'react';
import { fireEvent, render, within } from '@testing-library/react';
import { SchemaExplorer, MIN_COLUMNS_LOADING_MS } from './SchemaExplorer';
import { Datasource } from 'data/CHDatasource';
import { TableColumn } from 'types/queryBuilder';
import { selectors } from 'selectors';
import labels from 'labels';

jest.mock('hooks/useDatabases', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('hooks/useTables', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('hooks/useColumns', () => ({ __esModule: true, default: jest.fn(), useColumnsState: jest.fn() }));
jest.mock('hooks/useTableEngines', () => ({ __esModule: true, default: jest.fn() }));

import useDatabases from 'hooks/useDatabases';
import useTables from 'hooks/useTables';
import useColumns, { useColumnsState } from 'hooks/useColumns';
import useTableEngines from 'hooks/useTableEngines';

const mockUseDatabases = useDatabases as jest.Mock;
const mockUseTables = useTables as jest.Mock;
const mockUseColumns = useColumns as jest.Mock;
const mockUseColumnsState = useColumnsState as jest.Mock;
const mockUseTableEngines = useTableEngines as jest.Mock;

const columns: readonly TableColumn[] = [
  { name: 'id', type: 'UInt64', picklistValues: [] },
  { name: 'timestamp', type: 'DateTime', picklistValues: [] },
];

const tablesList = (result: ReturnType<typeof render>): HTMLElement =>
  within(result.getByTestId(selectors.components.SchemaExplorer.tablesPane)).getByTestId(
    selectors.components.SchemaExplorer.list
  );

const buildDatasource = (): Datasource => {
  const ds = {} as Datasource;
  ds.getConfiguredTimeColumn = jest.fn(() => undefined);
  return ds;
};

describe('SchemaExplorer', () => {
  beforeEach(() => {
    mockUseDatabases.mockReturnValue(['default', 'analytics']);
    mockUseTables.mockReturnValue([]);
    mockUseColumns.mockReturnValue([]);
    mockUseColumnsState.mockReturnValue({ columns: [], loading: false });
    mockUseTableEngines.mockReturnValue({});
  });

  it('renders databases', () => {
    const result = render(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={{}}
        onStateChange={() => {}}
        onSendToBuilder={() => {}}
        onSendToSql={() => {}}
      />
    );
    expect(result.getByText('default')).toBeInTheDocument();
    expect(result.getByText('analytics')).toBeInTheDocument();
  });

  it('clicking a database calls onStateChange with the table cleared', () => {
    const onStateChange = jest.fn();
    const result = render(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={{ database: 'default', table: 'events', selectedColumns: ['id'] }}
        onStateChange={onStateChange}
        onSendToBuilder={() => {}}
        onSendToSql={() => {}}
      />
    );
    fireEvent.click(result.getByText('analytics'));
    expect(onStateChange).toHaveBeenCalledWith(
      {
        database: 'analytics',
        table: undefined,
        selectedColumns: [],
        timeColumn: undefined,
      },
      []
    );
  });

  it('renders each table engine beside the table name', () => {
    mockUseTables.mockReturnValue(['events', 'rollups']);
    mockUseTableEngines.mockReturnValue({ events: 'MergeTree', rollups: 'SummingMergeTree' });
    const result = render(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={{ database: 'default' }}
        onStateChange={() => {}}
        onSendToBuilder={() => {}}
        onSendToSql={() => {}}
      />
    );
    const pane = within(result.getByTestId(selectors.components.SchemaExplorer.tablesPane));
    expect(pane.getByText('MergeTree')).toBeInTheDocument();
    expect(pane.getByText('SummingMergeTree')).toBeInTheDocument();
  });

  it('renders a table with no known engine', () => {
    mockUseTables.mockReturnValue(['events']);
    mockUseTableEngines.mockReturnValue({});
    const result = render(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={{ database: 'default' }}
        onStateChange={() => {}}
        onSendToBuilder={() => {}}
        onSendToSql={() => {}}
      />
    );
    expect(result.getByText('events')).toBeInTheDocument();
  });

  it('renders columns with their types', () => {
    mockUseColumnsState.mockReturnValue({ columns, loading: false });
    const result = render(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={{ database: 'default', table: 'events' }}
        onStateChange={() => {}}
        onSendToBuilder={() => {}}
        onSendToSql={() => {}}
      />
    );
    expect(result.getByLabelText('id')).toBeInTheDocument();
    expect(result.getByText('UInt64')).toBeInTheDocument();
    expect(result.getByLabelText('timestamp')).toBeInTheDocument();
    expect(result.getByText('DateTime')).toBeInTheDocument();
  });

  it('ticking a column updates selectedColumns', () => {
    mockUseColumnsState.mockReturnValue({ columns, loading: false });
    const onStateChange = jest.fn();
    const result = render(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={{ database: 'default', table: 'events', selectedColumns: [] }}
        onStateChange={onStateChange}
        onSendToBuilder={() => {}}
        onSendToSql={() => {}}
      />
    );
    fireEvent.click(result.getByLabelText('id'));
    expect(onStateChange).toHaveBeenCalledWith(expect.objectContaining({ selectedColumns: ['id'] }), columns);
  });

  it('disables both send buttons with no table selected', () => {
    const result = render(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={{}}
        onStateChange={() => {}}
        onSendToBuilder={() => {}}
        onSendToSql={() => {}}
      />
    );
    expect(result.getByTestId(selectors.components.SchemaExplorer.sendToBuilderButton)).toBeDisabled();
    expect(result.getByTestId(selectors.components.SchemaExplorer.sendToSqlButton)).toBeDisabled();
  });

  it('fires onSendToBuilder and onSendToSql with the right arguments once a table and columns are selected', () => {
    mockUseColumnsState.mockReturnValue({ columns, loading: false });
    const onSendToBuilder = jest.fn();
    const onSendToSql = jest.fn();
    const result = render(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={{ database: 'default', table: 'events', selectedColumns: ['id'], timeColumn: 'timestamp' }}
        onStateChange={() => {}}
        onSendToBuilder={onSendToBuilder}
        onSendToSql={onSendToSql}
      />
    );

    const builderButton = result.getByTestId(selectors.components.SchemaExplorer.sendToBuilderButton);
    expect(builderButton).not.toBeDisabled();
    fireEvent.click(builderButton);
    expect(onSendToBuilder).toHaveBeenCalledWith('default', 'events', ['id'], 'timestamp', columns);

    const sqlButton = result.getByTestId(selectors.components.SchemaExplorer.sendToSqlButton);
    fireEvent.click(sqlButton);
    expect(onSendToSql).toHaveBeenCalledWith('default', 'events', ['id'], 'timestamp', columns);
  });

  it('sends the resolved default time column to the builder when none is explicitly selected', () => {
    mockUseColumnsState.mockReturnValue({ columns, loading: false });
    const onSendToBuilder = jest.fn();
    const result = render(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={{ database: 'default', table: 'events', selectedColumns: ['id'] }}
        onStateChange={() => {}}
        onSendToBuilder={onSendToBuilder}
        onSendToSql={() => {}}
      />
    );

    fireEvent.click(result.getByTestId(selectors.components.SchemaExplorer.sendToBuilderButton));
    expect(onSendToBuilder).toHaveBeenCalledWith('default', 'events', ['id'], 'timestamp', columns);
  });

  it('persists the resolved default time column into state once columns load', () => {
    mockUseColumnsState.mockReturnValue({ columns, loading: false });
    const onStateChange = jest.fn();
    render(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={{ database: 'default', table: 'events' }}
        onStateChange={onStateChange}
        onSendToBuilder={() => {}}
        onSendToSql={() => {}}
      />
    );

    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ database: 'default', table: 'events', timeColumn: 'timestamp' }),
      columns
    );
  });

  it('shows the loading hint and disables both send buttons while columns are loading', () => {
    mockUseColumnsState.mockReturnValue({ columns: [], loading: true });
    const result = render(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={{ database: 'default', table: 'events' }}
        onStateChange={() => {}}
        onSendToBuilder={() => {}}
        onSendToSql={() => {}}
      />
    );

    expect(result.getByText(labels.components.SchemaExplorer.columns.loading)).toBeInTheDocument();
    expect(result.queryByText(labels.components.SchemaExplorer.timeColumn.noneOption)).not.toBeInTheDocument();
    expect(result.getByTestId(selectors.components.SchemaExplorer.sendToBuilderButton)).toBeDisabled();
    expect(result.getByTestId(selectors.components.SchemaExplorer.sendToSqlButton)).toBeDisabled();
  });

  it('resolves the default time column once columns finish loading instead of leaving "No time filter"', () => {
    jest.useFakeTimers();
    mockUseColumnsState.mockReturnValue({ columns: [], loading: true });
    const result = render(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={{ database: 'default', table: 'events' }}
        onStateChange={() => {}}
        onSendToBuilder={() => {}}
        onSendToSql={() => {}}
      />
    );
    expect(result.queryByText(labels.components.SchemaExplorer.timeColumn.noneOption)).not.toBeInTheDocument();

    mockUseColumnsState.mockReturnValue({ columns, loading: false });
    act(() => {
      jest.advanceTimersByTime(MIN_COLUMNS_LOADING_MS);
    });
    result.rerender(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={{ database: 'default', table: 'events' }}
        onStateChange={() => {}}
        onSendToBuilder={() => {}}
        onSendToSql={() => {}}
      />
    );

    const timeColumnSelect = result.getByTestId(selectors.components.SchemaExplorer.timeColumnSelect);
    expect(within(timeColumnSelect).getByText('timestamp')).toBeInTheDocument();
    expect(result.queryByText(labels.components.SchemaExplorer.timeColumn.noneOption)).not.toBeInTheDocument();
    jest.useRealTimers();
  });
});

describe('columns loading minimum duration', () => {
  beforeEach(() => {
    mockUseDatabases.mockReturnValue(['default']);
    mockUseTables.mockReturnValue(['events']);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const renderExplorer = () =>
    render(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={{ database: 'default', table: 'events' }}
        onStateChange={() => {}}
        onSendToBuilder={() => {}}
        onSendToSql={() => {}}
      />
    );

  it('holds the loading state and withholds columns for the minimum duration after a fast fetch resolves', () => {
    mockUseColumnsState.mockReturnValue({ columns: [], loading: true });
    const result = renderExplorer();

    mockUseColumnsState.mockReturnValue({ columns, loading: false });
    result.rerender(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={{ database: 'default', table: 'events' }}
        onStateChange={() => {}}
        onSendToBuilder={() => {}}
        onSendToSql={() => {}}
      />
    );
    expect(result.getByText(labels.components.SchemaExplorer.columns.loading)).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(MIN_COLUMNS_LOADING_MS - 1);
    });
    expect(result.getByText(labels.components.SchemaExplorer.columns.loading)).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.getByLabelText('id')).toBeInTheDocument();
  });

  it('does not add delay on top of a fetch that already took longer than the minimum', () => {
    mockUseColumnsState.mockReturnValue({ columns: [], loading: true });
    const result = renderExplorer();

    act(() => {
      jest.advanceTimersByTime(MIN_COLUMNS_LOADING_MS + 200);
    });

    mockUseColumnsState.mockReturnValue({ columns, loading: false });
    result.rerender(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={{ database: 'default', table: 'events' }}
        onStateChange={() => {}}
        onSendToBuilder={() => {}}
        onSendToSql={() => {}}
      />
    );

    expect(result.getByLabelText('id')).toBeInTheDocument();
  });

  it('does not update state after unmounting before the minimum duration elapses', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    mockUseColumnsState.mockReturnValue({ columns: [], loading: true });
    const result = renderExplorer();

    mockUseColumnsState.mockReturnValue({ columns, loading: false });
    result.rerender(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={{ database: 'default', table: 'events' }}
        onStateChange={() => {}}
        onSendToBuilder={() => {}}
        onSendToSql={() => {}}
      />
    );

    result.unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(MIN_COLUMNS_LOADING_MS);
    });
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  });
});

describe('scroll to selection', () => {
  // jsdom does no layout, so offsetTop/offsetHeight/clientHeight are all 0 by default.
  // Derive them from DOM structure instead: row height by sibling index, list viewport
  // small enough that a row several siblings deep falls outside it.
  const ROW_HEIGHT = 20;
  const LIST_CLIENT_HEIGHT = 60;

  let offsetTopDescriptor: PropertyDescriptor | undefined;
  let offsetHeightDescriptor: PropertyDescriptor | undefined;
  let clientHeightDescriptor: PropertyDescriptor | undefined;

  beforeAll(() => {
    offsetTopDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop');
    offsetHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    clientHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

    Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
      configurable: true,
      get(this: HTMLElement) {
        if (this.getAttribute('data-testid') !== selectors.components.SchemaExplorer.row || !this.parentElement) {
          return 0;
        }
        return Array.prototype.indexOf.call(this.parentElement.children, this) * ROW_HEIGHT;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.getAttribute('data-testid') === selectors.components.SchemaExplorer.row ? ROW_HEIGHT : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.getAttribute('data-testid') === selectors.components.SchemaExplorer.list ? LIST_CLIENT_HEIGHT : 0;
      },
    });
  });

  afterAll(() => {
    if (offsetTopDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'offsetTop', offsetTopDescriptor);
    }
    if (offsetHeightDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeightDescriptor);
    }
    if (clientHeightDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor);
    }
  });

  const manyTables = Array.from({ length: 10 }, (_, i) => `table${i}`);
  const manyDatabases = Array.from({ length: 10 }, (_, i) => `db${i}`);

  it('scrolls the selected table into view on mount when it is off screen', () => {
    mockUseTables.mockReturnValue(manyTables);
    const result = render(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={{ database: 'default', table: 'table9' }}
        onStateChange={() => {}}
        onSendToBuilder={() => {}}
        onSendToSql={() => {}}
      />
    );

    expect(tablesList(result).scrollTop).toBeGreaterThan(0);
  });

  it('leaves scrollTop untouched when the selected table is already visible', () => {
    mockUseTables.mockReturnValue(manyTables);
    const result = render(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={{ database: 'default', table: 'table0' }}
        onStateChange={() => {}}
        onSendToBuilder={() => {}}
        onSendToSql={() => {}}
      />
    );

    expect(tablesList(result).scrollTop).toBe(0);
  });

  it('does not re-scroll on a rerender with the same selection', () => {
    mockUseTables.mockReturnValue(manyTables);
    const state = { database: 'default', table: 'table9' };
    const result = render(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={state}
        onStateChange={() => {}}
        onSendToBuilder={() => {}}
        onSendToSql={() => {}}
      />
    );

    const list = tablesList(result);
    expect(list.scrollTop).toBeGreaterThan(0);

    list.scrollTop = 999;

    result.rerender(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={state}
        onStateChange={() => {}}
        onSendToBuilder={() => {}}
        onSendToSql={() => {}}
      />
    );

    expect(list.scrollTop).toBe(999);
  });

  it('scrolls again when the selected table changes', () => {
    mockUseTables.mockReturnValue(manyTables);
    const result = render(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={{ database: 'default', table: 'table0' }}
        onStateChange={() => {}}
        onSendToBuilder={() => {}}
        onSendToSql={() => {}}
      />
    );

    expect(tablesList(result).scrollTop).toBe(0);

    result.rerender(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={{ database: 'default', table: 'table9' }}
        onStateChange={() => {}}
        onSendToBuilder={() => {}}
        onSendToSql={() => {}}
      />
    );

    expect(tablesList(result).scrollTop).toBeGreaterThan(0);
  });

  it('scrolls the selected database into view on mount when it is off screen', () => {
    mockUseDatabases.mockReturnValue(manyDatabases);
    const result = render(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={{ database: 'db9' }}
        onStateChange={() => {}}
        onSendToBuilder={() => {}}
        onSendToSql={() => {}}
      />
    );

    const row = result.getByText('db9');
    expect(row.parentElement!.scrollTop).toBeGreaterThan(0);
  });

  it('does not undo a manual scroll for the databases pane on rerender with the same selection', () => {
    mockUseDatabases.mockReturnValue(manyDatabases);
    const state = { database: 'db9' };
    const result = render(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={state}
        onStateChange={() => {}}
        onSendToBuilder={() => {}}
        onSendToSql={() => {}}
      />
    );

    const list = result.getByText('db9').parentElement!;
    expect(list.scrollTop).toBeGreaterThan(0);

    list.scrollTop = 777;

    result.rerender(
      <SchemaExplorer
        datasource={buildDatasource()}
        state={state}
        onStateChange={() => {}}
        onSendToBuilder={() => {}}
        onSendToSql={() => {}}
      />
    );

    expect(list.scrollTop).toBe(777);
  });
});
