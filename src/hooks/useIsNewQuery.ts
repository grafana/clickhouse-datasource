import { isBuilderOptionsRunnable } from "data/utils";
import { useRef } from "react"
import { QueryBuilderOptions } from "types/queryBuilder";

/**
 * Returns true if the initial builderOptions represent a new query.
 * Returns false if the query was loaded from a saved URL or dashboard.
 * 
 * Does not update on re-renders
 */
export default (builderOptions: QueryBuilderOptions): boolean => {
  const isNewQuery = useRef<boolean>(!isBuilderOptionsRunnable(builderOptions));
  return isNewQuery.current;
}
