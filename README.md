# LookBusy
Because if it's logged in Notion, it counts as work.

A Manifest V3 Chrome extension: a Pomodoro timer (25 min focus / 5 min short break / 15 min long break after every 4 focus sessions) that logs every completed interval to a Notion database.

## Features
- Start, Pause, Reset, Skip
- Task label for the current session
- Desktop notifications and optional sound on completion
- Timers run on `chrome.alarms` in the service worker, so they survive worker shutdown
- Each completed interval is `POST`ed to `https://api.notion.com/v1/pages`

## Load the extension in Chrome
1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this repository's folder.
4. Pin LookBusy from the puzzle-piece menu, then open **Settings** in the popup (or the extension's Options).

## Set up Notion
1. Go to <https://www.notion.so/my-integrations> and click **New integration**. Choose the workspace, give it a name (e.g. "LookBusy") and submit.
2. Copy the **Internal Integration Secret**.
3. Create a database in Notion with the schema below.
4. Open the database page, click `•••` → **Connections** (or **Add connections**) and add your integration. Without this, the API returns 404.
5. Get the Database ID: open the database as a full page and copy its URL: `https://www.notion.so/<workspace>/<DATABASE_ID>?v=...`. The 32-character string before `?v=` is the ID. (Pasting the full URL into Settings also works.)
6. In LookBusy Settings, paste the secret and Database ID, then Save. Both are stored in `chrome.storage.sync`.

## Expected database schema
Property names are case-sensitive.

| Column         | Type   | Notes                                    |
|----------------|--------|------------------------------------------|
| `Name`         | Title  | Task / session name                      |
| `Date`         | Date   | Start and end of the interval            |
| `Session Type` | Select | Options: `Focus`, `Short Break`, `Long Break` |
| `Status`       | Select | Option: `Completed`                      |

`Status` is written as a Select. If your database uses Notion's built-in *Status* property type, change `Status` in `src/notion.js` to `{ status: { name: 'Completed' } }`.

## Layout
- `manifest.json` – MV3 manifest
- `src/background.js` – service worker (timer, alarms, notifications)
- `src/notion.js` – Notion API client
- `src/constants.js` – durations and state helpers
- `popup.*`, `options.*`, `styles.css` – UI
