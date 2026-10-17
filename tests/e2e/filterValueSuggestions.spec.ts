import { expect, test } from '@grafana/plugin-e2e';
import type { Locator, Page, Request } from '@playwright/test';
import { switchToBuilderMode } from './helpers/builder';
import { FIXTURE_FROM_ISO, FIXTURE_TO_ISO, skipFixtureTestsOnCloud } from './helpers/env';
import { exploreUrl } from './helpers/explore';

const fixtureRange = { from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO };

const openBuilder = async (page: Page, serviceCondition: string, range = fixtureRange) => {
  const rawSql = `SELECT timestamp, service FROM "e2e_test"."events" WHERE ( timestamp >= $__fromTime AND timestamp <= $__toTime ) AND ( ${serviceCondition} ) LIMIT 100`;
  await page.goto(exploreUrl({ rawSql, ...range }));
  await switchToBuilderMode(page);
};

const probeSql = (request: Request): string => JSON.parse(request.postData() ?? '{}').queries?.[0]?.rawSql ?? '';

const isValueProbe = (request: Request, search?: string) =>
  request.url().includes('/api/ds/query') &&
  (request.postData() ?? '').includes('LIMIT 100000') &&
  (search === undefined || probeSql(request).includes(`positionCaseInsensitiveUTF8(toString("service"), '${search}')`));

interface ProbeResponseBody {
  results?: Record<string, { frames?: Array<{ data?: { values?: unknown[][] } }> }>;
}

const sqlPreview = (page: Page): Locator => page.getByTestId('query-editor-section-builder').locator('pre');

const valueContainer = (page: Page, kind: 'single' | 'multi'): Locator =>
  page.getByTestId(`query-builder-filters-${kind}-string-value-container`);

const valueInput = (page: Page, kind: 'single' | 'multi'): Locator => valueContainer(page, kind).getByRole('combobox');

const editorCrashed = (page: Page): Locator => page.getByText('ClickHouse query editor failed to load');

const openValueMenu = async (page: Page, kind: 'single' | 'multi') => {
  const probe = page.waitForResponse((r) => isValueProbe(r.request()));
  await valueInput(page, kind).click();
  await probe;
};

const typeSearch = async (page: Page, search: string) => {
  const probe = page.waitForResponse((r) => isValueProbe(r.request(), search));
  await page.keyboard.type(search);
  await probe;
};

const boxOf = async (locator: Locator) => {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('element has no bounding box');
  }
  return box;
};

test.describe('Builder filter value suggestions', () => {
  test.beforeEach(() => {
    skipFixtureTestsOnCloud('seed.sql');
  });

  test('suggests values inside the time range and stores the picked value', async ({ page }) => {
    await openBuilder(page, `service = ''`);
    const probe = page.waitForResponse((r) => isValueProbe(r.request(), 'a'));

    await valueInput(page, 'single').click();
    await page.keyboard.type('a');

    const sql = probeSql((await probe).request());
    expect(sql).toContain('WHERE "timestamp" >= $__fromTime AND "timestamp" <= $__toTime LIMIT 100000');
    expect(sql).toContain(`positionCaseInsensitiveUTF8(toString("service"), 'a')`);
    await expect(page.getByRole('option', { name: 'cache', exact: true })).toBeVisible();
    await page.getByRole('option', { name: 'api', exact: true }).click();
    await expect(sqlPreview(page)).toContainText(`( service = 'api' )`);
  });

  test('offers no fixture values outside the time range', async ({ page }) => {
    await openBuilder(page, `service = ''`, { from: 'now-1h', to: 'now' });
    const probeResponse = page.waitForResponse((r) => isValueProbe(r.request()));

    await valueInput(page, 'single').click();

    const body: ProbeResponseBody = await (await probeResponse).json();
    const values = Object.values(body.results ?? {})
      .flatMap((result) => result.frames ?? [])
      .flatMap((frame) => frame.data?.values?.[0] ?? []);
    expect(values).toEqual([]);
    await expect(page.getByRole('option', { name: 'api', exact: true })).toHaveCount(0);
  });

  test('stores typed text when the field loses focus', async ({ page }) => {
    await openBuilder(page, `service = ''`);

    await valueInput(page, 'single').click();
    await page.keyboard.type('zzz');
    await sqlPreview(page).click();

    await expect(sqlPreview(page)).toContainText(`( service = 'zzz' )`);
  });

  test('stores the highlighted row on ArrowDown and Tab', async ({ page }) => {
    await openBuilder(page, `service = ''`);

    await openValueMenu(page, 'single');
    await typeSearch(page, 'ap');
    await expect(page.getByRole('option', { name: 'cache', exact: true })).toHaveCount(0);
    const api = page.getByRole('option', { name: 'api', exact: true });
    await expect(async () => {
      await page.keyboard.press('ArrowDown');
      await expect(api).toHaveAttribute('aria-selected', 'true', { timeout: 500 });
    }).toPass();
    await page.keyboard.press('Tab');

    await expect(sqlPreview(page)).toContainText(`( service = 'api' )`);
  });

  test('keeps the value on Escape', async ({ page }) => {
    await openBuilder(page, `service = 'api'`);

    await openValueMenu(page, 'single');
    await expect(page.getByRole('option', { name: 'db', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(sqlPreview(page)).toContainText(`( service = 'api' )`);

    await openValueMenu(page, 'single');
    await page.getByRole('option', { name: 'db', exact: true }).click();
    await page.keyboard.press('Escape');

    await expect(sqlPreview(page)).toContainText(`( service = 'db' )`);
    await expect(valueInput(page, 'single')).toHaveValue('db');
  });

  test('stores typed text on Enter when no suggestion is highlighted', async ({ page }) => {
    await openBuilder(page, `service = ''`);

    await openValueMenu(page, 'single');
    await typeSearch(page, 'ap');
    const api = page.getByRole('option', { name: 'api', exact: true });
    await api.hover();
    await page.mouse.move(0, 0);
    await expect(api).not.toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');

    await expect(sqlPreview(page)).toContainText(`( service = 'ap' )`);
  });

  test('keeps the saved value when the field is opened twice and left with Tab', async ({ page }) => {
    await openBuilder(page, `service = 'worker'`);

    for (let round = 0; round < 2; round++) {
      await openValueMenu(page, 'single');
      await expect(page.getByRole('option', { name: 'api', exact: true })).toBeVisible();
      await page.keyboard.press('Tab');
    }

    await expect(sqlPreview(page)).toContainText(`( service = 'worker' )`);
  });

  test('keeps the values when the operator changes from IN to =', async ({ page }) => {
    await openBuilder(page, `service IN ('api', 'db')`);
    const filterRow = valueContainer(page, 'multi').locator('xpath=..');

    await filterRow.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: '=', exact: true }).click();

    await expect(valueInput(page, 'single')).toHaveValue('api,db');
    await expect(editorCrashed(page)).toHaveCount(0);
    await expect(sqlPreview(page)).toContainText(`( service = 'api,db' )`);
  });

  test('keeps a long IN list inside its field', async ({ page }) => {
    const values = Array.from({ length: 18 }, (_, i) => `service-${i}`);
    await openBuilder(page, `service IN (${values.map((v) => `'${v}'`).join(', ')})`);
    const container = valueContainer(page, 'multi');
    await expect(container.getByText('service-0', { exact: true })).toBeVisible();

    await expect(async () => {
      const overflow = await container.evaluate((el) => el.scrollWidth - el.clientWidth);
      const box = await boxOf(container);
      const trash = await boxOf(container.locator('xpath=..').getByTestId('query-builder-filters-remove-button'));
      const editor = await boxOf(page.getByTestId('query-editor-section-builder'));

      expect(overflow).toBeLessThanOrEqual(1);
      expect(box.x + box.width).toBeLessThanOrEqual(editor.x + editor.width);
      expect(trash.x).toBeGreaterThanOrEqual(box.x + box.width);
      expect(trash.y).toBeLessThan(box.y + box.height);
    }).toPass();
  });

  test('appends picked and typed values to an IN filter with duplicate saved values', async ({ page }) => {
    await openBuilder(page, `service IN ('api', 'api', '')`);

    await expect(valueContainer(page, 'multi').getByText('api', { exact: true })).toHaveCount(1);
    await expect(editorCrashed(page)).toHaveCount(0);

    await openValueMenu(page, 'multi');
    await page.getByRole('option', { name: 'worker', exact: true }).click();
    // Before Grafana 13.1, MultiCombobox drops keys typed straight after a pick (grafana/grafana#123950).
    await expect(sqlPreview(page)).toContainText(`( service IN ('api', '', 'worker') )`);
    await valueInput(page, 'multi').pressSequentially('x', { delay: 50 });
    await sqlPreview(page).click();

    await expect(sqlPreview(page)).toContainText(`( service IN ('api', '', 'worker', 'x') )`);
  });
});
