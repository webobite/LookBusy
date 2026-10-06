# Design

## Context

`src/notion.ts` has two Notion-facing pieces: `buildPagePayload`, which returns an inferred object literal, and `logSession`, which `POST`s that payload with `fetch` and, on failure, reads the error body as `{ message?: string }`. The success response body is never read. The build is plain `tsc` (`module`/`moduleResolution: NodeNext`, `verbatimModuleSyntax`, `types: ["chrome"]`), and every emitted file must load directly in Chrome with no bundler.

`@notionhq/client` (v5.27.0 at the time of writing) ships CommonJS with declarations at `build/src/index.d.ts`. It exports `CreatePageParameters` and `CreatePageResponse` as types, and `APIErrorCode` as a runtime `enum`. Its declarations import `node:http` and `http`.

A prototype compiled in a scratch project with the same compiler options confirmed:
- `import type { CreatePageParameters } from '@notionhq/client'` resolves under NodeNext and is fully erased from the emitted JS.
- The current payload (`parent.database_id`, `title`, `date`, two `select` properties) satisfies `CreatePageParameters`, and a typo such as `select: { nam: … }` is rejected.
- Without `@types/node`, `tsc` fails inside the SDK's declarations (`Cannot find name 'node:http'`). It passes with `skipLibCheck: true`.

## Goals / Non-Goals

**Goals:**
- Compile-time checking of the page-creation request body against Notion's published types.
- A typed error body that names Notion's error codes, ready for a later change to use.
- Zero bytes of SDK code in `dist/`.

**Non-Goals:**
- Changing user-visible error messages (for example, mapping `object_not_found` to "connect the integration to the database"). The typed codes make that easy, but it changes behavior and belongs in its own change.
- Reading or typing the success response body. `logSession` does not parse it today, and parsing it would add runtime work for no behavior gain.
- Moving to Notion API `2025-09-03` or data sources.
- Retrying or queueing failed logs.

## Decisions

### 1. Type-only import, native `fetch` stays
Use `import type` for every SDK symbol. Under `verbatimModuleSyntax` the compiler guarantees the import is erased, so no module resolution happens at runtime and no bundler is needed.

*Alternatives:* using the runtime SDK `Client` with esbuild, or a vendored ESM copy. Both were rejected for this change; see proposal.md, Why.

### 2. Annotate the return type of `buildPagePayload` as `CreatePageParameters`
Declaring the return type, rather than adding `satisfies` to the literal, makes the contract part of the function's signature. That's where a future caller, or a later move to the SDK's `client.pages.create`, would rely on it. Excess-property and shape errors are still reported on the literal.

*Alternative:* `satisfies CreatePageParameters`. This keeps the narrower inferred type, but nothing reads that narrower type, and the signature would no longer document the contract.

### 3. Derive the error-code type from `APIErrorCode` without importing the enum's value
`APIErrorCode` is a runtime `enum`, so a value import would pull in SDK code. Use the template-literal form, `` type NotionErrorCode = `${APIErrorCode}` ``, which turns it into a union of its string values at the type level only. Define a local `NotionErrorBody { code?: NotionErrorCode; message?: string }` in `src/notion.ts`. The runtime parsing (`res.json().catch(() => ({}))`) and the `body.message || \`Notion responded with ${status}\`` fallback stay exactly as they are.

*Alternative:* hand-writing the list of codes. It would drift from Notion's list and duplicates what the SDK already publishes.

### 4. `skipLibCheck: true` instead of `@types/node`
Adding `@types/node` and `"node"` to `types` would make Node globals (`process`, `Buffer`, Node's `setTimeout` overloads) type-check in browser and service-worker code that can't use them, which undoes part of the strictness this project relies on. `skipLibCheck` only skips checking the internals of `.d.ts` files. The project's own `.ts` sources are still checked in full, including how they use SDK and Chrome types.

*Alternative:* a local ambient `declare module 'node:http'` shim. It's brittle, and it would need updating whenever the SDK's declarations change.

### 5. Pin the exact SDK version
The SDK's types follow Notion's newest API version (`2025-09-03`), while the extension sends `Notion-Version: 2022-06-28`. The fields we use are valid in both versions today, but a future SDK release could narrow `parent` toward `data_source_id`. Install with `--save-exact` so the types only change when someone upgrades deliberately.

### 6. Keep `NOTION_VERSION` as it is and document the gap
Next to `NOTION_VERSION`, add a short comment saying that the SDK types follow a newer API version, and that only fields valid in both are used.

## Risks / Trade-offs

- [The SDK types describe `2025-09-03`, but requests go out as `2022-06-28`, so the type checker could accept a field the older API rejects.] → Only the existing four properties and the `database_id` parent are used, and all of them are valid in both versions. The comment from decision 6 records the constraint, and the version is pinned.
- [`skipLibCheck` also skips checking `@types/chrome`'s internals.] → This is standard practice. It hides only conflicts inside declaration files, never mistakes in our own code.
- [A future edit uses a value import (`import { APIErrorCode }`) and pulls SDK code into the build.] → `verbatimModuleSyntax` keeps value imports in the emitted JS, so Chrome would fail to load the worker on the bare specifier. That failure is loud, not silent. A verification task also checks `dist/` for `@notionhq` references.
- [A dev dependency only to borrow its types (~MBs in `node_modules`).] → It affects development only, nothing ships, and it's acceptable for the safety it adds.

## Migration Plan

This is a developer-only change. After pulling it, run `npm install`. Nothing changes for installed extensions. To roll back, revert the commit.
