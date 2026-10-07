import { getSettings } from './src/notion.js';
import type { Settings } from './src/types.js';
import { el } from './src/ui.js';

// Accepts a raw ID or a full Notion URL and extracts the 32-char hex ID.
export function parseDatabaseId(input: string): string {
  const match = input.replace(/-/g, '').match(/[0-9a-f]{32}/i);
  return match ? match[0] : input.trim();
}

async function load(): Promise<void> {
  const s = await getSettings();
  el('token', HTMLInputElement).value = s.notionToken;
  el('db', HTMLInputElement).value = s.databaseId;
  el('sound', HTMLInputElement).checked = s.soundEnabled;
}

el('save', HTMLButtonElement).addEventListener('click', async () => {
  const stored = await getSettings();
  const settings: Settings = {
    ...stored,
    notionToken: el('token', HTMLInputElement).value.trim(),
    databaseId: parseDatabaseId(el('db', HTMLInputElement).value),
    soundEnabled: el('sound', HTMLInputElement).checked
  };
  await chrome.storage.sync.set(settings);
  el('status', HTMLElement).textContent = 'Saved. Productivity theatre is now fully funded.';
  load();
});

load();
