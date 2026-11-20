import { formatSql, registerSQL } from './sqlProvider';

describe('SQL Formatter', () => {
  it('formats SQL', () => {
    const input = 'SELECT 1, 2, 3 FROM test LIMIT 1';
    const expected = 'SELECT\n 1,\n 2,\n 3\nFROM\n test\nLIMIT\n 1';

    const actual = formatSql(input, 1);
    expect(actual).toBe(expected);
  });
});

describe('registerSQL', () => {
  it('disposes the completion and formatting providers when dispose() is called', () => {
    const disposables: Array<{ dispose: jest.Mock }> = [];
    const makeDisposable = () => {
      const d = { dispose: jest.fn() };
      disposables.push(d);
      return d;
    };

    (window as any).monaco = {
      languages: {
        registerCompletionItemProvider: jest.fn(makeDisposable),
        registerDocumentFormattingEditProvider: jest.fn(makeDisposable),
      },
      editor: {} as any,
    };

    const editor: any = { updateOptions: jest.fn() };
    const fetcher = jest.fn();

    const registration = registerSQL('sql', editor, fetcher);
    expect(disposables).toHaveLength(2);
    disposables.forEach((d) => expect(d.dispose).not.toHaveBeenCalled());

    registration.dispose();
    disposables.forEach((d) => expect(d.dispose).toHaveBeenCalledTimes(1));
  });

  it('registers a fresh pair of providers on each call (caller must dispose)', () => {
    const completionRegister = jest.fn(() => ({ dispose: jest.fn() }));
    const formattingRegister = jest.fn(() => ({ dispose: jest.fn() }));

    (window as any).monaco = {
      languages: {
        registerCompletionItemProvider: completionRegister,
        registerDocumentFormattingEditProvider: formattingRegister,
      },
      editor: {} as any,
    };

    const editor: any = { updateOptions: jest.fn() };

    registerSQL('sql', editor, jest.fn());
    registerSQL('sql', editor, jest.fn());

    expect(completionRegister).toHaveBeenCalledTimes(2);
    expect(formattingRegister).toHaveBeenCalledTimes(2);
  });

  it('answers completion requests only for its own editor', async () => {
    const providers: any[] = [];
    (window as any).monaco = {
      languages: {
        registerCompletionItemProvider: jest.fn((_language: string, provider: any) => {
          providers.push(provider);
          return { dispose: jest.fn() };
        }),
        registerDocumentFormattingEditProvider: jest.fn(() => ({ dispose: jest.fn() })),
      },
      editor: {} as any,
    };

    const makeModel = () => ({
      getValue: () => 'SELECT ',
      getWordUntilPosition: () => ({ startColumn: 8, endColumn: 8 }),
      getOffsetAt: () => 7,
      getValueInRange: jest.fn(),
    });
    const suggestion = (label: string) => ({
      label,
      kind: 0,
      insertText: label,
      range: { startLineNumber: 1, endLineNumber: 1, startColumn: 8, endColumn: 8 },
    });
    const modelA = makeModel();
    const modelB = makeModel();
    const fetchA = jest.fn(async () => ({ suggestions: [suggestion('from editor A')] }));
    const fetchB = jest.fn(async () => ({ suggestions: [suggestion('from editor B')] }));
    const editorA: any = { updateOptions: jest.fn(), getModel: () => modelA };
    const editorB: any = { updateOptions: jest.fn(), getModel: () => modelB };

    registerSQL('sql', editorA, fetchA);
    registerSQL('sql', editorB, fetchB);

    // Monaco asks every provider registered for the language, as it does when both editors are open.
    const position = { lineNumber: 1, column: 8 };
    const results = await Promise.all(providers.map((p) => p.provideCompletionItems(modelB, position)));

    expect(results.flatMap((r) => r.suggestions)).toEqual([suggestion('from editor B')]);
    expect(fetchA).not.toHaveBeenCalled();
    expect(fetchB).toHaveBeenCalledTimes(1);
  });
});
