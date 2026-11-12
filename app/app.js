import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000; // R4

const board = document.querySelector('[data-testid="board"]');
const list = document.querySelector('[data-testid="incident-list"]');
const status = document.querySelector('#status');
const panel = document.querySelector('[data-testid="incident-panel"]');
const rows = new Map(); // incident id -> <li>
const incidentsById = new Map(); // incident id -> latest data from the API
const ackedById = new Map(); // incident id -> ack reply
let openId = null; // the incident the panel shows

// R5: the viewer's own locale and time zone. The locale decides the order (dd/mm or mm/dd).
const timeFormat = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
});

function localTime(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : timeFormat.format(date);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Product's decision (SCHED-4515): Ack is not in the row. A row opens the panel for its incident, by id,
// and Ack lives there. Rows still move when a new incident arrives; the panel does not.
function markAcked(id, reply) {
  ackedById.set(id, reply);
  const row = rows.get(id);
  if (row && !row.querySelector('[data-testid="acked"]')) {
    const mark = el('span', 'acked', `acked ${localTime(reply.ackedAt)}`);
    mark.dataset.testid = 'acked';
    mark.title = reply.receipt;
    row.classList.add('is-acked');
    row.querySelector('.state').replaceChildren(mark);
  }
}

async function onPanelAck(id, button) {
  button.disabled = true;
  button.textContent = 'Acking…';
  try {
    markAcked(id, await ack(id)); // R2
    showStatus('');
  } catch (error) {
    showStatus(`Ack failed for ${id}: ${error.message}`);
  }
  if (openId === id) renderPanel();
}

function openPanel(id) {
  openId = id;
  renderPanel();
  panel.querySelector('[data-testid="panel-ack"], .panel-close')?.focus({ preventScroll: true });
}

function closePanel() {
  const opener = rows.get(openId)?.querySelector('.open');
  openId = null;
  renderPanel();
  opener?.focus({ preventScroll: true });
}

function renderPanel() {
  for (const [id, row] of rows) {
    row.classList.toggle('is-open', id === openId);
    row.querySelector('.open').setAttribute('aria-expanded', String(id === openId));
  }
  const incident = incidentsById.get(openId);
  if (!incident) {
    openId = null;
    panel.hidden = true;
    panel.replaceChildren();
    return;
  }
  // Keep the Ack button element while the same incident stays open, so a refresh cannot swallow a click.
  if (panel.dataset.id !== incident.id) {
    panel.dataset.id = incident.id;
    const title = el('h2', 'panel-id', incident.id);
    title.id = 'panel-title';
    const close = el('button', 'panel-close', 'Close');
    close.type = 'button';
    close.addEventListener('click', closePanel);
    panel.replaceChildren(title, el('p', 'panel-sev'), el('p', 'panel-what'), el('p', 'panel-summary'), el('time', 'panel-time'), el('div', 'panel-action'), close);
  }
  panel.hidden = false;
  panel.querySelector('.panel-sev').textContent = incident.severity;
  panel.querySelector('.panel-sev').className = `panel-sev ${/^sev\d$/.test(incident.severity) ? incident.severity : ''}`;
  panel.querySelector('.panel-what').textContent = `${incident.service} · ${incident.region}`;
  panel.querySelector('.panel-summary').textContent = incident.summary;
  const time = panel.querySelector('.panel-time');
  time.dateTime = incident.openedAt;
  time.textContent = `opened ${localTime(incident.openedAt)}`;
  const action = panel.querySelector('.panel-action');
  const reply = ackedById.get(incident.id);
  if (reply) {
    if (!action.querySelector('.acked')) action.replaceChildren(el('p', 'acked', `${incident.id} acked ${localTime(reply.ackedAt)}`));
  } else if (!action.querySelector('[data-testid="panel-ack"]')) {
    const button = el('button', 'ack', `Ack ${incident.id}`);
    button.type = 'button';
    button.dataset.testid = 'panel-ack';
    button.addEventListener('click', () => onPanelAck(incident.id, button));
    action.replaceChildren(button);
  }
}

function buildRow(incident) {
  const row = el('li', `row ${/^sev\d$/.test(incident.severity) ? incident.severity : ''}`);
  row.dataset.testid = 'incident-row';
  row.dataset.id = incident.id;

  // The id is a real button (keyboard and screen readers); a click anywhere on the row does the same.
  const open = el('button', 'id open', incident.id);
  open.type = 'button';
  open.setAttribute('aria-controls', 'incident-panel');
  open.setAttribute('aria-expanded', 'false');
  row.addEventListener('click', () => openPanel(incident.id));

  row.append(open, el('span', 'sev'), el('span', 'what'), el('time'), el('span', 'state'));
  return row;
}

function fillRow(row, incident) {
  row.querySelector('.sev').textContent = incident.severity;
  row.querySelector('.what').textContent = `${incident.service} · ${incident.region} · ${incident.summary}`;
  const time = row.querySelector('time');
  time.dateTime = incident.openedAt; // the full UTC value stays in the attribute
  time.textContent = localTime(incident.openedAt);
}

// Keyed render: rows keep their element (and their acked mark) between refreshes; the API's order,
// newest first, is the order on screen (R1).
function render(incidents) {
  const seen = new Set();
  let previous = null;
  for (const incident of incidents) {
    seen.add(incident.id);
    incidentsById.set(incident.id, incident);
    let row = rows.get(incident.id);
    if (!row) {
      row = buildRow(incident);
      rows.set(incident.id, row);
    }
    fillRow(row, incident);
    const expected = previous ? previous.nextElementSibling : list.firstElementChild;
    if (expected !== row) list.insertBefore(row, expected);
    previous = row;
  }
  for (const [id, row] of rows) {
    if (!seen.has(id)) {
      row.remove();
      rows.delete(id);
      incidentsById.delete(id);
    }
  }
  document.querySelector('[data-testid="empty"]').hidden = incidents.length > 0;
  renderPanel();
}

function showStatus(text) {
  status.textContent = text;
  status.hidden = !text;
}

let loaded = false;
async function refresh() {
  try {
    const page = await fetchIncidents();
    render(page.incidents);
    if (!loaded) {
      loaded = true;
      document.querySelector('[data-testid="loader"]')?.remove(); // R3
      board.setAttribute('aria-busy', 'false');
    }
    document.querySelector('#updated').textContent = `updated ${localTime(page.updatedAt)}`;
    showStatus('');
  } catch (error) {
    showStatus(`Could not refresh: ${error.message}. Trying again.`);
  } finally {
    setTimeout(refresh, REFRESH_MS); // R4
  }
}

addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && openId) closePanel();
});

refresh();
