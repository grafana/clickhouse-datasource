import * as fs from 'fs';
import * as path from 'path';

const DASHBOARDS_DIR = path.join(__dirname, '..');
const PLUGIN_JSON = path.join(__dirname, '..', '..', 'plugin.json');

const otelDashboards = [
  'otel-logs-explorer.json',
  'otel-traces-explorer.json',
  'otel-service-dashboard.json',
] as const;

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
});
