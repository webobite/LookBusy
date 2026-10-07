import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_STREAK, localDay, nextStreak, previousDay } from '../dist/src/streak.js';

test('localDay formats local calendar date', () => {
  assert.equal(localDay(new Date(2026, 0, 5, 23, 59).getTime()), '2026-01-05');
});

test('previousDay crosses month and year boundaries', () => {
  assert.equal(previousDay('2026-03-01'), '2026-02-28');
  assert.equal(previousDay('2024-03-01'), '2024-02-29');
  assert.equal(previousDay('2026-01-01'), '2025-12-31');
});

test('first focus ever starts the streak at 1', () => {
  assert.deepEqual(nextStreak(EMPTY_STREAK, '2026-10-06', true), {
    state: { lastFocusDay: '2026-10-06', streak: 1 },
    value: 1
  });
});

test('focus on the next day extends the streak', () => {
  const r = nextStreak({ lastFocusDay: '2026-10-05', streak: 4 }, '2026-10-06', true);
  assert.equal(r.value, 5);
  assert.deepEqual(r.state, { lastFocusDay: '2026-10-06', streak: 5 });
});

test('second focus on the same day keeps the streak', () => {
  const prev = { lastFocusDay: '2026-10-06', streak: 5 };
  assert.deepEqual(nextStreak(prev, '2026-10-06', true), { state: prev, value: 5 });
});

test('a gap of a day or more resets the streak to 1', () => {
  assert.equal(nextStreak({ lastFocusDay: '2026-10-04', streak: 9 }, '2026-10-06', true).value, 1);
});

test('extending across a year boundary', () => {
  assert.equal(nextStreak({ lastFocusDay: '2025-12-31', streak: 2 }, '2026-01-01', true).value, 3);
});

test('a break before today\'s first focus carries yesterday\'s streak and stores nothing', () => {
  const prev = { lastFocusDay: '2026-10-05', streak: 4 };
  assert.deepEqual(nextStreak(prev, '2026-10-06', false), { state: prev, value: 4 });
});

test('a break after a broken streak logs 0', () => {
  assert.equal(nextStreak({ lastFocusDay: '2026-10-03', streak: 4 }, '2026-10-06', false).value, 0);
  assert.equal(nextStreak(EMPTY_STREAK, '2026-10-06', false).value, 0);
});
