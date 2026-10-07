import { DEVICE_ID_KEY, DEVICE_NAME_KEY } from './src/constants.js';
import { detectSchemaVersion, getDevice, getSettings } from './src/notion.js';
import type { Settings } from './src/types.js';
import { el } from './src/ui.js';

// Accepts a raw ID or a full Notion URL and extracts the 32-char hex ID.
export function parseNotionId(input: string): string {
  const match = input.replace(/-/g, '').match(/[0-9a-f]{32}/i);
  return match ? match[0] : input.trim();
}

const token = el('token', HTMLInputElement);
const deviceName = el('deviceName', HTMLInputElement);
const db = el('db', HTMLInputElement);
const daily = el('daily', HTMLInputElement);
const sound = el('sound', HTMLInputElement);
const status = el('status', HTMLElement);

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

async function load(): Promise<void> {
  const s = await getSettings();
  const device = await getDevice();
  token.value = s.notionToken;
  db.value = s.databaseId;
  daily.value = s.dailyDatabaseId;
  sound.checked = s.soundEnabled;
  deviceName.value = device.name;
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

load();
