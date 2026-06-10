# Attribution

`y-prosemirror` can surface "who changed what" as ProseMirror decorations on the rendered document. We call this **attributed content**. The same mechanism powers two different features:

- **Suggestion mode.** A user proposes a change; the binding records the change in the Y document but renders it visually as a suggestion (inserted text, deleted text, or a formatting change) until somebody accepts or rejects it.
- **Version diffs and activity items.** Given two snapshots of the same Y document, the binding can render the difference in the live editor, showing who inserted, deleted, or reformatted each span.

In both cases the underlying primitive is the same. Every op produced by Yjs's `toDeltaDeep(am)` carries an optional `attribution` field that records which users authored that op and when. The binding turns those attributions into ProseMirror decorations via `ySuggestionDecorationPlugin`.

## How attribution flows through the binding

The Y to PM direction looks like this:

```
Y.Doc + AttributionManager
   |
   |  ytype.toDeltaDeep(am)        — attributed delta
   v
   |  ydeltaToDiffSet(delta, opts)  — extract diffs from attribution
   v
DiffSet (array of Diff objects with positions in the clean PM doc)
   |
   |  buildDiffDecorationSet(doc, diffs, schema, opts)
   v
DecorationSet (rendered by ySuggestionDecorationPlugin)
```

The PM document always contains **clean** content — no attribution marks, no deleted text inline. The sync plugin reads `ytype.toDeltaDeep()` (without the AM) to produce the clean PM doc. Attribution is rendered purely as decorations overlaid on the clean content.

This separation means:

- **No schema requirements.** Consumers do not need to define attribution mark types. The schema is simpler.
- **No stability concerns.** Since attribution data never enters the PM document, there is no risk of reconcile loops from mismatched mark attrs.
- **No mark exclusion issues.** Decorations compose freely — a span can be simultaneously inserted, deleted, and reformatted without schema constraints.

## Setting up

```js
import { syncPlugin, ySuggestionDecorationPlugin, configureYProsemirror } from '@y/prosemirror'

const view = new EditorView(el, {
  state: EditorState.create({
    schema, // no attribution marks needed
    plugins: [syncPlugin(), ySuggestionDecorationPlugin()]
  })
})
configureYProsemirror({ ytype, attributionManager: am })(view.state, view.dispatch)
```

That's it. No special mark types, no `mapAttributionToMark`, no `attributedNodes` predicate.

## The DiffSet pipeline

### `ydeltaToDiffSet(delta, opts)`

Converts an attributed Y delta into a `DiffSet` — an array of `Diff` objects positioned in the clean PM document coordinate space. Each `Diff` describes one contiguous range of attributed content:

```ts
interface Diff {
  type: 'inline-insert' | 'inline-delete' | 'block-insert' | 'block-delete' |
        'inline-update' | 'block-update'
  from: number    // PM position (in the clean doc)
  to: number      // PM position (in the clean doc)
  attribution: {
    authorIds: string[]
    timestamp: number | null
  }
  // For delete diffs: the reconstructed deleted content
  content?: Fragment
  // For update diffs: the changed attributes
  attributes?: Record<string, any>
  previousAttributes?: Record<string, any>
}
```

### `buildDiffDecorationSet(doc, diffs, schema, opts)`

Converts a `DiffSet` into a ProseMirror `DecorationSet`. Each diff becomes one or more decorations:

- **Inline inserts/updates:** `Decoration.inline` with `data-diff-type` attribute and `--author-color` CSS variable.
- **Block inserts/updates:** `Decoration.node` (or fallback to inline when spanning multiple nodes).
- **Deletes:** `Decoration.widget` rendering the deleted content as a ghost element.

### `defaultMapDiffToDecorations(args)`

The default decoration mapper. Can be overridden via the `mapDiffToDecorations` option on `ySuggestionDecorationPlugin` for custom rendering.

## CSS styling

Decorations use `data-diff-type` attributes and `--author-color` CSS custom properties. Example styles:

```css
/* Inserts: highlight + underline */
[data-diff-type='inline-insert'],
[data-diff-type='block-insert'] {
  background-color: color-mix(in srgb, var(--author-color, #28a745) 22%, transparent);
  text-decoration: underline;
  text-decoration-color: var(--author-color, #28a745);
}

/* Deletions: struck through */
[data-diff-type='inline-delete'],
[data-diff-type='block-delete'] {
  background-color: color-mix(in srgb, var(--author-color, #dc3545) 14%, transparent);
  text-decoration: line-through;
  text-decoration-color: var(--author-color, #dc3545);
}

/* Updates: dashed outline */
[data-diff-type='inline-update'],
[data-diff-type='block-update'] {
  outline: 1.5px dashed var(--author-color, #ffc107);
}
```

The `--author-color` CSS custom property is set per-decoration from the attribution's author ID. Multi-author scenarios get the primary author's color.

## Accept / reject commands

```js
import { acceptChanges, rejectChanges, acceptAllChanges, rejectAllChanges } from '@y/prosemirror'

// Accept changes in a range
acceptChanges(from, to)(view.state, view.dispatch)

// Reject changes in a range
rejectChanges(from, to)(view.state, view.dispatch)

// Accept/reject all
acceptAllChanges()(view.state, view.dispatch)
rejectAllChanges()(view.state, view.dispatch)
```

These commands work through the AM API using Y.ID-addressed operations. PM positions are mapped to Y relative positions internally.

## Plugin keys

- `ySyncPluginKey` — the sync plugin state (ytype, attributionManager).
- `ySuggestionDecorationPluginKey` — the decoration set state.
- `suggestionDiffPluginKey` — the raw DiffSet state (for consumers that need programmatic access to diffs).

See also [`CAVEATS.md`](./CAVEATS.md) for related design tradeoffs.
