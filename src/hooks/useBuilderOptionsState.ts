import { Reducer, useReducer } from 'react';
import { addRoleColumn, fitQueryToTable } from 'components/queryBuilder/roleColumns';
import { QueryBuilderOptions, QueryType, SelectedColumn, TableColumn } from 'types/queryBuilder';
import { defaultCHBuilderQuery } from 'types/sql';

enum BuilderOptionsActionType {
  SetOptions = 'set_options',
  SetAllOptions = 'set_all_options',
  SetQueryType = 'set_query_type',
  SetDatabase = 'set_database',
  SetTable = 'set_table',
  SetOtelEnabled = 'set_otel_enabled',
  SetOtelVersion = 'set_otel_version',
  SetColumnByHint = 'set_column_by_hint',
  MergeColumns = 'merge_columns',
  SetBuilderMinimized = 'set_builder_minimized',
  FillMissingRoles = 'fill_missing_roles',
  FitToTable = 'fit_to_table',
}

type QueryBuilderOptionsReducerAction = {
  type: BuilderOptionsActionType;
  payload: Partial<QueryBuilderOptions>;
};

type GenericReducerAction = {
  type: BuilderOptionsActionType;
  payload: any;
};

export type BuilderOptionsReducerAction = QueryBuilderOptionsReducerAction | GenericReducerAction;

const createAction = (
  type: BuilderOptionsActionType,
  payload: Partial<QueryBuilderOptions>
): BuilderOptionsReducerAction => ({ type, payload });
const createGenericAction = (type: BuilderOptionsActionType, payload: any): GenericReducerAction => ({ type, payload });
export const setOptions = (options: Partial<QueryBuilderOptions>): BuilderOptionsReducerAction =>
  createAction(BuilderOptionsActionType.SetOptions, options);
export const setAllOptions = (options: QueryBuilderOptions): BuilderOptionsReducerAction =>
  createAction(BuilderOptionsActionType.SetAllOptions, options);
export const setQueryType = (queryType: QueryType): BuilderOptionsReducerAction =>
  createAction(BuilderOptionsActionType.SetQueryType, { queryType });
export const setDatabase = (database: string): BuilderOptionsReducerAction =>
  createAction(BuilderOptionsActionType.SetDatabase, { database });
export const setTable = (table: string): BuilderOptionsReducerAction =>
  createAction(BuilderOptionsActionType.SetTable, { table });
export const setOtelEnabled = (otelEnabled: boolean): BuilderOptionsReducerAction =>
  createAction(BuilderOptionsActionType.SetOtelEnabled, { meta: { otelEnabled } });
export const setOtelVersion = (otelVersion: string): BuilderOptionsReducerAction =>
  createAction(BuilderOptionsActionType.SetOtelVersion, { meta: { otelVersion } });
export const setColumnByHint = (column: SelectedColumn): GenericReducerAction =>
  createGenericAction(BuilderOptionsActionType.SetColumnByHint, { column });
export const mergeColumns = (columns: SelectedColumn[]): GenericReducerAction =>
  createGenericAction(BuilderOptionsActionType.MergeColumns, { columns });
export const setBuilderMinimized = (minimized: boolean): GenericReducerAction =>
  createGenericAction(BuilderOptionsActionType.SetBuilderMinimized, { minimized });
/**
 * Adds role columns whose role is still empty, if the query is still of `queryType` on the
 * `database` and `table` the roles were guessed from.
 */
export const fillMissingRoles = (
  queryType: QueryType,
  database: string,
  table: string,
  columns: SelectedColumn[]
): GenericReducerAction =>
  createGenericAction(BuilderOptionsActionType.FillMissingRoles, { queryType, database, table, columns });
/** Fits the query to the columns of `database`.`table`, if it is still on that table (see `fitQueryToTable`). */
export const fitToTable = (database: string, table: string, columns: readonly TableColumn[]): GenericReducerAction =>
  createGenericAction(BuilderOptionsActionType.FitToTable, { database, table, columns });

// A query with no limit gets the default one when its type, database or table changes (#2163).
const keptLimit = (state: QueryBuilderOptions) => state.limit || defaultCHBuilderQuery.builderOptions.limit;

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
  [
    BuilderOptionsActionType.SetOptions,
    (state: QueryBuilderOptions, action: BuilderOptionsReducerAction): QueryBuilderOptions => {
      // A catch-all action for applying option changes.
      const nextOptions = action.payload as Partial<QueryBuilderOptions>;
      return mergeBuilderOptionsState(state, nextOptions);
    },
  ],
  [
    BuilderOptionsActionType.SetAllOptions,
    (state: QueryBuilderOptions, action: BuilderOptionsReducerAction): QueryBuilderOptions => {
      // Resets existing state with provided options.
      const nextOptions = action.payload as Partial<QueryBuilderOptions>;
      return buildInitialState(nextOptions);
    },
  ],
  [
    BuilderOptionsActionType.SetQueryType,
    (state: QueryBuilderOptions, action: BuilderOptionsReducerAction): QueryBuilderOptions => {
      // Keep the rest of the query; QueryBuilder adjusts it for the new type (see
      // getQueryTypeChangeDefaults), so a round trip doesn't always restore it.
      return mergeBuilderOptionsState(state, { queryType: action.payload.queryType, limit: keptLimit(state) });
    },
  ],
  [
    BuilderOptionsActionType.SetDatabase,
    (state: QueryBuilderOptions, action: BuilderOptionsReducerAction): QueryBuilderOptions => {
      // Keep the table and the rest of the query; TableSelect picks another table when this
      // one doesn't exist in the new database, and fitToTable drops what the table lacks.
      return mergeBuilderOptionsState(state, { ...action.payload, limit: keptLimit(state) });
    },
  ],
  [
    BuilderOptionsActionType.SetTable,
    (state: QueryBuilderOptions, action: BuilderOptionsReducerAction): QueryBuilderOptions => {
      // Keep the rest of the query, so switching between tables with the same schema keeps it whole.
      // Once the new table's columns load, fitToTable drops what it lacks.
      return mergeBuilderOptionsState(state, { ...action.payload, limit: keptLimit(state) });
    },
  ],
  [
    BuilderOptionsActionType.SetOtelEnabled,
    (state: QueryBuilderOptions, action: BuilderOptionsReducerAction): QueryBuilderOptions => {
      return mergeBuilderOptionsState(state, {
        meta: {
          otelEnabled: Boolean(action.payload.meta?.otelEnabled),
        },
      });
    },
  ],
  [
    BuilderOptionsActionType.SetOtelVersion,
    (state: QueryBuilderOptions, action: BuilderOptionsReducerAction): QueryBuilderOptions => {
      return mergeBuilderOptionsState(state, {
        meta: {
          otelVersion: action.payload.meta?.otelVersion,
        },
      });
    },
  ],
  [
    BuilderOptionsActionType.SetColumnByHint,
    (state: QueryBuilderOptions, action: GenericReducerAction): QueryBuilderOptions => {
      const col = action.payload.column as SelectedColumn;
      // Drop the column that currently holds this hint, and any hint-less column of the same name.
      // The latter is a plain column (for example one added by the "Include all columns" option)
      // being promoted to a role; without this it would stay selected and get projected twice.
      // Columns that hold a different hint are kept, so a column can still fill more than one role.
      const nextColumns = (state.columns || []).filter(
        (c) => c.hint !== col.hint && !(c.hint === undefined && c.name === col.name)
      );
      nextColumns.push(col);

      return mergeBuilderOptionsState(state, {
        columns: nextColumns,
      });
    },
  ],
  [
    BuilderOptionsActionType.MergeColumns,
    (state: QueryBuilderOptions, action: GenericReducerAction): QueryBuilderOptions => {
      // Append columns whose name is not already selected, keeping every existing column
      // (including role columns set by hint). Merging against live state keeps this safe
      // regardless of dispatch ordering relative to setColumnByHint.
      const incoming = (action.payload.columns as SelectedColumn[]) || [];
      const existingNames = new Set((state.columns || []).map((c) => c.name));
      const additions = incoming.filter((c) => !existingNames.has(c.name));
      if (additions.length === 0) {
        return state;
      }

      return mergeBuilderOptionsState(state, {
        columns: [...(state.columns || []), ...additions],
      });
    },
  ],
  [
    BuilderOptionsActionType.FillMissingRoles,
    (state: QueryBuilderOptions, action: GenericReducerAction): QueryBuilderOptions => {
      // Applied after an async column lookup: skip it if the query changed type or table meanwhile,
      // since the roles were guessed from the old one, and never replace a role filled meanwhile.
      const {
        queryType,
        database,
        table,
        columns: roles,
      } = action.payload as {
        queryType: QueryType;
        database: string;
        table: string;
        columns: SelectedColumn[];
      };
      if (state.queryType !== queryType || state.database !== database || state.table !== table) {
        return state;
      }
      let columns = state.columns || [];
      for (const role of roles) {
        if (!columns.some((c) => c.hint === role.hint)) {
          columns = addRoleColumn(columns, role);
        }
      }
      return columns === state.columns ? state : mergeBuilderOptionsState(state, { columns });
    },
  ],
  [
    BuilderOptionsActionType.FitToTable,
    (state: QueryBuilderOptions, action: GenericReducerAction): QueryBuilderOptions => {
      // Applied once a table's columns load: skip it if the query moved on to another table meanwhile.
      const { database, table, columns } = action.payload as {
        database: string;
        table: string;
        columns: readonly TableColumn[];
      };
      if (state.database !== database || state.table !== table || columns.length === 0) {
        return state;
      }
      const fitted = fitQueryToTable(state, columns);
      const unchanged = (Object.keys(fitted) as Array<keyof typeof fitted>).every(
        (k) => JSON.stringify(fitted[k]) === JSON.stringify(state[k] ?? [])
      );
      return unchanged ? state : mergeBuilderOptionsState(state, fitted);
    },
  ],
  [
    BuilderOptionsActionType.SetBuilderMinimized,
    (state: QueryBuilderOptions, action: GenericReducerAction): QueryBuilderOptions => {
      const minimized = action.payload.minimized as boolean;
      return mergeBuilderOptionsState(state, {
        meta: { minimized },
      });
    },
  ],
]);

const buildInitialState = (savedOptions?: Partial<QueryBuilderOptions>): QueryBuilderOptions => {
  const defaultOptions = defaultCHBuilderQuery.builderOptions;
  const initialState = {
    ...defaultOptions,
    ...savedOptions,
    meta: {
      ...defaultOptions.meta,
      ...savedOptions?.meta,
    },
  };

  return initialState;
};

const mergeBuilderOptionsState = (
  prevState: QueryBuilderOptions,
  nextState: Partial<QueryBuilderOptions>
): QueryBuilderOptions => {
  return {
    ...prevState,
    ...nextState,
    meta: {
      ...prevState.meta,
      ...nextState.meta,
    },
  };
};

export const useBuilderOptionsState = (
  savedOptions: QueryBuilderOptions
): [QueryBuilderOptions, React.Dispatch<BuilderOptionsReducerAction>] => {
  const [state, dispatch] = useReducer(reducer, savedOptions, buildInitialState);
  return [state, dispatch];
};

export const testFuncs = {
  reducer,
  buildInitialState,
};
