import { SESSION_TYPES } from './constants.js';

// Single source of truth for the Notion schemas. Database creation, session logging
// and the approval dialog all read from here, so they cannot drift apart.

export const SESSIONS_TITLE = 'LookBusy Sessions';
export const DAILY_TITLE = 'LookBusy Daily Summary';
export const COMPLETED = 'Completed';

// Current (v2) sessions database.
export const SESSION_PROPS = {
  task: 'Task',
  description: 'Description',
  sessionType: 'Session Type',
  status: 'Status',
  start: 'Start',
  end: 'End',
  streak: 'Streak',
  day: 'Day',
  focusCount: 'Focus Count',
  device: 'Device',
  deviceId: 'Device ID'
} as const;

// Legacy (v1) sessions database, as documented in the README before automatic setup.
export const LEGACY_PROPS = {
  name: 'Name',
  date: 'Date',
  sessionType: 'Session Type',
  status: 'Status'
} as const;

export const DAILY_PROPS = {
  day: 'Day',
  date: 'Date',
  sessions: 'Sessions',
  focusPomodoros: 'Focus Pomodoros',
  totalSessions: 'Total Sessions'
} as const;

export const SESSION_TYPE_OPTIONS: string[] = Object.values(SESSION_TYPES).map((t) => t.label);

export const FOCUS_COUNT_FORMULA =
  `if(prop("${SESSION_PROPS.sessionType}") == "${SESSION_TYPES.focus.label}", 1, 0)`;

// Notion's per-text-object limit.
export const RICH_TEXT_LIMIT = 2000;

export interface SchemaColumn {
  column: string;
  type: string;
  details: string;
}

export interface SchemaDescription {
  title: string;
  columns: SchemaColumn[];
}

// Human-readable summary for the approval dialog.
export function describeSchemas(): SchemaDescription[] {
  const P = SESSION_PROPS;
  const D = DAILY_PROPS;
  return [
    {
      title: SESSIONS_TITLE,
      columns: [
        { column: P.task, type: 'Title', details: 'Task label' },
        { column: P.description, type: 'Text', details: 'Optional description from the popup' },
        { column: P.sessionType, type: 'Select', details: SESSION_TYPE_OPTIONS.join(', ') },
        { column: P.status, type: 'Select', details: COMPLETED },
        { column: P.start, type: 'Date', details: 'Interval start, with time' },
        { column: P.end, type: 'Date', details: 'Interval end, with time' },
        { column: P.streak, type: 'Number', details: 'Consecutive days with a Focus session' },
        { column: P.day, type: 'Relation', details: `Links to ${DAILY_TITLE}` },
        { column: P.focusCount, type: 'Formula', details: '1 for Focus, otherwise 0' },
        { column: P.device, type: 'Select', details: 'Device name from Settings' },
        { column: P.deviceId, type: 'Text', details: 'Managed by LookBusy' }
      ]
    },
    {
      title: DAILY_TITLE,
      columns: [
        { column: D.day, type: 'Title', details: 'YYYY-MM-DD' },
        { column: D.date, type: 'Date', details: 'The day' },
        { column: D.sessions, type: 'Relation', details: `Links to ${SESSIONS_TITLE}` },
        { column: D.focusPomodoros, type: 'Rollup', details: `Sum of ${P.focusCount}` },
        { column: D.totalSessions, type: 'Rollup', details: `Count of ${D.sessions}` }
      ]
    }
  ];
}
