# Attribution

`y-prosemirror` can surface "who changed what" as ProseMirror marks on the rendered document. We call this **attributed content**. The same mechanism powers two different features:

- **Suggestion mode.** A user proposes a change; the binding records the change in the Y document but marks it visually as a suggestion (inserted text, deleted text, or a formatting change) until somebody accepts or rejects it.
- **Version diffs and activity items.** Given two snapshots of the same Y document, the binding can render the difference in the live editor, showing who inserted, deleted, or reformatted each span. The visual treatment is the same as suggestion mode; only the attribution source differs (a diff between snapshots rather than ongoing edits).

In both cases the underlying primitive is the same. Every op produced by Yjs's `toDeltaDeep(am)` carries an optional `attribution` field that records which users authored that op and when. The binding turns those attributions into ProseMirror marks. The mark schema is yours to define; the names and the translation function are part of `y-prosemirror`'s contract.

## How attribution flows through the binding

The binding syncs the two sides through a transformer pipeline (see
[`ARCHITECTURE.md`](./ARCHITECTURE.md)). The Y to PM direction looks like this:

```
Y.Doc + Renderer  (YSyncRdt)
   |
   |  change delta - each op may carry an `attribution` field
   v
renderedAttributions            - expands to the complete accumulated attribution
   |
attributionToFormat(conf)       - conf derived from mapAttributionToMark
   v
delta whose `format` carries y-attributed-* marks
   |
   |  deltaToPSteps + view.dispatch   (ProsemirrorRdt)
   v
EditorView
```

The PM to Y direction runs the same pipeline in reverse; the `swallowFormats` stage (and `attributionToFormat` behind it) strips every `y-attributed-*` key before a change reaches the Y type. Attribution marks are presentation, not content. They must never round-trip into the CRDT, otherwise the next render would double-apply them.

This bidirectional flow has an important consequence: the marks the binding writes into PM (in the Y to PM pass) must match what the binding reads back from PM (in the PM to Y pass), otherwise every apply produces a spurious fix that has to bounce between the two sides. See "Stability is mandatory" below.

## Setting up the schema

There are four canonical attribution mark names. **They are not configurable.** Internals reference them by name (notably the strip step described above), so renaming them in your schema will silently break suggestion mode.

- `y-attributed-insert`
- `y-attributed-delete`
- `y-attributed-format`
- `y-attributed-attrs` — node-level, for suggested *attribute* changes (e.g. a heading's `level`). **Opt-in**: it is materialized only when the schema declares it. Declare it with a single attr `changes` (`{ changes: { default: null } }`), whose value is `{ <attrKey>: <payload> }` per changed attribute (`{ userIds, timestamp }` by default). Whitelist it on block containers alongside the others. Limitation: attr changes on the root type have no parent op to carry the mark and are not rendered.

The schema must satisfy three constraints.

### 1. Use exactly these mark names

A custom `mapAttributionToMark` may shape the attribute payload however it likes (per-user color, suggestion id, timestamp, and so on), but the mark **type names** must match the canonical names above. If your editor ships its own suggestion mark family (BlockNote's `SuggestionMarks` is a real-world example), name them to match these canonical names rather than introducing new ones with a different name.

### 2. Allow the marks on every node where attribution can land

Attribution marks may be applied anywhere that attributable inline content can appear, which is essentially every node that contains text. If a node's `marks` content expression does not admit the `y-attributed-*` marks, the binding will throw `RangeError: Invalid content for node ...` from `tr.addMark` or `tr.addNodeMark` the moment a user makes the first edit in suggestion mode.

ProseMirror's `gatherMarks` resolves a node's `marks` spec by mark name first and only falls back to mark-group matching when no mark by that name exists. If your schema declares for example `marks: "insertion modification deletion"` and your editor *also* defines marks literally named `insertion` / `deletion` / `modification`, the group-based fallback never fires and putting the `y-attributed-*` marks into `group: "insertion"` does not help. The safest fix is to add the marks **by name** to every affected node's `marks` content expression, or to extend the node types' `markSet` programmatically after editor construction.

### 3. The declared `attrs` must cover everything the mapper emits

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

For every change the binding applies to the view, `ProsemirrorRdt` compares the state it
expected (`old state + change`) against what the document actually contains after the
dispatch (`marksToFormattingAttributes` reads each mark's `attrs` straight back into a
format object) and reports the difference as a fix that is written back to Y. The mapper
also runs on every attribution-touching change - the `attributionToFormat` stage clears or
replaces whole mark values from the mapper's output.

If `mapAttributionToMark(format, attribution)` ever produces output whose serialization differs from the `mark.attrs` we read back from PM for the same attribution, every apply produces a spurious fix. In benign cases the fix bounces once and settles (wasted work; other plugins that observe transactions will see the phantoms). In worse cases the two sides keep correcting each other and the fix propagation never terminates.

Note on inputs: the mapper is invoked through an adapter (`attributionMapperToConf`) that
resolves the attribution to plain data form first - `null`-cleared keys from incremental
updates are dropped before the mapper sees them - so a mapper written against the
documented `attribution` shape keeps working unchanged.

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
  'y-attributed-insert': { attrs: userColorAttrs, parseDOM: [{ tag: 'y-ins' }], toDOM: () => ['y-ins', 0] },
  'y-attributed-delete': { attrs: userColorAttrs, parseDOM: [{ tag: 'y-del' }], toDOM: () => ['y-del', 0] },
  'y-attributed-format': { attrs: userColorAttrs, parseDOM: [{ tag: 'y-fmt' }], toDOM: () => ['y-fmt', 0] }
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

## Rendering attributed nodes under a variant node type

By default, attribution on a block (or leaf) node is surfaced only as a `y-attributed-*` *node mark*. Sometimes it is easier to integrate attribution into an existing schema if the attributed node also renders under a *different node type* - so that we can give it its own NodeView, content rules, or styling without touching the base node. The `attributedNodes` option does exactly that: an attributed `paragraph` can render as `paragraph--attributed`.

```js
syncPlugin({
  // (nodeName, kinds) => boolean. `kinds` is { insert?, delete?, format? }
  // reflecting which attribution kinds are present on the node.
  attributedNodes: (nodeName, kinds) => kinds.delete === true
})
```

When the predicate returns `true` for an attributed node *and* a `{nodeName}--attributed` type exists in the schema, that node renders under the variant type. The marks still determine behavior: the `y-attributed-*` marks are applied to the variant exactly as they would be to the canonical node (they carry the who/when payload and remain the single source of truth). The variant name is an additional schema hook, nothing more.

A few properties follow from this design:

- **The suffix `--attributed` is fixed and reserved.** Canonicalizing back (PM to Y) is a pure string operation, so the forward and inverse mappings can never drift apart. As a consequence, a real node type whose name literally ends in `--attributed` would be canonicalized away on the way to Y. Do not name unrelated node types with that suffix.
- **The Y document always stores the canonical name.** The variant exists only in the rendered ProseMirror document. When attribution is accepted/rejected (or otherwise clears), the node flips back to its canonical type in place.
- **The predicate must be deterministic** in `(nodeName, kinds)`, for the same reason `mapAttributionToMark` must be (see "Stability is mandatory"). A non-deterministic predicate causes an endless reconcile loop.
- **Per-kind selection, not per-kind naming.** The predicate decides *whether* a node becomes attributed; the variant name is always the single `--attributed` sibling. A node carrying several kinds (e.g. inserted and then deleted) still resolves to one `--attributed` variant; the marks encode which kinds.

### Schema contract for variant nodes

The `{nodeName}--attributed` type must be a faithful sibling of the canonical node:

- It must accept the same `content` and live in the same `group`, so it is valid everywhere the canonical node is and so an in-place type flip (`setNodeMarkup`) does not violate `content`.
- It must declare the same `attrs`, **plus one more**: the binding injects a render-only `y-attributed: true` attr on every node it renders under a variant (`deltaToPNodeOrDrop` and the in-place `setNodeMarkup` flip both set it; `nodeToDelta`'s canonicalization strips it again on the way back to Y). If the variant does not declare it, ProseMirror's `computeAttrs` silently drops it and the readback stops matching the render - the stability problem described above. Declaring it *without* a default is the better choice: `NodeType.hasRequiredAttrs()` then reports `true`, which is exactly the guard `ContentMatch.defaultType` and `ContentMatch.fillBefore` consult, so ProseMirror's auto-fill can never materialize a variant on its own.
- It must still allow the `y-attributed-*` marks (we keep emitting them). The "easier integration" win is moving that allowance off the *base* node onto the variant, not removing it.
- **The parent must be able to accept it, and that is only possible through a `group`.** ProseMirror's content-expression tokenizer splits on non-word characters (`string.split(/\s*(?=\b|\W|$)/)`), so `listItem--attributed` tokenizes as `listItem`, `-`, `-`, `attributed` and a content expression can never name a variant: `new Schema({ nodes: { doc: { content: 'p--attributed*' }, ... } })` throws `No node type or group 'p' found`. A variant is therefore reachable only if it shares its canonical sibling's `group` *and* the parent addresses that group. That is free where the parent already says `block*`, but a parent that names its children - `bulletList: 'listItem+'`, `table: 'tableRow+'`, `tableRow: '(tableCell | tableHeader)*'` - has to be given a group first (e.g. put `listItem` and `listItem--attributed` in `listItemGroup` and change the list to `listItemGroup*`).

If `{nodeName}--attributed` is absent from the schema, the node simply keeps its canonical name (with the marks) - the predicate is a no-op for that type. This is how we restrict the feature to "certain nodes": define variants only for the types we want.

## Hardening an existing editor schema

Third-party schemas - Tiptap's StarterKit, `prosemirror-tables`, BlockNote - are authored for single-user editing, and they encode invariants that a CRDT merge and a suggestion overlay can both violate. Hardening one is a *schema* task: the binding can only report what it is unable to represent.

There are two distinct problems, and - this is the part that is easy to get wrong - **two remedies that are not interchangeable**:

| problem | what triggers it | the only remedy |
| --- | --- | --- |
| A container with `+` cardinality is emptied by two individually valid concurrent edits, so the binding must delete it on every peer (CAVEATS.md "Schema mismatches under concurrency") | ordinary collaborative editing, no attribution involved | **relax** the content expression |
| A node that is a *pending delete* keeps being rendered after the base document dropped its children, and is created unchecked because it can be neither dropped nor filled (CAVEATS.md "Schema mismatches in suggestion mode") | suggestion mode / version diffs | **relax**, or a relaxed `--attributed` **variant** |

`attributedNodes` is consulted only for *attributed* nodes, so a variant does nothing for the first row. Relaxation fixes both, but it weakens the schema your users author against. The variant's virtue is the opposite: the relaxation lives on a node type **only the binding can produce**, so user-authored content still conforms to the strict canonical type.

### Step 1 - decide cardinality per node, not globally

Ask what the implicit deletion destroys. `yhub-tiptap-demo/src/schema.js` resolves it like this, and keeps the table in one place so the policy is a one-line flip:

| node | policy | why |
| --- | --- | --- |
| `blockquote` | keep `block+`, add a variant | CAVEATS says the implicit deletion is acceptable here ("an empty blockquote is meaningless anyway"), and Backspace-deletes-the-quote is the editing UX people expect |
| `listItem` | keep `paragraph block*`, add a variant | pinning `paragraph` as the first child is what makes `splitListItem` / `sinkListItem` behave; relaxing changes list semantics rather than fixing a bug |
| `bulletList` / `orderedList` / `table` / `tableCell` / `tableHeader` | relax to `*` | losing an entire list or table because two people deleted different items destroys a lot of unrelated content, and an empty container is a cosmetic wart you can style |

Relaxing means empty containers become reachable, so give them a `min-height` and a placeholder - otherwise they collapse to zero height and the merge looks like data loss rather than the recovery it is.

### Step 2 - define variants for whatever stayed strict

Follow "Schema contract for variant nodes" above: same `group`, relaxed `content`, the canonical `attrs` plus `y-attributed`, the attribution marks, and - the part that bites - **a group the parent can address** (see that section's third bullet).

Three more requirements that only show up with real editors:

- **Variants must be inert.** No commands, input rules, keyboard shortcuts, plugins or node views, and in particular **no parse rules**: an inherited `{ tag: 'blockquote' }` competes with the canonical node during clipboard parsing and then throws, because `y-attributed` has no default.
- **Render the same DOM tag as the canonical node**, distinguished by a data attribute. Every structural CSS rule and every `y-ins > …` / `y-del > …` rule then keeps applying, and a custom tag would be unusable inside `<table>` anyway.
- **`prosemirror-tables` specifics.** A table variant must set `tableRole: null` - `tableNodeTypes()` builds `roles[spec.tableRole] = type` over `schema.nodes` in insertion order, so a variant that declares a role *replaces* the canonical entry and every table command starts constructing variants. Cell variants must declare identical `colspan` / `rowspan` / `colwidth`, because `TableMap.computeMap` reads those off whatever node it finds without checking its type. And a `table--attributed` needs its own `renderHTML`: the inherited one calls `createColGroup`, which returns `{}` for a row-less table and produces a spec with an `undefined` child - throwing on exactly the empty case the variant exists for.

### Step 3 - whitelist the marks, in the schema

List the four names **by name** on every non-leaf node that can hold attributable content. Leaves (`image`, `hardBreak`, `horizontalRule`, `text`) need nothing: they hold no content, so `validContent`'s `allowsMarks` loop never runs on them and *their* marks are validated against the parent. Textblocks that omit `marks:` already resolve to `markSet === null` (all marks).

**`marks: '_'` is not a shortcut.** It also admits `bold` / `link` as *node* marks on `doc` / `tableRow`, and those would round-trip into Y as node-level format keys.

Prefer the schema to a post-construction `markSet` patch. The patch works, but it makes a non-compliant schema *look* compliant at runtime while the bind-time audit still reports the truth - so it hides the thing you most want to see.

Note also that `extendNodeSchema` cannot do this for you: `getSchemaByResolvedExtensions` spreads the injected fields first and then writes `marks: callOrReturn(...)`, which is `undefined` for nodes that do not declare it, and `cleanUpSchemaItem` drops the key. Per-node `.extend({ marks })` is the only route (paired with `StarterKit.configure({ <name>: false })`, or Tiptap warns about duplicate extension names).

### Step 4 - `customCompare`, only if you cannot relax

BlockNote reached for this in [#250](https://github.com/yjs/y-prosemirror/issues/250): their `blockContainer: 'blockContent blockGroup?'` structurally could not hold a deleted paragraph next to an inserted table, and they could not relax it, so they shifted the diffing boundary instead - making a container whose first child *type* changed replace wholesale rather than diff in place.

Once a schema is relaxed the same state is representable, and rendering the old block next to the new one is better suggestion UX than replacing the container. Treat `customCompare` as the fallback for schemas that genuinely cannot relax, and be wary of extending it to cardinality: making `tableRow` pair only when the cell count matches would rewrite every row wholesale on a column insert, destroying per-cell identity and attribution and costing an O(table) write per column operation.

### Step 5 - guard editor plugins that repair the document

See CAVEATS.md "Editor plugins that repair the document". This is not optional for a tables integration.

### Step 6 - verify

Three signals, in this order:

1. **The bind-time audit.** `[y/prosemirror] these node types do not allow the attribution marks this binding renders:` names the offending types before any editing. Act on this first.
2. **`doc.check()` in development.** Exactly one failure is legitimate: a pending delete that lost its required content, which is rendered as-is by design. Name it in your UI so nobody "fixes" it - and note that with variants in place it should not happen at all, which makes `doc.check()` the pass/fail signal for this whole exercise.
3. **A schema-health panel**, if you can afford one. `yhub-tiptap-demo/src/diagnostics.js` re-runs the binding's audit plus the checks it cannot make (mark exclusion, attr coverage, variant parity), which turns "it seems to work" into something a reviewer can see. When comparing variant `attrs` against the canonical node's, remember to subtract the injected `y-attributed` key or every correct variant reads as a mismatch.

A worked implementation of all six steps lives in [`yhub-tiptap-demo/`](./yhub-tiptap-demo/).

## Pitfalls and debugging

- **Schema attribute mismatch.** The most common failure mode. Symptom: suggestions render but the per-user color (or whatever attr you encoded) is always the default. The sync plugin fires an extra transaction on every keystroke. Fix: align the mapper output with the declared schema `attrs`, ensuring every declared attribute is also emitted by the mapper.
- **Mark not allowed on the target node.** Symptom: the binding logs `[y/prosemirror] these node types do not allow the attribution marks this binding renders:` naming the node types, as soon as the editor is bound with a renderer - act on this one first, it is emitted before any editing and tells you exactly which nodes are wrong. (A binding without a renderer produces no attribution and is not audited.) Left unfixed it surfaces later as `RangeError: Invalid content for node ...` from `tr.addMark` / `tr.addNodeMark`, or as attribution that silently never appears inside those nodes. Fix: add the marks by name to every affected node's `marks` content expression, or extend the node types' `markSet` programmatically. Note that a container which simply omits `marks:` also excludes them - ProseMirror resolves an omitted `marks:` on a node without inline content to `[]`.
- **Container implicitly deleted after a concurrent edit.** Symptom: a blockquote / list / table disappears on every peer after two people edited it at the same time, and neither of them deleted it. Cause: a `+` content expression that two individually valid deletes emptied; the only schema-valid resolution is to delete the container. Fix: relax the expression, or accept the cascade deliberately (see "Hardening an existing editor schema").
- **`doc.check()` fails while a suggestion is on screen.** Expected *only* for a node that is a pending delete and has lost its required content - it can be neither dropped nor filled, so the binding renders it as-is. Fix: give that node type a relaxed `--attributed` variant. Any other `doc.check()` failure is a bug.
- **A variant is defined but nodes never flip to it.** Cause: the parent's content expression names the canonical type, and a `--attributed` name can never be matched by a content expression. Fix: give both types a shared `group` and address the group.
- **Marks not declared at all.** Symptom: `[y/prosemirror] a renderer is configured (suggestions / versioning), but this schema declares none of the y-attributed-* marks`, logged when the renderer is configured. Nothing will render attribution. Fix: declare the marks as described above.
- **Non-canonical mark names.** Symptom: attribution marks accumulate on the document and eventually leak into the CRDT, because the PM to Y strip step does not recognize them. Fix: rename your marks to the canonical names.
- **Non-deterministic mapper.** Symptom: sync plugin fires a never-ending stream of reconcile transactions, even with no user input. Fix: remove timestamps, random ids, and any other non-deterministic value from the mapper. Derive everything from the `attribution` argument.
- **Variant node missing or mismatched.** Symptom (with `attributedNodes`): attributed nodes never switch to their `--attributed` type, or `setNodeMarkup` throws an invalid-content error on the first attributed edit. Fix: define `{nodeName}--attributed` with the same `content`/`group`/`attrs`/allowed marks as the canonical node. See "Schema contract for variant nodes".
- **Non-deterministic `attributedNodes` predicate.** Symptom: never-ending reconcile transactions, same as a non-deterministic mapper. Fix: derive the result only from `(nodeName, kinds)`.

See also [`CAVEATS.md`](./CAVEATS.md) ("Attribution mark names are fixed", "Schema mismatches in suggestion mode") for related design tradeoffs and the underlying schema-resolution gotcha.
