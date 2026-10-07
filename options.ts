import { DEVICE_ID_KEY, DEVICE_NAME_KEY } from './src/constants.js';
import { createLoggingDatabases, detectSchemaVersion, getDevice, getSettings, listParentPages } from './src/notion.js';
import { describeSchemas } from './src/schema.js';
import type { Settings } from './src/types.js';
import { el } from './src/ui.js';

// Accepts a raw ID or a full Notion URL and extracts the 32-char hex ID.
export function parseNotionId(input: string): string {
  const match = input.replace(/-/g, '').match(/[0-9a-f]{32}/i);
  return match ? match[0] : input.trim();
}

const isNotionId = (id: string) => /^[0-9a-f]{32}$/i.test(id);

const token = el('token', HTMLInputElement);
const deviceName = el('deviceName', HTMLInputElement);
const db = el('db', HTMLInputElement);
const daily = el('daily', HTMLInputElement);
const sound = el('sound', HTMLInputElement);
const status = el('status', HTMLElement);
const setupHint = el('setupHint', HTMLElement);
const setupStart = el('setupStart', HTMLButtonElement);
const setupPick = el('setupPick', HTMLElement);
const parentSelect = el('parent', HTMLSelectElement);
const parentUrl = el('parentUrl', HTMLInputElement);
const setupStatus = el('setupStatus', HTMLElement);
const approve = el('approve', HTMLDialogElement);
const approveBody = el('approveBody', HTMLElement);
const approveCreate = el('approveCreate', HTMLButtonElement);

let storedDatabaseId = '';
let creating = false;
let chosenParent: { id: string; title: string } | null = null;

function show(target: HTMLElement, message: string, isError = false): void {
  target.textContent = message;
  target.classList.toggle('error', isError);
}

// Device names become Notion select options, which cannot contain commas.
function deviceNameError(name: string): string | null {
  if (!name) return 'A device name is required.';
  if (name.includes(',')) return 'Device names cannot contain commas.';
  if (name.length > 100) return 'Device names can be at most 100 characters.';
  return null;
}

// Saves this device's name, creating its ID on first save.
async function saveDevice(name: string): Promise<void> {
  const prev = await getDevice();
  const id = prev.id || crypto.randomUUID();
  await chrome.storage.local.set({ [DEVICE_NAME_KEY]: name, [DEVICE_ID_KEY]: id });
}

function refreshSetup(): void {
  const configured = db.value.trim() !== '' || storedDatabaseId !== '';
  setupStart.hidden = configured;
  if (configured) {
    setupPick.hidden = true;
    show(setupHint, 'A sessions database is configured. To create new databases, clear the Sessions Database ID and save.');
    return;
  }
  const missing: string[] = [];
  if (!token.value.trim()) missing.push('an integration secret');
  if (deviceNameError(deviceName.value.trim())) missing.push('a device name');
  setupStart.disabled = missing.length > 0 || creating;
  show(setupHint, missing.length
    ? `Enter ${missing.join(' and ')} first.`
    : 'Creates "LookBusy Sessions" and "LookBusy Daily Summary" in a page you choose. You review everything before anything is created.');
}

async function load(): Promise<void> {
  const s = await getSettings();
  const device = await getDevice();
  storedDatabaseId = s.databaseId;
  token.value = s.notionToken;
  db.value = s.databaseId;
  daily.value = s.dailyDatabaseId;
  sound.checked = s.soundEnabled;
  deviceName.value = device.name;
  refreshSetup();
}

el('save', HTMLButtonElement).addEventListener('click', async () => {
  const name = deviceName.value.trim();
  const nameError = deviceNameError(name);
  if (nameError) return show(status, nameError, true);

  const settings: Settings = {
    notionToken: token.value.trim(),
    databaseId: parseNotionId(db.value),
    dailyDatabaseId: parseNotionId(daily.value),
    schemaVersion: 'v1',
    soundEnabled: sound.checked
  };
  let detectError = '';
  if (settings.notionToken && settings.databaseId) {
    const detected = await detectSchemaVersion(settings.notionToken, settings.databaseId);
    if (detected.ok) settings.schemaVersion = detected.version;
    else detectError = detected.error;
  }
  await chrome.storage.sync.set(settings);
  await saveDevice(name);

  if (detectError) {
    show(status, `Saved, but the database could not be read (${detectError}). Logging with the original schema.`, true);
  } else {
    show(status, 'Saved. Productivity theatre is now fully funded.');
  }
  load();
});

// ---------------------------------------------------------------------------
// Automatic setup

setupStart.addEventListener('click', async () => {
  setupStart.disabled = true;
  show(setupStatus, 'Looking for pages shared with your integration…');
  const result = await listParentPages(token.value.trim());
  refreshSetup();
  if (!result.ok) return show(setupStatus, result.error, true);
  if (!result.pages.length) {
    setupPick.hidden = true;
    return show(setupStatus,
      'Your integration cannot see any pages. In Notion, open the page that should hold the databases, ' +
      'click ••• → Connections, add your integration, then try again.', true);
  }
  parentSelect.replaceChildren(...result.pages.map((p) => new Option(p.title, p.id)));
  parentUrl.value = '';
  setupPick.hidden = false;
  show(setupStatus, '');
});

function renderApproval(parentTitle: string): void {
  const parentLine = document.createElement('p');
  parentLine.textContent = `Parent page: ${parentTitle}`;
  const sections = describeSchemas().flatMap((schema) => {
    const heading = document.createElement('h3');
    heading.textContent = schema.title;
    const table = document.createElement('table');
    const head = table.insertRow();
    for (const label of ['Column', 'Type', 'Details']) {
      const th = document.createElement('th');
      th.textContent = label;
      head.appendChild(th);
    }
    for (const c of schema.columns) {
      const row = table.insertRow();
      for (const value of [c.column, c.type, c.details]) row.insertCell().textContent = value;
    }
    return [heading, table];
  });
  approveBody.replaceChildren(parentLine, ...sections);
}

el('setupReview', HTMLButtonElement).addEventListener('click', () => {
  const pasted = parentUrl.value.trim();
  const id = pasted ? parseNotionId(pasted) : parentSelect.value;
  if (!isNotionId(id)) return show(setupStatus, 'That does not look like a Notion page URL or ID.', true);
  const title = pasted ? `Page from pasted URL (${id})` : parentSelect.selectedOptions[0]?.text || 'Untitled';
  chosenParent = { id, title };
  renderApproval(title);
  approveCreate.disabled = false;
  approve.showModal();
});

el('approveCancel', HTMLButtonElement).addEventListener('click', () => {
  approve.close();
  show(setupStatus, 'Cancelled. Nothing was created.');
});

function link(href: string, label: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = label;
  return a;
}

approveCreate.addEventListener('click', async () => {
  if (creating || !chosenParent) return;
  creating = true;
  approveCreate.disabled = true;
  show(setupStatus, 'Creating databases…');
  try {
    const stored = await getSettings();
    if (stored.databaseId) {
      approve.close();
      return show(setupStatus, 'A sessions database was configured in the meantime, so nothing was created.', true);
    }
    const name = deviceName.value.trim();
    const notionToken = token.value.trim();
    const result = await createLoggingDatabases(notionToken, chosenParent.id);
    approve.close();
    if (!result.ok) return show(setupStatus, result.error, true);

    const settings: Settings = {
      ...stored,
      notionToken,
      databaseId: parseNotionId(result.sessions.id),
      dailyDatabaseId: parseNotionId(result.daily.id),
      schemaVersion: 'v2'
    };
    await chrome.storage.sync.set(settings);
    await saveDevice(name);
    await load();
    show(setupStatus, 'Done! Logging is ready. ');
    setupStatus.append(
      link(result.sessions.url, 'Open LookBusy Sessions'), ' · ', link(result.daily.url, 'Open LookBusy Daily Summary')
    );
  } finally {
    creating = false;
    refreshSetup();
  }
});

for (const field of [token, deviceName, db]) field.addEventListener('input', refreshSetup);

load();
