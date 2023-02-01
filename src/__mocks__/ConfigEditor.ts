import * as fs from 'fs';
import { Props } from '../views/CHConfigEditor';

const pluginJson = JSON.parse(fs.readFileSync('./src/plugin.json', 'utf-8'));

export const mockConfigEditorProps = (): Props => ({
  options: {
    ...pluginJson,
    jsonData: {
      server: 'foo.com',
      port: 443,
      username: 'user',
      protocol: 'native',
    },
  },
  onOptionsChange: jest.fn(),
});
