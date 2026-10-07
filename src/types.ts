import type { SessionType } from './constants.js';

export type TimerStatus = 'idle' | 'running' | 'paused';

export interface TimerState {
  type: SessionType;
  status: TimerStatus;
  task: string;
  description: string;
  durationMs: number;
  remainingMs: number;
  startedAt: number | null; // when the current interval was first started
  endsAt: number | null; // wall-clock end while running
  completedFocus: number;
}

export type SchemaVersion = 'v1' | 'v2';

// Synced across the user's Chrome profile.
export interface Settings {
  notionToken: string;
  databaseId: string;
  dailyDatabaseId: string;
  schemaVersion: SchemaVersion;
  soundEnabled: boolean;
}

// `warning` reports a partial success, such as a session logged without its day link.
export type LogResult = { ok: true; warning?: string } | { ok: false; error: string };

export interface CompletedSession {
  type: SessionType;
  task: string;
  description: string;
  streak: number;
  startedAt: number;
  endedAt: number;
}

// Per-device identity, kept in chrome.storage.local.
export interface Device {
  name: string;
  id: string;
}

export interface StreakState {
  lastFocusDay: string | null; // local YYYY-MM-DD
  streak: number;
}

export interface DayCache {
  dailyDatabaseId: string;
  day: string;
  pageId: string;
}

export interface PendingRename {
  deviceId: string;
  name: string;
  updated: number;
}

export interface ParentPage {
  id: string;
  title: string;
}

export interface CreatedDatabase {
  id: string;
  url: string;
}

export type SetupResult =
  | { ok: true; sessions: CreatedDatabase; daily: CreatedDatabase }
  | { ok: false; error: string };

// Messages from the popup to the service worker. Every one responds with TimerState.
export type WorkerRequest =
  | { action: 'start'; task?: string }
  | { action: 'pause' }
  | { action: 'reset' }
  | { action: 'skip' }
  | { action: 'setTask'; task: string }
  | { action: 'setDescription'; description: string }
  | { action: 'applyRename' } // starts the device rename job; responds with the current TimerState
  | { action: 'getState' };

// Message from the service worker to the offscreen document.
export interface OffscreenMessage {
  target: 'offscreen';
  action: 'beep';
}

// Anything on chrome.runtime.onMessage: messages reach every extension context, so
// both the worker and the offscreen document see both kinds and filter on `target`.
export type RuntimeMessage = (WorkerRequest & { target?: undefined }) | OffscreenMessage;
