// Local check of the plan's hooks against dist/. Incidents are real; the ack is mocked.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch();
for (const [locale, timezoneId] of [['en-NZ', 'Pacific/Auckland'], ['de-DE', 'Europe/Berlin'], ['en-US', 'America/New_York']]) {
  const ctx = await browser.newContext({ locale, timezoneId });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  let ackUrl = null;
  await page.route('**/api/ack?*', (route) => {
    ackUrl = new URL(route.request().url());
    route.fulfill({ json: { id: ackUrl.searchParams.get('id'), ackedAt: new Date().toISOString(), receipt: 'mock-receipt' } });
  });
  // Hold the first answer back so the loader is observable.
  let first = true;
  await page.route('**/api/incidents?*', async (route) => {
    if (first) { first = false; await new Promise((r) => setTimeout(r, 600)); }
    route.continue();
  });
  await page.goto(url);
  assert.equal(await page.getByTestId('loader').count(), 1, 'loader on open');
  await page.getByTestId('incident-row').first().waitFor();
  assert.equal(await page.getByTestId('loader').count(), 0, 'loader gone');
  assert.equal(await page.getByTestId('empty').isVisible(), false);
  const sha = await page.locator('meta[name=build]').getAttribute('content');
  assert.match(sha, /^[0-9a-f]{40}$/);
  assert.equal(await page.getByTestId('build-sha').textContent(), sha);
  const n0 = await page.getByTestId('incident-row').count();
  const top0 = await page.getByTestId('incident-row').first().getAttribute('data-id');
  // Ack the third row, then wait for a new incident and check the mark stays on that incident.
  const target = page.getByTestId('incident-row').nth(2);
  const id = await target.getAttribute('data-id');
  await target.getByTestId('ack').click();
  await page.locator(`[data-id="${id}"] [data-testid="acked"]`).waitFor();
  assert.equal(ackUrl.searchParams.get('id'), id);
  assert.ok(ackUrl.searchParams.get('cursor')?.length > 20, 'ack carries the cursor');
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid="incident-row"]').length > n, n0, { timeout: 40000 });
  const top1 = await page.getByTestId('incident-row').first().getAttribute('data-id');
  assert.notEqual(top1, top0, 'new incident on top without reload');
  assert.equal(await page.locator(`[data-id="${id}"] [data-testid="acked"]`).count(), 1, 'acked mark survives refresh');
  assert.equal(await page.getByTestId('acked').count(), 1);
  const times = await page.locator('[data-testid="incident-row"] time').evaluateAll((ts) => ts.map((t) => [t.dateTime, t.textContent]));
  const order = times.map(([d]) => d);
  assert.deepEqual(order, [...order].sort().reverse(), 'newest first');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(locale, timezoneId, 'ok ·', times[0].join(' -> '), '·', times.at(-1).join(' -> '));
  await ctx.close();
}
await browser.close();
