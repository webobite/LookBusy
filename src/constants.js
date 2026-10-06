export const SESSION_TYPES = {
  focus: { label: 'Focus', minutes: 25 },
  shortBreak: { label: 'Short Break', minutes: 5 },
  longBreak: { label: 'Long Break', minutes: 15 }
};

export const FOCUS_BEFORE_LONG_BREAK = 4;
export const ALARM_NAME = 'lookbusy-interval';
export const STATE_KEY = 'timerState';

export const DEFAULT_STATE = {
  type: 'focus',
  status: 'idle', // idle | running | paused
  task: '',
  durationMs: SESSION_TYPES.focus.minutes * 60 * 1000,
  remainingMs: SESSION_TYPES.focus.minutes * 60 * 1000,
  startedAt: null, // when the current interval was first started
  endsAt: null, // wall-clock end while running
  completedFocus: 0
};

export function durationFor(type) {
  return SESSION_TYPES[type].minutes * 60 * 1000;
}

export function nextType(type, completedFocus) {
  if (type !== 'focus') return 'focus';
  return completedFocus > 0 && completedFocus % FOCUS_BEFORE_LONG_BREAK === 0
    ? 'longBreak'
    : 'shortBreak';
}
