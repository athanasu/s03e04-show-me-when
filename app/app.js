import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000; // R4

const board = document.querySelector('[data-testid="board"]');
const list = document.querySelector('[data-testid="incident-list"]');
const status = document.querySelector('#status');
const rows = new Map(); // incident id -> <li>

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

function markAcked(row, reply) {
  const mark = el('span', 'acked', `acked ${localTime(reply.ackedAt)}`);
  mark.dataset.testid = 'acked';
  mark.title = reply.receipt;
  row.classList.add('is-acked');
  row.querySelector('[data-testid="ack"]').replaceWith(mark);
}

async function onAck(row, button) {
  button.disabled = true;
  button.textContent = 'Acking…';
  try {
    markAcked(row, await ack(row.dataset.id)); // R2
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Ack';
    showStatus(`Ack failed for ${row.dataset.id}: ${error.message}`);
  }
}

function buildRow(incident) {
  const row = el('li', `row ${/^sev\d$/.test(incident.severity) ? incident.severity : ''}`);
  row.dataset.testid = 'incident-row';
  row.dataset.id = incident.id;

  const time = el('time');
  const button = el('button', 'ack', 'Ack');
  button.type = 'button';
  button.dataset.testid = 'ack';
  button.setAttribute('aria-label', `Ack ${incident.id}`);
  button.addEventListener('click', () => onAck(row, button));

  row.append(el('span', 'id', incident.id), el('span', 'sev'), el('span', 'what'), time, button);
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
    }
  }
  document.querySelector('[data-testid="empty"]').hidden = incidents.length > 0;
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

refresh();
