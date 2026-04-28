# Caveats

This document covers design tradeoffs, known limitations, and open problems in `y-prosemirror`. Some are solvable and scheduled for a later release; some have mitigations that an integrator needs to be aware of; a few are fundamental to the CRDT / ProseMirror impedance mismatch and can only be worked around.

## Context

A handful of goals and constraints inform everything below:

- **Attributed rendering.** The binding must be able to render attributed content (suggestions, diffs of activity items, etc.) on top of the live document.
- **Yjs v14 schemas.** Yjs v14 will add schema support that restricts what collaborators can read or insert. It is similar in spirit to a ProseMirror schema but intentionally less expressive. A major motivation is letting LLMs and other tools understand a Yjs document's structure and produce valid edits to it directly.
- **Direct Yjs manipulation.** Nice to have: humans and LLMs should be able to edit the Yjs document directly (outside the editor) and have those edits reflected correctly in ProseMirror.
- **Migration compatibility.** We want a migration path - ideally transparent - for existing `y-prosemirror` users.

## Compatibility with older `y-prosemirror`

The new binding is not yet update-compatible with documents produced by the old `y-prosemirror`:

1. **Inline text representation.** The old binding represented inline text as a nested `Y.Text`; the new binding represents it as inline text inside the parent type. A transparent on-load migration is possible but not yet implemented.
2. **Overlapping marks.** The old binding supported multiple concurrent instances of the same mark type carrying different values (e.g., two `bold` marks with different payloads). This is not yet migrated, but could be.

**Status:** planned. We intend for old documents to remain loadable.

## Node splitting, merging, and lifting

ProseMirror's structural operations - splitting a node, merging two siblings, lifting a child out of its parent - have no first-class representation in Yjs. As a result, concurrent edits around these operations can diverge from ProseMirror's intended semantics. Concretely, splitting a paragraph at offset `n` is implemented in the CRDT as:

1. Delete everything after `n` in the original node.
2. Insert a new node containing the deleted content.

More broadly, Yjs represents changes differently than ProseMirror - through a different set of transformation steps that have no notion of lifting, merging, or splitting.

### Why we don't flatten the document (yet)

One way out is to represent the document as a flat sequence where structure is expressed through markers or depth annotations rather than as a nested tree. [Automerge's ProseMirror binding](https://github.com/automerge/automerge-prosemirror) takes this approach, but it tightly couples the storage layer to the ProseMirror schema - which defeats our goal of letting LLMs and external tools work with the Yjs document without having to understand the editor's schema.

A schema-agnostic flattening is also possible. For example, inlining everything into a single Y.Type with depth annotations:

```
<doc depth=0><p depth=1>hello<p depth=1>world
```

is reconstructed as `<doc><p>hello</p><p>world</p></doc>`. Each opening marker implicitly closes any earlier sibling at the same or deeper depth, so the second `<p depth=1>` marks the end of the first paragraph and the start of the second. Depth markers give a natural representation of splits, merges, and lifts. But a flat representation is hostile to direct manipulation: a human or LLM reading the raw Yjs state has to reason about depth markers and reconstruction rules on top of the schema.

**Planned mitigation.** Wrap the flat representation in a tree-shaped API, similar to the type wrappers in `y-utilities`. Consumers that need compatibility with pre-existing documents continue to use the unflattened `Y.Type`; new users (and users who can migrate) get the flat representation via the wrapper. The wrapper would be built on `lib0/delta/transformers`, which is expressive enough to recognize "node-split deltas" in the flat model and surface them as splits through the tree API. This wrapper would likely be broadly useful - `y-slate` could share it, for instance. More investigation is needed before it is production-ready; until then we stay on the tree structure.

## Position divergence across peers

Because Yjs represents a split as "delete tail + insert new node" (see above), absolute ProseMirror positions produced on one peer do not necessarily point at the same semantic content on another peer once concurrent edits have been merged in.

**Mitigation.** Editor plugins that need positions to survive remote edits - comments, cursors, awareness, anchored decorations - must use Yjs relative positions rather than absolute ProseMirror positions. Relative positions are guaranteed to converge to the same absolute position.

@nperez's relative-position mapping in this package makes this ergonomic; see the `Position Mapping` section of [`PROJECT_GOALS.md`](./PROJECT_GOALS.md).

## Diffing ambiguity

When we cannot derive the intent of a ProseMirror transaction unambiguously (for example, because only the before/after documents are available, or because the step is a `ReplaceAroundStep` whose intent is not directly representable in Yjs), we fall back to diffing the document. Diffing a repeated substring is inherently ambiguous.

**Example.** Inserting `a` into `aaaaa` yields `aaaaaa`. A structural diff can tell you that one `a` was added, but not at which of the six possible positions. On a single peer this is usually harmless, but once a second peer's concurrent edit is rebased against the resolved position, the "wrong" choice can produce visibly incorrect merges.

**Mitigation.** A known technique is to bias the diff toward the last known caret position - users overwhelmingly insert at the caret, so anchoring the diff there is right in the common case. We used this approach in Quill a few years ago; see [jhchen/fast-diff#2](https://github.com/jhchen/fast-diff/pull/2).

**Status:** solvable, likely not in the initial release.

## Schema mismatches under concurrency

ProseMirror schemas are very expressive - content expressions like `title image{2,4} paragraph+` (exactly one title, 2-4 images, at least one paragraph) are valid. This expressiveness is a liability under concurrent editing: two individually valid changes can compose into a schema-invalid document.

**Example.** A blockquote whose schema requires `paragraph+`:

- Initial state: `<blockquote><p>A</p><p>B</p></blockquote>`.
- User 1 deletes paragraph A.
- User 2 concurrently deletes paragraph B.
- Merged state: `<blockquote></blockquote>` - schema-invalid.

The only schema-valid resolution is to delete the blockquote entirely, which the binding must do on each peer that receives the merged state. A small remote edit has cascaded into the implicit deletion of a much larger structure on the other peer. Offline users are especially dangerous here: their locally valid edit can invalidate a large number of remote changes on sync.

This is inherent to ProseMirror schemas, not specific to Yjs. `prosemirror-collab` avoids CRDT-style merging by serializing all steps through a central authority; each client rebases its unconfirmed local steps on top of whatever the authority has since accepted. Neither the authority nor the plugin validates schemas. Instead, `rebaseSteps` reapplies each local step via `transform.maybeStep` and silently discards any step whose `.failed` is true - which includes steps whose application would produce a schema-invalid document. For an online user the window for loss is narrow, since each edit round-trips quickly. A user who edits offline, however, accumulates many dependent local steps, and on reconnect can watch a large contiguous run of their work vanish without any warning. The mitigation under `prosemirror-collab` is the same as under Yjs: widen the schema.

### Recommendations for schema authors

- **Prefer `*` over `+` and over bounded repetitions `{n,m}`.** `paragraph*` and `image*` are concurrency-safe; `paragraph+` and `image{2,4}` are not. Use the stricter form only when implicit deletion of the parent on invalidation is an acceptable outcome (for blockquote, it arguably is - an empty blockquote is meaningless anyway).
- **Consider explicit "invalid-schema" node variants.** Define relaxed variant node types that only the binding can produce - never the user. When concurrent edits would produce an invalid parent, the binding can reshape into the relaxed variant rather than drop content. User-generated content still has to conform to the strict schema.

**Status:** addressable through schema discipline and/or invalid-node variants. Integrators need to be aware of the failure mode.

## Schema mismatches in suggestion mode

A suggestion is an ordinary node rendered with a mark, attribute, or decoration that indicates its suggestion status (insertion / deletion / modification). This composition breaks down against strict cardinality constraints.

**Example.** A schema like `image{2,4}` means "exactly 2-4 images". A suggestion that proposes "delete these 4 images and insert 4 others" requires transiently holding 8 images in the parent - violating the schema regardless of how the proposal is rendered.

**Mitigation.** The schema has to be suggestion-aware. Either:

- Relax cardinality in the schema itself (e.g., `image*` with separate validation at commit time), or
- Introduce suggestion-specific node types that relax the constraints while preserving the visual / semantic distinction.

Without this, the binding has no choice but to drop invalid content, silently discarding part of the suggestion.

**Status:** addressable; integrators need to be aware.

## Attribution mark names are fixed

Attributed content (insertions, deletions, format changes) is surfaced in ProseMirror as marks. The names of those marks are part of `y-prosemirror`'s contract and are **not user-configurable**:

- `y-attributed-insert`
- `y-attributed-delete`
- `y-attributed-format`

The default `defaultMapAttributionToMark` produces these names; custom `mapAttributionToMark` mappers must produce them too. Other internals (e.g. `_clearAttributionFormatting` in `sync-utils.js`) reference the names directly. Returning a different name from your mapper will cause `y-prosemirror` to fail to clear the attribution formatting on subsequent renders, and any code that relies on these names (decorations, accept/reject UI) will silently miss the marks.

**Integrator requirements:**

1. Define ProseMirror mark types with these exact names. Tiptap example:

   ```js
   Mark.create({
     name: 'y-attributed-insert',
     addAttributes () { return { userIds: { default: null }, timestamp: { default: null } } },
     parseHTML () { return [{ tag: 'y-ins' }] },
     renderHTML ({ HTMLAttributes }) { return ['y-ins', HTMLAttributes, 0] }
   })
   // ...similarly for y-attributed-delete and y-attributed-format
   ```

2. **Make sure the schema actually accepts these marks on every node where they may land.** This sounds trivial but is the most common integration pitfall, because ProseMirror's `gatherMarks` resolves a node's `marks` spec by mark name first and only falls back to mark-group matching when no mark by that name exists. If your schema has nodes that declare e.g. `marks: "insertion modification deletion"` and your editor *also* defines marks literally named `insertion`/`deletion`/`modification` (BlockNote's `SuggestionMarks` is a real-world example), the group-based fallback never fires and the `y-attributed-*` marks get silently shadowed - even if you put them in `group: "insertion"`. The runtime symptom is a `RangeError: Invalid content for node …` from `tr.addNodeMark` the moment a user makes the first edit in suggestion mode.

   The safest fix is to extend the affected node types' `markSet` after editor construction so the `y-attributed-*` marks are explicitly listed.

## Visualizing attributed content

Attributed rendering - showing insertions, deletions, and modifications inline - is currently a coarse red / yellow / green background treatment. That works as a floor, but several cases need more:

- How do we render a pure attribute change? For example, an image's `height` changes from `200` to `400` - there is no text to highlight.
- For attribute changes more generally, do we visualize the change in place, or show both versions side-by-side for comparison?
- Are insertions colored by author (per-user color) or by semantics (green-for-insertion)? The two schemes compete, and picking one loses information.

Visualizing this well requires the editor, the ProseMirror schema, and `y-prosemirror` to cooperate - the binding can surface attribution metadata, but the rendering strategy has to be schema-aware.

**Status:** the simple solution is good enough for now; optimal rendering will need schema-level collaboration.
