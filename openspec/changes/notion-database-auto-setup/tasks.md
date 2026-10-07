# Tasks

## 1. Shared schema, settings and test harness

- [ ] 1.1 Add `"test": "npm run build && node --test test/"` to `package.json` and create a `test/` folder with a placeholder test; verify that `npm test` runs and passes
- [ ] 1.2 Create `src/schema.ts` with the property names for Sessions `v2`, Sessions `v1` and Daily, the database titles, the `Completed` value, the `Focus Count` formula expression, select options derived from `SESSION_TYPES`, and `describeSchemas()`; verify with `npm run typecheck`
- [ ] 1.3 Extend `Settings` in `src/types.ts` with `dailyDatabaseId` and `schemaVersion: 'v1' | 'v2'`, with defaults `''` and `'v1'` in `getSettings()` and in the `options.ts` load; verify that `npm run typecheck` passes and an existing install still loads its settings

## 2. Description and streak in the worker and popup

- [ ] 2.1 Add `description` to `TimerState`, `DEFAULT_STATE` and `CompletedSession`, plus a `setDescription` `WorkerRequest` handled in `src/background.ts` like `setTask`; verify with `npm run typecheck`
- [ ] 2.2 Add an optional `<textarea id="description">` to `popup.html` and wire it in `popup.ts`, mirroring the task input (send on input, restore on render without overwriting while focused); verify in Chrome that the text survives closing and reopening the popup
- [ ] 2.3 Create `src/streak.ts` with pure `localDay(ts)` and `nextStreak(prev, today, isFocus)`; add `test/streak.test.mjs` covering consecutive day, same day, gap, a break before today's Focus, a break after a gap, and month and year boundaries; verify `npm test` passes
- [ ] 2.4 In `src/background.ts`, on interval completion, read and update `{ lastFocusDay, streak }` in `chrome.storage.local` and pass `streak` and `description` in the `CompletedSession`; verify in DevTools storage that the streak value is updated after a Focus completes and unchanged after a break

## 3. Notion client: logging

- [ ] 3.1 Extract `notionFetch(token, method, path, body?)` in `src/notion.ts` and move `logSession` onto it; verify that `npm run typecheck` passes and a completed interval still logs to an existing `v1` database in Chrome
- [ ] 3.2 Make `buildPagePayload` branch on `schemaVersion`: `v1` reproduces today's payload, `v2` writes Task, Description (truncated to 2000 characters), Session Type, Status, Start, End, Streak, Device and Device ID (from `chrome.storage.local`, empty when unset) and an optional Day relation; add `test/payload.test.mjs` that asserts the `v1` output equals a fixture of the current payload and that the `v2` keys match the schema; verify `npm test` passes
- [ ] 3.3 Add day-row find-or-create in `logSession` for `v2` with a `dailyDatabaseId`: check the cache in `chrome.storage.local`, otherwise query on `Date`, otherwise create a `YYYY-MM-DD` row; on a validation error, retry once with the cache cleared; on failure, log without `Day`; verify in Chrome that two sessions on the same day create one daily row and both link to it

## 4. Notion client: setup

- [ ] 4.1 Add `buildSessionsDatabasePayload(parentId)`, `buildDailyDatabasePayload(parentId, sessionsId)` and the rollup/rename PATCH payload builders, all from `src/schema.ts`; extend `test/payload.test.mjs` to assert that the sessions database property names cover every `v2` page property and that every `SESSION_TYPES` label is a select option; verify `npm test` passes
- [ ] 4.2 Add `listParentPages(token)` (`POST /v1/search` filtered to pages, at most 100 results, excluding `parent.type === 'database_id'`, with an `Untitled` fallback); verify in Chrome that a page shared with the integration is listed and database rows are not
- [ ] 4.3 Add `createLoggingDatabases(token, parentId)`, which runs the four-step sequence (create Sessions → create Daily with relation → PATCH rollups → PATCH rename the synced property to `Day`), with rollback through `DELETE /v1/blocks/{id}` on any failure after step 1, returning both IDs and URLs or an error that names any leftover database; verify `npm run typecheck`, and verify in Chrome that forcing a step-2 failure (for example a bad sessions ID in a temporary debug edit) leaves no database behind
- [ ] 4.4 Add `detectSchemaVersion(token, databaseId)` (`GET /v1/databases/{id}`, `v2` if there is a `Task` title plus `Start` and `End` dates, else `v1`); verify in Chrome against an old-schema database (`v1`) and a database created by setup (`v2`)

## 5. Settings page

- [ ] 5.1 Rename `parseDatabaseId` to `parseNotionId`, add an optional "Daily Summary Database ID" input, and run `detectSchemaVersion` on Save, saving even if detection fails and showing its error; verify that pasting an old-schema database URL saves `schemaVersion: 'v1'` and that logging still works
- [ ] 5.2 Add a required "Device name" input to `options.html`, loaded from and saved to `chrome.storage.local`, generating `deviceId` with `crypto.randomUUID()` on the first save; block Save with a message when it is empty; verify in Chrome that Save fails with an empty name, and that after saving `deviceName` and `deviceId` appear in local storage and not in sync storage
- [ ] 5.3 Add the "Create databases for me" section (button, hint, parent-page `<select>`, paste-URL fallback) to `options.html` with styles in `styles.css`, and wire availability (no secret or no device name → disabled with a hint; database ID set → hidden with a "clear to recreate" note); verify each state by hand in Chrome
- [ ] 5.4 Load parent pages on click, handling the invalid-secret and no-pages-shared errors with the Connections instructions; verify both messages in Chrome
- [ ] 5.5 Add the approval `<dialog>` rendering `describeSchemas()` for both databases, with Create and Cancel; verify in DevTools Network that Cancel sends no write request
- [ ] 5.6 On Create: set the in-flight guard, re-read storage and abort if a `databaseId` exists, call `createLoggingDatabases`, then save `{ notionToken, databaseId, dailyDatabaseId, schemaVersion: 'v2' }` and the device name and show links to both databases, or show the error with storage unchanged; verify that double-clicking creates only one pair, and that after success both ID fields are filled and the action is hidden

## 6. Device rename job

- [ ] 6.1 Add pure `buildRenameQuery(deviceId, name)` (a filter on `Device ID` equal to the ID **and** `Device` not equal to the name) and `buildDevicePatch(name)` in `src/notion.ts`; add tests in `test/payload.test.mjs`; verify `npm test` passes
- [ ] 6.2 Implement the rename loop in `src/background.ts` (query → PATCH each row at about 3 per second → increase `pendingRename.updated` → re-query until empty → clear `pendingRename`), with a single-run guard and 429 `Retry-After` handling; add an `applyRename` `WorkerRequest`; verify with `npm run typecheck`
- [ ] 6.3 Resume the job on `chrome.runtime.onStartup` and from a `lookbusy-rename` alarm created while `pendingRename` exists; verify in Chrome that a rename resumes after you stop the service worker mid-run in `chrome://serviceworker-internals` and finishes on its own
- [ ] 6.4 In `options.ts`, on Save with a changed device name and a `v2` database, write `pendingRename` (overwriting any existing one) and send `applyRename`; show progress and completion from `chrome.storage.onChanged`; for `v1` or no database, save the name without starting a job; verify in Chrome that renaming updates the past rows of this device only (seed one row by hand with a different `Device ID`) and that a second rename mid-job ends with the latest name

## 7. Documentation

- [ ] 7.1 Rewrite README "Set up Notion" (automatic setup first, manual as the alternative) and "Expected database schema" (the Sessions `v2` and Daily tables, the legacy `v1` table and how detection works). Note that the streak is per device, that the Description field is in the popup, that the device name is required and set per computer, that renames update past rows in the background, and that `Device ID` is managed by the extension. Verify by following the README from scratch in a clean Notion workspace

## 8. End-to-end check

- [ ] 8.1 With a fresh integration and the device name "Test Mac", run setup, then complete Focus, Short Break, Focus (using Skip) with a task and description set; verify:
  - three Sessions rows with correct Task, Description, Start, End, Session Type, `Device` = "Test Mac", a non-empty `Device ID` and `Streak` = 1
  - all three linked to today's Daily row
  - that row showing `Focus Pomodoros` = 2 and `Total Sessions` = 3
- [ ] 8.2 Rename the device to "Test Mac 2" and verify that all three rows from 8.1 show the new name once Settings reports completion, and that the next session logs as "Test Mac 2"
- [ ] 8.3 With the old-schema database configured, complete one interval and verify that the row is identical in shape to rows logged before this change
