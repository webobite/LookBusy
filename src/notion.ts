import { SESSION_TYPES } from './constants.js';
import type { CompletedSession, LogResult, Settings } from './types.js';

const NOTION_API = 'https://api.notion.com/v1';
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

export type NotionResponse<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; retryAfter?: number };

export async function notionFetch<T>(token: string, method: string, path: string, body?: unknown): Promise<NotionResponse<T>> {
  try {
    const res = await fetch(NOTION_API + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_VERSION
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!res.ok) {
      const err: { message?: string } = await res.json().catch(() => ({}));
      const error = res.status === 401
        ? 'Notion rejected the integration secret. Check that it is correct and not revoked.'
        : err.message || `Notion responded with ${res.status}`;
      const retryAfter = Number(res.headers.get('Retry-After')) || undefined;
      return { ok: false, status: res.status, error, retryAfter };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    return { ok: false, status: 0, error: (err as Error).message };
  }
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
  const res = await notionFetch(notionToken, 'POST', '/pages', buildPagePayload({ ...session, databaseId }));
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}
