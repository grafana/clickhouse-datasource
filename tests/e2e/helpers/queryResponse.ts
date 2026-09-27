import { ExplorePage } from '@grafana/plugin-e2e';

// The parts of the /api/ds/query response body that the specs read.

export interface FrameField {
  name: string;
  type?: string;
  typeInfo?: {
    frame?: string;
    nullable?: boolean;
  };
}

export interface Frame {
  schema?: {
    fields?: FrameField[];
  };
  data?: {
    values?: unknown[][];
  };
}

export interface QueryDataBody {
  results?: Record<string, { frames?: Frame[] } | undefined>;
}

/**
 * Start waiting for an OK /api/ds/query response with frames for refId. Call
 * before the action that runs the query, await responsePromise after it, then
 * read the body with getBody(). The body is read inside the predicate because
 * the response buffer is only live there. plugin-e2e 3.12.0 adds
 * GrafanaPage.waitForQueryDataResponseWithBody for this. Delegate to it once
 * the dependency is bumped.
 */
export async function waitForQueryDataResponseWithBody(explorePage: ExplorePage, refId = 'A') {
  let body: QueryDataBody | null = null;
  const responsePromise = explorePage.waitForQueryDataResponse(async (r) => {
    if (!r.ok()) {
      return false;
    }
    const b = (await r.json().catch(() => null)) as QueryDataBody | null;
    if (!Array.isArray(b?.results?.[refId]?.frames)) {
      return false;
    }
    body = b;
    return true;
  });
  return { responsePromise, getBody: (): QueryDataBody | null => body };
}

/** The frames for refId, or [] when the body has none. */
export function frames(body: QueryDataBody | null, refId = 'A'): Frame[] {
  return body?.results?.[refId]?.frames ?? [];
}

/** The first frame's column-major values, or [] when absent. */
export function frameValues(body: QueryDataBody | null, refId = 'A'): unknown[][] {
  return frames(body, refId)[0]?.data?.values ?? [];
}

/** The first frame's schema fields, or [] when absent. */
export function frameFields(body: QueryDataBody | null, refId = 'A'): FrameField[] {
  return frames(body, refId)[0]?.schema?.fields ?? [];
}

/** Row count of the first frame. ClickHouse returns one values array per column. */
export function rowCount(body: QueryDataBody | null, refId = 'A'): number {
  const values = frameValues(body, refId)[0];
  return Array.isArray(values) ? values.length : 0;
}
