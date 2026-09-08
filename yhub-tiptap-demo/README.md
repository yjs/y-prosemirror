# yhub + Tiptap + `@y/prosemirror`

A Tiptap 3 editor with **suggestion mode** and **versioning**, running against a
[yhub](https://github.com/yjs/yhub) backend, on a schema that has been hardened
for both.

```bash
npm install
npm run dev      # http://localhost:8000
```

> [!IMPORTANT]
> The public yhub instance enforces an origin allowlist - the dev server must be
> on **`http://localhost:8000`**. `vite.config.js` pins the port and sets
> `strictPort` so it fails loudly rather than silently moving to 8001 (which
> looks like "the activity panel is broken" and is not).
>
> Point it elsewhere with `?api=http://localhost:4400`, and pick a room with the
> URL hash. `?compare=strict` enables the optional `customCompare` (see below).

## Why this demo has its own schema

A stock `StarterKit` + tables schema does not survive this binding. Run the
audit against both and the difference is stark:

```
STOCK schema:     10 node types reject the y-attributed-* marks
                  (doc, blockquote, bulletList, orderedList, listItem,
                   codeBlock, table, tableRow, tableCell, tableHeader)
                  and `code` (excludes: '_') shadows them on inline-code spans
HARDENED schema:  0
```

Two independent problems, with two remedies that are **not** interchangeable:

- **Concurrency.** `+` cardinality means "never empty", but two individually
  valid concurrent deletes can empty a container anyway - and the only
  schema-valid resolution is to delete it on every peer. Only *relaxing* the
  content expression fixes this.
- **Attributed rendering.** A node that is a pending delete keeps being rendered
  after the base document dropped its children; it can be neither dropped (Y
  re-inserts it) nor filled (Y reverts the fill), so it is created unchecked.
  A relaxed `{name}--attributed` *variant* fixes this while leaving the schema
  users author against strict.

`src/schema.js` applies each where it pays, and documents the per-node policy in
one table. `src/guards.js` stops `fixTables` / `TrailingNode` / autolink from
"repairing" a document the binding owns. See
[`ATTRIBUTION.md`](../ATTRIBUTION.md) ("Hardening an existing editor schema") and
[`CAVEATS.md`](../CAVEATS.md) ("Editor plugins that repair the document").

## Files

| file | role |
| --- | --- |
| `src/schema.js` | the hardened schema: cardinality policy, mark whitelisting, `--attributed` variants, `attributedNodes`, optional `customCompare` |
| `src/guards.js` | neutralises document-repairing plugins while the binding owns the doc |
| `src/extensions.js` | `syncPlugin` / `yCursorPlugin` / `yUndoPlugin` as Tiptap extensions, plus the gutter decorations |
| `src/diagnostics.js` | schema-health panel, `doc.check()` indicator, error banners |
| `src/main.js` | wiring, suggestion modes, activity panel, version diffs, rollback |

## Verifying it

The header carries three indicators: **Schema** (the mark audit, plus the
checks the binding cannot make), **doc** (live `doc.check()`), and the
connection status. "Schema health" in the right column breaks the audit down per
node type. Anything the library logs, plus any internal error, is mirrored into
a banner - so a green run means something.

`window.__demo` exposes `{ editor, view, ydoc, suggestionDoc, suggestionRenderer,
undoManagers, keys, Y }` for console work.

### Scenarios

Open two tabs on the same room (there is an "Open in another tab" button).

1. **Undo/redo.** Type, then `Mod-Z` / `Mod-Shift-Z`. Changes revert in *both*
   tabs (Yjs owns history; StarterKit's `undoRedo` is off). The toolbar's ↶/↷
   grey out at the ends of the stack. Switching suggestion mode swaps the
   UndoManager - one per bound doc - and switching back restores the live
   history.
2. **Concurrent emptying.** Click **Go offline** in both tabs. Give a bullet list
   two items and a blockquote two paragraphs; in tab A delete the first of each,
   in tab B the second. Go online.
   - the **list survives as an empty `<ul>`** with an `(empty)` placeholder -
     relaxed to `listItemGroup*`
   - the **blockquote is deleted on both peers** - kept at `block+`, taking the
     cascade CAVEATS explicitly blesses as acceptable for a blockquote

   Both remedies, side by side, in one merge.
3. **A pending delete that loses its content.** In tab A choose
   Suggestions → **Edit** and delete a whole list item (struck through, gutter
   avatar). Then in tab B (Suggestions **Off**) delete that item's paragraph for
   real. Tab A now shows an empty struck-through item tagged `relaxed` - it is a
   `listItem--attributed` - and **`doc` stays green**. With the canonical
   `listItem` (`paragraph block*`) that same document is
   `Invalid content for node listItem: <>`.
4. **Code.** In Edit mode, delete text inside a code block *and* inside an
   inline `` `code` `` span. Both must render the deletion. The inline one is the
   `excludes: '_'` fix - without it `Mark.addToSet` silently refuses the
   attribution mark and `swallowFormats` eats the loss.
5. **Tables.** In Edit mode use `+Row` and `−Col`. The table must not re-shape
   itself, and no repair may reach Y: `fixTables` is suppressed whenever a
   renderer is configured, and for any binding-driven batch. It still repairs
   genuine user edits in live mode.
6. **Attribute changes.** Change a heading level in Edit mode - the block renders
   inside `<y-attr>` with a tooltip naming the changed attribute.
7. **Accept / reject.** Accept or reject each of the above. Variants flip back to
   their canonical type (`JSON.stringify(__demo.view.state.doc.toJSON())` should
   then contain neither `--attributed` nor `y-attributed`), and `doc` stays green.
8. **Versions.** Suggestions **Off**, then drag-select a range in the Activity
   panel. The editor goes read-only and renders the same treatments for the
   historical range; column-resize handles are dead (they would otherwise write
   `colwidth` into the historical doc). `✕` returns to the live editor with the
   live undo history intact. **Rollback** restores the pre-range state in both
   tabs.
9. **Negative test.** Remove one mark name from `codeBlock` in `src/schema.js`.
   The Schema chip must go red and name the node, and the library's own warning
   must appear as a banner. If it stays green, the diagnostics are not
   trustworthy and neither is anything above.
10. **Idle.** Leave the editor alone in suggestion mode: zero transactions should
    be dispatched. A climbing banner counter means a reconcile loop - typically a
    non-deterministic `attributedNodes` / `mapAttributionToMark`, or a mapper
    emitting an attr the schema does not declare.
