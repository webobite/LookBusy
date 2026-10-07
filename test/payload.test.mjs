import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDailyDatabasePayload,
  buildDailyRollupsPatch,
  buildDevicePatch,
  buildPagePayload,
  buildRenameQuery,
  buildSessionsDatabasePayload,
  schemaVersionOf
} from '../dist/src/notion.js';
import { SESSION_TYPES } from '../dist/src/constants.js';
import { SESSION_PROPS } from '../dist/src/schema.js';

const startedAt = Date.UTC(2026, 9, 6, 9, 0);
const endedAt = Date.UTC(2026, 9, 6, 9, 25);
const session = { type: 'focus', task: 'Write report', description: 'Draft section 2', streak: 3, startedAt, endedAt };

test('v1 payload is unchanged from the original logger', () => {
  assert.deepEqual(buildPagePayload({ ...session, databaseId: 'db', schemaVersion: 'v1' }), {
    parent: { database_id: 'db' },
    properties: {
      Name: { title: [{ text: { content: 'Write report' } }] },
      Date: { date: { start: '2026-10-06T09:00:00.000Z', end: '2026-10-06T09:25:00.000Z' } },
      'Session Type': { select: { name: 'Focus' } },
      Status: { select: { name: 'Completed' } }
    }
  });
});

test('v1 payload keeps the unnamed default', () => {
  const p = buildPagePayload({ ...session, task: '  ', type: 'shortBreak', databaseId: 'db', schemaVersion: 'v1' });
  assert.equal(p.properties.Name.title[0].text.content, 'Short Break (unnamed, suspiciously)');
});

test('v2 payload writes every current property', () => {
  const p = buildPagePayload({
    ...session, databaseId: 'db', schemaVersion: 'v2', device: { name: 'Work laptop', id: 'dev-1' }, dayPageId: 'day-1'
  });
  assert.deepEqual(Object.keys(p.properties).sort(), Object.values(SESSION_PROPS).filter((n) => n !== SESSION_PROPS.focusCount).sort());
  assert.equal(p.properties.Task.title[0].text.content, 'Write report');
  assert.equal(p.properties.Description.rich_text[0].text.content, 'Draft section 2');
  assert.deepEqual(p.properties.Start, { date: { start: '2026-10-06T09:00:00.000Z' } });
  assert.deepEqual(p.properties.End, { date: { start: '2026-10-06T09:25:00.000Z' } });
  assert.deepEqual(p.properties.Streak, { number: 3 });
  assert.deepEqual(p.properties.Device, { select: { name: 'Work laptop' } });
  assert.equal(p.properties['Device ID'].rich_text[0].text.content, 'dev-1');
  assert.deepEqual(p.properties.Day, { relation: [{ id: 'day-1' }] });
});

test('v2 payload without device, description or day', () => {
  const p = buildPagePayload({ ...session, description: '', databaseId: 'db', schemaVersion: 'v2' });
  assert.deepEqual(p.properties.Description, { rich_text: [] });
  assert.deepEqual(p.properties.Device, { select: null });
  assert.deepEqual(p.properties['Device ID'], { rich_text: [] });
  assert.equal(p.properties.Day, undefined);
});

test('v2 description is truncated to 2000 characters', () => {
  const p = buildPagePayload({ ...session, description: 'x'.repeat(2500), databaseId: 'db', schemaVersion: 'v2' });
  assert.equal(p.properties.Description.rich_text[0].text.content.length, 2000);
});

test('sessions database defines every property a v2 page writes', () => {
  const db = buildSessionsDatabasePayload('parent');
  const page = buildPagePayload({ ...session, databaseId: 'db', schemaVersion: 'v2', dayPageId: 'd' });
  const dbProps = new Set([...Object.keys(db.properties), SESSION_PROPS.day]); // Day comes from the relation
  for (const name of Object.keys(page.properties)) assert.ok(dbProps.has(name), `missing ${name}`);
  assert.equal(Object.keys(db.properties).length + 1, 11);
});

test('every session type label is a select option', () => {
  const options = buildSessionsDatabasePayload('parent').properties['Session Type'].select.options.map((o) => o.name);
  for (const t of Object.values(SESSION_TYPES)) assert.ok(options.includes(t.label));
});

test('daily database relates to sessions and rolls up focus count', () => {
  const daily = buildDailyDatabasePayload('parent', 'sessions-id');
  assert.equal(daily.properties.Sessions.relation.database_id, 'sessions-id');
  const rollups = buildDailyRollupsPatch().properties;
  assert.deepEqual(rollups['Focus Pomodoros'].rollup, {
    relation_property_name: 'Sessions', rollup_property_name: 'Focus Count', function: 'sum'
  });
  assert.equal(rollups['Total Sessions'].rollup.function, 'count');
});

test('schema version detection', () => {
  assert.equal(schemaVersionOf({ Task: { type: 'title' }, Start: { type: 'date' }, End: { type: 'date' } }), 'v2');
  assert.equal(schemaVersionOf({ Name: { type: 'title' }, Date: { type: 'date' } }), 'v1');
  assert.equal(schemaVersionOf({ Task: { type: 'rich_text' }, Start: { type: 'date' }, End: { type: 'date' } }), 'v1');
});

test('rename query matches this device ID and rows not yet renamed', () => {
  assert.deepEqual(buildRenameQuery('dev-1', 'Office Mac').filter, {
    and: [
      { property: 'Device ID', rich_text: { equals: 'dev-1' } },
      {
        or: [
          { property: 'Device', select: { does_not_equal: 'Office Mac' } },
          { property: 'Device', select: { is_empty: true } }
        ]
      }
    ]
  });
  assert.deepEqual(buildDevicePatch('Office Mac'), { properties: { Device: { select: { name: 'Office Mac' } } } });
});
