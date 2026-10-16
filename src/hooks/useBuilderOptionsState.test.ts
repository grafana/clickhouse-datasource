import { ColumnHint, FilterOperator, OrderByDirection, QueryType } from 'types/queryBuilder';
import {
  mergeColumns,
  setAllOptions,
  setBuilderMinimized,
  setColumnByHint,
  setDatabase,
  setOptions,
  setOtelEnabled,
  setOtelVersion,
  setQueryType,
  setTable,
  testFuncs,
  fillMissingRoles,
} from './useBuilderOptionsState';
const { reducer, buildInitialState } = testFuncs;

describe('reducer', () => {
  it('applies SetOptions action', async () => {
    const prevState = buildInitialState();
    const action = setOptions({
      limit: 100,
      // Include meta to verify deep merge
      meta: {
        otelEnabled: true,
      },
    });

    const nextState = reducer(prevState, action);
    expect(nextState.limit).toEqual(100);
    expect(nextState.meta?.otelEnabled).toEqual(true);
  });
  it('applies SetAllOptions action', async () => {
    const prevState = buildInitialState({
      limit: 100,
    });
    const action = setAllOptions({
      database: 'default',
      table: 'test',
      queryType: QueryType.Table,
    });

    const nextState = reducer(prevState, action);
    // SetAllOptions will overwrite with defaults
    expect(nextState.limit).not.toEqual(100);
  });
  it('run SetQueryType action with no changes', async () => {
    const prevState = buildInitialState({
      queryType: QueryType.TimeSeries,
    });
    const action = setQueryType(QueryType.TimeSeries);

    const nextState = reducer(prevState, action);
    expect(nextState.queryType).toEqual(QueryType.TimeSeries);
  });
  const authoredState = () =>
    buildInitialState({
      database: 'prev_db',
      table: 'prev_table',
      queryType: QueryType.Table,
      columns: [{ name: 'a' }],
      groupBy: ['a'],
      filters: [
        {
          type: 'string',
          operator: FilterOperator.Equals,
          filterType: 'custom',
          key: 'a',
          condition: 'AND',
          value: 'x',
        },
      ],
      orderBy: [{ name: 'a', dir: OrderByDirection.DESC }],
      limit: 50,
      meta: { otelEnabled: true },
    });

  it('applies SetQueryType keeping the rest of the query', async () => {
    const prevState = authoredState();

    const nextState = reducer(prevState, setQueryType(QueryType.Logs));

    expect(nextState).toEqual({ ...prevState, queryType: QueryType.Logs });
  });
  it('applies SetDatabase keeping the table and the rest of the query', async () => {
    const prevState = authoredState();

    const nextState = reducer(prevState, setDatabase('next_db'));

    expect(nextState).toEqual({ ...prevState, database: 'next_db' });
  });
  it('fills only roles still empty, and only for the same query type', async () => {
    const state = buildInitialState({
      queryType: QueryType.Logs,
      columns: [{ name: 'msg' }, { name: 't', hint: ColumnHint.Time }],
    });
    const roles = [
      { name: 'ts', hint: ColumnHint.Time },
      { name: 'msg', hint: ColumnHint.LogMessage },
    ];

    expect(reducer(state, fillMissingRoles(QueryType.Logs, roles)).columns).toEqual([
      { name: 't', hint: ColumnHint.Time },
      { name: 'msg', hint: ColumnHint.LogMessage },
    ]);
    expect(reducer(state, fillMissingRoles(QueryType.Traces, roles))).toBe(state);
  });
  it('applies SetTable keeping the rest of the query', async () => {
    const prevState = authoredState();

    const nextState = reducer(prevState, setTable('next_table'));

    expect(nextState).toEqual({ ...prevState, table: 'next_table' });
  });
  it('applies SetOtelEnabled action', async () => {
    const prevState = buildInitialState({
      limit: 50,
    });
    const action = setOtelEnabled(true);

    const nextState = reducer(prevState, action);
    expect(nextState.limit).toEqual(50);
    expect(nextState.meta?.otelEnabled).toEqual(true);
  });
  it('applies SetOtelVersion action', async () => {
    const prevState = buildInitialState({
      limit: 50,
    });
    const action = setOtelVersion('0.0.1');

    const nextState = reducer(prevState, action);
    expect(nextState.limit).toEqual(50);
    expect(nextState.meta?.otelVersion).toEqual('0.0.1');
  });
  it('applies SetColumnByHint action, overwrites existing column', async () => {
    const prevState = buildInitialState({
      columns: [{ name: 'prev_timestamp', hint: ColumnHint.Time }, { name: 'a' }, { name: 'b' }, { name: 'c' }],
    });
    const action = setColumnByHint({ name: 'next_timestamp', hint: ColumnHint.Time });

    const nextState = reducer(prevState, action);
    expect(nextState.columns).toHaveLength(4);
    expect(nextState.columns![0].name).toEqual('a');
    expect(nextState.columns![1].name).toEqual('b');
    expect(nextState.columns![2].name).toEqual('c');
    // Updated column is filtered and pushed to end of array
    expect(nextState.columns![3].name).toEqual('next_timestamp');
  });
  it('applies SetColumnByHint action, dropping a same-named hint-less column so it is not projected twice', async () => {
    // SeverityText was added as a plain column (for example by "Include all columns") and is now
    // promoted to the Level role; it must end up selected once, not once plain and once hinted.
    const prevState = buildInitialState({
      columns: [{ name: 'Timestamp', hint: ColumnHint.Time }, { name: 'SeverityText' }],
    });
    const action = setColumnByHint({ name: 'SeverityText', hint: ColumnHint.LogLevel });

    const nextState = reducer(prevState, action);
    expect(nextState.columns).toEqual([
      { name: 'Timestamp', hint: ColumnHint.Time },
      { name: 'SeverityText', hint: ColumnHint.LogLevel },
    ]);
  });
  it('applies SetColumnByHint action, keeping a same-named column that holds a different hint', async () => {
    // The dedup only drops a hint-less twin; a column that legitimately fills two roles under the
    // same name (e.g. one column as both FilterTime and Time) must keep both entries.
    const prevState = buildInitialState({
      columns: [{ name: 'Timestamp', hint: ColumnHint.FilterTime }, { name: 'a' }],
    });
    const action = setColumnByHint({ name: 'Timestamp', hint: ColumnHint.Time });

    const nextState = reducer(prevState, action);
    expect(nextState.columns).toEqual([
      { name: 'Timestamp', hint: ColumnHint.FilterTime },
      { name: 'a' },
      { name: 'Timestamp', hint: ColumnHint.Time },
    ]);
  });
  it('applies SetBuilderMinimized action', async () => {
    const prevState = buildInitialState();
    const action = setBuilderMinimized(true);

    const nextState = reducer(prevState, action);
    expect(nextState.meta?.minimized).toBe(true);
  });
  it('applies MergeColumns action, appending only columns whose name is not already selected', async () => {
    const prevState = buildInitialState({
      columns: [{ name: 'Timestamp', hint: ColumnHint.Time }, { name: 'ServiceName' }],
    });
    const action = mergeColumns([{ name: 'ServiceName' }, { name: 'StatusCode' }, { name: 'SpanId' }]);

    const nextState = reducer(prevState, action);
    // ServiceName is already present, so it is not duplicated; the new columns append in order
    expect(nextState.columns!.map((c) => c.name)).toEqual(['Timestamp', 'ServiceName', 'StatusCode', 'SpanId']);
  });
  it('returns the same state reference when MergeColumns adds nothing new', async () => {
    const prevState = buildInitialState({ columns: [{ name: 'ServiceName' }] });

    const nextState = reducer(prevState, mergeColumns([{ name: 'ServiceName' }]));
    expect(nextState).toBe(prevState);
  });
});

describe('buildInitialState', () => {
  it('builds initial state using defaults', async () => {
    const state = buildInitialState();
    expect(state).not.toBeUndefined();
    expect(state.database).toEqual('');
    expect(state.table).toEqual('');
    expect(state.queryType).toEqual(QueryType.Table);
  });

  it('builds initial state and merge saved state', async () => {
    const state = buildInitialState({
      table: 'saved_table',
      limit: 50,
      meta: {
        otelEnabled: true,
      },
    });
    expect(state).not.toBeUndefined();
    expect(state.database).toEqual('');
    expect(state.table).toEqual('saved_table');
    expect(state.limit).toEqual(50);
    expect(state.queryType).toEqual(QueryType.Table);
    expect(state.meta?.otelEnabled).toEqual(true);
  });
});
