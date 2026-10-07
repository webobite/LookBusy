import { DAY_CACHE_KEY, DEVICE_ID_KEY, DEVICE_NAME_KEY, SESSION_TYPES } from './constants.js';
import {
  COMPLETED,
  DAILY_PROPS,
  LEGACY_PROPS,
  RICH_TEXT_LIMIT,
  SESSION_PROPS
} from './schema.js';
import { localDay } from './streak.js';
import type {
  CompletedSession,
  DayCache,
  Device,
  LogResult,
  SchemaVersion,
  Settings
} from './types.js';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

export const DEFAULT_SETTINGS: Settings = {
  notionToken: '',
  databaseId: '',
  dailyDatabaseId: '',
  schemaVersion: 'v1',
  soundEnabled: false
};

export async function getSettings(): Promise<Settings> {
  const s = await chrome.storage.sync.get<Partial<Settings>>(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...s };
}

export async function getDevice(): Promise<Device> {
  const s = await chrome.storage.local.get<{ [DEVICE_NAME_KEY]?: string; [DEVICE_ID_KEY]?: string }>([DEVICE_NAME_KEY, DEVICE_ID_KEY]);
  return { name: s[DEVICE_NAME_KEY] || '', id: s[DEVICE_ID_KEY] || '' };
}

// ---------------------------------------------------------------------------
// Transport

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

// ---------------------------------------------------------------------------
// Payload builders (pure, covered by test/)

function text(content: string) {
  return [{ type: 'text', text: { content: content.slice(0, RICH_TEXT_LIMIT) } }];
}

function taskName(session: Pick<CompletedSession, 'task' | 'type'>): string {
  const label = SESSION_TYPES[session.type].label;
  return (session.task && session.task.trim()) || `${label} (unnamed, suspiciously)`;
}

export interface PagePayloadInput extends CompletedSession {
  databaseId: string;
  schemaVersion: SchemaVersion;
  device?: Device;
  dayPageId?: string | null;
}

export function buildPagePayload(input: PagePayloadInput) {
  const { databaseId, type, startedAt, endedAt } = input;
  const label = SESSION_TYPES[type].label;
  const start = new Date(startedAt).toISOString();
  const end = new Date(endedAt).toISOString();

  if (input.schemaVersion === 'v1') {
    const L = LEGACY_PROPS;
    return {
      parent: { database_id: databaseId },
      properties: {
        [L.name]: { title: [{ text: { content: taskName(input) } }] },
        [L.date]: { date: { start, end } },
        [L.sessionType]: { select: { name: label } },
        [L.status]: { select: { name: COMPLETED } }
      }
    };
  }

  const P = SESSION_PROPS;
  const device = input.device || { name: '', id: '' };
  const properties: Record<string, unknown> = {
    [P.task]: { title: text(taskName(input)) },
    [P.description]: { rich_text: input.description ? text(input.description) : [] },
    [P.sessionType]: { select: { name: label } },
    [P.status]: { select: { name: COMPLETED } },
    [P.start]: { date: { start } },
    [P.end]: { date: { start: end } },
    [P.streak]: { number: input.streak },
    [P.device]: { select: device.name ? { name: device.name } : null },
    [P.deviceId]: { rich_text: device.id ? text(device.id) : [] }
  };
  if (input.dayPageId) properties[P.day] = { relation: [{ id: input.dayPageId }] };
  return { parent: { database_id: databaseId }, properties };
}

export function buildDayQuery(day: string) {
  return { filter: { property: DAILY_PROPS.date, date: { equals: day } }, page_size: 1 };
}

export function buildDayPagePayload(dailyDatabaseId: string, day: string) {
  return {
    parent: { database_id: dailyDatabaseId },
    properties: {
      [DAILY_PROPS.day]: { title: text(day) },
      [DAILY_PROPS.date]: { date: { start: day } }
    }
  };
}

// ---------------------------------------------------------------------------
// Session logging

interface PageObject { id: string; url: string }
interface QueryResult<T> { results: T[]; has_more: boolean; next_cursor: string | null }

async function readDayCache(): Promise<DayCache | null> {
  const s = await chrome.storage.local.get<{ [DAY_CACHE_KEY]?: DayCache }>(DAY_CACHE_KEY);
  return s[DAY_CACHE_KEY] || null;
}

async function findOrCreateDay(
  token: string,
  dailyDatabaseId: string,
  day: string,
  useCache: boolean
): Promise<{ ok: true; pageId: string; cached: boolean } | { ok: false; error: string }> {
  if (useCache) {
    const cache = await readDayCache();
    if (cache && cache.dailyDatabaseId === dailyDatabaseId && cache.day === day) {
      return { ok: true, pageId: cache.pageId, cached: true };
    }
  }
  const found = await notionFetch<QueryResult<PageObject>>(token, 'POST', `/databases/${dailyDatabaseId}/query`, buildDayQuery(day));
  if (!found.ok) return found;
  let pageId = found.data.results[0]?.id;
  if (!pageId) {
    const created = await notionFetch<PageObject>(token, 'POST', '/pages', buildDayPagePayload(dailyDatabaseId, day));
    if (!created.ok) return created;
    pageId = created.data.id;
  }
  const cache: DayCache = { dailyDatabaseId, day, pageId };
  await chrome.storage.local.set({ [DAY_CACHE_KEY]: cache });
  return { ok: true, pageId, cached: false };
}

export async function logSession(session: CompletedSession): Promise<LogResult> {
  const { notionToken, databaseId, dailyDatabaseId, schemaVersion } = await getSettings();
  if (!notionToken || !databaseId) {
    return { ok: false, error: 'Notion is not configured. Visit the options page.' };
  }

  if (schemaVersion === 'v1') {
    const res = await notionFetch(notionToken, 'POST', '/pages', buildPagePayload({ ...session, databaseId, schemaVersion }));
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }

  const device = await getDevice();
  const post = (dayPageId: string | null) =>
    notionFetch(notionToken, 'POST', '/pages', buildPagePayload({ ...session, databaseId, schemaVersion, device, dayPageId }));

  if (!dailyDatabaseId) {
    const res = await post(null);
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }

  const day = localDay(session.startedAt);
  let link = await findOrCreateDay(notionToken, dailyDatabaseId, day, true);
  let res = await post(link.ok ? link.pageId : null);

  // A cached day row may have been deleted in Notion: refresh it and retry once.
  if (!res.ok && res.status === 400 && link.ok && link.cached) {
    await chrome.storage.local.remove(DAY_CACHE_KEY);
    link = await findOrCreateDay(notionToken, dailyDatabaseId, day, false);
    res = await post(link.ok ? link.pageId : null);
  }

  if (!res.ok) return { ok: false, error: res.error };
  return link.ok ? { ok: true } : { ok: true, warning: `not linked to its day: ${link.error}` };
}
