# Proposal

## Why

LookBusy is ~300 lines of untyped JavaScript whose pieces talk through loosely shaped objects: the popup-to-worker message protocol, the persisted timer state, the Notion payload, and the settings read from `chrome.storage`. A typo in an action name or a state field fails silently at runtime. Converting to strict TypeScript now, while the codebase is small and before the planned bug-fix changes land, makes those contracts checkable at compile time.

## What Changes

- Convert every source file to TypeScript: `src/background.ts`, `src/constants.ts`, `src/notion.ts`, `src/offscreen.ts`, `popup.ts`, `options.ts`.
- Add explicit types for the existing contracts: session types, timer state, settings, the Notion log result, and the runtime message protocol (popup to worker, worker to offscreen).
- Add `package.json` (dev dependencies only: `typescript`, `@types/chrome`) with `build`, `watch` and `typecheck` scripts, plus a strict `tsconfig.json`.
- Compile with plain `tsc` into `dist/`, and copy `manifest.json`, the HTML pages, `styles.css` and `icons/` alongside it through a small, dependency-free Node script.
- **BREAKING (developer workflow only)**: the unpacked extension is loaded from `dist/` after `npm install && npm run build`, not from the repository root. The README is updated to match.
- Add a `.gitignore` for `node_modules/` and `dist/`, and an `.nvmrc` pinning Node 20+.
- No runtime behavior changes. The known behavior issues recorded during the baseline review (skip after a long break, late alarms, lost Notion logs, and others) are kept exactly as they are and left to follow-up changes.

## Capabilities

### New Capabilities

None. This is a tooling and type-safety refactor; specs describe behavior, and no behavior changes.

### Modified Capabilities

None. The change sets `skip_specs: true` in its `.openspec.yaml`.

## Impact

- **Code**: every `.js` source file is renamed to `.ts` and annotated; `offscreen.html` loads its script as a module.
- **Dependencies**: new dev dependencies `typescript` and `@types/chrome`. The shipped extension still has zero runtime dependencies.
- **Build output**: new `dist/` directory, git-ignored. The manifest, HTML and asset paths are unchanged relative to the extension root.
- **Developer workflow**: Node 20+ and a build step are now required before loading the extension. The README's "Load the extension" section changes.
- **Users**: none. The extension's permissions, UI, timing and Notion payload stay identical.
