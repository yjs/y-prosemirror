# Changelog

## Unreleased (since v2.0.0-4)

This release rebuilds the sync engine on lib0's RDT/binding architecture, tracks
the breaking `AttributionManager → Renderer` rename in Yjs v14, and adds several
extension points (custom transformers, `customCompare`, overlapping marks).

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
`acceptAllChanges`, `rejectAllChanges` — names unchanged) now gate on
`pluginState.renderer instanceof Y.DiffRenderer` (was `Y.DiffAttributionManager`).

Integrator code that constructs managers directly must use the renamed
`@y/y` exports — the old names were removed, no aliases kept:

- `createAttributionManagerFromDiff(prevDoc, nextDoc, { attrs })` → `createDiffRenderer(...)` (same options shape)
- `createAttributionManagerFromSnapshots(...)` → `createSnapshotRenderer(...)`
- `DiffAttributionManager` / `SnapshotAttributionManager` / `TwosetAttributionManager` / `AbstractAttributionManager` → `DiffRenderer` / `SnapshotRenderer` / `TwosetRenderer` / `AbstractRenderer`
- `noAttributionsManager` → `baseRenderer`, which is now a **deprecated alias for `null`** — "no renderer" is represented by `null` everywhere; pass `null` or omit the option.

Yjs also moved the renderer argument into an options object on the delta APIs:
`ytype.toDeltaDeep({ renderer })`, `ytype.toDelta({ renderer, ... })`,
`event.getDelta({ renderer, deep })`, and
`ytype.applyDelta(d, origin, { renderer })` (which now returns a lib0-RDT
*fix* delta for the parts it had to revert).

#### Dependencies

- `@y/y` moved from `peerDependencies` to `dependencies`: `^14.0.0-rc.23`.
- `lib0` bumped to `^1.0.0-rc.22` (was `^1.0.0-rc.13` at v2.0.0-4).
- Remaining peers unchanged: `@y/protocols`, `prosemirror-model`, `prosemirror-state`, `prosemirror-view`.

### ✨ The new RDT binding

The sync plugin no longer runs a render/diff/reconcile loop. Both sides of the
binding are now modeled as lib0 **RDTs** ("replicated data types",
`lib0/delta/rdt`) and connected with `bind()` through a transformer pipeline
(see the new [ARCHITECTURE.md](./ARCHITECTURE.md)):

```
YSyncRdt  ⇄  pipe( renderedAttributions,        ⇄  ProsemirrorRdt
(Y side)         ...opts.transformers,             (view side)
                 attributionToFormat )
```

Each RDT emits `'delta'` events and accepts foreign changes via
`applyDelta(delta, origin)`, which may return a **fix** — a follow-up change the
RDT applied to satisfy its own invariants (e.g. the renderer attributing a
suggestion-mode insert, or ProseMirror's schema normalization). The binding
propagates fixes back and forth until both sides settle.

- **New root exports:** `YSyncRdt` (wraps the ytype) and `ProsemirrorRdt`
  (wraps the `EditorView`) — the building blocks of the binding, usable
  standalone.
- **Performance:** in steady state the Y side does **zero full re-renders**.
  It consumes Yjs's native change deltas (identical on every peer) and the
  maintained `ytype.delta` cache; a local write's fix is a diff of two
  already-materialized deltas. Only the *uncertain window* (writes issued
  mid-transaction/mid-cleanup, or app code wrapping a binding dispatch in its
  own `ydoc.transact()`) falls back to full-render diffing until the
  transaction queue drains.
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

The current architecture is *iteration 1* of a staged plan:

1. **Done — Y side incremental:** steady-state changes are native Yjs deltas
   applied against the maintained delta cache; no `toDeltaDeep` renders.
2. **Next — view side incremental:** `ProsemirrorRdt` still snapshots the doc
   and diffs on every pull. A later iteration will translate ProseMirror
   transaction steps into deltas directly, making both directions incremental.
3. **Eventually — native bind:** `YType` natively implements the RDT interface
   since `@y/y@14.0.0-rc.21` (`ytype.delta` cache, `'delta'` events with
   origins, `applyDelta` fixes). `YSyncRdt` remains only a thin wrapper adding
   fix computation and origin filtering; each duty is documented in
   `src/rdt/y-sync.js` together with the upstream change that would remove it.
   Once those land, the ytype can be bound directly and the wrapper disappears.

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

### ✨ customCompare — configure the diffing boundary

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

### ✨ Other additions

- `pmToFragment` and `fragmentToPm` are now exported from the package root.
- New docs: [ARCHITECTURE.md](./ARCHITECTURE.md) (binding internals), rewritten
  [ATTRIBUTION.md](./ATTRIBUTION.md) (pipeline-based attribution flow), and new
  [CAVEATS.md](./CAVEATS.md) sections (read-only attribution projection,
  editing suggestion-deleted content, transaction discipline around the
  binding).

### 🐛 Fixes

- Fixed an infinite reconcile loop (eventually a stack overflow inside
  `lib0/delta.diff`): attribute-level attribution is now stripped when
  rendering deltas to ProseMirror, so the PM↔Y diff reaches an empty fixpoint.
- Attribution marks are excluded from overlapping-mark hashing, preventing
  attribution formatting from leaking into the Y document.
- Via `@y/y@14.0.0-rc.23`: suggestion-mode cache-drift fixes, attribution
  clearing when accepting changes, and correct rendering of insertions into
  suggestion-deleted children.

### ⚠️ Behavioral notes (see CAVEATS.md)

- Modifications of suggestion-deleted content (e.g. formatting a
  suggestion-deleted paragraph) are reverted by design instead of becoming
  format-suggestions; text inserts/deletes at those positions still work.
- Wrapping binding-driven ProseMirror dispatches in your own `ydoc.transact()`
  is supported but degrades the fast path to full-render diffing for the
  duration of the transaction.
- Do not write to `ytype.doc` synchronously from inside a binding-initiated
  dispatch — defer such writes to a microtask.

### 🧪 Demos

- All demos (`demo/`, `yhub-demo/`, `yhub-tiptap-demo/`, `blocknote-demo/`,
  `yhub-blocknote-demo/`) were updated to `@y/y@^14.0.0-rc.23` /
  `lib0@^1.0.0-rc.22` and migrated to the Renderer API
  (`Y.createDiffRenderer(...)` + `configureYProsemirror({ renderer })`).
- Known issue: `yhub-blocknote-demo` doesn't build until the pinned BlockNote
  `pkg.pr.new` build (PR 2739) is regenerated against the `@y/y` Renderer API —
  the published build still imports the removed `createAttributionManagerFromDiff`.

## v2.0.0-4 and earlier

See the [git history](https://github.com/yjs/y-prosemirror/commits/master) and
[GitHub releases](https://github.com/yjs/y-prosemirror/releases).
