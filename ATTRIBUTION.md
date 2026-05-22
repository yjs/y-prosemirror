# Attribution

`y-prosemirror` can surface "who changed what" as ProseMirror marks on the rendered document. We call this **attributed content**. The same mechanism powers two different features:

- **Suggestion mode.** A user proposes a change; the binding records the change in the Y document but marks it visually as a suggestion (inserted text, deleted text, or a formatting change) until somebody accepts or rejects it.
- **Version diffs and activity items.** Given two snapshots of the same Y document, the binding can render the difference in the live editor, showing who inserted, deleted, or reformatted each span. The visual treatment is the same as suggestion mode; only the attribution source differs (a diff between snapshots rather than ongoing edits).

In both cases the underlying primitive is the same. Every op produced by Yjs's `toDeltaDeep(am)` carries an optional `attribution` field that records which users authored that op and when. The binding turns those attributions into ProseMirror marks. The mark schema is yours to define; the names and the translation function are part of `y-prosemirror`'s contract.

## How attribution flows through the binding

The Y to PM direction looks like this:

```
Y.Doc + AttributionManager
   |
   |  ytype.toDeltaDeep(am)
   v
delta where each op may carry an `attribution` field
   |
   |  deltaAttributionToFormat(delta, mapAttributionToMark)
   v
delta whose `format` carries y-attributed-* marks
   |
   |  deltaToPSteps + view.dispatch
   v
EditorView
```

The PM to Y direction is the same pipeline with one extra step: we strip `y-attributed-*` from the reconcile diff before applying it to the Y type. Attribution marks are presentation, not content. They must never round-trip into the CRDT, otherwise the next render would double-apply them.

This bidirectional flow has an important consequence: the marks the binding writes into PM (in the Y to PM pass) must match what the binding reads back from PM (in the PM to Y pass), otherwise the diff is non-empty on every pass and the sync plugin fires reconcile transactions in a loop. See "Stability is mandatory" below.

## Setting up the schema

There are three canonical attribution mark names. **They are not configurable.** Internals reference them by name (notably the strip step described above), so renaming them in your schema will silently break suggestion mode.

- `y-attributed-insert`
- `y-attributed-delete`
- `y-attributed-format`

The schema must satisfy four constraints.

### 1. Use exactly these mark names

A custom `mapAttributionToMark` may shape the attribute payload however it likes (per-user color, suggestion id, timestamp, and so on), but the mark **type names** must match the canonical names above. If your editor ships its own suggestion mark family (BlockNote's `SuggestionMarks` is a real-world example), name them to match these canonical names rather than introducing new ones with a different name.

### 2. Allow the marks on every node where attribution can land

Attribution marks may be applied anywhere that attributable inline content can appear, which is essentially every node that contains text. If a node's `marks` content expression does not admit the `y-attributed-*` marks, the binding will throw `RangeError: Invalid content for node ...` from `tr.addMark` or `tr.addNodeMark` the moment a user makes the first edit in suggestion mode.

ProseMirror's `gatherMarks` resolves a node's `marks` spec by mark name first and only falls back to mark-group matching when no mark by that name exists. If your schema declares for example `marks: "insertion modification deletion"` and your editor *also* defines marks literally named `insertion` / `deletion` / `modification`, the group-based fallback never fires and putting the `y-attributed-*` marks into `group: "insertion"` does not help. The safest fix is to add the marks **by name** to every affected node's `marks` content expression, or to extend the node types' `markSet` programmatically after editor construction.

### 3. The three marks must not exclude each other

A single op can carry multiple attribution kinds simultaneously:

- Inserted text whose formatting was also suggested gets both `y-attributed-insert` and `y-attributed-format`.
- A span that one user inserted and another user then deleted gets both `y-attributed-insert` and `y-attributed-delete`.
- A formatted span whose attribute was changed twice gets one `y-attributed-format` with multiple authors in its payload.

The schema must allow these combinations. In ProseMirror, marks default to excluding marks in their own group, so two marks of the same `group` will kick each other out and marks of the same name always replace each other. To make the three attribution marks fully composable, set `excludes: ''` on each of them. The empty string overrides the default and explicitly says "excludes nothing":

```js
const marks = {
  'y-attributed-insert': {
    attrs: { /* see below */ },
    excludes: '',
    parseDOM: [{ tag: 'y-ins' }],
    toDOM: () => ['y-ins', 0]
  },
  'y-attributed-delete': {
    attrs: { /* see below */ },
    excludes: '',
    parseDOM: [{ tag: 'y-del' }],
    toDOM: () => ['y-del', 0]
  },
  'y-attributed-format': {
    attrs: { /* see below */ },
    excludes: '',
    parseDOM: [{ tag: 'y-fmt' }],
    toDOM: () => ['y-fmt', 0]
  }
}
```

Do **not** write:

```js
// WRONG: each attribution mark kicks the others out
'y-attributed-insert': {
  excludes: 'y-attributed-insert y-attributed-delete y-attributed-format',
  ...
}
```

That schema cannot represent insert + format on the same span. The rendered overlay will silently lose information about one of the two attribution kinds, and the diff comparing it against the freshly rendered AM delta will keep producing reconcile churn.

### 4. The declared `attrs` must cover everything the mapper emits

`schema.mark(name, value)` normalizes `value` against the declared `attrs`. **Undeclared keys in `value` are silently dropped** (see `computeAttrs` in `prosemirror-model/src/schema.ts`). If the schema declares `{ id, "user-color" }` and the mapper emits `{ userIds, timestamp }`, the resulting Mark instance has `{ id: null, "user-color": null }` and the `userIds` / `timestamp` payload is gone. This breaks stability (next section) and makes the rendered overlay generic instead of per-user.

## Writing a custom `mapAttributionToMark`

The sync plugin accepts a `mapAttributionToMark` option:

```js
syncPlugin({ mapAttributionToMark })
```

The default implementation, `defaultMapAttributionToMark` from `src/sync-utils.js`, emits:

```js
'y-attributed-insert': { userIds: attribution.insert,   timestamp: attribution.insertAt ?? null }
'y-attributed-delete': { userIds: attribution.delete,   timestamp: attribution.deleteAt ?? null }
'y-attributed-format': {
  userIds:        array.unique(Object.values(attribution.format).flat()),
  userIdsByAttr:  attribution.format,
  timestamp:      attribution.formatAt ?? null
}
```

The signature is `(format, attribution) => format`, where:

- `format` is the existing PM format object for the op (with any non-attribution marks the op already carries).
- `attribution` is `{ insert?: string[], delete?: string[], format?: Record<string, string[]>, insertAt?: number, deleteAt?: number, formatAt?: number }`.

The mapper sets one or more of the three `y-attributed-*` keys on `format` and returns it. **Do not** write absent attribution kinds as explicit `null`. The diff layer naturally produces a format-clear when comparing pcontent (mark present) against desiredPM (key absent). Writing explicit `null`s changes the delta op fingerprint and prevents the diff from matching ops by content, which causes spurious text-node splits.

### Stability is mandatory

The sync plugin runs this loop after every transaction:

1. `desiredPM = deltaAttributionToFormat(ytype.toDeltaDeep(am), mapAttributionToMark)` is the target state.
2. `pcontent = nodeToDelta(view.state.doc)` is the current PM state. `marksToFormattingAttributes` reads each mark's `attrs` straight back into a format object.
3. `diff(pcontent, desiredPM)` is the reconcile diff. If non-empty, the plugin dispatches a transaction to apply it.

If `mapAttributionToMark(format, attribution)` ever produces output whose serialization differs from the `mark.attrs` we read back from PM for the same attribution, the diff is non-empty on every pass. The sync plugin will dispatch a reconcile transaction on every edit, forever. In benign cases (when the resulting `tr.addMark` is a PM-level no-op because the on-doc mark already normalizes equal) the loop bounds at one phantom dispatch per keystroke, but it is still wasted work; other plugins that observe transactions will see the phantoms. In worse cases the reconcile dispatch produces real steps and the loop never terminates.

Concretely, "stable" means:

- **The schema declares every attribute the mapper emits.** Otherwise PM drops them on the way in and the readback never matches the mapper output.
- **The same `(format, attribution)` input produces the same output, byte for byte.** No `Date.now()` inside the mapper, no random ids, no allocation-dependent ordering. If you need an id per suggestion, derive it deterministically from the attribution (for example a hash of `attribution.insert.join(',') + attribution.insertAt`).
- **Every declared attribute gets an explicit value.** If the schema declares `id: { default: null }` and the mapper omits the key, the readback will produce `id: null` but the mapper output will not, and the format objects will not be deep-equal.

A useful sanity check during development: after creating a suggestion, dump `view.state.doc.nodeAt(pos).marks` and compare against the format object the mapper produced for that op. They must be deep-equal. If they are not, the binding will loop on the next transaction.

### Example: per-user-color attribution

Schema:

```js
const userColorAttrs = {
  userIds:   { default: [] },
  userColor: { default: null }
}

const marks = {
  'y-attributed-insert': { attrs: userColorAttrs, excludes: '', parseDOM: [{ tag: 'y-ins' }], toDOM: () => ['y-ins', 0] },
  'y-attributed-delete': { attrs: userColorAttrs, excludes: '', parseDOM: [{ tag: 'y-del' }], toDOM: () => ['y-del', 0] },
  'y-attributed-format': { attrs: userColorAttrs, excludes: '', parseDOM: [{ tag: 'y-fmt' }], toDOM: () => ['y-fmt', 0] }
  // ...the rest of your marks
}
```

Mapper:

```js
const colorForUser = (userId) => userColors[hash(userId) % userColors.length]

const mapAttributionToMark = (format, attribution) => {
  const out = { ...format }
  if (attribution.insert) {
    out['y-attributed-insert'] = {
      userIds:   attribution.insert,
      userColor: colorForUser(attribution.insert[0])
    }
  }
  if (attribution.delete) {
    out['y-attributed-delete'] = {
      userIds:   attribution.delete,
      userColor: colorForUser(attribution.delete[0])
    }
  }
  if (attribution.format) {
    const userIds = [...new Set(Object.values(attribution.format).flat())]
    out['y-attributed-format'] = {
      userIds,
      userColor: colorForUser(userIds[0])
    }
  }
  return out
}
```

Note that:

- All three marks share `userColorAttrs`, so the mapper can emit the same shape regardless of which kinds are present.
- The mapper sets each present kind independently and leaves absent kinds untouched on `format`. A span that is both inserted and reformatted ends up with both marks.
- `colorForUser` is deterministic in the user id, so two calls of the mapper with the same `attribution` produce byte-equal output.

## Pitfalls and debugging

- **Schema attribute mismatch.** The most common failure mode. Symptom: suggestions render but the per-user color (or whatever attr you encoded) is always the default. The sync plugin fires an extra transaction on every keystroke. Fix: align the mapper output with the declared schema `attrs`, ensuring every declared attribute is also emitted by the mapper.
- **Mark exclusion.** Symptom: applying a suggestion that touches an already-suggested span silently drops the previous mark, or the visual treatment for "inserted and reformatted" never appears. Fix: `excludes: ''` on all three marks.
- **Mark not allowed on the target node.** Symptom: `RangeError: Invalid content for node ...` from `tr.addMark` or `tr.addNodeMark` on the first suggestion-mode edit. Fix: add the three marks by name to every node's `marks` content expression, or extend the node types' `markSet` programmatically.
- **Non-canonical mark names.** Symptom: attribution marks accumulate on the document and eventually leak into the CRDT, because the PM to Y strip step does not recognize them. Fix: rename your marks to the canonical names.
- **Non-deterministic mapper.** Symptom: sync plugin fires a never-ending stream of reconcile transactions, even with no user input. Fix: remove timestamps, random ids, and any other non-deterministic value from the mapper. Derive everything from the `attribution` argument.

See also [`CAVEATS.md`](./CAVEATS.md) ("Attribution mark names are fixed", "Schema mismatches in suggestion mode") for related design tradeoffs and the underlying schema-resolution gotcha.
