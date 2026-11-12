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
  // SCHED-4515: no Ack in a row; a row opens the panel, the panel names the incident, Ack lives there.
  assert.equal(await page.getByTestId('ack').count(), 0, 'no Ack in rows');
  assert.equal(await page.getByTestId('incident-panel').isVisible(), false);
  const other = page.getByTestId('incident-row').nth(1);
  await other.click();
  assert.ok((await page.getByTestId('incident-panel').innerText()).includes(await other.getAttribute('data-id')));
  const target = page.getByTestId('incident-row').nth(2);
  const id = await target.getAttribute('data-id');
  await target.click();
  assert.ok((await page.getByTestId('incident-panel').innerText()).includes(id), 'panel names the picked incident');
  await page.getByTestId('panel-ack').click();
  await page.locator(`[data-id="${id}"] [data-testid="acked"]`).waitFor();
  assert.equal(await page.getByTestId('panel-ack').count(), 0, 'no second ack for the same incident');
  assert.equal(ackUrl.searchParams.get('id'), id);
  assert.ok(ackUrl.searchParams.get('cursor')?.length > 20, 'ack carries the cursor');
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid="incident-row"]').length > n, n0, { timeout: 40000 });
  const top1 = await page.getByTestId('incident-row').first().getAttribute('data-id');
  assert.notEqual(top1, top0, 'new incident on top without reload');
  assert.equal(await page.locator(`[data-id="${id}"] [data-testid="acked"]`).count(), 1, 'acked mark survives refresh');
  assert.equal(await page.getByTestId('acked').count(), 1);
  assert.ok((await page.getByTestId('incident-panel').innerText()).includes(id), 'panel stays on its incident while rows move');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByTestId('incident-panel').isVisible(), false);
  const times = await page.locator('[data-testid="incident-row"] time').evaluateAll((ts) => ts.map((t) => [t.dateTime, t.textContent]));
  const order = times.map(([d]) => d);
  assert.deepEqual(order, [...order].sort().reverse(), 'newest first');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(locale, timezoneId, 'ok ·', times[0].join(' -> '), '·', times.at(-1).join(' -> '));
  await ctx.close();
}
await browser.close();
