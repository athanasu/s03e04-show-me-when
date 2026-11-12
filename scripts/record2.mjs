// Records the panel build (SCHED-4515) in use and prints a timeline in video time.
// The only thing added to the page is a red dot that shows where the pointer is.
import { chromium } from 'playwright';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';

const url = process.argv[2];
const name = process.argv[3] ?? 'recording';
mkdirSync('recordings', { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: 'recordings/tmp', size: { width: 1280, height: 720 } } });
await ctx.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div');
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
const mark = (what, extra = {}) => { timeline.push({ at: mmss(), what, ...extra }); console.log(mmss(), what, JSON.stringify(extra)); };
const acks = [];
page.on('console', (m) => { if (m.text().startsWith('ack ')) { const [, id, ackedAt, receipt] = m.text().split(' '); acks.push({ id, ackedAt, receipt }); } });
const rows = () => page.getByTestId('incident-row');
const ids = () => rows().evaluateAll((rs) => rs.map((r) => r.dataset.id));
const panelId = () => page.getByTestId('incident-panel').getAttribute('data-id');
const moveTo = async (locator) => { const b = await locator.boundingBox(); const p = { x: b.x + b.width / 2, y: b.y + b.height / 2 }; await page.mouse.move(p.x, p.y, { steps: 25 }); return p; };

await page.goto(url);
mark('open-board: page opened', { loader: await page.getByTestId('loader').count() });
await rows().first().waitFor();
mark('open-board: incidents on screen, loader gone', { rows: await rows().count(), ackButtonsInRows: await page.getByTestId('ack').count(), sha: await page.getByTestId('build-sha').textContent() });
await page.waitForTimeout(3000);

// Aim at a row that is not acked yet and rest there.
const before = await ids();
const target = rows().filter({ hasNot: page.getByTestId('acked') }).nth(2);
const aimed = await target.getAttribute('data-id');
const p = await moveTo(target.locator('.what'));
mark('ack-incident: pointer rests on a row', { aimedAt: aimed });
await page.waitForFunction((n) => document.querySelectorAll('[data-testid="incident-row"]').length > n, before.length, { timeout: 60000 });
mark('watch-board: new incident on top without a reload, rows moved down', { newTop: (await ids())[0] });
await page.waitForTimeout(400);
await page.mouse.down(); await page.mouse.up();
await page.getByTestId('incident-panel').waitFor();
mark('ack-incident: click at the same point opens the panel; nothing is acked', { aimedAt: aimed, panelNames: await panelId(), acks: acks.length });
await page.waitForTimeout(2500);
await moveTo(page.locator(`[data-testid="incident-row"][data-id="${aimed}"] .what`));
await page.mouse.down(); await page.mouse.up();
await page.waitForTimeout(300);
mark('ack-incident: picked the meant row; the panel names it', { panelNames: await panelId() });
await page.waitForTimeout(2000);
await moveTo(page.getByTestId('panel-ack'));
await page.waitForTimeout(500);
await page.mouse.down(); await page.mouse.up();
await page.locator(`[data-testid="incident-row"][data-id="${aimed}"] [data-testid="acked"]`).waitFor();
mark('ack-incident: Ack in the panel; the meant row is marked acked', { expected: aimed, got: acks.at(-1)?.id, receipt: acks.at(-1)?.receipt, ackedAt: acks.at(-1)?.ackedAt });
const n = (await ids()).length;
await page.waitForFunction((k) => document.querySelectorAll('[data-testid="incident-row"]').length > k, n, { timeout: 60000 });
mark('watch-board: another incident arrived; the panel and the acked mark stayed on their incident', { panelNames: await panelId(), ackedRows: await page.getByTestId('acked').evaluateAll((ms) => ms.map((m) => m.closest('[data-testid="incident-row"]').dataset.id)) });
await page.waitForTimeout(3000);
mark('end');
const video = page.video();
await ctx.close();
await browser.close();
renameSync(await video.path(), `recordings/${name}.webm`);
writeFileSync(`recordings/${name}.timeline.json`, JSON.stringify({ url, acks, timeline }, null, 2));
