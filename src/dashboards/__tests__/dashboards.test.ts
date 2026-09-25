import * as fs from 'fs';
import * as path from 'path';

const DASHBOARDS_DIR = path.join(__dirname, '..');
const PLUGIN_JSON = path.join(__dirname, '..', '..', 'plugin.json');

const otelDashboards = [
  'otel-logs-explorer.json',
  'otel-logs-explorer-json.json',
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

  describe('JSON-schema logs dashboard', () => {
    const JSON_DASHBOARD = 'otel-logs-explorer-json.json';
    const filepath = path.join(DASHBOARDS_DIR, JSON_DASHBOARD);

    it('is registered in plugin.json with a distinct uid/title', () => {
      const pluginJson = JSON.parse(fs.readFileSync(PLUGIN_JSON, 'utf8')) as {
        includes: Array<{ type: string; path: string }>;
      };
      expect(
        pluginJson.includes.find((i) => i.type === 'dashboard' && i.path === `dashboards/${JSON_DASHBOARD}`)
      ).toBeDefined();

      const dashboard = JSON.parse(fs.readFileSync(filepath, 'utf8')) as { uid?: string; title?: string };
      expect(dashboard.uid).toBe('otel-logs-explorer-json');
      expect(dashboard.title).toContain('JSON');
    });

    it('reads otel_logs attributes with JSON (dot) access, not Map (bracket)', () => {
      const content = fs.readFileSync(filepath, 'utf8');
      expect(content).toContain('ResourceAttributes.service.namespace::String');
      expect(content).toContain('ResourceAttributes.k8s.pod.name::String');
      expect(content).not.toContain("ResourceAttributes['service.namespace']");
      expect(content).not.toContain("ResourceAttributes['k8s.pod.name']");
    });

    it('keeps Map (bracket) access for otel_traces in the deployment annotation', () => {
      // otel_traces is still Map(String,String); only otel_logs uses the JSON schema.
      const content = fs.readFileSync(filepath, 'utf8');
      expect(content).toContain("ResourceAttributes['service.version']");
    });
  });

  describe('importable', () => {
    it.each(otelDashboards)('%s declares a datasource __input so import prompts for one', (filename) => {
      const dashboard = JSON.parse(fs.readFileSync(path.join(DASHBOARDS_DIR, filename), 'utf8')) as {
        __inputs?: Array<{ name?: string; type?: string; pluginId?: string }>;
      };
      const dsInput = dashboard.__inputs?.find((i) => i.type === 'datasource');
      expect(dsInput).toBeDefined();
      expect(dsInput?.pluginId).toBe('grafana-clickhouse-datasource');
    });

    it.each(otelDashboards)('%s wires the datasource variable to the __input', (filename) => {
      // On UI import Grafana substitutes the input token into current.value, so the datasource
      // the user picks in the import prompt becomes the variable's selection.
      const dashboard = JSON.parse(fs.readFileSync(path.join(DASHBOARDS_DIR, filename), 'utf8')) as {
        __inputs?: Array<{ name?: string; type?: string }>;
        templating?: { list?: Array<{ type?: string; current?: { value?: string } }> };
      };
      const inputName = dashboard.__inputs?.find((i) => i.type === 'datasource')?.name;
      const dsVar = dashboard.templating?.list?.find((v) => v.type === 'datasource');
      expect(dsVar?.current?.value).toBe(`\${${inputName}}`);
    });
  });

  describe('query-analysis query_log source', () => {
    const QUERY_ANALYSIS = 'query-analysis.json';
    const readDashboard = () =>
      JSON.parse(fs.readFileSync(path.join(DASHBOARDS_DIR, QUERY_ANALYSIS), 'utf8')) as {
        templating?: { list?: Array<{ name?: string; type?: string; query?: unknown }> };
      };

    it('exposes query_log as a constant variable defaulting to the local system table', () => {
      const variable = readDashboard().templating?.list?.find((v) => v.name === 'query_log');
      expect(variable).toBeDefined();
      expect(variable?.type).toBe('constant');
      expect(variable?.query).toBe('system.query_log');
    });

    it('reads every panel and variable through ${query_log}', () => {
      // A single hard-coded system.query_log would silently pin that panel to the local node
      // while the rest of the dashboard followed the selected source.
      const content = fs.readFileSync(path.join(DASHBOARDS_DIR, QUERY_ANALYSIS), 'utf8');
      const sources = content.match(/(?:FROM|JOIN)\s+(?:\$\{query_log\}|[\w.]*query_log)/g) ?? [];
      expect(sources.length).toBeGreaterThan(0);
      for (const source of sources) {
        expect(source.replace(/(?:FROM|JOIN)\s+/, '')).toBe('${query_log}');
      }
    });

    it('filters every panel by the dashboard variables', () => {
      // Two panels used to read the whole query_log regardless of the Query status, user and
      // query kind selections, which reads as a rendering bug rather than a filter.
      const dashboard = JSON.parse(fs.readFileSync(path.join(DASHBOARDS_DIR, QUERY_ANALYSIS), 'utf8')) as {
        panels?: Array<{ title?: string; targets?: Array<{ rawSql?: string }>; panels?: unknown }>;
      };
      const flatten = (panels: typeof dashboard.panels = []): NonNullable<typeof dashboard.panels> =>
        panels.flatMap((panel) => [panel, ...flatten((panel.panels as typeof dashboard.panels) ?? [])]);

      const queries = flatten(dashboard.panels).flatMap((panel) =>
        (panel.targets ?? []).map((target) => ({ title: panel.title ?? '', sql: target.rawSql ?? '' }))
      );
      expect(queries.length).toBeGreaterThan(0);

      for (const { title, sql } of queries.filter(({ sql }) => sql.includes('${query_log}'))) {
        for (const column of ['type', 'initial_user', 'query_kind']) {
          // Either the variable drives the column, or the panel constrains that column itself
          // — "Query requests by user" picks its own top ten, as it does on main.
          const constrained =
            sql.includes(`$__conditionalAll(${column} IN (`) || new RegExp(`\\b${column} (?:IN|!=|=) `).test(sql);
          expect(`${title} constrains ${column}`).toBe(constrained ? `${title} constrains ${column}` : sql);
        }
      }
    });
  });

  describe('template variable quoting', () => {
    // allDashboards covers every bundled dashboard, so a bare interpolation added to any of
    // them is caught.
    it.each(allDashboards)('%s quotes template variables in SQL', (filename) => {
      const content = fs.readFileSync(path.join(DASHBOARDS_DIR, filename), 'utf8');
      // Template variables must be interpolated with :singlequote, not bare. The datasource's
      // default formatter (CHDatasource.format) already renders a multi-value selection as
      // 'a','b', but it does not escape a single quote inside a value, so a value such as
      // bob's-service produces invalid SQL. :singlequote escapes the quote; the plain formatter
      // does not. Dashboards mix uppercase IN and lowercase in, so match case-insensitively.
      // ($__... macros are excluded.)
      expect(content).not.toMatch(/IN \(\$\{?(?!__)\w+\}?\)/i);
      expect(content).not.toMatch(/= '\$\{?\w+\}?'/i);
    });
  });

  describe('database variable', () => {
    // The three Map-schema dashboards link to each other with includeVars, so a database
    // selected on one is forwarded to the others. Their selectors must therefore offer the
    // same set of databases: one that holds both otel_logs and otel_traces. If a dashboard
    // listed databases holding only its own signal, forwarding that choice would land the
    // next dashboard on a database where none of its tables resolve.
    const linkedOtelDashboards = [
      'otel-logs-explorer.json',
      'otel-traces-explorer.json',
      'otel-service-dashboard.json',
    ] as const;

    const databaseVariableSql = (filename: string): string | undefined => {
      const dashboard = JSON.parse(fs.readFileSync(path.join(DASHBOARDS_DIR, filename), 'utf8')) as {
        templating?: { list?: Array<{ name?: string; query?: { rawSql?: string } }> };
      };
      return dashboard.templating?.list?.find((v) => v.name === 'database')?.query?.rawSql;
    };

    it('linked dashboards agree on which databases the selector offers', () => {
      const queries = linkedOtelDashboards.map(databaseVariableSql);
      expect(queries.every((q) => typeof q === 'string' && q.length > 0)).toBe(true);
      expect(new Set(queries).size).toBe(1);
    });

    it.each(linkedOtelDashboards)('%s only offers databases holding both otel tables', (filename) => {
      const sql = databaseVariableSql(filename) ?? '';
      expect(sql).toContain("name IN ('otel_logs', 'otel_traces')");
      expect(sql).toContain('count(DISTINCT name) = 2');
    });

    const crossLinksIn = (filename: string) =>
      fs.readFileSync(path.join(DASHBOARDS_DIR, filename), 'utf8').match(/\/d\/otel-[a-z-]+\?[^"]*/g) ?? [];

    it.each(linkedOtelDashboards)('%s carries the database through drill-through links', (filename) => {
      // Nothing else covers link forwarding, so a dropped parameter would leave CI green while
      // silently sending the target dashboard to whichever database it defaults to.
      for (const url of crossLinksIn(filename)) {
        expect(url).toContain('var-database=${database}');
      }
    });

    it('otel-service-dashboard.json has drill-through links for that guard to check', () => {
      // The panel drill-throughs live only on the service dashboard, so the loop above runs
      // zero times for the two explorers. Pin the count here: deleting the links would
      // otherwise make the guard pass vacuously.
      expect(crossLinksIn('otel-service-dashboard.json').length).toBeGreaterThan(0);
    });

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
      // ...and qualification must actually have happened: at least one table
      // reference is prefixed with the ${database} variable.
      expect(content).toMatch(/(?:FROM|JOIN)\s+\$\{database\}\.otel_(?:logs|traces)\b/);
    });
  });

  describe('interval variable', () => {
    type Panel = { gridPos?: unknown; interval?: string; targets?: Array<{ rawSql?: string }> };
    type Dashboard = {
      templating?: { list?: Array<{ name?: string; type?: string }> };
      panels?: Array<Panel & { panels?: Panel[] }>;
    };

    const flatten = (d: Dashboard): Panel[] => (d.panels ?? []).flatMap((p) => [p, ...(p.panels ?? [])]);

    it.each(otelDashboards)('%s exposes an "interval" interval variable', (filename) => {
      const d = JSON.parse(fs.readFileSync(path.join(DASHBOARDS_DIR, filename), 'utf8')) as Dashboard;
      const variable = d.templating?.list?.find((v) => v.name === 'interval');
      expect(variable).toBeDefined();
      expect(variable?.type).toBe('interval');
    });

    it.each(otelDashboards)('%s sets min interval on every $__interval_s panel', (filename) => {
      const d = JSON.parse(fs.readFileSync(path.join(DASHBOARDS_DIR, filename), 'utf8')) as Dashboard;
      const bucketed = flatten(d).filter((p) =>
        (p.targets ?? []).some((t) => (t.rawSql ?? '').includes('$__interval_s'))
      );
      expect(bucketed.length).toBeGreaterThan(0);
      for (const panel of bucketed) {
        expect(panel.interval).toBe('${interval}');
      }
    });

    const intervalLinksIn = (filename: string) =>
      fs.readFileSync(path.join(DASHBOARDS_DIR, filename), 'utf8').match(/var-interval=\$\{interval[^}]*\}/g) ?? [];

    it.each(otelDashboards)('%s forwards the interval through drill-through links', (filename) => {
      // Plain ${interval}, not :text. On scenes, IntervalVariable defines no getValueText, so
      // the :text formatter falls through to getValue() and forwards the resolved bucket
      // anyway; and the target's updateFromUrl takes any non-sentinel string verbatim, so
      // var-interval=auto would set a literal "auto" that is not one of its options. A
      // drill-through therefore pins the bucket that was in effect, which is at least a value
      // the target can honour. The dashboard-level menu link keeps auto via includeVars.
      for (const param of intervalLinksIn(filename)) {
        expect(param).toBe('var-interval=${interval}');
      }
    });

    it('otel-service-dashboard.json has interval-forwarding links for that guard to check', () => {
      // The loop above runs zero times for the two explorers, so without this the guard would
      // still pass if the parameter were dropped from every link.
      expect(intervalLinksIn('otel-service-dashboard.json').length).toBeGreaterThan(0);
    });
  });
});
