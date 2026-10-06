# Tasks

## 1. Toolchain and build scaffolding

- [x] 1.1 Add `.nvmrc` (`20`) and `package.json` (`"private": true`, `"type": "module"`, `engines.node >= 20`, dev deps `typescript` and `@types/chrome`, scripts `build`, `watch`, `typecheck`, `clean` as in design.md decision 10); verify `npm install` succeeds and writes `package-lock.json`
- [x] 1.2 Add `tsconfig.json` with the settings from design.md decisions 2 to 4 (`rootDir: "."`, `outDir: "dist"`, NodeNext, ES2022, DOM, `types: ["chrome"]`, strict flags, `include` covering `src/**/*.ts`, `popup.ts`, `options.ts`); verify `npx tsc --showConfig` prints the expected options
- [x] 1.3 Add `scripts/copy-static.mjs` that copies `manifest.json`, `popup.html`, `options.html`, `offscreen.html`, `styles.css` and `icons/` into `dist/` using only `node:fs/promises`, plus the `clean` script that removes `dist/`; verify `node scripts/copy-static.mjs` produces those files under `dist/` and `npm run clean` removes it
- [x] 1.4 Add `.gitignore` with `node_modules/` and `dist/`; verify `git status` does not list either after a build
- [x] 1.5 Update README: prerequisites (Node 20+, `npm install`), `npm run build` / `watch` / `typecheck`, load `dist/` (not the repo root) via **Load unpacked**, re-run `build` after editing HTML/CSS/manifest, the one-time settings re-entry because the unpacked extension ID changes, and the Layout section with `.ts` paths, `src/types.ts`, `scripts/` and `dist/`; verify the documented commands run as written

## 2. Shared types and constants

- [x] 2.1 Create `src/types.ts` with `TimerStatus`, `TimerState`, `Settings`, `LogResult`, `CompletedSession`, `WorkerRequest` and `OffscreenMessage` (design.md decisions 5 and 6); verify `npm run typecheck` passes
- [x] 2.2 Rename `src/constants.js` to `src/constants.ts`: declare `SESSION_TYPES` `as const satisfies …`, export `SessionType`, and type `DEFAULT_STATE: TimerState`, `durationFor(type: SessionType): number`, `nextType(type: SessionType, completedFocus: number): SessionType`, keeping the logic byte-for-byte equivalent (including the skip-after-long-break behavior); verify `npm run typecheck` passes and `dist/src/constants.js` is emitted by `npm run build`

## 3. Notion client

- [x] 3.1 Rename `src/notion.js` to `src/notion.ts`: type `getSettings(): Promise<Settings>` (merge over typed defaults, design.md decision 7), `buildPagePayload`, and `logSession(session: CompletedSession): Promise<LogResult>`; keep the URL, `Notion-Version`, property names, `(unnamed, suspiciously)` fallback and error messages unchanged; verify `npm run typecheck` passes and `git diff -M` shows no change to string literals or control flow beyond annotations

## 4. Service worker and offscreen document

- [x] 4.1 Rename `src/background.js` to `src/background.ts`: type `getState`/`setState`/`freshState`/`start`/`pause`/`reset`/`skip`/`setTask`/`playSound`/`complete`, and narrow `LogResult` on `ok` before reading `error`; keep every existing guard (`status !== 'running'` checks, "advance state first" ordering); verify `npm run typecheck` passes
- [x] 4.2 Replace the `actions[msg.action]` map in the `onMessage` listener with an exhaustive `switch` over `WorkerRequest` (`never` check in default) while preserving the `msg.target === 'offscreen'` early `return false`, the `return false` for unknown actions, and `return true` for async responses; verify `npm run typecheck` passes and a deliberately removed case produces a compile error (then restore it)
- [x] 4.3 Rename `src/offscreen.js` to `src/offscreen.ts`, type its listener with `OffscreenMessage`, and change `offscreen.html` to `<script type="module" src="src/offscreen.js">` (design.md decision 9); verify `npm run build` emits `dist/src/offscreen.js` and `dist/offscreen.html` references it as a module

## 5. Popup and options pages

- [x] 5.1 Add the checked `el(id, type)` DOM helper (design.md decision 8) in a shared module under `src/` and the typed `send(req: WorkerRequest): Promise<TimerState>` helper; verify `npm run typecheck` passes
- [x] 5.2 Rename `popup.js` to `popup.ts` using `el` and `send`, keeping the 500 ms render interval, button label logic, focus-preserving task input and `storage.onChanged` refresh unchanged; verify `npm run typecheck` passes and `dist/popup.js` is emitted
- [x] 5.3 Rename `options.js` to `options.ts` using `el`, typing `parseDatabaseId(input: string): string` and the saved `Settings`, keeping the save message text unchanged; verify `npm run typecheck` passes and `dist/options.js` is emitted

## 6. Integration check

- [x] 6.1 Run `npm run clean && npm run build`, confirm the repo root contains no `.js` sources (only `scripts/copy-static.mjs`) and `dist/` contains the manifest, three HTML pages, `styles.css`, `icons/`, `popup.js`, `options.js` and `src/{background,constants,notion,offscreen,types}.js`
- [ ] 6.2 Load `dist/` unpacked in Chrome with no errors on `chrome://extensions` or in the service worker console, then smoke test: start, pause, resume, reset, skip, task label persistence, popup reopen mid-interval, settings save with a full Notion URL as DB ID, one completed interval logged to Notion (shorten a duration locally only for the test and revert), the "Not configured" notification with settings cleared, and the chime with sound enabled
