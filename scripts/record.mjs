// Records the deployed board in use (Playwright video, 1280x720) and prints a timeline in video time.
// The only thing added to the page is a red dot that shows where the pointer is.
import { chromium } from 'playwright';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';

const url = process.argv[2];
const name = process.argv[3] ?? 'recording';
mkdirSync('recordings', { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: 'recordings/tmp', size: { width: 1280, height: 720 } },
});
await ctx.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div');
    dot.id = 'recorder-pointer';
    dot.style.cssText = 'position:fixed;z-index:99999;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:rgba(220,0,0,.75);pointer-events:none;left:-20px;top:-20px';
    document.body.append(dot);
    addEventListener('mousemove', (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => { dot.style.outline = '4px solid rgba(220,0,0,.4)'; setTimeout(() => (dot.style.outline = ''), 400); }, true);
  });
});
const t0 = Date.now();
const page = await ctx.newPage();
const timeline = [];
const mmss = () => { const s = Math.floor((Date.now() - t0) / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const mark = (what, extra = {}) => { timeline.push({ at: mmss(), ms: Date.now() - t0, what, ...extra }); console.log(mmss(), what, JSON.stringify(extra)); };
const acks = [];
page.on('console', (m) => { if (m.text().startsWith('ack ')) { const [, id, ackedAt, receipt] = m.text().split(' '); acks.push({ id, ackedAt, receipt }); } });
const rows = () => page.getByTestId('incident-row');
const ids = () => rows().evaluateAll((rs) => rs.map((r) => r.dataset.id));

await page.goto(url);
mark('open-board: page opened', { loader: await page.getByTestId('loader').count() });
await rows().first().waitFor();
mark('open-board: incidents on screen, loader gone', {
  loader: await page.getByTestId('loader').count(),
  rows: await rows().count(),
  sha: await page.getByTestId('build-sha').textContent(),
});
await page.waitForTimeout(3000);

// ack-incident: aim at the Ack button of the third row and rest there, as on-call reading the row would.
const before = await ids();
const aimed = before[2];
const box = await rows().nth(2).getByTestId('ack').boundingBox();
const x = box.x + box.width / 2, y = box.y + box.height / 2;
await page.mouse.move(x, y, { steps: 25 });
mark('ack-incident: pointer rests on the Ack button', { aimedAt: aimed, x: Math.round(x), y: Math.round(y) });
// watch-board: the board refreshes itself; wait for the next incident to arrive without a reload.
await page.waitForFunction((n) => document.querySelectorAll('[data-testid="incident-row"]').length > n, before.length, { timeout: 60000 });
const after = await ids();
mark('watch-board: new incident on top without a reload, rows moved down', { newTop: after[0], underPointerNow: await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('[data-testid="incident-row"]')?.dataset.id, [x, y]) });
await page.waitForTimeout(400);
await page.mouse.down(); await page.mouse.up();
mark('ack-incident: click at the same point', {});
await page.getByTestId('acked').first().waitFor();
const ackedRow = await page.getByTestId('acked').first().evaluate((m) => m.closest('[data-testid="incident-row"]').dataset.id);
mark('ack-incident: row marked acked', { aimedAt: aimed, acked: ackedRow, receipt: acks[0]?.receipt, ackedAt: acks[0]?.ackedAt });
// watch-board: keep it open through at least one more arrival; the acked mark must stay on its incident.
const n = (await ids()).length;
await page.waitForFunction((k) => document.querySelectorAll('[data-testid="incident-row"]').length > k, n, { timeout: 60000 });
mark('watch-board: another incident arrived; acked mark still on its row', { ackedRows: await page.getByTestId('acked').evaluateAll((ms) => ms.map((m) => m.closest('[data-testid="incident-row"]').dataset.id)) });
await page.waitForTimeout(3000);
mark('end', {});
const video = page.video();
await ctx.close();
await browser.close();
renameSync(await video.path(), `recordings/${name}.webm`);
writeFileSync(`recordings/${name}.timeline.json`, JSON.stringify({ url, acks, timeline }, null, 2));
