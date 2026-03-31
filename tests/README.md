# Tests

Run with `npm test` (uses `tests/index.node.js` as the entry point with jsdom).

## Structure

- `index.node.js` — Node.js test runner (jsdom setup + lib0/testing)
- `index.js` — Browser test runner (subset of tests)
- `helpers.js` — Shared utilities: `createPMView`, `setupTwoWaySync`, `assertDocJSON`, `createSuggestionSetup`
- `complexSchema.js` — ProseMirror schema used by delta and tr tests

## Test files

- `delta.test.js` — Core delta ↔ ProseMirror sync (insert, delete, format, wrap, split)
- `suggestions.test.js` — Suggestion mode (insertions, deletions, formatting, reconfigure)
- `tr.test.js` — _Dead_; imports non-existent `src/sync/delta-sync.js`
- `y-prosemirror.test.js` — _Dead_; imports non-existent `src/y-prosemirror.js`

## `blocknote/`

BlockNote-specific tests using a replicated BlockNote schema (no `@blocknote/core` dependency).

- `schema.js` — BlockNote-like PM schema + helpers (`bnDoc`, `mapAttributionToMark`, etc.)
- `sync.test.js` — Two-client sync: typing, block insert, split, concurrent edits, setNodeAttribute
- `suggestions.test.js` — Suggestion mode with BlockNote marks (insertion/deletion/modification)

## `../blocknote-demo/tests/`

Separate test suite that runs in a **real browser** via vitest browser mode (Playwright/Chromium). Uses the actual `@blocknote/core` `BlockNoteEditor`, unlike `blocknote/` which uses a replicated schema.

Run from the `blocknote-demo/` directory:

```
cd blocknote-demo && npm test
```
