/* eslint-env browser */
//
// The hardened ProseMirror schema for this demo.
//
// A stock Tiptap StarterKit + tables schema is authored for single-user
// editing. Two things break it once `@y/prosemirror` is in the picture:
//
//   1. CONCURRENCY. Content expressions using `+` encode "this container must
//      never be empty". Two individually valid concurrent deletes can empty it
//      anyway, and the only schema-valid resolution is to delete the container
//      on every peer - a small remote edit cascading into the implicit deletion
//      of a much larger structure. See CAVEATS.md "Schema mismatches under
//      concurrency".
//   2. ATTRIBUTED RENDERING. A suggestion transiently holds both the deleted
//      and the inserted content, and a node that is a *pending delete* keeps
//      being rendered even after the base document dropped its children. That
//      node cannot be dropped (Y re-renders it) and cannot be filled (Y reverts
//      the fill), so `deltaToPNodeOrDrop` creates it UNCHECKED - an invalid
//      ProseMirror document for as long as it is on screen. See CAVEATS.md
//      "Schema mismatches in suggestion mode".
//
// There are two remedies and they are NOT interchangeable:
//
//   - RELAXING a content expression (`+` -> `*`) fixes both, but weakens the
//     schema users author against.
//   - An `{name}--attributed` VARIANT (ATTRIBUTION.md "Rendering attributed
//     nodes under a variant node type") fixes only (2), because
//     `attributedNodes` is consulted only for attributed nodes. Its virtue is
//     that the relaxation lives on a type ONLY THE BINDING CAN PRODUCE, so
//     user-authored content still conforms to the strict canonical type.
//
// This file applies each remedy where it pays - see CARDINALITY POLICY below.
//
import { mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Blockquote } from '@tiptap/extension-blockquote'
import { BulletList, ListItem, OrderedList } from '@tiptap/extension-list'
import { CodeBlock } from '@tiptap/extension-code-block'
import { Code } from '@tiptap/extension-code'
import { Document } from '@tiptap/extension-document'
import { Link } from '@tiptap/extension-link'
import { TrailingNode } from '@tiptap/extensions'
import { Image } from '@tiptap/extension-image'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { AttributedAttrs, AttributedDelete, AttributedFormat, AttributedInsert } from './attribution-marks.js'
import { guardBindingMutations } from './guards.js'

/**
 * The four reserved attribution mark names. Not configurable - `y-prosemirror`
 * references them by name internally (CAVEATS.md "Attribution mark names are
 * fixed").
 */
export const ATTRIBUTION_MARK_NAMES = [
  'y-attributed-insert',
  'y-attributed-delete',
  'y-attributed-format',
  'y-attributed-attrs'
]

/**
 * The marks whitelist as a ProseMirror `marks:` content expression.
 *
 * Listed BY NAME rather than by group on purpose: `gatherMarks` resolves a
 * node's `marks` spec by mark name first and only falls back to group matching,
 * so a name list can never be shadowed by an unrelated mark that happens to
 * share a group (ATTRIBUTION.md §2).
 *
 * `marks: '_'` (= allow everything) would be shorter, but it would also let
 * `bold` / `link` land as NODE marks on `doc` / `tableRow`, and those *would*
 * round-trip into Y as node-level format keys. A name list is the narrow fix.
 */
const A = ATTRIBUTION_MARK_NAMES.join(' ')

/**
 * `@tiptap/extension-code` declares `excludes: '_'` ("excludes every other
 * mark"). `Mark.addToSet` returns the set unchanged when an existing mark
 * excludes the incoming one, so the attribution marks are silently refused on
 * inline-code spans - and `swallowFormats` swallows the loss, so nothing warns
 * and no attribution ever renders there.
 *
 * Re-state the exclusion as an explicit list: `code` keeps kicking out every
 * formatting mark, but lets the render-only attribution marks through. If a
 * mark named here is ever removed from the editor, `gatherMarks` throws
 * `Unknown mark type` at schema-construction time - a loud failure, which is
 * what we want.
 */
const NON_ATTRIBUTION_MARKS = 'code bold italic strike underline link'

// ── CARDINALITY POLICY ───────────────────────────────────────────────────────
//
// Which containers keep `+` (and get a variant) and which relax to `*`. The
// question to ask per node is "what does the implicit deletion destroy?".
//
//   node                     | policy            | rationale
//   -------------------------|-------------------|--------------------------------
//   blockquote               | KEEP `block+`     | CAVEATS says the implicit
//                            | + variant         | deletion is acceptable here
//                            |                   | ("an empty blockquote is
//                            |                   | meaningless anyway"), and
//                            |                   | Backspace-deletes-the-quote is
//                            |                   | the expected editing UX.
//   listItem                 | KEEP              | keeping `paragraph` pinned as
//                            | `paragraph block*`| the first child is what makes
//                            | + variant         | splitListItem / sinkListItem
//                            |                   | behave; relaxing changes list
//                            |                   | semantics, it does not fix a bug.
//   bulletList / orderedList | RELAX `*`         | losing an entire list because
//   table                    | RELAX `*`         | two people deleted different
//   tableCell / tableHeader  | RELAX `*`         | items / rows destroys a lot of
//                            |                   | unrelated content, and an empty
//                            |                   | list / table / cell is only a
//                            |                   | cosmetic wart (which index.html
//                            |                   | styles with a placeholder).
//
// Relaxation is the ONLY remedy for the live-mode concurrency cascade; the
// variant is the only remedy that leaves the authoring schema strict. The demo
// deliberately shows both.

/**
 * The canonical (user-authored) node types.
 *
 * Every node here is `.extend()`ed rather than injected through
 * `extendNodeSchema`: `getSchemaByResolvedExtensions` spreads `extraNodeFields`
 * FIRST and then writes `marks: callOrReturn(getExtensionField(ext, 'marks'))`,
 * which is `undefined` for nodes that don't declare it - the explicit
 * `undefined` shadows the injected value and `cleanUpSchemaItem` drops the key.
 * So a global "add the attribution marks to every node" extension is
 * impossible, and each override must be paired with
 * `StarterKit.configure({ <name>: false })` or Tiptap warns about duplicate
 * extension names.
 */
const canonicalNodes = () => [
  // `doc` holds block children that can carry NODE marks (a wholly inserted or
  // deleted paragraph). ProseMirror validates a child's marks against the
  // PARENT's markSet, so `doc` must whitelist them or block-level attribution
  // throws `RangeError: Invalid content for node doc`.
  Document.extend({ marks: A }),

  // Strict on purpose (see CARDINALITY POLICY). `blockquote--attributed` is the
  // relaxed sibling that only the binding can produce.
  Blockquote.extend({ marks: A }),

  // `listItem` ships with NO group, so `listItem+` names the type directly and
  // `listItem--attributed` could never be reached: `--` is untokenizable in a
  // ProseMirror content expression (the tokenizer splits on non-word
  // characters, so `listItem--attributed` becomes `listItem`,`-`,`-`,
  // `attributed`). Introduce a group and address the group instead.
  ListItem.extend({ marks: A, group: 'listItemGroup' }),
  BulletList.extend({ marks: A, content: 'listItemGroup*' }),
  OrderedList.extend({ marks: A, content: 'listItemGroup*' }),

  // Upstream declares `marks: ''` -> markSet [] -> attribution inside code
  // blocks is dropped silently, and the binding's bind-time audit names
  // `codeBlock`. Swap the empty expression for the four reserved names: still
  // no bold/italic inside a code block, but insertions and deletions render.
  CodeBlock.extend({ marks: A }),

  Code.extend({ excludes: NON_ATTRIBUTION_MARKS }),

  Table.extend({
    marks: A,
    content: 'tableRow*',
    addProseMirrorPlugins () { return (this.parent?.() ?? []).map(guardBindingMutations) }
  }),
  TableRow.extend({ marks: A }),
  TableCell.extend({ marks: A, content: 'block*' }),
  TableHeader.extend({ marks: A, content: 'block*' }),

  // `TrailingNode` and `Link`'s autolink both mutate the document from
  // `appendTransaction`, including on the binding's own dispatches - and the
  // sync plugin's `update` pull then writes that mutation into Y. Guard rather
  // than remove, so they keep working for genuine user edits.
  TrailingNode.extend({
    addProseMirrorPlugins () { return (this.parent?.() ?? []).map(guardBindingMutations) }
  }),
  Link.extend({
    addProseMirrorPlugins () { return (this.parent?.() ?? []).map(guardBindingMutations) }
  })
]

/**
 * `deltaToPNodeOrDrop` / `applyNodeFormat` inject a render-only
 * `y-attributed: true` attr on every node they render under a variant type, and
 * the PM->Y canonicalization strips it again. The variant MUST declare it or
 * ProseMirror's `computeAttrs` drops it and the readback stops matching the
 * render (ATTRIBUTION.md "Stability is mandatory").
 *
 * Declared WITHOUT a default (`isRequired`), which mirrors
 * tests/attributed-nodes.test.js and has a useful side effect: `NodeType`
 * reports `hasRequiredAttrs()`, which is exactly the guard
 * `ContentMatch.defaultType` and `ContentMatch.fillBefore` consult - so
 * ProseMirror's auto-fill can never materialize a variant on its own.
 *
 * Rendering it as `data-y-attributed` gives index.html its CSS hook for free.
 */
const yAttributedAttr = () => ({
  'y-attributed': {
    isRequired: true,
    parseHTML: () => null,
    renderHTML: () => ({ 'data-y-attributed': 'true' })
  }
})

/**
 * A variant is a pure *rendering* sibling. It must contribute no commands,
 * input rules, shortcuts, plugins or node views, and - importantly - no parse
 * rules: an inherited `{ tag: 'blockquote' }` would compete with the canonical
 * node during clipboard parsing and then throw, because `y-attributed` has no
 * default.
 */
const inert = {
  addCommands: () => ({}),
  addKeyboardShortcuts: () => ({}),
  addInputRules: () => [],
  addPasteRules: () => [],
  addProseMirrorPlugins: () => [],
  addNodeView: () => null,
  addGlobalAttributes: () => [],
  parseHTML: () => []
}

/**
 * The relaxed `--attributed` siblings, for the two node types this schema keeps
 * strict. Each renders the SAME DOM TAG as its canonical node plus a
 * `data-y-attributed` marker - a deliberate contract, so every structural rule
 * in index.html (the blockquote border, the `li` marker) and every
 * `y-ins > …` / `y-del > …` rule keeps applying to variants unchanged.
 */
const attributedVariantNodes = () => [
  Blockquote.extend({
    ...inert,
    name: 'blockquote--attributed',
    marks: A,
    content: 'block*', // relaxed from `block+` - the whole point
    group: 'block', // identical to canonical, so it is valid wherever it is
    addAttributes () { return { ...this.parent?.(), ...yAttributedAttr() } },
    renderHTML ({ HTMLAttributes }) { return ['blockquote', mergeAttributes(HTMLAttributes), 0] }
  }),

  ListItem.extend({
    ...inert,
    name: 'listItem--attributed',
    marks: A,
    content: 'block*', // relaxed from `paragraph block*`
    group: 'listItemGroup',
    addAttributes () { return { ...this.parent?.(), ...yAttributedAttr() } },
    renderHTML ({ HTMLAttributes }) { return ['li', mergeAttributes(HTMLAttributes), 0] }
  })
]

/**
 * The node types that have a `{name}--attributed` sibling in this schema.
 * A module-level literal, never mutated, so the predicate below stays a pure
 * function of its arguments.
 */
const VARIANT_NODES = new Set(['blockquote', 'listItem'])

/**
 * `attributedNodes` predicate for `syncPlugin`.
 *
 * Gated on `delete` because `deltaToPNodeOrDrop`'s `undroppable` is literally
 * `nodeType === topNodeType || attributionKinds(dformat).delete`: insert- and
 * format-attributed nodes are droppable, and dropping an invalid one is the
 * documented convergent behaviour. Gating narrowly means we do not pay a
 * `setNodeMarkup` type flip (and a flip back) on every ordinary insertion
 * suggestion.
 *
 * Deterministic in `(nodeName, kinds)` as the API requires - no clock, no
 * randomness, no state lookup. A non-deterministic predicate would put the
 * binding into an endless reconcile loop.
 *
 * @type {AttributedNodesPredicate}
 */
export const attributedNodes = (nodeName, kinds) =>
  kinds.delete === true && VARIANT_NODES.has(nodeName)

/**
 * Name of the first node-child of a `lib0/delta` node, or `null` when it has
 * none. Modelled on tests/custom-compare.test.js.
 *
 * @param {any} node
 * @return {string | null}
 */
const firstChildName = (node) => {
  for (const child of node.children) {
    if (child.insert != null && Array.isArray(child.insert)) {
      const first = child.insert[0]
      return first != null && typeof first === 'object' && 'name' in first ? first.name : null
    }
  }
  return null
}

/**
 * OPTIONAL `customCompare`, off by default (`?compare=strict` turns it on).
 *
 * This is the knob BlockNote reached for in yjs/y-prosemirror#250: their
 * `blockContainer: 'blockContent blockGroup?'` structurally could not hold a
 * deleted paragraph next to an inserted table, and they could not relax it, so
 * they shifted the diffing boundary instead - making a container whose first
 * child type changed replace wholesale rather than diff in place.
 *
 * We do NOT adopt it, because after the relaxation above that state is
 * representable, and rendering the old block next to the new one is better
 * suggestion UX than replacing the container. It stays here, behind a flag, so
 * the demo documents the option.
 *
 * Deliberately NOT extended to `tableRow` (pair only when the cell count
 * matches): adding a column would then rewrite every row wholesale, destroying
 * per-cell identity and attribution and costing an O(table) Y write per column
 * operation. Ragged rows are handled by the fixTables guard in guards.js.
 *
 * @type {NodeCompare}
 */
export const strictListItemCompare = (a, b) =>
  a.name === b.name &&
  (a.name !== 'listItem' || firstChildName(a) === firstChildName(b))

/**
 * Mirrors the binding's own bind-time audit (`warnUnsupportedAttributionMarks`)
 * but runs unconditionally - the binding only audits once a renderer is
 * configured, i.e. the moment you enter suggestion or version-diff mode.
 *
 * Leaves are exempt: they hold no content, so `validContent`'s `allowsMarks`
 * loop never runs on them and *their* marks are validated against the parent.
 *
 * @param {import('@tiptap/pm/model').Schema} schema
 * @return {Array<{ name: string, missing: Array<string> }>}
 */
export const auditAttributionMarks = (schema) => {
  const markTypes = ATTRIBUTION_MARK_NAMES
    .map(n => schema.marks[n])
    .filter(m => m != null)
  /** @type {Array<{ name: string, missing: Array<string> }>} */
  const offenders = []
  for (const name in schema.nodes) {
    const nodeType = schema.nodes[name]
    if (nodeType.isLeaf) continue
    const missing = markTypes.filter(m => !nodeType.allowsMarkType(m)).map(m => m.name)
    if (missing.length > 0) offenders.push({ name, missing })
  }
  return offenders
}

/**
 * The complete extension list for the demo editor.
 *
 * Every node we override is disabled in StarterKit - otherwise Tiptap logs
 * `[tiptap warn]: Duplicate extension names found` and which copy wins is
 * arbitrary. `undoRedo` is off because Yjs owns history (see the yUndo
 * extension in extensions.js).
 */
export const createEditorExtensions = () => [
  StarterKit.configure({
    undoRedo: false,
    document: false,
    blockquote: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    codeBlock: false,
    code: false,
    link: false,
    trailingNode: false
  }),
  ...canonicalNodes(),
  ...attributedVariantNodes(),
  // A block image (leaf/atom). Leaves need no `marks:` of their own - the
  // attribution mark on a wholly inserted/deleted image is validated against
  // the PARENT, which is whitelisted above.
  Image.configure({ inline: false, allowBase64: true }),
  AttributedInsert,
  AttributedDelete,
  AttributedFormat,
  AttributedAttrs
]
