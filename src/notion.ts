import { SESSION_TYPES } from './constants.js';
import type { CompletedSession, LogResult, Settings } from './types.js';

const NOTION_URL = 'https://api.notion.com/v1/pages';
const NOTION_VERSION = '2022-06-28';

const DEFAULT_SETTINGS: Settings = {
  notionToken: '',
  databaseId: '',
  soundEnabled: false
};

export async function getSettings(): Promise<Settings> {
  const s = await chrome.storage.sync.get<Partial<Settings>>(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...s };
}

export function buildPagePayload({ databaseId, task, type, startedAt, endedAt }: CompletedSession & { databaseId: string }) {
  const label = SESSION_TYPES[type].label;
  const name = (task && task.trim()) || `${label} (unnamed, suspiciously)`;
  return {
    parent: { database_id: databaseId },
    properties: {
      Name: { title: [{ text: { content: name } }] },
      Date: {
        date: {
          start: new Date(startedAt).toISOString(),
          end: new Date(endedAt).toISOString()
        }
      },
      'Session Type': { select: { name: label } },
      Status: { select: { name: 'Completed' } }
    }
  };
}

export async function logSession(session: CompletedSession): Promise<LogResult> {
  const { notionToken, databaseId } = await getSettings();
  if (!notionToken || !databaseId) {
    return { ok: false, error: 'Notion is not configured. Visit the options page.' };
  }
  try {
    const res = await fetch(NOTION_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + notionToken,
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_VERSION
      },
      body: JSON.stringify(buildPagePayload({ ...session, databaseId }))
    });
    if (!res.ok) {
      const body: { message?: string } = await res.json().catch(() => ({}));
      return { ok: false, error: body.message || `Notion responded with ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
