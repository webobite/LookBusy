# Tasks

## 1. Dependency and compiler setup

- [ ] 1.1 Install the SDK as an exact-pinned dev dependency (`npm install --save-dev --save-exact @notionhq/client`, design.md decision 5); verify `package.json` lists it under `devDependencies` with no `^`/`~` range, and nothing under `dependencies`
- [ ] 1.2 Add `"skipLibCheck": true` to `tsconfig.json` without adding `@types/node` or changing `types: ["chrome"]` (design.md decision 4); verify `npm run typecheck` still passes on the unchanged sources

## 2. Typed Notion client

- [ ] 2.1 In `src/notion.ts`, add `import type { APIErrorCode, CreatePageParameters } from '@notionhq/client'` and annotate `buildPagePayload`'s return type as `CreatePageParameters` (design.md decisions 1 and 2), leaving the object literal unchanged; verify `npm run typecheck` passes, and that temporarily changing `select: { name: 'Completed' }` to `select: { nam: 'Completed' }` fails with TS2561 (then revert)
- [ ] 2.2 Add `` type NotionErrorCode = `${APIErrorCode}` `` and a local `NotionErrorBody { code?: NotionErrorCode; message?: string }`, and use it for the error body in `logSession`, in place of `{ message?: string }` (design.md decision 3). Keep the `.catch(() => ({}))`, the `body.message || \`Notion responded with ${res.status}\`` fallback and the outer `try/catch` exactly as they are. Verify `npm run typecheck` passes and `git diff src/notion.ts` shows no change to string literals, URLs, headers or control flow
- [ ] 2.3 Next to `NOTION_VERSION`, add a short comment saying that the SDK types follow a newer API version, so only fields valid in both `2022-06-28` and the SDK's version may be used (design.md decision 6); verify the comment is present and `NOTION_VERSION` is still `'2022-06-28'`
- [ ] 2.4 Update the README to say that `@notionhq/client` is a dev dependency used only for compile-time types, and that the extension still has no runtime dependencies (adjust the `src/notion.ts` line under Layout and the `npm install` note under Build); verify the README commands still run as written

## 3. Integration checks

- [ ] 3.1 Run `npm run clean && npm run build`; verify it succeeds, that `grep -r "notionhq" dist/` finds nothing, and that `dist/src/notion.js` has no `import` other than `./constants.js`
- [ ] 3.2 Load `dist/` unpacked in Chrome and finish a short interval (temporarily setting a focus duration of a few seconds is fine; revert afterwards) against a real Notion database; verify a page appears with the same Name, Date, Session Type and Status as before, and that the success notification text is unchanged
- [ ] 3.3 With a deliberately wrong Database ID, finish an interval; verify the notification still shows Notion's error message (`Not logged: …`) exactly as before the change
