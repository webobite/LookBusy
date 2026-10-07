import {
  ALARM_NAME,
  DEFAULT_STATE,
  SESSION_TYPES,
  STATE_KEY,
  STREAK_KEY,
  durationFor,
  nextType,
  type SessionType
} from './constants.js';
import { getSettings, logSession } from './notion.js';
import { EMPTY_STREAK, localDay, nextStreak } from './streak.js';
import type { CompletedSession, OffscreenMessage, RuntimeMessage, StreakState, TimerState } from './types.js';

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
    message: result.ok
      ? `Logged to Notion. Up next: ${SESSION_TYPES[next].label}.`
      : `Not logged: ${result.error}`
  });
  if (settings.soundEnabled) await playSound();
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) complete();
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
      case 'getState': pending = getState(); break;
      default:
        msg satisfies never;
        return false;
    }
    pending.then(sendResponse);
    return true;
  }
);
