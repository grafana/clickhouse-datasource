import { CoreApp } from "@grafana/data";
import { useEffect, useRef } from "react";
import { QueryType } from "types/queryBuilder";
import { CHBuilderQuery, CHQuery } from "types/sql";

/**
 * A very questionable hook that identifies split-view Trace queries and
 * auto collapses them on mount.
 * 
 * The goal is to only render the trace panel while hiding the query editor
 * 
 * Strongly reconsider not using this in production, or maybe disable it via config switch
 */
export const useCollapseQueryOnMount = (app: CoreApp | undefined, query: CHQuery) => {
  const didCollapseQuery = useRef<boolean>(false);

  useEffect(() => {
    if (didCollapseQuery.current) {
      return;
    }

    const q = query as CHBuilderQuery;
    const isQueryValid = q && q.builderOptions && q.builderOptions.queryType === QueryType.Traces;
    const isExploreView = app === CoreApp.Explore;
    if (!isQueryValid || !isExploreView) {
      didCollapseQuery.current = true;
      return;
    }

    const elements = document.getElementsByTagName('button');
    for (let i = 0; i < elements.length; i++) {
      const element = elements.item(i);
      if (!element) {
        continue;
      }

      const isCollapseButtonName = element.getAttribute('aria-label') === 'Collapse query row'
      const isNotOriginalQuery = element.getAttribute('aria-controls') !== 'A_1';

      if (!isCollapseButtonName || !isNotOriginalQuery) {
        continue;
      }

      
      element.click();
      element.remove(); // Might cause React to die
      didCollapseQuery.current = true;
    }
  }, [app, query]);
};
