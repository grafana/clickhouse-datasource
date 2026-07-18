import * as fs from 'fs';
import * as path from 'path';

const DASHBOARDS_DIR = path.join(__dirname, '..');
const PLUGIN_JSON = path.join(__dirname, '..', '..', 'plugin.json');

const otelDashboards = [
  'otel-logs-explorer.json',
  'otel-traces-explorer.json',
  'otel-service-dashboard.json',
] as const;

const allDashboards = fs.readdirSync(DASHBOARDS_DIR).filter((filename) => filename.endsWith('.json'));

// Built-in Grafana datasources referenced by annotations
const builtInDatasourceUids = new Set(['grafana', '-- Grafana --']);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const collectDatasourceUids = (node: unknown): string[] => {
  if (Array.isArray(node)) {
    return node.flatMap(collectDatasourceUids);
  }
  if (!isRecord(node)) {
    return [];
  }
  const datasource = node.datasource;
  const uids = isRecord(datasource) && typeof datasource.uid === 'string' ? [datasource.uid] : [];
  return uids.concat(Object.values(node).flatMap(collectDatasourceUids));
};

describe('shipped dashboards', () => {
  it.each(allDashboards)('%s references datasources only via variables or built-ins', (filename) => {
    const content = fs.readFileSync(path.join(DASHBOARDS_DIR, filename), 'utf8');
    const dashboard: unknown = JSON.parse(content);
    const hardcodedUids = collectDatasourceUids(dashboard).filter(
      (uid) => !uid.startsWith('${') && !builtInDatasourceUids.has(uid)
    );
    expect(hardcodedUids).toEqual([]);
  });
});

describe('OTel dashboards', () => {
  describe.each(otelDashboards)('%s', (filename) => {
    const filepath = path.join(DASHBOARDS_DIR, filename);

    it('is valid JSON', () => {
      const content = fs.readFileSync(filepath, 'utf8');
      const parsed: unknown = JSON.parse(content);
      expect(typeof parsed).toBe('object');
      expect(parsed).not.toBeNull();
    });

    it('has a uid and a title', () => {
      const dashboard = JSON.parse(fs.readFileSync(filepath, 'utf8')) as {
        uid?: string;
        title?: string;
      };
      expect(dashboard.uid).toBeTruthy();
      expect(dashboard.title).toBeTruthy();
    });

    it('does not pass the free-text search variable to hasToken', () => {
      // hasToken() raises BAD_ARGUMENTS for needles containing whitespace or
      // ASCII separators (e.g. 'GET /api'), so free-text search clauses must
      // use substring matching such as positionCaseInsensitive() instead.
      const content = fs.readFileSync(filepath, 'utf8');
      expect(content).not.toContain('hasToken(');
    });
  });

  describe('otel-logs-explorer.json annotations', () => {
    // Traces-backed annotations must ship disabled so logs-only installations
    // do not hit UNKNOWN_TABLE errors on every dashboard load.
    it('ships traces-backed annotations disabled but not hidden', () => {
      const filepath = path.join(DASHBOARDS_DIR, 'otel-logs-explorer.json');
      const dashboard = JSON.parse(fs.readFileSync(filepath, 'utf8')) as {
        annotations?: {
          list?: Array<{ name?: string; enable?: boolean; hide?: boolean; target?: { rawSql?: string } }>;
        };
      };
      const tracesAnnotations = (dashboard.annotations?.list ?? []).filter((annotation) =>
        annotation.target?.rawSql?.includes('otel_traces')
      );
      expect(tracesAnnotations.length).toBeGreaterThan(0);
      tracesAnnotations.forEach((annotation) => {
        expect(annotation.enable).toBe(false);
        expect(annotation.hide).toBe(false);
      });
    });
  });

  describe('plugin.json registration', () => {
    const pluginJson = JSON.parse(fs.readFileSync(PLUGIN_JSON, 'utf8')) as {
      includes: Array<{ type: string; name: string; path: string }>;
    };

    it.each(otelDashboards)('registers %s in includes', (filename) => {
      const entry = pluginJson.includes.find(
        (inc) => inc.type === 'dashboard' && inc.path === `dashboards/${filename}`
      );
      expect(entry).toBeDefined();
    });

    it.each(otelDashboards)('%s file exists at the registered path', (filename) => {
      const filepath = path.join(DASHBOARDS_DIR, filename);
      expect(fs.existsSync(filepath)).toBe(true);
    });
  });

  describe('database variable', () => {
    it.each(otelDashboards)('%s exposes a "database" query variable', (filename) => {
      const dashboard = JSON.parse(fs.readFileSync(path.join(DASHBOARDS_DIR, filename), 'utf8')) as {
        templating?: { list?: Array<{ name?: string; type?: string }> };
      };
      const variable = dashboard.templating?.list?.find((v) => v.name === 'database');
      expect(variable).toBeDefined();
      expect(variable?.type).toBe('query');
    });

    it.each(otelDashboards)('%s qualifies every otel table with ${database}', (filename) => {
      const content = fs.readFileSync(path.join(DASHBOARDS_DIR, filename), 'utf8');
      // No bare (unqualified) references to the otel tables should remain.
      expect(content).not.toMatch(/(?:FROM|JOIN)\s+otel_(?:logs|traces)\b/);
    });
  });
});
