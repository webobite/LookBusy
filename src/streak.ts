import type { StreakState } from './types.js';

export const EMPTY_STREAK: StreakState = { lastFocusDay: null, streak: 0 };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// Local calendar day of a timestamp, as YYYY-MM-DD.
export function localDay(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The local day before `day`. Built from date parts, not by subtracting 24h, so DST cannot skip a day.
export function previousDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return localDay(new Date(y, m - 1, d - 1).getTime());
}

// Advances the daily streak for a completed interval on `today`.
// `value` is what the logged row carries; `state` is what to store.
export function nextStreak(prev: StreakState, today: string, isFocus: boolean): { state: StreakState; value: number } {
  const alive = prev.lastFocusDay === today || prev.lastFocusDay === previousDay(today);
  if (!isFocus) return { state: prev, value: alive ? prev.streak : 0 };
  if (prev.lastFocusDay === today) return { state: prev, value: prev.streak };
  const streak = alive ? prev.streak + 1 : 1;
  return { state: { lastFocusDay: today, streak }, value: streak };
}
