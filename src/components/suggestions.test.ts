import { fetchSuggestions } from './suggestions';

describe('Suggestions', () => {
  it('Should fetch suggestions', async () => {
    const schema = {
      databases: () => Promise.resolve(['db']),
      tables: () => Promise.resolve(['table']),
      fields: () => Promise.resolve(['field']),
    };
    const range = {
      startLineNumber: 1,
      endLineNumber: 1,
      startColumn: 1,
      endColumn: 1,
    };
    const suggestions = await fetchSuggestions('db.', schema, range);

    expect(suggestions.length).toBe(1);
    expect(suggestions[0].insertText).toBe('table');
  });
});
