import {
  ALARM_NAME,
  DEFAULT_STATE,
  PENDING_RENAME_KEY,
  RENAME_ALARM,
  SESSION_TYPES,
  STATE_KEY,
  STREAK_KEY,
  durationFor,
  nextType,
  type SessionType
} from './constants.js';
import { buildDevicePatch, buildRenameQuery, getSettings, logSession, notionFetch } from './notion.js';
import { EMPTY_STREAK, localDay, nextStreak } from './streak.js';
import type {
  CompletedSession,
  OffscreenMessage,
  PendingRename,
  RuntimeMessage,
  StreakState,
  TimerState
} from './types.js';

async function getState(): Promise<TimerState> {
  const data = await chrome.storage.local.get<{ [STATE_KEY]?: Partial<TimerState> }>(STATE_KEY);
  return { ...DEFAULT_STATE, ...(data[STATE_KEY] || {}) };
}

async function setState(state: TimerState): Promise<TimerState> {
  await chrome.storage.local.set({ [STATE_KEY]: state });
  return state;
}

function freshState(prev: TimerState, type: SessionType): TimerState {
  const durationMs = durationFor(type);
  return {
    ...DEFAULT_STATE,
    type,
    task: prev.task,
    description: prev.description,
    durationMs,
    remainingMs: durationMs,
    completedFocus: prev.completedFocus
  };
}

async function start(task?: string): Promise<TimerState> {
  const state = await getState();
  if (state.status === 'running') return state;
  const now = Date.now();
  if (typeof task === 'string') state.task = task;
  state.startedAt = state.startedAt || now;
  state.endsAt = now + state.remainingMs;
  state.status = 'running';
  await chrome.alarms.create(ALARM_NAME, { when: state.endsAt });
  return setState(state);
}

async function pause(): Promise<TimerState> {
  const state = await getState();
  if (state.status !== 'running') return state;
  // A running timer always has endsAt set.
  state.remainingMs = Math.max(0, state.endsAt! - Date.now());
  state.endsAt = null;
  state.status = 'paused';
  await chrome.alarms.clear(ALARM_NAME);
  return setState(state);
}

async function reset(): Promise<TimerState> {
  const state = await getState();
  await chrome.alarms.clear(ALARM_NAME);
  return setState(freshState(state, state.type));
}

async function skip(): Promise<TimerState> {
  const state = await getState();
  await chrome.alarms.clear(ALARM_NAME);
  return setState(freshState(state, nextType(state.type, state.completedFocus)));
}

async function setTask(task: string): Promise<TimerState> {
  const state = await getState();
  state.task = task;
  return setState(state);
}

async function setDescription(description: string): Promise<TimerState> {
  const state = await getState();
  state.description = description;
  return setState(state);
}

// Updates the stored streak for an interval that started on `day`, returning the value to log.
async function advanceStreak(day: string, isFocus: boolean): Promise<number> {
  const data = await chrome.storage.local.get<{ [STREAK_KEY]?: StreakState }>(STREAK_KEY);
  const { state, value } = nextStreak(data[STREAK_KEY] || EMPTY_STREAK, day, isFocus);
  await chrome.storage.local.set({ [STREAK_KEY]: state });
  return value;
}

async function playSound(): Promise<void> {
  try {
    const existing = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType]
    });
    if (!existing.length) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Play a chime when an interval completes'
      });
    }
    const beep: OffscreenMessage = { target: 'offscreen', action: 'beep' };
    await chrome.runtime.sendMessage(beep);
  } catch (err) {
    console.warn('LookBusy: audio failed', err);
  }
}

async function complete(): Promise<void> {
  const state = await getState();
  if (state.status !== 'running') return;
  const endedAt = Date.now();
  // A running timer always has startedAt set.
  const startedAt = state.startedAt!;
  // Counted from completed work, whether or not the Notion write below succeeds.
  const streak = await advanceStreak(localDay(startedAt), state.type === 'focus');
  const finished: CompletedSession = {
    type: state.type,
    task: state.task,
    description: state.description,
    streak,
    startedAt,
    endedAt
  };
  const completedFocus = state.type === 'focus' ? state.completedFocus + 1 : state.completedFocus;
  const next = nextType(state.type, completedFocus);

  // Advance state first so the UI is correct even if Notion is slow or down.
  await setState(freshState({ ...state, completedFocus }, next));

  const label = SESSION_TYPES[finished.type].label;
  const settings = await getSettings();
  const result = await logSession(finished);

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `${label} complete`,
    message: !result.ok
      ? `Not logged: ${result.error}`
      : result.warning
        ? `Logged to Notion, ${result.warning}. Up next: ${SESSION_TYPES[next].label}.`
        : `Logged to Notion. Up next: ${SESSION_TYPES[next].label}.`
  });
  if (settings.soundEnabled) await playSound();
}

// ---------------------------------------------------------------------------
// Device rename: sets the new name on every past row with this device's ID.
// The query skips rows that already have the name, so the job is idempotent and can
// resume from scratch after the worker is stopped. The alarm restarts it until done.

const RENAME_PACE_MS = 350; // about 3 requests per second, Notion's average limit
const MAX_RETRY_WAIT_MS = 60_000;
let renaming = false;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readPendingRename(): Promise<PendingRename | null> {
  const data = await chrome.storage.local.get<{ [PENDING_RENAME_KEY]?: PendingRename }>(PENDING_RENAME_KEY);
  return data[PENDING_RENAME_KEY] || null;
}

async function finishRename(): Promise<void> {
  await chrome.storage.local.remove(PENDING_RENAME_KEY);
  await chrome.alarms.clear(RENAME_ALARM);
}

async function waitAfter(res: { status: number; retryAfter?: number }): Promise<boolean> {
  if (res.status !== 429) return false;
  await sleep(Math.min((res.retryAfter || 1) * 1000, MAX_RETRY_WAIT_MS));
  return true;
}

async function runRename(): Promise<void> {
  if (renaming) return;
  renaming = true;
  try {
    for (;;) {
      const job = await readPendingRename();
      if (!job) return finishRename();
      const { notionToken, databaseId, schemaVersion } = await getSettings();
      if (!notionToken || !databaseId || schemaVersion !== 'v2') return finishRename();

      const query = await notionFetch<{ results: { id: string }[] }>(
        notionToken, 'POST', `/databases/${databaseId}/query`, buildRenameQuery(job.deviceId, job.name)
      );
      if (!query.ok) {
        if (await waitAfter(query)) continue;
        console.warn('LookBusy: rename query failed, will retry', query.error);
        return;
      }
      if (!query.data.results.length) {
        // Only finish if the user has not picked yet another name meanwhile.
        if ((await readPendingRename())?.name === job.name) return finishRename();
        continue;
      }

      for (const row of query.data.results) {
        const current = await readPendingRename();
        if (!current || current.name !== job.name) break; // renamed again: re-query with the new name
        let patch = await notionFetch(notionToken, 'PATCH', `/pages/${row.id}`, buildDevicePatch(job.name));
        while (!patch.ok && (await waitAfter(patch))) {
          patch = await notionFetch(notionToken, 'PATCH', `/pages/${row.id}`, buildDevicePatch(job.name));
        }
        if (!patch.ok) {
          console.warn('LookBusy: rename update failed, will retry', patch.error);
          return;
        }
        await chrome.storage.local.set({ [PENDING_RENAME_KEY]: { ...current, updated: current.updated + 1 } });
        await sleep(RENAME_PACE_MS);
      }
    }
  } finally {
    renaming = false;
  }
}

async function startRename(): Promise<void> {
  if (!(await readPendingRename())) return;
  await chrome.alarms.create(RENAME_ALARM, { periodInMinutes: 1 });
  await runRename();
}

chrome.runtime.onStartup.addListener(() => { startRename(); });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) complete();
  if (alarm.name === RENAME_ALARM) runRename();
});

chrome.runtime.onMessage.addListener(
  (msg: RuntimeMessage, _sender, sendResponse: (state: TimerState) => void) => {
    if (msg.target === 'offscreen') return false;
    let pending: Promise<TimerState>;
    switch (msg.action) {
      case 'start': pending = start(msg.task); break;
      case 'pause': pending = pause(); break;
      case 'reset': pending = reset(); break;
      case 'skip': pending = skip(); break;
      case 'setTask': pending = setTask(msg.task); break;
      case 'setDescription': pending = setDescription(msg.description); break;
      case 'applyRename':
        startRename();
        pending = getState();
        break;
      case 'getState': pending = getState(); break;
      default:
        msg satisfies never;
        return false;
    }
    pending.then(sendResponse);
    return true;
  }
);
