import {
  ALARM_NAME,
  DEFAULT_STATE,
  SESSION_TYPES,
  STATE_KEY,
  durationFor,
  nextType
} from './constants.js';
import { getSettings, logSession } from './notion.js';

async function getState() {
  const data = await chrome.storage.local.get(STATE_KEY);
  return { ...DEFAULT_STATE, ...(data[STATE_KEY] || {}) };
}

async function setState(state) {
  await chrome.storage.local.set({ [STATE_KEY]: state });
  return state;
}

function freshState(prev, type) {
  const durationMs = durationFor(type);
  return {
    ...DEFAULT_STATE,
    type,
    task: prev.task,
    durationMs,
    remainingMs: durationMs,
    completedFocus: prev.completedFocus
  };
}

async function start(task) {
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

async function pause() {
  const state = await getState();
  if (state.status !== 'running') return state;
  state.remainingMs = Math.max(0, state.endsAt - Date.now());
  state.endsAt = null;
  state.status = 'paused';
  await chrome.alarms.clear(ALARM_NAME);
  return setState(state);
}

async function reset() {
  const state = await getState();
  await chrome.alarms.clear(ALARM_NAME);
  return setState(freshState(state, state.type));
}

async function skip() {
  const state = await getState();
  await chrome.alarms.clear(ALARM_NAME);
  return setState(freshState(state, nextType(state.type, state.completedFocus)));
}

async function setTask(task) {
  const state = await getState();
  state.task = task;
  return setState(state);
}

async function playSound() {
  try {
    const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (!existing.length) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Play a chime when an interval completes'
      });
    }
    await chrome.runtime.sendMessage({ target: 'offscreen', action: 'beep' });
  } catch (err) {
    console.warn('LookBusy: audio failed', err);
  }
}

async function complete() {
  const state = await getState();
  if (state.status !== 'running') return;
  const endedAt = Date.now();
  const finished = { type: state.type, task: state.task, startedAt: state.startedAt, endedAt };
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target === 'offscreen') return false;
  const actions = {
    start: () => start(msg.task),
    pause,
    reset,
    skip,
    setTask: () => setTask(msg.task),
    getState
  };
  const fn = actions[msg.action];
  if (!fn) return false;
  fn().then(sendResponse);
  return true;
});
