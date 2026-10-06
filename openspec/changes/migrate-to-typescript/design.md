# Design

## Context

See proposal.md for motivation. Current state that shapes the approach:

- Chrome loads files exactly as they sit on disk. There is no build today, and the repository root is the unpacked extension.
- `src/background.js` runs as a module service worker (`"type": "module"` in `manifest.json`). `popup.html` and `options.html` load `popup.js` and `options.js` with `<script type="module">`. `offscreen.html` loads `src/offscreen.js` as a classic script.
- Relative imports already carry `.js` extensions (`./constants.js`, `./src/constants.js`), which browsers require for native ESM.
- The only cross-file contracts are plain objects: the `{ action, ...extra }` messages from the popup, the `{ target: 'offscreen', action: 'beep' }` message, the `timerState` object in `chrome.storage.local`, the settings object in `chrome.storage.sync`, and `logSession`'s `{ ok, error }` result.
- The codebase has no tests. Correctness of the migration is shown by a clean strict type check plus a manual smoke test in Chrome.

## Goals / Non-Goals

**Goals:**
- Every source file is TypeScript under `strict`, with no `any` in the cross-file contracts listed above.
- The emitted JavaScript keeps the same file layout and module graph, so `manifest.json` and the HTML pages need no path changes.
- The build needs only `typescript` and `@types/chrome`, plus Node's standard library.

**Non-Goals:**
- Fixing any behavior issue from the baseline review. Known quirks are carried over unchanged, even where the new types make them more visible.
- Bundling, minification, source maps for release, linting, formatting, or a test framework.
- Restructuring modules or moving files beyond the `.js` to `.ts` rename.
- Generating `manifest.json` or adding hot reload.

## Decisions

### 1. Plain `tsc` emitting to `dist/`, not a bundler
`tsc` compiles each `.ts` file to one `.js` file in the same relative position under `dist/`. The extension is ~300 lines with no runtime dependencies, and Chrome loads native ES modules, so a bundler would add nothing.
- *Alternatives:* esbuild (faster, one more dependency, needs `tsc --noEmit` for type checking anyway) and Vite + CRXJS (hot reload, but a heavy toolchain for this size). The user chose `tsc` only.

### 2. Keep the source layout and mirror it in `dist/`
`rootDir: "."` with `include: ["src/**/*.ts", "popup.ts", "options.ts"]` and `outDir: "dist"` emits `dist/src/background.js`, `dist/popup.js` and so on. Every path in `manifest.json` and in the HTML `<script>` tags therefore stays valid without edits.
- *Alternative:* move everything under `src/` (including the popup and options pages). That is cleaner, but it means editing the manifest and HTML paths, and it is churn this change doesn't need.

### 3. `module`/`moduleResolution: "NodeNext"` with `"type": "module"` in `package.json`
Under NodeNext, a relative import without an explicit `.js` extension is a compile error. That is exactly the rule the browser enforces at runtime. The sources keep their existing `./constants.js` specifiers, which TypeScript resolves to `constants.ts`.
- *Alternative:* `moduleResolution: "Bundler"`. It accepts extensionless imports that compile fine but then fail when Chrome loads them. Rejected because it lets a runtime break through.
- `lib: ["ES2022", "DOM"]`, `target: "ES2022"`, `types: ["chrome"]`. Chrome MV3 supports ES2022 natively, so nothing is down-levelled.

### 4. Strict compiler settings
`strict`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `forceConsistentCasingInFileNames`, and `verbatimModuleSyntax` (type-only imports are erased explicitly). `exactOptionalPropertyTypes` is left off; it adds friction with `@types/chrome` for little gain here.

### 5. Shared types live in `src/types.ts`; constants keep their shape
- `SessionType = 'focus' | 'shortBreak' | 'longBreak'`, derived from `SESSION_TYPES` (`keyof typeof SESSION_TYPES`, with `SESSION_TYPES` declared `as const satisfies Record<string, { label: string; minutes: number }>`), so labels and durations stay in one place.
- `TimerStatus = 'idle' | 'running' | 'paused'`. `TimerState` is an interface matching `DEFAULT_STATE`, with `startedAt` and `endsAt` typed `number | null`.
- `Settings { notionToken: string; databaseId: string; soundEnabled: boolean }`.
- `LogResult = { ok: true } | { ok: false; error: string }`, a discriminated union, so the notification code must narrow on `ok` before reading `error`.
- `CompletedSession { type; task; startedAt: number; endedAt: number }`. `startedAt` is non-null at completion, and that assertion is made once, explicitly, in `complete()`.

### 6. A typed message protocol
- `WorkerRequest` is a discriminated union on `action`: `start` (optional `task`), `pause`, `reset`, `skip`, `setTask` (`task`), `getState`. Every one responds with `TimerState`.
- `OffscreenMessage = { target: 'offscreen'; action: 'beep' }`.
- The worker's `onMessage` listener switches on `msg.action` with an exhaustive `never` check, replacing the untyped `actions[msg.action]` lookup map. The current listener returns `false` for unknown actions; the switch's default branch does the same.
- The popup gets a small typed `send(req: WorkerRequest): Promise<TimerState>` helper. Its one cast lives inside the helper, because `chrome.runtime.sendMessage` is typed `any` in its response.

### 7. Typed storage access at the edges
`chrome.storage.*.get` returns untyped records. `getState()` and `getSettings()` remain the single place where stored data enters the program. Each merges the stored record over typed defaults and returns `TimerState` or `Settings`. There is no runtime schema validation; that would be a behavior change and is out of scope.

### 8. DOM lookups through a checked helper
`popup.ts` and `options.ts` replace `document.getElementById` with `el<T extends HTMLElement>(id, type)`. It throws a descriptive error if the element is missing or of the wrong class, which makes `.value` and `.checked` type-safe without `!` assertions scattered through the code.

### 9. `offscreen.html` loads its script as a module
Under `"type": "module"`, `offscreen.ts` is compiled as an ES module, and its emitted file may contain `export {}`. That is a syntax error in a classic script. The `<script>` tag gains `type="module"`. The module runs the same listener code, so behavior is unchanged.

### 10. Static files copied by `scripts/copy-static.mjs`
A dependency-free script using `node:fs/promises` `cp` copies `manifest.json`, `popup.html`, `options.html`, `offscreen.html`, `styles.css` and `icons/` into `dist/`. npm scripts:
- `build`: `tsc && node scripts/copy-static.mjs`
- `watch`: `node scripts/copy-static.mjs && tsc --watch`
- `typecheck`: `tsc --noEmit`
- `clean`: removes `dist/` (Node `rm`, so it works on any OS)

The build does not delete `dist/` first, so a renamed or removed source file leaves a stale output behind. `clean` exists for that case.
- *Alternative:* `cp -R` in the npm script. Rejected because it isn't portable to Windows shells.

### 11. Node 20+ pinned via `.nvmrc` and `engines`
TypeScript itself runs on older Node, but the repository's OpenSpec CLI already fails on Node 18. A single pinned version avoids two different environments.

## Risks / Trade-offs

- **[`dist/` is stale after editing an HTML or CSS file in watch mode]** → `watch` copies static files once at start. The README says to re-run `npm run build` after changing static files. Acceptable for a project this size.
- **[`@types/chrome` lags or is wrong for newer APIs such as `chrome.runtime.getContexts` and `chrome.offscreen`]** → Pin a current `@types/chrome`. If a signature is missing, add a narrowly scoped declaration in `src/types.ts` with a comment, never a file-wide `any`.
- **[Types silently change behavior, for example when the `switch` rewrite of the message listener drops the `msg.target === 'offscreen'` early return]** → Task list keeps every early return and guard explicitly. The manual smoke test covers start, pause, resume, reset, skip, completion with and without Notion configured, and the chime.
- **[Developers keep loading the repository root out of habit]** → Without a build, the root has no `.js` files, so loading it fails loudly at once. The README's load instructions name `dist/` explicitly.
- **[Making known bugs type-visible tempts fixing them in this change]** → Out of scope by design. Any such spot gets a short `// Known issue: see baseline findings` comment at most, and no logic change.

## Migration Plan

1. Land the change on a branch. `npm install && npm run build`, then load `dist/` in `chrome://extensions` and remove the old unpacked entry that pointed at the repository root.
2. Timer state in `chrome.storage.local` and settings in `chrome.storage.sync` are keyed by extension ID. An unpacked extension's ID derives from its folder path, so loading from `dist/` gives a new ID: settings must be entered again once, and any in-flight timer is lost. This is acceptable for a developer-loaded extension and is noted in the README.
3. Rollback: revert the commit and load the repository root again. No data migration is involved.

## Open Questions

- Should `dist/` eventually be zipped by an npm script for Chrome Web Store upload? This can be added later without affecting this design.
