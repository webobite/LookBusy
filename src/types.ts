import type { SessionType } from './constants.js';

export type TimerStatus = 'idle' | 'running' | 'paused';

export interface TimerState {
  type: SessionType;
  status: TimerStatus;
  task: string;
  durationMs: number;
  remainingMs: number;
  startedAt: number | null; // when the current interval was first started
  endsAt: number | null; // wall-clock end while running
  completedFocus: number;
}

export interface Settings {
  notionToken: string;
  databaseId: string;
  soundEnabled: boolean;
}

export type LogResult = { ok: true } | { ok: false; error: string };

export interface CompletedSession {
  type: SessionType;
  task: string;
  startedAt: number;
  endedAt: number;
}

// Messages from the popup to the service worker. Every one responds with TimerState.
export type WorkerRequest =
  | { action: 'start'; task?: string }
  | { action: 'pause' }
  | { action: 'reset' }
  | { action: 'skip' }
  | { action: 'setTask'; task: string }
  | { action: 'getState' };

// Message from the service worker to the offscreen document.
export interface OffscreenMessage {
  target: 'offscreen';
  action: 'beep';
}

// Anything on chrome.runtime.onMessage: messages reach every extension context, so
// both the worker and the offscreen document see both kinds and filter on `target`.
export type RuntimeMessage = (WorkerRequest & { target?: undefined }) | OffscreenMessage;
