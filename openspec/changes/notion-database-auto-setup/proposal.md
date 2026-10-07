# Proposal

## Why

Setting up LookBusy's Notion side today takes six manual steps (see README "Set up Notion"). The user must build a database by hand with exactly named, case-sensitive properties, connect the integration to it, and copy its ID out of a URL. A single typo makes every log fail with a Notion validation error. The log is also thin: it records only a name and a time range, with no description, no streak and no daily view of how much focus work got done. Most of the setup can be done for the user through the Notion API, as one action they approve, and that action can also produce a richer, more useful structure.

## What Changes

- Add a **"Create databases for me"** action to the Settings page. It is available once an integration secret is entered.
- Before anything is created, show an approval step that lists exactly what will be created: both database titles, their parent page and every column with its type and options. Nothing is written to Notion until the user confirms.
- On approval, create two linked databases under a parent page the user picks from the pages shared with their integration:
  - **LookBusy Sessions** has one row per completed interval, with columns `Task` (Title), `Description` (Text), `Session Type` (Select: Focus, Short Break, Long Break), `Status` (Select: Completed), `Start` (Date and time), `End` (Date and time), `Streak` (Number), `Day` (Relation to Daily Summary), `Focus Count` (Formula), `Device` (Select) and `Device ID` (Text, used to match rows when a device is renamed).
  - **LookBusy Daily Summary** has one row per day, with columns `Day` (Title), `Date` (Date), `Sessions` (Relation), `Focus Pomodoros` (Rollup: the number of Focus sessions that day) and `Total Sessions` (Rollup).
- Save both database IDs to Settings automatically. If the second database cannot be created, remove the first so that a failed setup leaves nothing behind.
- Make the action one-time: while a sessions database ID is configured, the action is not offered.
- Add an optional **Description** field to the popup, logged with each session.
- Add a required **Device name** to Settings, entered during initial setup together with the integration secret. It is stored only on that device, with a random device ID generated once. Every logged session records both.
- When the device name changes, update `Device` on every past row with this device's ID, so a device's history stays labelled consistently. The update runs in the background and resumes if interrupted.
- Track a **daily streak**, the number of consecutive days with at least one completed Focus session, and write it on every logged session.
- Link every logged session to its day's row in the Daily Summary, creating that row the first time a session is logged on that day.
- Keep logging working for databases built by hand from the old README schema (`Name`, `Date`, `Session Type`, `Status`). The extension detects which schema the configured database has and writes the matching properties.
- Define both schemas in one place, so database creation and session logging cannot drift apart.
- Update the README: automatic setup becomes the primary path, manual setup the alternative, with both schemas documented.

## Capabilities

### New Capabilities
- `notion-database-setup`: Creating, with the user's approval, LookBusy's predefined Sessions and Daily Summary databases in Notion, and wiring them into the extension's settings.
- `session-logging`: What the extension writes to Notion for each completed interval: properties, description, streak, linking to the day row, and compatibility with older schemas.

### Modified Capabilities
<!-- None. No specs exist yet in openspec/specs/. -->

## Impact

- **Code**:
  - `src/notion.ts`: database creation, parent-page search, logging that adapts to the schema, find-or-create of day rows.
  - New `src/schema.ts`: both schema definitions.
  - `src/types.ts`: settings fields, a `description` on the timer state and completed sessions, and a new `setDescription` message.
  - `src/background.ts`: description state, streak bookkeeping and the background job that applies a device rename.
  - `popup.*`: the Description field.
  - `options.*` and `styles.css`: the setup flow, an optional daily database ID field, and a required device name field with rename progress.
- **Notion API**: new calls, all on the same `Notion-Version: 2022-06-28` as today:
  - `POST /v1/search`
  - `POST /v1/databases`
  - `GET /v1/databases/{id}`
  - `POST /v1/databases/{id}/query`
  - `PATCH /v1/databases/{id}` (adds rollups and renames the relation)
  - `DELETE /v1/blocks/{id}` (used only for rollback)
  - `PATCH /v1/pages/{id}` (used to update past rows on a device rename)
- **Request volume**: when a daily database is configured, logging a session can take up to three requests (find the day row, create it, create the session) instead of one. A device rename makes one request per affected row, paced to Notion's rate limit, so a long history takes minutes.
- **Storage**: new `chrome.storage.sync` keys `dailyDatabaseId` and `schemaVersion`; new `chrome.storage.local` data for the streak, the cache of day rows, `deviceName`, `deviceId` and any pending rename.
- **Permissions**: none added.
- **User-facing constraint**: Notion does not let an internal integration create a database at the workspace root, so the user must still share one parent page with the integration.
- **Docs**: README "Set up Notion" and "Expected database schema".
- **Out of scope**: OAuth (public integration) sign-in, migrating an old-schema database to the new schema, custom columns, Notion views, and back-filling streaks or day links for sessions logged before this change.
