import { Protocol } from 'types/config';
import { ValidationAPI } from '../CHConfigEditorHooks';

/**
 * Creates a mock ValidationAPI for use in tests. Captures the registered
 * validator so tests can invoke it directly and assert on inline error display.
 */
export const createMockValidation = (): ValidationAPI & { runValidator: () => boolean | Promise<boolean> } => {
  let registeredValidator: (() => boolean | Promise<boolean>) | null = null;
  return {
    registerValidation: jest.fn((fn) => {
      registeredValidator = fn;
      return () => {};
    }),
    validate: jest.fn(async () => true),
    isValid: jest.fn(() => true),
    getErrors: jest.fn(() => ({})),
    setError: jest.fn(),
    clearError: jest.fn(),
    runValidator: () => registeredValidator?.() ?? true,
  };
};

/**
 * Creates a set of test props for the Clickhouse V2 config page for use in tests.
 * This function allows you to override default properties for specific test cases.
 */
export const createTestProps = (overrides: { options?: object; mocks?: object }) => ({
  options: {
    access: 'proxy',
    basicAuth: false,
    basicAuthUser: '',
    database: '',
    id: 1,
    isDefault: false,
    jsonData: {
      version: '',
      host: '',
      port: 9000,
      protocol: Protocol.Native,
      username: '',
    },
    name: 'ClickHouse',
    orgId: 1,
    readOnly: false,
    secureJsonFields: {},
    type: 'clickhouse',
    typeLogoUrl: '',
    typeName: 'ClickHouse',
    uid: 'z',
    url: '',
    user: '',
    withCredentials: false,
    ...overrides.options,
  },
  onOptionsChange: jest.fn(),
  ...overrides.mocks,
});
