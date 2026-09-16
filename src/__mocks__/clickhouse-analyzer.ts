/** Jest mock for @clickhouse/analyzer — used via moduleNameMapper in jest.config.js */
export async function init(): Promise<void> {}
export function getDiagnostics(_sql: string): string {
  return '[]';
}
