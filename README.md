# LookBusy
Because if it's logged in Notion, it counts as work.

A Manifest V3 Chrome extension: a Pomodoro timer (25 min focus / 5 min short break / 15 min long break after every 4 focus sessions) that logs every completed interval to a Notion database.

## Features
- Start, Pause, Reset, Skip
- Task label for the current session
- Desktop notifications and optional sound on completion
- Timers run on `chrome.alarms` in the service worker, so they survive worker shutdown
- Each completed interval is `POST`ed to `https://api.notion.com/v1/pages`

## Build
Prerequisites: Node 20+ (`nvm use` picks it up from `.nvmrc`).

```sh
npm install        # once, installs TypeScript and the Chrome typings
npm run build      # compiles to dist/ and copies manifest, HTML, CSS and icons
npm run watch      # copies static files once, then recompiles .ts on change
npm run typecheck  # strict type check without emitting
npm test           # builds, then runs the tests in test/
npm run clean      # deletes dist/ (use after renaming or removing a source file)
```

`watch` only recompiles TypeScript. After editing an HTML page, `styles.css`, `manifest.json` or `icons/`, re-run `npm run build`.

## Load the extension in Chrome
1. Run `npm install && npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `dist/` folder (not the repository root, which has no compiled JavaScript).
5. Pin LookBusy from the puzzle-piece menu, then open **Settings** in the popup (or the extension's Options).

If you previously loaded the repository root, remove that entry. An unpacked extension's ID comes from its folder path, so the `dist/` build gets a new ID: enter your Notion settings once more, and any running timer is lost.

## Set up Notion

### Automatic setup (recommended)
1. Go to <https://www.notion.so/my-integrations> and click **New integration**. Choose the workspace, give it a name (e.g. "LookBusy") and submit.
2. Copy the **Internal Integration Secret**.
3. In Notion, open (or create) the page that should hold LookBusy's databases, click `•••` → **Connections** and add your integration. Notion does not let an integration create databases at the top level of a workspace, so this one page is required.
4. In LookBusy Settings, paste the secret and enter a **Device name** (e.g. "Work laptop"). Both are required.
5. Click **Create databases for me**, pick the page from step 3 and click **Review**. LookBusy shows every database and column it will create. Nothing is written to Notion until you click **Create**.
6. Done. Both database IDs are filled in and saved for you, and the Settings page links to the new databases.

The setup button is only offered while no sessions database is configured. To create a fresh pair, clear the Sessions Database ID and save.

### Manual setup
1. Follow steps 1–2 above.
2. Create a database with the **Sessions** schema below (or keep an existing one with the legacy schema), and optionally a **Daily Summary** database.
3. On each database, click `•••` → **Connections** and add your integration. Without this, the API returns 404.
4. Copy each database's URL (`https://www.notion.so/<workspace>/<DATABASE_ID>?v=...`) into Settings. The full URL or the 32-character ID both work.
5. Enter a device name and click **Save**. LookBusy reads the database to detect which schema it has (see below).

The secret and database IDs are stored in `chrome.storage.sync`. The device name is stored only on this computer (`chrome.storage.local`), so each computer has its own.

## Database schemas
Property names are case-sensitive.

### LookBusy Sessions (current schema)
| Column         | Type     | Notes                                                    |
|----------------|----------|----------------------------------------------------------|
| `Task`         | Title    | Task label from the popup                                |
| `Description`  | Text     | Optional description from the popup                      |
| `Session Type` | Select   | Options: `Focus`, `Short Break`, `Long Break`            |
| `Status`       | Select   | Option: `Completed`                                      |
| `Start`        | Date     | Interval start, with time                                |
| `End`          | Date     | Interval end, with time                                  |
| `Streak`       | Number   | Consecutive days, up to this one, with a completed Focus |
| `Day`          | Relation | Links to the session's day in Daily Summary              |
| `Focus Count`  | Formula  | `if(prop("Session Type") == "Focus", 1, 0)`              |
| `Device`       | Select   | Device name from Settings                                |
| `Device ID`    | Text     | Managed by LookBusy. Do not edit                         |

### LookBusy Daily Summary
| Column            | Type     | Notes                              |
|-------------------|----------|------------------------------------|
| `Day`             | Title    | `YYYY-MM-DD`                       |
| `Date`            | Date     | The day                            |
| `Sessions`        | Relation | The other side of Sessions → `Day` |
| `Focus Pomodoros` | Rollup   | Sum of `Focus Count`               |
| `Total Sessions`  | Rollup   | Count of `Sessions`                |

A Day row is created the first time a session is logged on that day. A session belongs to the day it **started** on.

### Legacy schema
Databases built from earlier versions of this README keep working unchanged:

| Column         | Type   | Notes                                         |
|----------------|--------|-----------------------------------------------|
| `Name`         | Title  | Task / session name                           |
| `Date`         | Date   | Start and end of the interval                 |
| `Session Type` | Select | Options: `Focus`, `Short Break`, `Long Break` |
| `Status`       | Select | Option: `Completed`                           |

When you save Settings, LookBusy reads the sessions database. If it has a `Task` title and `Start` and `End` dates, it uses the current schema. Otherwise it writes only the four legacy columns. If the database cannot be read, the legacy schema is assumed.

### Notes
- **Streak** is tracked per computer, so two computers keep separate streaks.
- **Device rename**: changing the device name in Settings updates `Device` on every past row whose `Device ID` belongs to this computer. Rows from other computers are not touched. The update runs in the background at about 3 rows per second, resumes if Chrome closes, and Settings shows its progress. Old names stay in the `Device` select's option list, because Notion's API cannot rename options.

## Layout
- `manifest.json` – MV3 manifest
- `src/background.ts` – service worker (timer, alarms, notifications)
- `src/notion.ts` – Notion API client: logging, setup and schema detection
- `src/schema.ts` – Notion database schemas (single source of truth)
- `src/streak.ts` – daily streak calculation
- `src/constants.ts` – durations and state helpers
- `src/types.ts` – shared types: timer state, settings, runtime message protocol
- `src/offscreen.ts` – offscreen document that plays the chime
- `src/ui.ts` – DOM and messaging helpers for the popup and options pages
- `popup.*`, `options.*`, `styles.css` – UI
- `scripts/copy-static.mjs` – copies non-TypeScript files into `dist/`
- `test/` – `node --test` tests for the pure payload and streak code (`npm test`)
- `dist/` – build output, the folder Chrome loads (git-ignored)
