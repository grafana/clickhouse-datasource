import * as fs from 'fs';
import { ConfigEditorProps } from 'views/CHConfigEditor';
import { CHConfig } from 'types/config';

const pluginJson = JSON.parse(fs.readFileSync('./src/plugin.json', 'utf-8'));

export const mockConfigEditorProps = (overrides?: Partial<CHConfig>): ConfigEditorProps => ({
  options: {
    ...pluginJson,
    jsonData: {
      server: 'foo.com',
      port: 443,
      path: '',
      username: 'user',
      protocol: 'http',
      ...overrides,
    },
  },
  onOptionsChange: jest.fn(),
});
