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
    // Each registration call returns a fresh disposable; we track them so we can
    // assert dispose() fires on every one. This guards against the provider-leak
    // that caused duplicate autocomplete entries when SqlEditor was re-mounted.
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

    // Two mounts == two registrations. Without dispose-on-unmount in the caller,
    // these stack and Monaco merges results from all of them — the source of duplicates.
    expect(completionRegister).toHaveBeenCalledTimes(2);
    expect(formattingRegister).toHaveBeenCalledTimes(2);
  });
});
