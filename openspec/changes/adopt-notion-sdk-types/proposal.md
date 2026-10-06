# Proposal

## Why

The Notion integration is a single hand-rolled `fetch` to `POST /v1/pages` whose request body and error body are untyped object literals. A misspelled property shape (for example `select: { nam: 'Completed' }`) compiles cleanly and only surfaces at runtime as a 400 from Notion, after a 25-minute focus session has already ended and its log is lost. The official `@notionhq/client` package publishes complete request and response types for this endpoint; borrowing those types closes the gap without shipping the SDK itself.

The full SDK was considered and set aside for now: it ships only as CommonJS, so adopting it at runtime would require introducing a bundler, would add the extension's first runtime dependency, and would bring Notion API version drift (SDK v5 defaults to `2025-09-03`) for a feature that makes exactly one HTTP call. If Notion features grow (schema validation, reading sessions back, data sources), that trade-off can be revisited.

## What Changes

- Add `@notionhq/client` as a **dev dependency only**, pinned to an exact version.
- Type the page-creation payload in `src/notion.ts` against the SDK's `CreatePageParameters`, using `import type` so the import is erased at compile time.
- Type the Notion error body (`code`, `message`) using the SDK's `APIErrorCode` values as a string-literal union, replacing the inline `{ message?: string }`.
- Enable `skipLibCheck` in `tsconfig.json`: the SDK's declaration files reference Node's `http` types, which this browser-targeted project deliberately does not load.
- Keep the transport exactly as it is: native `fetch`, the same URL, headers, and `Notion-Version: 2022-06-28`.
- Update the README's "Layout"/build notes to state that the SDK is used for types only.

## Capabilities

### New Capabilities

None. This is a compile-time type-safety change; no behavior changes.

### Modified Capabilities

None. The change sets `skip_specs: true` in its `.openspec.yaml`.

## Impact

- **Code**: `src/notion.ts` (types on `buildPagePayload` and `logSession`), `tsconfig.json` (`skipLibCheck`), `package.json` / `package-lock.json` (new dev dependency), `README.md`.
- **Dependencies**: new dev dependency `@notionhq/client`. The shipped extension still has zero runtime dependencies; `dist/` must contain no SDK code.
- **Build**: unchanged. Still plain `tsc` plus `scripts/copy-static.mjs`; no bundler.
- **Users**: none. Permissions, request payload, API version, notifications and error messages stay identical.
