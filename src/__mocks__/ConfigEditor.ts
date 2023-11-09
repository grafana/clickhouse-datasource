import * as fs from 'fs';
import { Props } from '../views/CHConfigEditor';
import { CHConfig } from 'types';

const pluginJson = JSON.parse(fs.readFileSync('./src/plugin.json', 'utf-8'));

export const mockConfigEditorProps = (overrides?: Partial<CHConfig>): Props => ({
  options: {
    ...pluginJson,
    jsonData: {
      server: 'foo.com',
      port: 443,
      path: '',
      username: 'user',
      protocol: 'native',
      ...overrides,
    },
  },
  onOptionsChange: jest.fn(),
});
