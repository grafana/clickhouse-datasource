import { Reducer, useReducer } from "react";
import { QueryBuilderOptions, QueryType, SelectedColumn } from "types/queryBuilder";
import { defaultCHBuilderQuery } from "types/sql";

enum BuilderOptionsActionType {
  SetOptions = 'set_options',
  SetAllOptions = 'set_all_options',
  SetQueryType = 'set_query_type',
  SetDatabase = 'set_database',
  SetTable = 'set_table',
  SetOtelEnabled = 'set_otel_enabled',
  SetOtelVersion = 'set_otel_version',
  SetColumnByHint = 'set_column_by_hint',
  SetBuilderMinimized = 'set_builder_minimized',
};

type QueryBuilderOptionsReducerAction = {
  type: BuilderOptionsActionType,
  payload: Partial<QueryBuilderOptions>
};

type GenericReducerAction = {
  type: BuilderOptionsActionType,
  payload: any
};

export type BuilderOptionsReducerAction = QueryBuilderOptionsReducerAction | GenericReducerAction;

const createAction = (type: BuilderOptionsActionType, payload: Partial<QueryBuilderOptions>): BuilderOptionsReducerAction => ({ type, payload });
const createGenericAction = (type: BuilderOptionsActionType, payload: any): GenericReducerAction => ({ type, payload });
export const setOptions = (options: Partial<QueryBuilderOptions>): BuilderOptionsReducerAction => createAction(BuilderOptionsActionType.SetOptions, options);
export const setAllOptions = (options: QueryBuilderOptions): BuilderOptionsReducerAction => createAction(BuilderOptionsActionType.SetAllOptions, options);
export const setQueryType = (queryType: QueryType): BuilderOptionsReducerAction => createAction(BuilderOptionsActionType.SetQueryType, { queryType });
export const setDatabase = (database: string): BuilderOptionsReducerAction => createAction(BuilderOptionsActionType.SetDatabase, { database });
export const setTable = (table: string): BuilderOptionsReducerAction => createAction(BuilderOptionsActionType.SetTable, { table });
export const setOtelEnabled = (otelEnabled: boolean): BuilderOptionsReducerAction => createAction(BuilderOptionsActionType.SetOtelEnabled, { meta: { otelEnabled } });
export const setOtelVersion = (otelVersion: string): BuilderOptionsReducerAction => createAction(BuilderOptionsActionType.SetOtelVersion, { meta: { otelVersion } });
export const setColumnByHint = (column: SelectedColumn): GenericReducerAction => createGenericAction(BuilderOptionsActionType.SetColumnByHint, { column });
export const setBuilderMinimized = (minimized: boolean): GenericReducerAction => createGenericAction(BuilderOptionsActionType.SetBuilderMinimized, { minimized });


const reducer = (state: QueryBuilderOptions, action: BuilderOptionsReducerAction): QueryBuilderOptions => {
  const actionFn = actions.get(action.type);
  if (!actionFn) {
    throw Error('missing function for BuilderOptionsActionType: ' + action.type);
  }

  const nextState = actionFn(state, action);
  // console.log('ACTION:', action.type, 'PAYLOAD:', action.payload, 'PREV STATE:', state, 'NEXT STATE:', nextState);
  return nextState;
};

/**
 * A mapping between action type and reducer function, used in reducer to apply action changes.
 */
const actions = new Map<BuilderOptionsActionType, Reducer<QueryBuilderOptions, BuilderOptionsReducerAction>>([
  [BuilderOptionsActionType.SetOptions, (state: QueryBuilderOptions, action: BuilderOptionsReducerAction): QueryBuilderOptions => {
    // A catch-all action for applying option changes.
    const nextOptions = action.payload as Partial<QueryBuilderOptions>;
    return mergeBuilderOptionsState(state, nextOptions);
  }],
  [BuilderOptionsActionType.SetAllOptions, (state: QueryBuilderOptions, action: BuilderOptionsReducerAction): QueryBuilderOptions => {
    // Resets existing state with provided options.
    const nextOptions = action.payload as Partial<QueryBuilderOptions>;
    return buildInitialState(nextOptions);
  }],
  [BuilderOptionsActionType.SetQueryType, (state: QueryBuilderOptions, action: BuilderOptionsReducerAction): QueryBuilderOptions => {
    // If switching query type, reset the editor.
    const nextQueryType = action.payload.queryType;
    if (state.queryType !== nextQueryType) {
      return buildInitialState({
        database: state.database,
        table: state.table,
        queryType: nextQueryType
      });
    }

    return state;
  }],
  [BuilderOptionsActionType.SetDatabase, (state: QueryBuilderOptions, action: BuilderOptionsReducerAction): QueryBuilderOptions => {
    // Clear table and reset editor when database changes
    return buildInitialState({
      database: action.payload.database,
      table: '',
      queryType: state.queryType
    });
  }],
  [BuilderOptionsActionType.SetTable, (state: QueryBuilderOptions, action: BuilderOptionsReducerAction): QueryBuilderOptions => {
    // Reset editor when table changes
    return buildInitialState({
      database: state.database,
      table: action.payload.table,
      queryType: state.queryType
    });
  }],
  [BuilderOptionsActionType.SetOtelEnabled, (state: QueryBuilderOptions, action: BuilderOptionsReducerAction): QueryBuilderOptions => {
    return mergeBuilderOptionsState(state, {
      meta: {
        otelEnabled: Boolean(action.payload.meta?.otelEnabled),
      }
    });
  }],
  [BuilderOptionsActionType.SetOtelVersion, (state: QueryBuilderOptions, action: BuilderOptionsReducerAction): QueryBuilderOptions => {
    return mergeBuilderOptionsState(state, {
      meta: {
        otelVersion: action.payload.meta?.otelVersion
      }
    });
  }],
  [BuilderOptionsActionType.SetColumnByHint, (state: QueryBuilderOptions, action: GenericReducerAction): QueryBuilderOptions => {
    const col = action.payload.column as SelectedColumn;
    const nextColumns = (state.columns || []).filter(c => c.hint !== col.hint);
    nextColumns.push(col);

    return mergeBuilderOptionsState(state, {
      columns: nextColumns
    });
  }],  
  [BuilderOptionsActionType.SetBuilderMinimized, (state: QueryBuilderOptions, action: GenericReducerAction): QueryBuilderOptions => {
    const minimized = action.payload.minimized as boolean;
    return mergeBuilderOptionsState(state, {
      meta: { minimized }
    });
  }],
]);

const buildInitialState = (savedOptions?: Partial<QueryBuilderOptions>): QueryBuilderOptions => {
  const defaultOptions = defaultCHBuilderQuery.builderOptions;
  const initialState = {
    ...defaultOptions,
    ...savedOptions,
    meta: {
      ...defaultOptions.meta,
      ...savedOptions?.meta,
    }
  };

  return initialState;
};

const mergeBuilderOptionsState = (prevState: QueryBuilderOptions, nextState: Partial<QueryBuilderOptions>): QueryBuilderOptions => {
  return {
    ...prevState,
    ...nextState,
    meta: {
      ...prevState.meta,
      ...nextState.meta
    }
  };
}

export const useBuilderOptionsState = (savedOptions: QueryBuilderOptions): [QueryBuilderOptions, React.Dispatch<BuilderOptionsReducerAction>] => {
  const [state, dispatch] = useReducer<typeof reducer, QueryBuilderOptions>(reducer, savedOptions, buildInitialState);
  return [state as QueryBuilderOptions, dispatch];
};

export const testFuncs = {
  reducer,
  buildInitialState
};
