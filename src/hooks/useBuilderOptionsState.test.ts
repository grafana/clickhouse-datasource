import { ColumnHint, QueryType } from "types/queryBuilder";
import { setAllOptions, setBuilderMinimized, setColumnByHint, setDatabase, setOptions, setOtelEnabled, setOtelVersion, setQueryType, setTable, testFuncs } from "./useBuilderOptionsState";
const { reducer, buildInitialState } = testFuncs;

describe('reducer', () => {
  it('applies SetOptions action', async () => {
    const prevState = buildInitialState();
    const action = setOptions({
      limit: 100,
      // Include meta to verify deep merge
      meta: {
        otelEnabled: true
      }
    });

    const nextState = reducer(prevState, action);
    expect(nextState.limit).toEqual(100);
    expect(nextState.meta?.otelEnabled).toEqual(true);
  });
  it('applies SetAllOptions action', async () => {
    const prevState = buildInitialState({
      limit: 100
    });
    const action = setAllOptions({
      database: 'default',
      table: 'test',
      queryType: QueryType.Table
    });

    const nextState = reducer(prevState, action);
    // SetAllOptions will overwrite with defaults
    expect(nextState.limit).not.toEqual(100);
  });
  it('run SetQueryType action with no changes', async () => {
    const prevState = buildInitialState({
      queryType: QueryType.TimeSeries
    });
    const action = setQueryType(QueryType.TimeSeries);

    const nextState = reducer(prevState, action);
    expect(nextState.queryType).toEqual(QueryType.TimeSeries);
  });
  it('applies SetQueryType to reset settings but preserve db/table', async () => {
    const prevState = buildInitialState({
      database: 'prev_db',
      table: 'prev_table',
      queryType: QueryType.Table,
      groupBy: ['will', 'be', 'reset']
    });
    const action = setQueryType(QueryType.Logs);

    const nextState = reducer(prevState, action);
    expect(nextState.database).toEqual('prev_db');
    expect(nextState.table).toEqual('prev_table');
    expect(nextState.queryType).toEqual(QueryType.Logs);
    expect(nextState.groupBy).toBeFalsy();
  });
  it('applies SetDatabase to reset settings but preserve query type', async () => {
    const prevState = buildInitialState({
      database: 'prev_db',
      table: 'prev_table',
      queryType: QueryType.Logs,
      groupBy: ['will', 'be', 'reset']
    });
    const action = setDatabase('next_db');

    const nextState = reducer(prevState, action);
    expect(nextState.database).toEqual('next_db');
    expect(nextState.table).toEqual('');
    expect(nextState.queryType).toEqual(QueryType.Logs);
    expect(nextState.groupBy).toBeFalsy();
  });
  it('applies SetTable to reset settings but preserve db/queryType', async () => {
    const prevState = buildInitialState({
      database: 'prev_db',
      table: 'prev_table',
      queryType: QueryType.Logs,
      groupBy: ['will', 'be', 'reset']
    });
    const action = setTable('next_table');

    const nextState = reducer(prevState, action);
    expect(nextState.database).toEqual('prev_db');
    expect(nextState.table).toEqual('next_table');
    expect(nextState.queryType).toEqual(QueryType.Logs);
    expect(nextState.groupBy).toBeFalsy();
  });
  it('applies SetOtelEnabled action', async () => {
    const prevState = buildInitialState({
      limit: 50
    });
    const action = setOtelEnabled(true);

    const nextState = reducer(prevState, action);
    expect(nextState.limit).toEqual(50);
    expect(nextState.meta?.otelEnabled).toEqual(true);
  });
  it('applies SetOtelVersion action', async () => {
    const prevState = buildInitialState({
      limit: 50
    });
    const action = setOtelVersion('0.0.1');

    const nextState = reducer(prevState, action);
    expect(nextState.limit).toEqual(50);
    expect(nextState.meta?.otelVersion).toEqual('0.0.1');
  });
  it('applies SetColumnByHint action, overwrites existing column', async () => {
    const prevState = buildInitialState({
      columns: [
        { name: 'prev_timestamp', hint: ColumnHint.Time },
        { name: 'a' },
        { name: 'b' },
        { name: 'c' },
      ]
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
  it('applies SetBuilderMinimized action', async () => {
    const prevState = buildInitialState();
    const action = setBuilderMinimized(true);

    const nextState = reducer(prevState, action);
    expect(nextState.meta?.minimized).toBe(true);
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
        otelEnabled: true
      }
    });
    expect(state).not.toBeUndefined();
    expect(state.database).toEqual('');
    expect(state.table).toEqual('saved_table');
    expect(state.limit).toEqual(50);
    expect(state.queryType).toEqual(QueryType.Table);
    expect(state.meta?.otelEnabled).toEqual(true);
  });
});
