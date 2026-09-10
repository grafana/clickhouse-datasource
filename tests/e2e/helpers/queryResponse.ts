import { ExplorePage } from '@grafana/plugin-e2e';

// Typed view of the /api/ds/query response shape the specs drill into:
// results[refId].frames[].schema.fields[{ name, type, typeInfo }] and
// .data.values[][] (one values array per column).

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
 * Wraps explorePage.waitForQueryDataResponse, reading the response body
 * inside the predicate while the CDP buffer is still live. Only resolves for
 * an OK response whose body carries a frames array for the given refId.
 *
 * TODO: patch @grafana/plugin-e2e so waitForQueryDataResponse exposes the
 * body directly, removing the need for this workaround.
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

/** The frames array for a refId, or [] when the body has none. */
export function frames(body: QueryDataBody | null, refId = 'A'): Frame[] {
  return body?.results?.[refId]?.frames ?? [];
}

/** The first frame's column-major values arrays, or [] when absent. */
export function frameValues(body: QueryDataBody | null, refId = 'A'): unknown[][] {
  return frames(body, refId)[0]?.data?.values ?? [];
}

/** The first frame's schema fields, or [] when absent. */
export function frameFields(body: QueryDataBody | null, refId = 'A'): FrameField[] {
  return frames(body, refId)[0]?.schema?.fields ?? [];
}

/**
 * Row count of the first frame: the length of any column's values array
 * (clickhouse-datasource returns one values array per column).
 */
export function rowCount(body: QueryDataBody | null, refId = 'A'): number {
  const values = frameValues(body, refId)[0];
  return Array.isArray(values) ? values.length : 0;
}
