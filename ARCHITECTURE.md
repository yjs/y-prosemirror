# Architecture — decoration-based attribution

> **Audience:** maintainers and reviewers who want the *why* behind the
> attribution rendering design.
> For usage see [`ATTRIBUTION.md`](./ATTRIBUTION.md); for design tradeoffs and
> known limitations see [`CAVEATS.md`](./CAVEATS.md).

## What this change set out to do

`y-prosemirror` renders "who changed what" — suggestions and version diffs — on
top of a live ProseMirror editor. The attribution data itself lives in Yjs: every
op produced by `ytype.toDeltaDeep(am)` carries an optional `attribution` field
recording which users authored it and when. The open question has always been
*how that attribution reaches the screen*.

The earlier design answered that by **folding attribution into the ProseMirror
document model** as marks. This change set replaces it with the opposite answer:
**keep the document clean and render attribution as a decoration overlay.** The
goal was to remove the document-model coupling and the schema burden it imposed,
while keeping (and extending) what could actually be shown.

## The old approach: attribution as marks

In the mark-based design the read path (Y → PM) ran:

```
ytype.toDeltaDeep(am)                       attributed delta
  → deltaAttributionToFormat(delta, mapper) attribution -> PM "format" (marks)
  → diff against current PM content
  → deltaToPSteps                           apply the diff to the editor
```

`deltaAttributionToFormat` mapped each `attribution` field onto one of three
reserved mark types — `y-attributed-insert`, `y-attributed-delete`,
`y-attributed-format` — via a `mapAttributionToMark` function. The consequences
of that single decision rippled through the whole binding:

- **Deleted text physically stayed in the document.** A suggested deletion was
  rendered by *keeping* the deleted run in the PM doc and tagging it with
  `y-attributed-delete`. The document model therefore was not the content the
  user sees — it was content-plus-tombstones.
- **The schema had to declare the attribution marks.** Integrators were required
  to define all three mark types, give them the right attrs, and allow them on
  every node where attribution could land. Mark-group and exclusion rules made
  this a documented footgun.
- **A whole variant-node layer existed for block attribution.** Because marks
  cannot always express attribution on a block, a node could be re-rendered under
  a `{nodeName}--attributed` variant type. That required a reserved `--attributed`
  suffix, a `y-attributed` attr marker injected at render time, and
  `canonicalNodeName` / `attributedVariant` to map back to the canonical name on
  the way to Y. Getting the canonicalization wrong (e.g. letting the `y-attributed`
  attr persist into Y) meant the reconcile loop never converged.
- **The write path had to surgically un-mark before diffing.** Since attribution
  marks lived in the PM doc, the PM → Y direction had to strip every
  `y-attributed-*` format out (`stripAttributionFormattingFromDelta`) before
  diffing against Y — and do it without mutating shared op references, because
  `lib0/delta.diff` reuses op and nested-delta references from its inputs. A
  subtle, comment-heavy invariant guarded that.

In short, attribution was *entangled* with the content model. Every part of the
binding that touched the document — diffing, reconciling, hydration
(`fragmentToTr` / `fragmentToPm`), schema definition — had to know about
attribution and carefully route around it.

## The new approach: attribution as a decoration overlay

The document model now holds **clean content only** — no attribution marks, no
deleted text. Attribution is computed separately and painted on top as
decorations, the same way cursors and selections are.

### Two cooperating plugins

```
syncPlugin()                    bidirectional clean-content sync (PM <-> Y)
ySuggestionDecorationPlugin()   read-only attribution overlay (Y -> decorations)
```

`syncPlugin` no longer knows attribution exists. Its read path renders the clean
delta (`ytype.toDeltaDeep()` with *no* attribution manager), diffs it against the
current PM doc, and applies the difference. Its write path diffs the clean PM doc
against the clean Y content and applies the result *through* the attribution
manager (`ytype.applyDelta(diff, am)`) so that local edits are recorded as
suggestions in Yjs — but nothing about that tagging ever re-enters the PM doc.

`ySuggestionDecorationPlugin` is modeled on the cursor plugin: its own plugin
key, its own state holding a `DecorationSet`, and a `decorations` prop. It reads
the *attributed* delta (`ytype.toDeltaDeep(am)`) and rebuilds its overlay when
the sync plugin signals a change via `y-sync-transaction` meta. On local
`docChanged` transactions (before the Y write has happened) it simply maps
existing decorations by position — the authoritative rebuild occurs on the
reconcile dispatch that follows the write.

### The Y → decoration pipeline

```
ytype.toDeltaDeep(am)                                  attributed delta
  → ydeltaToDiffSet(delta, { displayedDoc, schema })   DiffSet (clean-doc positions)
  → buildDiffDecorationSet(doc, diffs, schema, opts)   DecorationSet
  → rendered by ySuggestionDecorationPlugin
```

**`ydeltaToDiffSet`** (`src/y-attribution-to-diffset.js`) is the heart of the
design. It walks the attributed delta — which still contains deleted content,
retained because the suggestion docs run with `gc: false` — and maps each
attributed span onto positions in the *clean displayed document*. Insertions and
formatting changes advance the cursor as they exist in the clean doc; deletions
do not advance it (they are zero-width, `from === to`) and instead carry a
reconstructed `Fragment` of the removed content for ghost rendering. The output
is a flat `DiffSet` of six diff kinds: `{inline,block} × {insert,delete,update}`.

Because the walk re-derives positions in the clean coordinate space rather than
trusting offsets from the delta, it must mirror ProseMirror's own position model
exactly — including that leaf block nodes (e.g. `horizontal_rule`) occupy a
single position with no separate close token. (This is precisely where a leaf
node was once over-counted by one and drifted every later position; the walk now
consults the schema's `isLeaf` to advance correctly.)

**`buildDiffDecorationSet`** (`src/diff-decorations.js`) turns each `Diff` into
decorations:

- inline insert/update → `Decoration.inline`
- block update → `Decoration.node`
- block insert → `Decoration.node` (with an inline fallback when a diff spans
  multiple nodes)
- inline/block delete → `Decoration.widget` rendering the removed `Fragment` as a
  non-editable ghost element via `DOMSerializer`

Every decoration carries its originating `diff` in the decoration spec and
exposes `data-diff-type`, `data-diff-user-id`, and a `--author-color` CSS custom
property so styling and click-to-act handlers can read the change back out. The
mapping is swappable through the `mapDiffToDecorations` option, and author
colors through `colorForAuthors`.

Accept/reject is unchanged in spirit: `acceptChanges` / `rejectChanges` (and the
`*AllChanges` variants) resolve PM positions to Yjs relative positions and call
the `DiffAttributionManager` directly. Accepting or rejecting mutates the Yjs
attribution, which changes the clean content and/or the attributed delta, which
the two plugins then reconcile and re-render.

## Why this is better than marks

1. **Zero schema requirements.** Integrators no longer define `y-attributed-*`
   mark types, set their attrs, or wrestle with mark-group allowance and
   exclusion rules. Any ProseMirror schema works as-is — which is what let the
   Tiptap and BlockNote integrations drop their bespoke attribution plumbing.

2. **The document model is pure content again.** What you serialize, copy, or
   hand to another tool is the clean document. Selection, cursor math, and
   export stop having to reason about inline tombstones for deleted text.

3. **The reconcile path got dramatically simpler.** Attribution never makes a
   round trip through the PM ↔ Y diff, so the entire un-marking layer disappears:
   `stripAttributionFormattingFromDelta` and its non-mutating-clone invariant,
   the `--attributed` variant-node mechanism with its canonicalization rules, and
   the `fragmentToTr` / `fragmentToPm` hydration helpers are all gone (~500 lines
   from `src/sync-utils.js` plus the mark machinery in `src/sync-plugin.js`).
   Convergence is now easy to reason about because the two sides only ever
   exchange clean content.

4. **Attribution kinds compose freely.** A single span can be simultaneously
   inserted, deleted, and reformatted. Marks fight with schema exclusion rules
   here; overlaid decorations simply stack.

5. **Richer rendering, not just equivalent rendering.** Deleted content is shown
   as a ghost widget — something marks could only approximate by leaving the
   deleted text in the document. Block-level attribute changes get an explicit
   badge. Arbitrary DOM is available through widget decorations, and the
   `mapDiffToDecorations` hook gives integrators full control without touching
   the sync path.

6. **Friendlier to direct manipulation.** Yjs stores clean content plus
   out-of-band attribution metadata, so humans, LLMs, and external tools editing
   the Y document directly do not need to understand an attribution-mark
   convention to produce valid edits — a stated project goal (see
   [`CAVEATS.md`](./CAVEATS.md) and [`PROJECT_GOALS.md`](./PROJECT_GOALS.md)).

## Sharp edges

- **Recompute cost.** The overlay is rebuilt by calling `ytype.toDeltaDeep(am)`
  and re-walking it on every relevant document change — O(document) per edit.
  For large documents this wants debouncing or incremental re-evaluation; today
  it is a full recompute.

- **No `previousAttributes` for block-update diffs.** The Y.js delta format
  records which keys were changed and by whom, but not the old values. Showing
  "level: 1 → 2" (rather than just "level: 2") would require AM-level support
  for storing before-values.

## Map of the code

| File | Responsibility |
| --- | --- |
| `src/sync-plugin.js` | Bidirectional **clean-content** sync (PM ↔ Y). No attribution awareness. |
| `src/suggestion-decoration-plugin.js` | `ySuggestionDecorationPlugin` — reads the attributed delta, owns the overlay's `DecorationSet`. |
| `src/y-attribution-to-diffset.js` | `ydeltaToDiffSet` — walks the attributed delta into a `DiffSet` in clean-doc coordinates. |
| `src/diff-decorations.js` | `buildDiffDecorationSet` / `defaultMapDiffToDecorations` / `renderDeletedContent` / `suggestionDiffPlugin` — `DiffSet` → decorations. |
| `src/commands.js` | `acceptChanges` / `rejectChanges` / `*AllChanges`, `configureYProsemirror`, `pauseSync`. |
| `src/sync-utils.js` | Delta ↔ PM helpers (`nodeToDelta`, `deltaToPSteps`, `deltaToPNode`, `formattingAttributesToMarks`). |
| `src/keys.js` | Plugin keys, incl. `ySuggestionDecorationPluginKey`, `suggestionDiffPluginKey`. |
