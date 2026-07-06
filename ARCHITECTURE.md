# Sync architecture

`@y/prosemirror` synchronizes a `Y.Type` and a ProseMirror `EditorView` by modeling both as
lib0 **RDTs** ("replicated data types", see `lib0/delta/rdt`) and connecting them with
`bind()` through a **transformer pipeline**:

```
YSyncRdt  ⇄  pipe( renderedAttributions,        ⇄  ProsemirrorRdt
(Y side)         ...opts.transformers,             (view side)
                 attributionToFormat )
```

An RDT emits a `'delta'` event (with an origin) whenever its state changes and accepts
foreign changes via `applyDelta(delta, origin)`, which may return a **fix** — a follow-up
change the RDT applied to itself to satisfy its own invariants. The binding routes every
change through the pipeline (`applyA` = data→view, left to right; `applyB` = view→data,
right to left), deep-clones each change before the transformer touches it, and propagates
fixes back and forth until both sides settle.

## Data → view (`applyA`)

1. A Y transaction (remote update, undo, accept/reject, …) makes `YSyncRdt` emit a change.
2. `renderedAttributions` expands each attribution-bearing op to the **complete accumulated
   attribution** at that position (resolved from the current attributed render).
3. Optional user transformers (see below).
4. `attributionToFormat` (lib0) renders the attribution dimension into the reserved
   `y-attributed-insert` / `y-attributed-delete` / `y-attributed-format` format keys, using
   handlers derived from the `mapAttributionToMark` option.
5. `ProsemirrorRdt.applyDelta` converts the delta to ProseMirror steps (`deltaToPSteps`) and
   dispatches one transaction (`y-sync-transaction` meta, `addToHistory: false`). Whatever
   ProseMirror normalizes (createAndFill, content-expression coercion, dropped unknown
   marks) is returned as a fix and written back to Y.

## View → data (`applyB`)

1. The sync plugin's `view().update` hook (after a committed dispatch — never from
   speculative `state.apply` calls) runs `ProsemirrorRdt.pull()`, which snapshots the doc
   (`nodeToDelta`, canonicalized) and emits `delta.diff(previousSnapshot, snapshot)`.
2. `attributionToFormat` strips every `y-attributed-*` format key — the view never
   attributes; attribution marks are presentation, not content.
3. Optional user transformers (reverse direction).
4. `renderedAttributions` passes through.
5. `YSyncRdt.applyDelta` writes the change into the ytype inside
   `doc.transact(fn, pluginOrigin)` (so the undo plugin can track it) and returns as a fix
   the difference between "old state + change" and what the ytype actually renders — e.g.
   the renderer attributing a suggestion-mode insert, or dropping formatting applied to
   suggestion-deleted content. The fix flows back through `applyA` and lands in the view as
   `y-attributed-*` marks.

The **initial sync** when a ytype is (re)configured is the same machinery: the binding
projects the ytype's state through the pipeline and applies the difference to the view —
the ytype fully overwrites the ProseMirror content. When the difference cannot be expressed
as raw steps (e.g. deleting the only block of a `doc{block+}`), `ProsemirrorRdt` falls back
to a whole-document `tr.replaceWith`, which uses ProseMirror's fitting algorithm.

## Custom transformers

`syncPlugin` accepts a `transformers` option: an array of `$d => Template` factories (see
`lib0/delta/transformer`) slotted **between** `renderedAttributions` and
`attributionToFormat`, in data→view order:

```js
import * as dt from 'lib0/delta/transformer'

syncPlugin({
  transformers: [
    // e.g. rename an attribute between the Y document and the view
    $d => dt.renameAttrs($d, { src: 'url' })
  ]
})
```

Custom transformers see changes in canonical document space (attributed node-name variants
and render-only attrs do not exist at this level), with the complete accumulated
attribution present on every attribution-bearing op. Note that attribution arrives in
*instruction form*: a cleared key survives as a `null` leaf (e.g.
`{ format: { bold: null } }`) so downstream stages can clear derived state.

## Why the two thin wrappers exist

`YType` natively implements the RDT interface — the `'delta'` channel (with transaction
origins, delivered through suggestion-deleted parents, and covering renderer `'change'`
overlay updates), `applyDelta(d, origin, opts)`, and the maintained `ytype.delta` cache.
`YSyncRdt` only adds what the native surface cannot express yet — each duty is documented
in `src/rdt/y-sync.js` together with the upstream change that would remove it:

1. **Fix computation** — the native emission of the wrapper's own write is swallowed by the
   binding's echo mutex, and the native `applyDelta` return value covers only the
   deleted-but-rendered revert class — so renderer enrichment (suggestion-mode attribution,
   content kept by a suggestion-delete) must be returned as the `applyDelta` fix:
   `diff(expected, actual)`. The write transacts with the sync plugin instance as origin so
   the undo plugin can track it and renderer cascades inside the same transaction share it.
2. **Origin filtering** — emissions of the wrapper's own transactions can fire outside the
   `applyDelta` window (a write issued during another transaction's cleanup is queued by
   Yjs and its event fires after the binding's echo mutex was released); they are
   recognized by origin and skipped.

Since the upstream cache-drift fixes landed (yjs `testRdt*CacheDrift` pins), the wrapper
**consumes the native surface directly in steady state** (iteration 2): foreign changes
are forwarded as the native `'delta'` payloads, the RDT state is the maintained
`ytype.delta` cache (patched by Yjs right before each emission, so it is exactly the
post-change state every consumer needs), and a local write's fix is a diff of two
already-materialized deltas — no full re-renders. The legacy self-healing behavior
(full-render override, diff-based emissions) survives only inside the **uncertain
window**: a write issued mid-transaction/mid-cleanup defers its cache patch and renderer
attribution, so the wrapper serves a fresh render until the doc's cleanup queue drains
(this also absorbs the merged-transaction case — app code wrapping a view dispatch in its
own `doc.transact`). See the `src/rdt/y-sync.js` module doc for the full mode semantics.

`ProsemirrorRdt` wraps the `EditorView`; its change detection is driven by the sync
plugin's `update` hook rather than self-observation (iteration 1 uses full-snapshot diffs;
a later iteration can translate transaction steps into smaller deltas directly).

## Why `renderedAttributions` instead of lib0's `fullAttributions`

lib0's `fullAttributions` fills the same pipeline role but is *stateful*: it accumulates
attribution in an overlay by tracking the op stream it is fed. Parts of the Y side's
change stream are diffs between renders (fixes; uncertain-window emissions), and a diff
between two states is not unique — with several equal-named nodes of similar content,
`diff` may pair node instances differently on different peers ("Diffing ambiguity" in
CAVEATS.md). Content converges regardless of the pairing, but an overlay that tracks ops
accumulates attribution at whichever node the local pairing chose — peers' overlays drift
apart, and with them the attribution marks their views render. (Steady-state emissions
are nowadays the native change deltas — identical on every peer — which shrinks the
ambiguity class but does not remove it.) `renderedAttributions`
(src/transformers/rendered-attributions.js) is stateless instead: it resolves the full
attribution from the Y side's current render — the truth every peer agrees on. No other
lib0 transformer needed local modification;
`attributionToFormat` is used as-is.

## Known caveats of the RDT machinery

- **The `y-attributed-*` projection is read-only in ProseMirror** — see CAVEATS.md.
- **`customCompare` applies everywhere**: the two RDTs forward it to every diff they
  compute (live pulls and fixes), and the binding forwards it to the initial-state sync
  diff via `bind()`'s (experimental) `diffCompare` option.
- **The binding's `propagate` loop is unbounded.** Fixes must converge; both RDTs are
  written so that a fix is computed against the state that produced it (pinned `expected`
  baselines, self-healing render diffs). An upstream `maxIterations` safety option for
  `bind()` would turn a hypothetical non-convergence bug from a UI freeze into a loud error.
- **Edits into suggestion-deleted child nodes are reverted, not applied.** `YType.applyDelta`
  addresses deleted-but-rendered nodes renderer-aware and reverts modifications into them,
  returning the inverse as its fix (the wrapper's own render-diff fix subsumes it). The
  binding stays convergent; the user-visible behavior is that e.g. formatting a
  suggestion-deleted paragraph is undone rather than becoming a format-suggestion.
