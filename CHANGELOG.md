# Changelog

## Unreleased

## v2.0.0-12

Standalone conversion between Yjs and ProseMirror through the binding's own
transformer pipeline (replacing the helpers that bypassed it), a configurable
empty-state check, and two binding fixes: document attributes, and marks the
schema cannot hold.

### 💥 Breaking changes

#### Converting without a binding: `ynodeToPmnode` / `pmnodeToDelta`

`pmToFragment`, `fragmentToPm`, `deltaAttributionToFormat` and the
module-level `fragmentToTr` are removed: they bypassed (or hand-copied parts
of) the binding's transformer pipeline. The pipeline is now exported as
`defaultTransformer`, and two conversions map through it without a binding:

- `ynodeToPmnode(ynode, schema, { renderer, transformer, attributedNodes })`
  renders a Y node the way a bound view renders it. Documents in the
  `y-prosemirror` 1.x representation are flattened, and with a `renderer`,
  attribution becomes `y-attributed-*` marks. The Y content must fit the
  schema: as in the binding, invalid descendants are dropped, while a `ynode`
  that does not fit the schema itself throws.
- `pmnodeToDelta(pmnode, { transformer })` returns the delta the binding would
  write to Y for a ProseMirror node. Write it with
  `ynode.applyDelta(pmnodeToDelta(pmnode), origin, { renderer })`. Only for
  documents rendered without a renderer: the transformer swallows the
  attribution projection (`y-attributed-*` marks, `--attributed` variants),
  so a suggestion-rendered document would be written as plain content
  (pending deletions as live text, suggested insertions as accepted).

If the sync plugin is configured with `mapAttributionToMark` or custom
`transformers`, pass the same values to
`defaultTransformer({ mapAttributionToMark, transformers })` and hand the
result to both functions as `transformer`.

`defaultAttributionConf` is removed as well; build the same conf with
`attributionMapperToConf(defaultMapAttributionToMark)`.

Migrating integration code (e.g. BlockNote's `@blocknote/core/y`):

| Before | After |
| --- | --- |
| `pmToFragment(pmDoc, fragment, { renderer })` | `fragment.applyDelta(pmnodeToDelta(pmDoc), null, { renderer })` |
| `fragmentToPm(ytype, tr)` | `ynodeToPmnode(ytype, schema)` |
| `deltaToPNode(ytype.toDeltaDeep(), schema, null)` | `ynodeToPmnode(ytype, schema)` |
| `deltaAttributionToFormat(ytype.toDeltaDeep({ renderer }), mapper)`, then `deltaToPSteps(tr, delta.diff(nodeToDelta(tr.doc, undefined, true), rendered))` | `const rendered = ynodeToPmnode(ytype, schema, { renderer, transformer: defaultTransformer({ mapAttributionToMark }) })`, then `deltaToPSteps(tr, delta.diff(nodeToDelta(tr.doc, undefined, true), nodeToDelta(rendered, undefined, true)))` |

#### Dependencies

- `prosemirror-transform` is now a peer dependency (`^1.8.0`, the release
  that added doc-attribute steps); the binding imports it directly and only
  declared it as a devDependency before.

### ✨ `isInitialContent` - configure the empty-state check

`syncPlugin({ isInitialContent })` takes a predicate `(doc) => boolean` over the
ProseMirror document that decides whether it is the integrator's *initial*
(empty) state — the state that must not be written into an empty ytype at bind
time. Return `true` to arm the initial-content gate for the current document,
`false` to let the normal bind-time behavior apply. Omit the option to keep the
default check (the document's fingerprint equals the schema's `createAndFill()`
default).

The predicate is only consulted while the ytype has no children. It is also
accepted directly by `ProsemirrorRdt`, is stored on the plugin state (the
binding is rebuilt when it changes), and is re-consulted on every pull while
the gate holds — so a starter document that is re-created with a different
fingerprint (changed attributes, a rebuilt skeleton) still stays out of Y,
while the first real edit opens the gate and seeds the ytype as before.

Contributed in [#277](https://github.com/yjs/y-prosemirror/pull/277).

### 🐛 Fixes

- Attributes of the document node (ProseMirror doc attributes, e.g. set with
  `tr.setDocAttribute`) sync from Y into the view. Setting one threw in
  `deltaToPSteps` (a node-attribute step at position -1), and the
  whole-document fallback did not carry doc attributes either. So binding a
  view dropped the stored value and wrote the schema default back into Y, and
  two bound peers kept overwriting each other's value in an endless update
  loop. The whole-document fallback (initial-content gate, unfittable steps)
  now sets the doc attributes too.
- Content from Y carrying a mark the schema cannot hold no longer breaks the
  view. A format with no matching mark in the schema threw from `schema.mark`
  (the editor never bound, and a remote change adding one threw out of
  `ytype.applyDelta`); a remote change clearing one reached
  `tr.removeMark(from, to, undefined)`, which removes every mark in the range,
  and the fix then deleted those marks from Y. A mark the parent does not
  allow (e.g. `strong` in a `code_block` with `marks: ''`) slipped into
  pre-built nodes and left the view with a schema-invalid document. Such marks
  are now dropped where the content is built, with one `console.warn` per
  schema and mark; the view renders the content without them. As with any
  schema normalization, the fix then writes the removal into Y.

### 📝 Documentation and demos

- The README documents `@y/prosemirror`: the `syncPlugin` +
  `configureYProsemirror` setup, cursors, undo, and the conversion utilities
  above. The stable 1.x API stays documented in the
  [v1.3.7 README](https://github.com/yjs/y-prosemirror/tree/v1.3.7#readme).
- The demos depend on `@y/y` `^14.0.0-rc.26` and `lib0` `^1.0.0-rc.32` (their
  installs had fallen behind). Known issue: `yhub-blocknote-demo` does not
  build until the BlockNote preview build it installs (PR 2739) moves off
  `pmToFragment` / `deltaAttributionToFormat` (see the migration table above).

## v2.0.0-11

### ✨ Additions

- `yUndoPlugin` can switch to another `Y.UndoManager`: dispatch
  `tr.setMeta(yUndoPluginKey, { undoManager })`. An `UndoManager` covers a
  single `Y.Doc`, so an editor that is re-bound to a different document (a
  suggestion document, a historical version) needs one manager per document.
  Re-registering the plugin is not an alternative: changing the plugin array
  recreates every plugin view, which tears down the sync binding.

### 🧪 Demos

- `yhub-tiptap-demo` runs on a schema hardened for suggestion mode and version
  diffs (relaxed content expressions, attribution marks admitted on every node
  type, 0 audit findings where a stock `StarterKit` + tables schema has 10),
  guards for third-party plugins that repair the document from
  `appendTransaction` (`fixTables`, `TrailingNode`, autolink), a diagnostics
  panel (schema audit, live `doc.check()`, `onInternalError`), and one
  `UndoManager` per bound document. Its README lists manual checks.

## v2.0.0-10

### 🐛 Fixes

- Repeated Backspace in suggestion mode now strikes one character per
  keystroke ([#242](https://github.com/yjs/y-prosemirror/issues/242)).
  A delete in suggestion mode keeps its content: the Y side turns it into a
  pending delete and hands the content back as a fix, which the binding
  re-inserts at the caret. ProseMirror maps a caret across an insertion at its
  own position to the right, so the caret ended up behind the struck-through
  character and every further Backspace hit content that was already
  pending-deleted - a write Yjs reverts - and the user could delete only a
  single character. The sync plugin now appends a caret correction to the fix
  dispatch of a backward deletion, re-mapping the caret with a left bias so it
  stays where the local delete left it (`src/suggestion-caret.js`). Forward
  delete (`Delete`) keeps the right bias, so it keeps advancing past the
  struck-through content as before, and remote changes are unaffected. The sync
  engine itself is unchanged.

## v2.0.0-9

Published as 2.0.0-9; the release commit was titled 2.0.0-8. Covers everything
since v2.0.0-4 (2.0.0-5 to 2.0.0-8 shipped these notes while they were still
"Unreleased").

This release rebuilds the sync engine on lib0's RDT/binding architecture, tracks
the breaking `AttributionManager → Renderer` rename in Yjs v14, adds several
extension points (custom transformers, `customCompare`, overlapping marks,
attributed attributes), replaces the positions API with view-based converters,
and loads documents written by `y-prosemirror` 1.x.

### 💥 Breaking changes

#### AttributionManager → Renderer

Yjs v14 renamed the *AttributionManager* concept to **Renderer**
(`@y/y@14.0.0-rc.19`). y-prosemirror follows the rename across its whole API:

| Old | New |
| --- | --- |
| `configureYProsemirror({ attributionManager })` | `configureYProsemirror({ renderer })` |
| `ySyncPluginKey.getState(state).attributionManager` | `.renderer` |
| `$syncPluginState.attributionManager` (`Y.$attributionManager`) | `$syncPluginState.renderer` (`Y.$renderer`) |
| `pmToFragment(node, fragment, { attributionManager })` | `pmToFragment(node, fragment, { renderer })` |
| positions API trailing arg `am: Y.AbstractAttributionManager` | `renderer: Y.AbstractRenderer` (positional, so call sites keep working) |

The accept/reject commands (`acceptChanges`, `rejectChanges`,
`acceptAllChanges`, `rejectAllChanges` - names unchanged) now gate on
`pluginState.renderer instanceof Y.DiffRenderer` (was `Y.DiffAttributionManager`).

Integrator code that constructs managers directly must use the renamed
`@y/y` exports - the old names were removed, no aliases kept:

- `createAttributionManagerFromDiff(prevDoc, nextDoc, { attrs })` → `createDiffRenderer(...)` (same options shape)
- `createAttributionManagerFromSnapshots(...)` → `createSnapshotRenderer(...)`
- `DiffAttributionManager` / `SnapshotAttributionManager` / `TwosetAttributionManager` / `AbstractAttributionManager` → `DiffRenderer` / `SnapshotRenderer` / `TwosetRenderer` / `AbstractRenderer`
- `noAttributionsManager` → `baseRenderer`, which is now a **deprecated alias for `null`** - "no renderer" is represented by `null` everywhere; pass `null` or omit the option.

Yjs also moved the renderer argument into an options object on the delta APIs:
`ytype.toDeltaDeep({ renderer })`, `ytype.toDelta({ renderer, ... })`,
`event.getDelta({ renderer, deep })`, and
`ytype.applyDelta(d, origin, { renderer })` (which now returns a lib0-RDT
*fix* delta for the parts it had to revert).

#### Positions API

The state-based converters are gone; every app-facing converter now takes the
`EditorView`, maps through the live binding transformer, and returns `null`
instead of throwing when a position cannot be anchored or resolved (see the
README section "Positions").

| Removed | Use instead |
| --- | --- |
| `absolutePositionToRelativePosition(resolvedPos, type, renderer?)` | `resolvedPositionToRelativePosition(view, resolvedPos)` → `Y.RelativePosition \| null` |
| `relativePositionToAbsolutePosition(rpos, type, pmDoc, renderer?)` | `relativePositionToResolvedPosition(view, rpos)` → `ResolvedPos \| null` |
| `relativePositionStore(resolvedPos, type, renderer?)` (restore threw) | `relativePositionStore(view, resolvedPos)` → `null \| ((view) => ResolvedPos \| null)` |
| `relativePositionStoreMapping(type)` with `captureMapping(doc, renderer, clear)` / `restoreMapping(type, pmDoc, renderer)` | `relativePositionStoreMapping()` with `captureMapping(state, clear?)` / `restoreMapping(state)` (still throws on restore: ProseMirror's `Mappable` has no null channel) |

New: the batched `resolvedPositionsToRelativePositions(view, [...])` /
`relativePositionsToResolvedPositions(view, [...])` (one Y resolution and one
transformer pass for many positions), and the view-less delta layer
`resolvedPositionToDeltaPosition(resolvedPos)` /
`deltaPositionToResolvedPosition(pmDoc, pos)` for server-side use together with
yjs's `createRelativePositionFromDeltaPosition` /
`createDeltaPositionFromRelativePosition`. A relative position that points into
a deleted *node* resolves to `null` rather than to a clamped position (a deleted
character whose parents survive still resolves to the deletion gap).

Because mapping runs through the binding transformer, positions are correct
inside paragraphs stored in the old `y-prosemirror` representation (cursors,
undo bookmarks, stored anchors), which they were not before.

#### Plugin state and defaults

- `ySyncPluginKey.getState(state)` gained `binding`, the live lib0 RDT binding
  (`null` while paused). `binding.t` is the data ⇄ view transformer the cursor
  plugin maps positions through; `usableTransformer(pluginState)` returns it
  only when it belongs to the state's current ytype and renderer.
- `ytype` is a `Y.Node` (`Y.$nodeAny`), following `@y/y`'s unified node type.
- "No renderer" is canonically `null`: the plugin state no longer coerces a
  missing renderer to `Y.baseRenderer`, and `pmToFragment` / `fragmentToTr`
  default to `renderer: null`.
- `ProsemirrorRdt.pull(prevDoc?)` takes the previous document (the sync plugin
  passes it from its `update` hook) and walks the change incrementally.

#### Removed internals

Module-level exports that were never part of the package root but reachable
through deep imports of `src/sync-utils.js` were deleted together with the
step-translation experiment they served: `nodesToDelta`, `docDiffToDelta`,
`trToDelta`, `stepToDelta`, `pmToDeltaPath`, `deltaPathToPm`,
`deltaModifyNodeAt`.

#### Custom transformers see the flattened document

The built-in `inlineAnonymousNodes` stage (see "Loading documents written by
y-prosemirror 1.x" below) runs before the `transformers` option, so custom
transformers now see old-representation text containers already spliced into
their parents.

#### Console warnings at bind time

When a renderer is configured, the sync plugin audits the schema once and
warns (`console.warn`, once per schema) when it declares none of the
`y-attributed-*` marks, or lists the node types that do not allow them. A
view-side change that removes one of the render-only attribution formats logs
once per format key when it is swallowed (see "Read-only attribution
projection" below). There is no opt-out; fix the schema or do not configure a
renderer. The repo's own demo schema had to switch `code_block` from
`marks: ''` to the attribution whitelist.

#### Dependencies

- `@y/y` moved from `peerDependencies` to `dependencies`: `^14.0.0-rc.26`.
- `lib0` bumped to `^1.0.0-rc.32` (was `^1.0.0-rc.13` at v2.0.0-4).
- `npm run dist` builds with TypeScript 6 (`tsconfig.json` dropped `baseUrl`).
- Remaining peers unchanged: `@y/protocols`, `prosemirror-model`, `prosemirror-state`, `prosemirror-view`.
- New devDependencies used only by the tests: `y-prosemirror@1.3.7`
  (aliased as `y-prosemirror-v1`), `yjs@13` and `y-protocols`.

### ✨ The new RDT binding

The sync plugin no longer runs a render/diff/reconcile loop. Both sides of the
binding are now modeled as lib0 **RDTs** ("replicated data types",
`lib0/delta/rdt`) and connected with `bind()` through a transformer pipeline
(see the new [ARCHITECTURE.md](./ARCHITECTURE.md)):

```
YSyncRdt  ⇄  pipe( renderedAttributions,        ⇄  ProsemirrorRdt
(Y side)         inlineAnonymousNodes,             (view side)
                 ...opts.transformers,
                 attributionToFormat,
                 swallowFormats )
```

Each RDT emits `'delta'` events and accepts foreign changes via
`applyDelta(delta, origin)`, which may return a **fix** - a follow-up change the
RDT applied to satisfy its own invariants (e.g. the renderer attributing a
suggestion-mode insert, or ProseMirror's schema normalization). The binding
propagates fixes back and forth until both sides settle.

- **New root exports:** `YSyncRdt` (wraps the ytype) and `ProsemirrorRdt`
  (wraps the `EditorView`) - the building blocks of the binding, usable
  standalone.
- **Performance:** in steady state the Y side does **zero full re-renders**.
  It consumes Yjs's native change deltas (identical on every peer) and the
  maintained `ytype.delta` cache; a local write's fix is a diff of two
  already-materialized deltas, and that diff is O(change): `expected` is a
  structure-sharing `clone` of the cache and `actual` is the live cache, so
  memoized fingerprints let the diff skip every untouched subtree instead of
  two deep clones and a cold re-hash of the whole document (fixes
  [#248](https://github.com/yjs/y-prosemirror/issues/248) "slow syncing":
  on the Y side a keystroke on a 4000-paragraph nested document drops from
  about 140 ms to 0.2 ms, on a flat one to about 5 ms, both measured within
  v2 before and after the change). The cache's fingerprints are warmed once at
  bind so the first keystroke is as cheap as every later one. Only the
  *uncertain window* (writes issued mid-transaction/mid-cleanup, or app code
  wrapping a binding dispatch in its own `ydoc.transact()`) falls back to
  full-render diffing until the transaction queue drains.
- **Attribution stability across peers:** attribution is resolved from the
  rendered state (internal, stateless `renderedAttributions` stage) instead of
  a stateful overlay, eliminating a class of cross-peer attribution-mark drift
  under diff-pairing ambiguity.
- The `y-attributed-*` marks are now an explicitly **read-only projection** in
  ProseMirror: local edits to them are reverted by a corrective transaction and
  the Y side re-attributes through its renderer (see CAVEATS.md).
- `configureYProsemirror` no longer builds replacement content into its own
  transaction; the dispatched meta makes the plugin (re)create the binding,
  whose initial sync hydrates the view synchronously. The plugin also rebinds
  when `attributionMapper`, `attributedNodes`, or `customCompare` change (not
  just `ytype`/`renderer`).

#### Outlook: towards a very performant binding

The current architecture is *iteration 2* of a staged plan:

1. **Done - Y side incremental:** steady-state changes are native Yjs deltas
   applied against the maintained delta cache; no `toDeltaDeep` renders, and
   since #248 a local write's fix is computed in O(change) through a
   structure-sharing clone of the cache and memoized fingerprints.
2. **Done - view side incremental:** `ProsemirrorRdt` no longer rebuilds and
   diffs the full document on every pull. Canonical snapshots are memoized per
   PM node (`nodeToDeltaCached`; unchanged subtrees are reference-shared as
   frozen deltas), and `pull` derives the change from a reference-walk over
   the before/after documents (`pmDocDiff`), falling back to a full
   `delta.diff` of the memoized snapshots whenever the previous document is
   unknown. We walk before/after states instead of translating transaction
   steps (a step's effect can exceed what it describes - fitting,
   `ReplaceAroundStep`). Measured on a 2000-paragraph document, a keystroke's
   view-side pull drops from the ~100ms class to well under a millisecond in
   steady state (~10ms on the fallback path); `applyDelta` drops similarly
   (structure-sharing `clone` + memoized snapshots instead of two deep clones
   and a cold diff). Note the observable API change: the children of canonical
   `nodeToDelta(n, undefined, true)` results are now frozen shared cache
   entries (the root stays a mutable builder).
3. **Eventually - native bind:** `YType` natively implements the RDT interface
   since `@y/y@14.0.0-rc.21` (`ytype.delta` cache, `'delta'` events with
   origins, `applyDelta` fixes). `YSyncRdt` remains only a thin wrapper adding
   fix computation and origin filtering; each duty is documented in
   `src/rdt/y-sync.js` together with the upstream change that would remove it.
   Once those land, the ytype can be bound directly and the wrapper disappears.

### ✨ Loading documents written by y-prosemirror 1.x

Documents written by the old binding (`y-prosemirror` 1.x on Yjs 13) load in
the new binding and can be edited further. That is the compatibility we
promise; `tests/v1-compat.test.js` exercises it against the real
`y-prosemirror@1.3.7` and `yjs@13` packages (fixtures, a fuzz over random
documents, editing, undo, stored relative positions, remote cursors).

- **Representation.** The old binding stored inline text as a nested `Y.Text`
  (an anonymous, `name === null` child in Yjs v14); the new binding stores it
  as inline text inside the parent type. The built-in `inlineAnonymousNodes`
  pipeline stage (`src/transformers/inline-anonymous-nodes.js`) flattens
  anonymous containers at every depth for rendering, so old documents render
  identically. Edits strictly inside a flattened container are routed back
  into the nested type (the old representation is preserved), newly inserted
  nodes are written flat, and mixed documents load fine. `fragmentToPm`
  applies the same flattening.
- **Positions.** Relative positions created by the old binding resolve to the
  same ProseMirror position in the new one, and a remote cursor published by an
  old client renders at the right place.
- **One-time normalizations.** The first bind of an old document rewrites two
  things once: overlapping marks are re-keyed (the old binding hashed the key
  suffix with sha256, we use a faster Rabin fingerprint), and node attributes
  holding `null` are stored explicitly (the old binding omitted them). A
  document without those constructs binds without any write.
- **Not supported.** The old binding cannot decode inline text stored flat: an
  old client that receives content written by the new binding throws in its
  render, or deletes the node where it catches the error. Old and new clients
  must therefore not collaborate on one document. The stored representation is
  not migrated eagerly.

The API changed with the rewrite. The old exports and their replacements:

| `y-prosemirror` 1.x | `@y/prosemirror` |
| --- | --- |
| `ySyncPlugin(yXmlFragment, { colors, colorMapping, permanentUserData, onFirstRender, mapping })` | `syncPlugin(opts)` in the plugin list, then `configureYProsemirror({ ytype, renderer })(state, dispatch)` to bind. Snapshot rendering, `ychange` colors and the mapping are gone; attribution through a renderer replaces them. |
| `initProseMirrorDoc(fragment, schema)` | Not needed: `configureYProsemirror` hydrates the view synchronously from the ytype, which is always the source of truth (see CAVEATS.md "Initial content"). |
| `prosemirrorToYDoc`, `prosemirrorJSONToYDoc`, `prosemirrorToYXmlFragment`, `prosemirrorJSONToYXmlFragment` | `pmToFragment(node, ytype, { renderer })`; build the node with `schema.nodeFromJSON` first for JSON input. |
| `yDocToProsemirror`, `yDocToProsemirrorJSON`, `yXmlFragmentToProsemirror`, `yXmlFragmentToProsemirrorJSON`, `yXmlFragmentToProseMirrorRootNode`, `yXmlFragmentToProseMirrorFragment` | `fragmentToPm(ytype, tr)` (call `.toJSON()` on the result for JSON). |
| `absolutePositionToRelativePosition(pos, type, mapping)` | `resolvedPositionToRelativePosition(view, view.state.doc.resolve(pos))` |
| `relativePositionToAbsolutePosition(ydoc, type, rpos, mapping)` | `relativePositionToResolvedPosition(view, rpos)` (a `ResolvedPos` or `null`) |
| `getRelativeSelection(binding, state)` | `resolvedPositionsToRelativePositions(view, [sel.$anchor, sel.$head])` |
| `yUndoPlugin({ protectedNodes, trackedOrigins, undoManager })` | `yUndoPlugin(undoManager)` with your own `new Y.UndoManager(ytype, opts)`; the sync plugin's origin is tracked automatically. |
| `yCursorPlugin(awareness, opts, cursorStateField)` | `yCursorPlugin(awareness, { ...opts, cursorStateField })`; the `getSelection` option was removed and `resolveLocalCursorState` added. |
| `yCursorPluginKey` (`'yjs-cursor'`) | Same export; the key string is now `'y-cursor'`. |
| `ySyncPluginKey.getState(state)` (`type`, `doc`, `binding`, `snapshot`, …) | `{ ytype, renderer, attributionMapper, attributedNodes, customCompare, binding }` |
| `ProsemirrorBinding`, `updateYFragment`, `isVisible`, `setMeta`, `defaultProtectedNodes`, `defaultDeleteFilter`, `defaultAwarenessStateFilter` | Removed. `YSyncRdt` and `ProsemirrorRdt` are the building blocks now. |
| `undo`, `redo`, `undoCommand`, `redoCommand`, `ySyncPluginKey`, `yUndoPluginKey`, `defaultCursorBuilder`, `defaultSelectionBuilder` | Unchanged. |

### ✨ Custom transformers

`syncPlugin` accepts a new `transformers` option: an array of
`$d => Template` factories (see `lib0/delta/transformer`) slotted into the
pipeline between attribution resolution and mark rendering, in data→view order:

```js
import * as dt from 'lib0/delta/transformer'

syncPlugin({
  transformers: [
    // e.g. rename an attribute between the Y document and the view
    $d => dt.renameAttrs($d, { src: 'url' })
  ]
})
```

Custom transformers see changes in canonical document space (attributed
node-name variants and render-only attrs don't exist at this level), with the
complete accumulated attribution present on every attribution-bearing op.

Related new exports: `attributionMapperToConf(mapper)` adapts a legacy
`(format, attribution) => format` mapper (the `mapAttributionToMark` option) to
lib0's `attributionToFormat` conf form, and `defaultAttributionConf` is the
default mapper in conf form. Existing `mapAttributionToMark` mappers keep
working unchanged.

### ✨ Overlapping marks ([#259](https://github.com/yjs/y-prosemirror/issues/259))

ProseMirror mark types that don't exclude themselves (`excludes: ''`, e.g. a
`comment` mark) can now overlap on the same text range and sync correctly. Each
overlapping mark instance is stored under a content-hashed key
`` `${markName}--${hash}` `` in the Y format map; the suffix is stripped on the
way back to ProseMirror.

- New export `yattr2markname(attrName)` recovers the ProseMirror mark name from
  a (possibly hashed) Y format key.
- `--<8 base64 chars>` is now a reserved mark-name suffix (see CAVEATS.md).
- The reserved `y-attributed-*` attribution marks are never hashed, even if a
  schema declares them as overlapping.

### ✨ customCompare - configure the diffing boundary

`syncPlugin({ customCompare })` takes a predicate `(a, b) => boolean` over raw
`lib0/delta` nodes (each exposing `.name`, `.attrs`, `.children`) that decides
whether the differ pairs two nodes (diff in place via `modify`) or replaces the
subtree wholesale (delete + insert). It is forwarded to `lib0/delta.diff` as
its `compare` option and applied recursively; the default remains name-only
pairing. Example: make a `blockContainer` pair only when its first child type
also matches, so changing the first child replaces the whole container.

Note: with the RDT binding, steady-state Y→view changes are native deltas that
are never re-paired, so `customCompare` applies to fixes, uncertain-window
emissions, view-side pulls, and the initial sync.

### ✨ Attributed attributes

A suggested *attribute* change (a heading level, a checkbox) now renders. A
fourth reserved mark, `y-attributed-attrs`, carries the attribution of a node's
attributes as a node-level mark with a single `changes` attr holding
`{ <attrName>: payload }`:

```js
'y-attributed-attrs': {
  attrs: { changes: { default: null } },
  toDOM (mark) { /* render mark.attrs.changes */ }
}
```

- It is opt-in through the schema: without the mark declared, attribute
  attribution is dropped as before.
- Unlike the other three marks it must keep the **default** `excludes`, so a
  re-render replaces the mark instead of stacking instances.
- New export `defaultMapAttrAttribution(attribution)` produces the default
  payload (`{ userIds, timestamp }`); a custom `mapAttributionToMark` may take
  control by emitting the `y-attributed-attrs` key. `deltaAttributionToFormat`
  gained a third parameter for the attribute mapper.
- Attribute changes on the root type have no parent to carry the mark and are
  not rendered.

The demos and `tests/complexSchema.js` declare the mark; see ATTRIBUTION.md.

### ✨ Positions

A new README section "Positions" explains the three representations
(ProseMirror positions, `lib0/delta/position` tree paths, `Y.RelativePosition`),
recommends relative positions for anything that outlives a transaction, and
shows the view-based converters, the position store, and why deleted content
resolves to `null`. See the breaking-changes entry above for the API.

### ✨ Read-only attribution projection: swallowFormats and the schema audit

The `y-attributed-*` marks are presentation only. A new final pipeline stage,
`swallowFormats` (`src/transformers/swallow-formats.js`, exported together with
`defaultSwallowedFormats`), gates them on the view→data path: a view-side
*addition* is dropped and corrected away in the view, a view-side *removal* is
dropped and not re-asserted (a mark the schema cannot hold would otherwise loop
forever), with one warning per format key. `ProsemirrorRdt.pull` restores the
projection on retained content from the previous snapshot. The bind-time schema
audit (see "Console warnings at bind time") tells you up front which node types
would drop the marks. CAVEATS.md "The `y-attributed-*` projection is read-only
in ProseMirror" describes the three ways the projection gets edited and what
happens in each case.

### ✨ Diff placement hints ([#243](https://github.com/yjs/y-prosemirror/issues/243))

Within a run of identical characters, deleting any one of them yields the same
document, and an unhinted diff placed the edit at the end of the run, so a
backspaced character rendered its delete suggestion far from where the user
typed. `ProsemirrorRdt.pull` now passes the cursor as a placement hint into the
incremental diff (`pmDocDiff(prev, next, compare, hint)`); a wrong hint only
shifts placement, never correctness. `resolvedPositionToDeltaPosition` moved to
`src/sync-utils.js` and is re-exported unchanged.

### ⚡ Performance

Measured in node with jsdom (medians). The first table compares three
bindings on the same ProseMirror document: `y-prosemirror@1.3.7` on yjs 13, this release on
a document it wrote itself, and this release bound to the document v1 wrote
(the representation existing documents have, rendered through the compat
stage). `bind` constructs a bound editor on the existing document, `local` is a
one-character insert in the middle of the document including the write into Y,
`remote` applies that keystroke's update to a second document with its own
bound editor including the re-render. Every configuration converged.

| shape    | paragraphs   | v1 bind   | v2 bind   | v2-on-v1 bind   | v1 local   | v2 local   | v2-on-v1 local   | v1 remote   | v2 remote   | v2-on-v1 remote   | converged   |
| -------- | -----------: | --------: | --------: | --------------: | ---------: | ---------: | ---------------: | ----------: | ----------: | ----------------: | ----------- |
| flat     |          250 |        22 |        46 |              25 |       0.44 |       1.44 |             1.18 |        0.38 |        1.39 |              1.09 | true        |
| flat     |         1000 |        23 |        68 |              73 |       0.51 |       2.05 |             2.11 |        0.55 |        2.95 |              2.92 | true        |
| flat     |         4000 |        72 |       311 |             361 |       1.19 |       6.45 |             6.88 |        1.70 |       20.48 |             22.53 | true        |
| nested   |          250 |         6 |        19 |              24 |       0.22 |       0.59 |             0.57 |        0.12 |        0.52 |              0.46 | true        |
| nested   |         1000 |        13 |        64 |              78 |       0.20 |       0.54 |             0.63 |        0.13 |        0.47 |              0.50 | true        |
| nested   |         4000 |        65 |       274 |             367 |       0.25 |       0.62 |             0.58 |        0.16 |        0.51 |              0.48 | true        |

Medians in ms over 15 keystrokes after 3 warm-ups, node v26.7.0, 13th Gen Intel(R) Core(TM) i7-1370P, linux. `v2-on-v1` is
this release bound to the document v1 wrote.

The old binding is cheaper per keystroke in every configuration, and cheaper
to bind: its keystroke path is an identity walk over its node mapping, while
this release routes every change through the delta pipeline (transformers,
fingerprints, fix computation), which costs a constant per change plus, on
flat documents, a walk over the top-level siblings. On nested documents the
cost stays at about half a millisecond per keystroke regardless of size; on a
flat 4000-paragraph document a remote keystroke costs about 20 ms, the
remaining known cost of the view-side apply path (see the outlook above).
Loading a document written by the old binding costs the same as loading one
written by this release.

The second table measures this release in three collaboration shapes: `plain`
(two editors on two Y.Docs exchanging updates), `suggest` (the editor types in
suggestion mode through a `DiffRenderer`, the peer views the suggestions) and
`review` (the peer first makes pending suggestions, one per fifty paragraphs,
then the editor who sees them types into the base document). `keystroke` is the
round trip until every peer has rendered the change, split into the `editor`
part (pull, Y write, renderer bridge, update exchange) and the `peers` part
(the peers' bindings applying the change); `enter` splits a paragraph.

| scenario   | shape    | paragraphs   | bind   | keystroke   | editor   | peers   | max     | enter   | converged   |
| ---------- | -------- | -----------: | -----: | ----------: | -------: | ------: | ------: | ------: | ----------- |
| plain      | flat     |          250 |    114 |        3.11 |     2.84 |    0.25 |    9.00 |    3.45 | true        |
| plain      | flat     |         1000 |    188 |        5.74 |     5.41 |    0.32 |    9.30 |    6.66 | true        |
| plain      | flat     |         4000 |    635 |       30.80 |    30.15 |    0.74 |   36.54 |   32.84 | true        |
| plain      | nested   |          250 |     48 |        1.25 |     1.12 |    0.12 |    1.50 |    1.41 | true        |
| plain      | nested   |         1000 |    154 |        1.34 |     1.21 |    0.12 |    1.81 |    1.41 | true        |
| plain      | nested   |         4000 |    671 |        1.54 |     1.42 |    0.12 |    1.69 |    1.73 | true        |
| suggest    | flat     |          250 |     39 |        3.37 |     3.21 |    0.17 |    6.52 |    6.19 | true        |
| suggest    | flat     |         1000 |    166 |        9.27 |     8.94 |    0.29 |   10.77 |   13.86 | true        |
| suggest    | flat     |         4000 |    567 |       52.69 |    51.94 |    0.65 |   75.26 |   73.60 | true        |
| suggest    | nested   |          250 |     42 |        1.69 |     1.61 |    0.09 |    2.00 |    2.60 | true        |
| suggest    | nested   |         1000 |    144 |        1.66 |     1.58 |    0.09 |    2.48 |    2.33 | true        |
| suggest    | nested   |         4000 |    604 |        3.28 |     3.12 |    0.15 |   33.27 |    3.34 | true        |
| review     | flat     |          250 |     37 |        5.14 |     4.77 |    0.35 |   10.01 |    3.27 | true        |
| review     | flat     |         1000 |    155 |        7.18 |     6.46 |    0.57 |    8.65 |    7.79 | true        |
| review     | flat     |         4000 |    617 |       32.57 |    30.80 |    1.98 |   35.21 |   43.54 | true        |
| review     | nested   |          250 |     38 |        2.11 |     2.01 |    0.12 |    6.22 |    1.39 | true        |
| review     | nested   |         1000 |    160 |        1.30 |     1.20 |    0.10 |    1.38 |    1.43 | true        |
| review     | nested   |         4000 |    658 |        1.57 |     1.46 |    0.11 |    1.81 |    1.55 | true        |

Medians in ms over 15 keystrokes and 5 splits after 3 warm-ups each,
node v26.7.0, 13th Gen Intel(R) Core(TM) i7-1370P, linux. `bind` sets up the whole session (every editor, renderer and doc
sync) on the existing document. Suggestion mode adds the renderer bridge to
the editor's share; the peers' bindings stay below a millisecond except on
flat 4000-paragraph documents.

The per-iteration numbers quoted in "The new RDT binding" above (about 140 ms
to 0.2 ms on the Y side, the ~100 ms class to under a millisecond on the view
side) compare v2 before and after those optimizations; the tables here compare
the released bindings.

### ✨ Other additions

- `pmToFragment` and `fragmentToPm` are now exported from the package root.
- More root exports: `nodeToDelta`, `nodeToDeltaCached`, `deltaToPNode`,
  `deltaToPSteps`, `deltaAttributionToFormat`, `defaultMapAttrAttribution`,
  `usableTransformer`.
- The `--yprosemirror-debug` conf (`lib0/environment`) cross-checks every
  incremental view-side pull against the full snapshot diff and throws on
  divergence (test rigs only).
- New docs: [ARCHITECTURE.md](./ARCHITECTURE.md) (binding internals), rewritten
  [ATTRIBUTION.md](./ATTRIBUTION.md) (pipeline-based attribution flow, four
  marks), and new [CAVEATS.md](./CAVEATS.md) sections (read-only attribution
  projection, editing suggestion-deleted content, transaction discipline around
  the binding, schema mismatches in suggestion mode, compatibility with older
  y-prosemirror).

### 🐛 Fixes

- Schema-invalid nodes produced by concurrent edits (e.g. both paragraphs of
  a `block+` blockquote deleted by two peers) are dropped at construction and
  deleted from Y on every peer, the way the v1 binding handled them, instead
  of being filled with per-peer schema fillers
  ([#258](https://github.com/yjs/y-prosemirror/issues/258)). The document
  node is still filled. A pending-deleted node (suggestion mode) that lost its
  required content is rendered as-is until the deletion is resolved; see
  "Schema mismatches in suggestion mode" in CAVEATS.md.
- Fixed an infinite fix loop when a pending-deleted container (suggestion
  mode) had its content deleted for real in the base document.
- The Y-side RDT now delivers the difference between its mid-transaction
  render and the settled cache to the view when the uncertain window closes.
  Previously a view-originated delete written during another transaction's
  cleanup could leave the view without a node the Y side kept rendering, and
  the next positional change then hit the wrong node.
- Fixed an infinite reconcile loop (eventually a stack overflow inside
  `lib0/delta.diff`): attribute-level attribution is now stripped when
  rendering deltas to ProseMirror, so the PM↔Y diff reaches an empty fixpoint.
- Attribution marks are excluded from overlapping-mark hashing, preventing
  attribution formatting from leaking into the Y document.
- Via `@y/y@14.0.0-rc.23`: suggestion-mode cache-drift fixes, attribution
  clearing when accepting changes, and correct rendering of insertions into
  suggestion-deleted children.
- An error thrown while computing a fix (a malformed foreign change positioned
  against content the view never held) no longer escapes into Yjs's event
  delivery, which starved later observers and left the view state stale. Both
  RDTs report it through `onInternalError` instead: code 0 is a failed Y-side
  write, 1 a failed Y-side fix diff, 2 a failed view-side reconcile diff.
- The attribution projection converges between peers again: with lib0's
  format-aware diff (`^1.0.0-rc.30`), incidental mark damage on a neighbouring
  text run no longer leaves one peer with stale `y-attributed-*` marks.
- The cursor plugin never publishes a half-mapped selection (an unresolvable
  endpoint clears the cursor), and a mapping failure while rendering remote
  cursors is logged and skipped instead of failing the dispatch.
- `acceptChanges` / `rejectChanges` return `false` when the selection cannot be
  anchored in the Y document instead of calling the renderer with a fabricated
  position.
- Rendering a format key whose mark the schema does not declare is skipped
  instead of throwing from `tr.removeNodeMark`.
- `fragmentToPm` renders documents in the old `y-prosemirror` representation
  (it threw on the nested text containers).

### ⚠️ Behavioral notes (see CAVEATS.md)

- Modifications of suggestion-deleted content (e.g. formatting a
  suggestion-deleted paragraph) are reverted by design instead of becoming
  format-suggestions; text inserts/deletes at those positions still work.
- Wrapping binding-driven ProseMirror dispatches in your own `ydoc.transact()`
  is supported but degrades the fast path to full-render diffing for the
  duration of the transaction.
- Do not write to `ytype.doc` synchronously from inside a binding-initiated
  dispatch - defer such writes to a microtask.

### 🧪 Demos

- All demos (`demo/`, `yhub-demo/`, `yhub-tiptap-demo/`, `blocknote-demo/`,
  `yhub-blocknote-demo/`) were updated to the current `@y/y` / `lib0`
  prereleases and migrated to the Renderer API
  (`Y.createDiffRenderer(ydoc, suggestionDoc, { attributions: Y.createContentMap() })`
  + `configureYProsemirror({ renderer })`; version diffs render through
  `Y.createAttributionsRenderer`).
- The yhub demos moved to the versioned yhub endpoints (`/api/ws/v1/`,
  `/api/activity/v1/`, `/api/changeset/v1/`, `/api/rollback/v1/`) and their
  response shapes, and filter transient content (inserted and deleted inside
  the same window) when rendering changesets.
- Every demo declares `y-attributed-attrs` and admits the attribution marks on
  every node type (the tiptap demo extends each restricted node's `markSet`
  after editor construction), as the new bind-time audit requires.
- Known issue: `yhub-blocknote-demo` doesn't build until the pinned BlockNote
  `pkg.pr.new` build (PR 2739) is regenerated against the `@y/y` Renderer API -
  the published build still imports the removed `createAttributionManagerFromDiff`.

## v2.0.0-4 and earlier

See the [git history](https://github.com/yjs/y-prosemirror/commits/master) and
[GitHub releases](https://github.com/yjs/y-prosemirror/releases).
