const $ = (id) => document.getElementById(id);

// Accepts a raw ID or a full Notion URL and extracts the 32-char hex ID.
export function parseDatabaseId(input) {
  const match = input.replace(/-/g, '').match(/[0-9a-f]{32}/i);
  return match ? match[0] : input.trim();
}

async function load() {
  const s = await chrome.storage.sync.get({ notionToken: '', databaseId: '', soundEnabled: false });
  $('token').value = s.notionToken;
  $('db').value = s.databaseId;
  $('sound').checked = s.soundEnabled;
}

$('save').addEventListener('click', async () => {
  await chrome.storage.sync.set({
    notionToken: $('token').value.trim(),
    databaseId: parseDatabaseId($('db').value),
    soundEnabled: $('sound').checked
  });
  $('status').textContent = 'Saved. Productivity theatre is now fully funded.';
  load();
});

load();
