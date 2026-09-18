import * as array from 'lib0/array'
import * as delta from 'lib0/delta'
import * as dpos from 'lib0/delta/position'
import * as fun from 'lib0/function'
import * as math from 'lib0/math'
import * as object from 'lib0/object'
import * as s from 'lib0/schema'
import { Slice, Fragment } from 'prosemirror-model'
import { ReplaceStep } from 'prosemirror-transform'
import { hashOfJSON } from './utils.js'

/** @import { Node } from 'prosemirror-model' */

export const $prosemirrorDelta = delta.$delta({ name: s.$string, attrs: s.$record(s.$string, s.$any), text: true, recursiveChildren: true })

/**
 * Suffix appended to a node name when it is rendered as its "attributed
 * variant" (see `attributedNodes` on {@link syncPlugin}). The suffix is fixed
 * so that canonicalizing back (PM -> Y) is a pure string operation and can
 * never drift from the forward mapping. `--attributed` is a *reserved* suffix:
 * a real node type literally ending in it would be canonicalized away on the
 * way to Y.
 */
export const ATTRIBUTED_SUFFIX = '--attributed'

/**
 * Default `attributedNodes` predicate - the feature is off, so every node keeps
 * its canonical name.
 *
 * @type {AttributedNodesPredicate}
 */
export const defaultAttributedNodes = () => false

/**
 * Strip the {@link ATTRIBUTED_SUFFIX} so a PM node name maps back to the
 * canonical name stored in the Y document. Identity for canonical names.
 *
 * @param {string} name
 * @return {string}
 */
export const canonicalNodeName = (name) =>
  name.endsWith(ATTRIBUTED_SUFFIX)
    ? name.slice(0, -ATTRIBUTED_SUFFIX.length)
    : name

/**
 * Which attribution kinds a rendered op carries, read off the reserved
 * `y-attributed-*` format keys that the attribution-to-format stage produces.
 * A custom `mapAttributionToMark` that omits a kind hides it from every
 * decision made here (the attributed node variants and the pending-delete
 * handling in {@link deltaToPNodeOrDrop}) and in the fix filter of
 * `ProsemirrorRdt.applyDelta` (rdt/prosemirror.js).
 *
 * @param {Record<string, unknown> | null | undefined} format
 * @return {{ insert: boolean, delete: boolean, format: boolean }}
 */
export const attributionKinds = format => ({
  insert: format?.['y-attributed-insert'] != null,
  delete: format?.['y-attributed-delete'] != null,
  format: format?.['y-attributed-format'] != null
})

/**
 * Whether a ProseMirror node is rendered as a pending delete: the mark form
 * of the `y-attributed-delete` format {@link attributionKinds} reads.
 *
 * @param {Node} node
 * @return {boolean}
 */
const isPendingDeleteNode = node => node.marks.some(m => m.type.name === 'y-attributed-delete')

/**
 * Resolve the PM node name to render for `canonicalName` given the attribution
 * carried in `format`. Returns `canonicalName + ATTRIBUTED_SUFFIX` when the
 * `attributedNodes` predicate opts in *and* the variant exists in the schema;
 * otherwise returns `canonicalName` unchanged.
 *
 * @param {string} canonicalName
 * @param {Record<string, unknown> | null | undefined} format
 * @param {AttributedNodesPredicate} attributedNodes
 * @param {import('prosemirror-model').Schema} schema
 * @return {string}
 */
export const attributedVariant = (canonicalName, format, attributedNodes, schema) => {
  const kinds = attributionKinds(format)
  if ((kinds.insert || kinds.delete || kinds.format) && attributedNodes(canonicalName, kinds)) {
    const variant = canonicalName + ATTRIBUTED_SUFFIX
    if (schema.nodes[variant] != null) return variant
  }
  return canonicalName
}

/**
 * Default attribution-to-mark mapper.
 *
 * **The mark names are part of `y-prosemirror`'s public contract and cannot be
 * changed.** A custom `mapAttributionToMark` may return a different *value*
 * (different attrs, omit some attribution kinds, etc.), but it must use the
 * exact mark names below - other internals reference them by name and will not
 * find marks named anything else:
 *
 * - `y-attributed-insert`
 * - `y-attributed-delete`
 * - `y-attributed-format`
 *
 * The integrator's ProseMirror schema must (a) define mark types with exactly
 * these names and (b) ensure they are allowed on every node where attribution
 * marks may land. See `CAVEATS.md` ("Attribution mark names are fixed") for the
 * full rationale and the schema gotcha around mark-group resolution.
 *
 * Note: a single op may carry multiple attribution kinds simultaneously
 * (e.g. inserted text whose format was also suggested), so the mapper sets
 * each applicable mark independently rather than picking one. Absent kinds
 * are not added to the format object - the diff layer naturally produces a
 * format-remove when comparing PM content (where a stale mark is present)
 * against the freshly-rendered renderer delta (where the key is absent).
 *
 * @template {import('lib0/delta').Attribution} T
 * @param {Record<string, unknown> | null} format
 * @param {T} attribution
 * @returns {Record<string, unknown> | null}
 */
export const defaultMapAttributionToMark = (format, attribution) => {
  const out = /** @type {Record<string, unknown>} */ (object.assign({}, format))
  // Set each attribution kind that is present. Do NOT explicitly null out
  // the absent kinds: lib0/delta's diff naturally produces a format-remove
  // when comparing pcontent (where the mark is present) with desiredPM
  // (where the key is absent). Including explicit `null` here would change
  // the delta op's fingerprint and prevent the diff from matching ops by
  // content, causing spurious text-node splits.
  if (attribution.insert) {
    out['y-attributed-insert'] = {
      userIds: attribution.insert,
      timestamp: attribution.insertAt ?? null
    }
  }
  if (attribution.delete) {
    out['y-attributed-delete'] = {
      userIds: attribution.delete,
      timestamp: attribution.deleteAt ?? null
    }
  }
  if (attribution.format) {
    // `userIdsByAttr` keeps the per-format-key authorship for callers that
    // need it; `userIds` is the deduped union across all format keys for
    // callers that just want "who suggested any format on this span".
    out['y-attributed-format'] = {
      userIds: array.unique(object.map(attribution.format, v => v).flat()),
      userIdsByAttr: attribution.format,
      timestamp: attribution.formatAt ?? null
    }
  }
  return out
}

/**
 * Resolve an *instruction-form* attribution (as produced by the
 * `fullAttributions` transformer and by `lib0/delta.diff`) to plain data form.
 * Instruction form keeps cleared keys as `null` leaves (`{ insert: null }`,
 * `{ format: { bold: null } }`) so downstream consumers can clear state.
 * Attribution mappers only ever saw resolved render attributions, so before
 * handing an attribution to one, drop `null` leaves, drop `null` inner
 * `format` keys, and drop an emptied `format` map.
 *
 * @param {import('lib0/delta').Attribution} a
 * @return {import('lib0/delta').Attribution}
 */
const resolveAttribution = (a) => {
  const out = /** @type {import('lib0/delta').Attribution} */ ({})
  object.forEach(/** @type {Record<string, any>} */ (a), (v, k) => {
    if (v == null) return
    if (k === 'format') {
      const format = dropNullLeaves(v)
      if (!object.isEmpty(format)) out.format = format
    } else {
      // @ts-ignore dynamic attribution key
      out[k] = v
    }
  })
  return out
}

/**
 * A copy of `map` without its `null`-valued keys (instruction-form clears).
 *
 * @param {Record<string, any>} map
 * @return {Record<string, any>}
 */
const dropNullLeaves = (map) => {
  /** @type {Record<string, any>} */
  const out = {}
  object.forEach(map, (v, k) => {
    if (v != null) out[k] = v
  })
  return out
}

/**
 * Reserved node-level mark carrying attr-change attribution. The name is fixed
 * by lib0's `attributionToFormat` transformer (its `Y_ATTRS` constant): the
 * transformer lifts attr-op attribution onto the *parent* insert/modify op's
 * format under this key, as `{ <attrKey>: conf.attrs(attribution) }`.
 * ProseMirror still has no model for per-attribute attribution — the mark on
 * the node is the rendering of "some of this node's attributes are
 * suggested/attributed changes".
 */
const Y_ATTRS_MARK = 'y-attributed-attrs'

/**
 * Default per-attr-key payload stored inside the {@link Y_ATTRS_MARK} mark's
 * `changes` attr: `{ userIds, timestamp }`, aligned with the sibling
 * attribution-mark payloads. Empty `userIds` arrays are preserved — anonymous
 * suggestions (`{ insert: [] }`) are the norm when the DiffRenderer is used
 * without an `attributions` option.
 *
 * @param {import('lib0/delta').Attribution} a
 * @return {{ userIds: Array<any>, timestamp: number|null } | null}
 */
export const defaultMapAttrAttribution = (a) => {
  const r = resolveAttribution(a)
  const userIds = r.insert ?? r.delete
  if (userIds == null) return null
  return { userIds: [...userIds], timestamp: r.insertAt ?? r.deleteAt ?? null }
}

/**
 * The conf handed to lib0's `attributionToFormat` transformer: one handler per
 * attribution dimension, mapping the op's (complete, instruction-form)
 * attribution to the value stored under the corresponding reserved mark name
 * (`y-attributed-insert` / `y-attributed-delete` / `y-attributed-format` /
 * `y-attributed-attrs`). Returning `null` clears the mark (on retain/modify
 * instructions) or renders nothing (on inserted data).
 *
 * The `attrs` handler feeds lib0's attr-attribution lift ({@link Y_ATTRS_MARK}).
 * It is schema-gated in sync-plugin: when the editor schema does not declare
 * the `y-attributed-attrs` mark the handler is removed from the conf, and attr
 * attribution is dropped exactly as before.
 *
 * @typedef {(a: import('lib0/delta').Attribution) => any} AttributionConfHandler
 * @typedef {{ insert?: AttributionConfHandler, delete?: AttributionConfHandler, format?: AttributionConfHandler, attrs?: AttributionConfHandler }} AttributionConf
 */

/**
 * Adapt a legacy `(format, attribution) => format` attribution mapper (the
 * `mapAttributionToMark` option) to an {@link AttributionConf}. The mapper is
 * called with a resolved data-form attribution ({@link resolveAttribution}) and
 * a `null` base format; each handler extracts its own reserved key from the
 * result. A key the mapper did not set maps to `null` — which clears the mark
 * on instruction ops and renders nothing on data ops, matching the legacy
 * "absent kinds are not added" contract.
 *
 * @param {AttributionMapper} mapper
 * @return {AttributionConf}
 */
export const attributionMapperToConf = (mapper) => ({
  insert: a => mapper(null, resolveAttribution(a))?.['y-attributed-insert'] ?? null,
  delete: a => mapper(null, resolveAttribution(a))?.['y-attributed-delete'] ?? null,
  format: a => mapper(null, resolveAttribution(a))?.['y-attributed-format'] ?? null,
  // A mapper may control the attr-change payload by emitting the reserved
  // `y-attributed-attrs` key (the default mapper does not); otherwise the
  // default payload builder applies.
  attrs: a => {
    const m = mapper(null, resolveAttribution(a))
    return m != null && Y_ATTRS_MARK in m ? m[Y_ATTRS_MARK] : defaultMapAttrAttribution(a)
  }
})

/**
 * Marks are stored as a flat `format` object keyed by mark name. Marks whose
 * type does *not* exclude itself (declared with `excludes: ''`, e.g. a comment
 * mark) may overlap on the same text span - several distinct instances coexist.
 * Keying them all by the bare mark name would collide, so each overlapping mark
 * gets a stable content-hash suffix (`name--<hash>`), keeping every instance on
 * its own key. Self-excluding marks (strong/em/code/attribution marks) keep the
 * bare name. `--<8 base64 chars>` is therefore a reserved suffix, symmetric to
 * {@link ATTRIBUTED_SUFFIX} above.
 */
const hashedMarkNameRegex = /(.*)(--[a-zA-Z0-9+/=]{8})$/

/**
 * Strip a hashed overlapping-mark suffix to recover the PM mark name. Identity
 * for bare (non-hashed) names.
 *
 * @param {string} attrName
 * @return {string}
 */
export const yattr2markname = attrName => hashedMarkNameRegex.exec(attrName)?.[1] ?? attrName

/**
 * The reserved `y-attributed-*` attribution marks are render-only and MUST stay
 * addressable by their exact name: `stripAttributionFormattingFromDelta`
 * (sync-plugin.js) strips them on the PM->Y path and `attributedVariant`
 * branches on the literal names. They must never receive the overlapping-mark
 * hash suffix - even if an integrator's schema (wrongly) declares them
 * non-self-excluding - or those name-based filters would miss them and the
 * attribution formatting would leak into the Y document.
 *
 * @param {string} name
 */
const isReservedMarkName = name => name.startsWith('y-attributed-')

/**
 * Inverse of {@link yattr2markname}: the delta format key for a PM mark.
 *
 * @param {import('prosemirror-model').Mark} mark
 * @return {string}
 */
const markToYattrName = mark =>
  (mark.type.excludes(mark.type) || isReservedMarkName(mark.type.name))
    ? mark.type.name
    : `${mark.type.name}--${hashOfJSON(mark.toJSON())}`

/**
 * Delta-space ⇄ PM-space shape adapter for the {@link Y_ATTRS_MARK} mark. The
 * delta format value is the unwrapped per-attr map `{ <attrKey>: payload }`
 * (arbitrary document attr names as keys); PM mark attrs must be *declared*,
 * and `schema.mark` silently drops undeclared given attrs - which would turn
 * the map into `{}` and break the render⇄doc fixpoint. So the map is stored
 * under the single declared mark attr `changes` and unwrapped symmetrically on
 * the way back.
 *
 * @param {string} markName
 * @param {any} v
 */
const wrapYattrMarkValue = (markName, v) => markName === Y_ATTRS_MARK ? { changes: v } : v

/**
 * Resolve a `y-attributed-attrs` format instruction value to the mark's
 * resolved map: `{ <key>: null }` clear entries are dropped (lib0's `attrsFmt`
 * emits them for attrs whose attribution went away, e.g. after accept), and an
 * empty result resolves to `null` - "remove the mark". The maps arriving here
 * are complete (the `renderedAttributions` stage injects the state's other
 * attributed attrs into any change touching attr-attribution space), so
 * replacing the mark wholesale is correct. Identity for every other format
 * key.
 *
 * @param {string} markName
 * @param {any} v
 */
const resolveYattrFormatValue = (markName, v) => {
  if (markName !== Y_ATTRS_MARK || v == null) return v
  const resolved = dropNullLeaves(v)
  return object.isEmpty(resolved) ? null : resolved
}

/**
 * @param {import('prosemirror-model').Mark} mark
 */
const unwrapYattrMark = (mark) => mark.type.name === Y_ATTRS_MARK ? (mark.attrs.changes ?? {}) : mark.attrs

/**
 * @param {readonly import('prosemirror-model').Mark[]} marks
 */
const marksToFormattingAttributes = marks => {
  if (marks.length === 0) return null
  /**
   * @type {{[key:string]:any}}
   */
  const formatting = {}
  marks.forEach(mark => {
    formatting[markToYattrName(mark)] = unwrapYattrMark(mark)
  })
  return formatting
}

/**
 * Mark drops already reported by {@link warnDroppedMark}, per schema.
 *
 * @type {WeakMap<import('prosemirror-model').Schema, Set<string>>}
 */
const reportedMarkDrops = new WeakMap()

/**
 * Warn once per schema and `key` that content from Y lost a mark because the
 * schema cannot hold it. The view renders the content without the mark, and
 * the reconcile fix writes the removal into Y like any other schema
 * normalization.
 *
 * @param {import('prosemirror-model').Schema} schema
 * @param {string} key
 * @param {string} reason
 */
const warnDroppedMark = (schema, key, reason) => {
  let reported = reportedMarkDrops.get(schema)
  if (reported == null) reportedMarkDrops.set(schema, (reported = new Set()))
  if (reported.has(key)) return
  reported.add(key)
  console.warn(`[y/prosemirror] ${reason}, so content from Y is rendered without it (logged once per schema)`)
}

/**
 * The mark type for a delta format key, or `null` (with a warning) when the
 * schema declares no such mark.
 *
 * @param {import('prosemirror-model').Schema} schema
 * @param {string} key
 * @return {import('prosemirror-model').MarkType | null}
 */
const declaredMarkType = (schema, key) => {
  const name = yattr2markname(key)
  const markType = schema.marks[name]
  if (markType == null) {
    warnDroppedMark(schema, name, `the schema declares no mark "${name}"`)
    return null
  }
  return markType
}

/**
 * Whether `parentType` may hold content carrying a `markType` mark (warns
 * when it may not). `null` stands for an unknown parent and allows every
 * mark.
 *
 * @param {import('prosemirror-model').NodeType | null} parentType
 * @param {import('prosemirror-model').MarkType} markType
 */
const allowedIn = (parentType, markType) => {
  if (parentType == null || parentType.allowsMarkType(markType)) return true
  warnDroppedMark(parentType.schema, `${parentType.name}>${markType.name}`, `"${parentType.name}" does not allow the "${markType.name}" mark`)
  return false
}

/**
 * Convert a delta `format` object to PM marks. `null` entries (which mean
 * "this mark is absent / cleared") are filtered out - a custom attribution
 * mapper may emit `null` for absent attribution kinds, and a fresh insert
 * should not materialize a mark for them. Hashed overlapping-mark keys are
 * mapped back to their mark name via {@link yattr2markname}. Marks the schema
 * does not declare, or that `parentType` does not allow, are dropped with a
 * warning (see {@link warnDroppedMark}).
 *
 * @param {{[key:string]:any}|null} formatting
 * @param {import('prosemirror-model').Schema} schema
 * @param {import('prosemirror-model').NodeType | null} [parentType] the node
 *   type that will hold the marked content
 */
export const formattingAttributesToMarks = (formatting, schema, parentType = null) =>
  object.map(formatting ?? {}, (v, k) => {
    if (v == null) return null
    const markType = declaredMarkType(schema, k)
    if (markType == null || !allowedIn(parentType, markType)) return null
    return markType.create(wrapYattrMarkValue(markType.name, v))
  }).filter(m => m != null)

/**
 * Memo for the canonical snapshot shape ({@link nodeToDeltaCached}).
 *
 * ProseMirror nodes are persistent immutable structures, so a node's
 * canonical delta is a pure function of the node object - unchanged subtrees
 * keep object identity across transactions and their snapshots can be
 * reused. Entries are frozen (`done()`) before they are stored: reference
 * sharing across successive snapshots is only safe for frozen nested deltas
 * (lib0's copy-on-write clones a frozen child before any mutation, while an
 * unfrozen shared child would be mutated in place, silently corrupting every
 * other snapshot that holds it).
 *
 * Only the `(nodeName = default, canonicalize = true)` shape is ever cached;
 * the non-canonical caller ({@link docToDelta}) bypasses the
 * memo entirely, so an attributed-variant render can never poison a
 * canonical snapshot or vice versa.
 *
 * @type {WeakMap<Node, ProsemirrorDelta>}
 */
const canonicalDeltaCache = new WeakMap()

/**
 * Memoized {@link nodeToDelta} for the canonical (PM -> Y) shape, equivalent
 * to `nodeToDelta(n, undefined, true)` except that the returned delta is
 * frozen (`done()`) and shared: repeated calls for the same node object
 * return the same instance, and unchanged subtrees of a rebuilt document hit
 * the memo, making a document snapshot O(changed spine) instead of O(doc).
 *
 * The result is a shared read value - consumers must never mutate it (a
 * mutation attempt throws, because the delta is frozen). Freezing is also
 * what keeps the sharing safe under lib0's copy-on-write, and it is
 * shape-stable: snapshot deltas contain only insert/text ops, so `done()`'s
 * trailing-retain trim never applies.
 *
 * @param {Node} n
 * @return {ProsemirrorDelta}
 */
export const nodeToDeltaCached = n => {
  const cached = canonicalDeltaCache.get(n)
  if (cached !== undefined) return cached
  const d = /** @type {ProsemirrorDelta} */ (nodeToDelta(n, undefined, true).done())
  canonicalDeltaCache.set(n, d)
  return d
}

/**
 * @param {Node} n
 * @param {string?} nodeName
 * @param {boolean} [canonicalize] When `true`, the emitted name has the
 *   {@link ATTRIBUTED_SUFFIX} stripped (PM -> Y direction). The flag propagates
 *   through the child recursion. Canonical child snapshots come from (and
 *   populate) the {@link canonicalDeltaCache}, so the returned delta shares
 *   frozen child deltas with every other canonical snapshot of the same
 *   nodes; the root itself stays a mutable `done(false)` builder.
 * @return {ProsemirrorDelta}
 */
export const nodeToDelta = (n, nodeName = n.type.name, canonicalize = false) => {
  const d = delta.create(canonicalize && nodeName != null ? canonicalNodeName(nodeName) : nodeName, $prosemirrorDelta)
  // `y-attributed` is a render-only marker injected when a node is rendered
  // under its `--attributed` variant (see the injections in `applyNodeFormat`
  // and `deltaToPNode`). It must never persist in Y - strip it on the PM->Y
  // (canonicalize) path, symmetric to the variant-name canonicalization above.
  // Otherwise Y stores a canonical node carrying `y-attributed`, which the
  // canonical PM type cannot round-trip, and the reconcile loop never converges.
  if (canonicalize && n.attrs['y-attributed'] !== undefined) {
    const { 'y-attributed': _omit, ...rest } = n.attrs
    d.setAttrs(rest)
  } else {
    d.setAttrs(n.attrs)
  }
  n.content.content.forEach(c => {
    d.insert(c.isText ? (c.text ?? []) : [canonicalize ? nodeToDeltaCached(c) : nodeToDelta(c, undefined, false)], marksToFormattingAttributes(c.marks))
  })
  return d.done(false)
}

/**
 * @param {Node} doc
 */
export const docToDelta = doc => nodeToDelta(doc, null)

/**
 * Content index (lib0 delta coordinates: 1 slot per character, 1 slot per element child)
 * of the child at `childIndex` within `parent`. This mirrors how `nodeToDelta` renders a
 * PM node - text as strings, every other child as a single embed.
 *
 * @param {Node} parent
 * @param {number} childIndex
 * @return {number}
 */
const pmContentIndex = (parent, childIndex) => {
  let idx = 0
  for (let i = 0; i < childIndex; i++) {
    const child = parent.child(i)
    idx += child.isText ? child.nodeSize : 1
  }
  return idx
}

/**
 * Transforms a Prosemirror position to a lib0 delta position (a tree position) rooted at
 * the PM doc - the coordinate space of the binding's view side.
 *
 * @param {import('prosemirror-model').ResolvedPos} resolvedPos
 * @return {import('lib0/delta/position').Pos}
 */
export const resolvedPositionToDeltaPosition = (resolvedPos) => {
  const depth = resolvedPos.depth
  /**
   * @type {Array<number>}
   */
  const path = []
  for (let d = 0; d < depth; d++) {
    path.push(pmContentIndex(resolvedPos.node(d), resolvedPos.index(d)))
  }
  const parent = resolvedPos.node(depth)
  const terminal = pmContentIndex(parent, resolvedPos.index(depth)) + resolvedPos.textOffset
  path.push(terminal)
  const contentLength = pmContentIndex(parent, parent.childCount)
  // End-of-parent binds left; position 0 in an empty parent also binds left so the
  // position is retained if content is inserted later.
  const assoc = (terminal > 0 && terminal === contentLength) || (resolvedPos.pos === 0 && contentLength === 0) ? -1 : 1
  return dpos.create(path, assoc)
}

/**
 * Canonical attrs of a PM node: the render-only `y-attributed` marker
 * stripped, mirroring {@link nodeToDelta}'s canonicalize branch. Returns the
 * node's own attrs object when nothing needs stripping, so an identity
 * comparison between two nodes' canonical attrs stays meaningful.
 *
 * @param {Node} n
 * @return {Record<string, any>}
 */
const canonicalAttrs = n => {
  if (n.attrs['y-attributed'] !== undefined) {
    const { 'y-attributed': _omit, ...rest } = n.attrs
    return rest
  }
  return n.attrs
}

/**
 * Delta length of one PM child in snapshot coordinates: a text child
 * contributes its character count (`nodeSize` of a text node), an element
 * child contributes one position.
 *
 * @param {Node} c
 * @return {number}
 */
const childDeltaLength = c => c.isText ? c.nodeSize : 1

/**
 * Snapshot-shaped delta of a slice of a children array (a changed window),
 * built exactly like {@link nodeToDelta}'s child loop - element children
 * come from the canonical memo, so the window carries frozen shared
 * subtrees with memoized fingerprints and diffing two windows is cheap.
 *
 * @param {readonly Node[]} children
 * @param {number} from
 * @param {number} to
 * @return {delta.DeltaBuilderAny}
 */
const windowDelta = (children, from, to) => {
  const d = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  for (let i = from; i < to; i++) {
    const c = children[i]
    d.insert(c.isText ? (c.text ?? '') : [nodeToDeltaCached(c)], marksToFormattingAttributes(c.marks))
  }
  return /** @type {delta.DeltaBuilderAny} */ (d.done(false))
}

/**
 * The walk's single-pair decision, matching `delta.diff`'s pairing
 * semantics exactly: the default pairs nodes with equal canonical names
 * (lib0's `defaultCompare` on the canonical snapshots), and a custom
 * predicate receives the same `(fromNode, toNode)` lib0 delta nodes that
 * `diff` would pass.
 *
 * @param {Node} a
 * @param {Node} b
 * @param {NodeCompare | undefined} compare
 * @return {boolean}
 */
const walkPairable = (a, b, compare) => compare == null
  ? canonicalNodeName(a.type.name) === canonicalNodeName(b.type.name)
  : compare(/** @type {any} */ (nodeToDeltaCached(a)), /** @type {any} */ (nodeToDeltaCached(b)))

/**
 * @param {Node} prev
 * @param {Node} next
 * @param {NodeCompare | undefined} compare
 * @param {string?} name the change root's name, mirroring diff's
 *   `d1.name === d2.name ? d1.name : null` convention in canonical space
 * @param {import('lib0/delta/position').Pos} [hint] where the change starts
 *   at this level, mirroring `delta.diff`'s `options.hint`: the leading path
 *   step is a content index (delta coordinates) into `prev`'s children, the
 *   rest descends. Forwarded into the changed window's `delta.diff` (shifted
 *   by the identity-trimmed prefix) and into the single-pair recursion (one
 *   step consumed). A wrong hint only shifts placement, never correctness.
 * @return {delta.DeltaBuilderAny}
 */
const pmNodeDiff = (prev, next, compare, name, hint) => {
  const d = /** @type {delta.DeltaBuilderAny} */ (delta.create(name, delta.$deltaAny))
  const pa = canonicalAttrs(prev)
  const na = canonicalAttrs(next)
  if (pa !== na) {
    for (const k in na) {
      if (!fun.equalityDeep(pa[k], na[k])) d.setAttr(k, na[k])
    }
    for (const k in pa) {
      if (!(k in na)) d.deleteAttr(k)
    }
  }
  // Fragment identity is the attr-only fast path: an unchanged content
  // object means zero child work (a `setNodeAttribute` copies the node but
  // reuses its content Fragment).
  if (prev.content !== next.content) {
    const prevC = prev.content.content
    const nextC = next.content.content
    // trim the common prefix/suffix by node object identity, accumulating
    // DELTA positions (text length vs one slot per element). Identical
    // node objects also carry identical marks, so the parent-op format is
    // trivially equal across a trimmed pair.
    let i = 0
    let prefixLen = 0
    while (i < prevC.length && i < nextC.length && prevC[i] === nextC[i]) {
      prefixLen += childDeltaLength(prevC[i])
      i++
    }
    // the `> i` bounds prevent double-counting a node already consumed by
    // the prefix when both sides share a run reachable from either end
    let pEnd = prevC.length
    let nEnd = nextC.length
    while (pEnd > i && nEnd > i && prevC[pEnd - 1] === nextC[nEnd - 1]) {
      pEnd--
      nEnd--
    }
    if (pEnd > i || nEnd > i) {
      if (prefixLen > 0) d.retain(prefixLen)
      const hintStep = hint?.path[0]
      if (
        pEnd - i === 1 && nEnd - i === 1 && !prevC[i].isText && !nextC[i].isText &&
        fun.equalityDeep(marksToFormattingAttributes(prevC[i].marks), marksToFormattingAttributes(nextC[i].marks)) &&
        walkPairable(prevC[i], nextC[i], compare)
      ) {
        // a single paired element: keep walking by reference inside it, so
        // deep edits never explode the wide levels above them. The hint
        // descends when its leading step names exactly this child (which
        // sits at content index `prefixLen`), mirroring diff's own descent.
        const cn = canonicalNodeName(prevC[i].type.name)
        const nn = canonicalNodeName(nextC[i].type.name)
        const inner = pmNodeDiff(prevC[i], nextC[i], compare, cn === nn ? cn : null,
          hint != null && hintStep === prefixLen ? { path: hint.path.slice(1), assoc: hint.assoc } : undefined)
        if (inner.isEmpty()) {
          d.retain(1)
        } else {
          d.modify(/** @type {any} */ (inner))
        }
      } else {
        // structural window (splits, joins, inserts, deletes, text edits,
        // mark changes): delegate to `delta.diff` over memoized window
        // snapshots - it produces granular text diffs and the correct
        // tri-state format updates, and `append` clones its ops in after
        // the prefix retain (merging the seam). The hint shifts into window
        // coordinates; one that points into the trimmed prefix is dropped
        // (the identity trim already proved the change starts later).
        const windowHint = hint != null && typeof hintStep === 'number' && hintStep >= prefixLen
          ? { path: [hintStep - prefixLen, ...hint.path.slice(1)], assoc: hint.assoc }
          : undefined
        d.append(/** @type {any} */ (delta.diff(/** @type {any} */ (windowDelta(prevC, i, pEnd)), /** @type {any} */ (windowDelta(nextC, i, nEnd)), { compare, hint: windowHint })))
      }
    }
    // the suffix needs no ops - a change delta retains to the end implicitly
  }
  return /** @type {delta.DeltaBuilderAny} */ (d.done(false))
}

/**
 * Incremental canonical diff of two ProseMirror documents by reference
 * identity. PM nodes are persistent immutable trees: unchanged subtrees keep
 * object identity across transactions, so trimming children by `===` finds
 * the changed window without inspecting content, and only the window is
 * diffed (via `delta.diff` over memoized frozen snapshots). Typing into one
 * block of an N-block document costs N pointer comparisons plus one small
 * text diff - no fingerprint hashing, no full-tree walk.
 *
 * Contract: applying the result to `nodeToDeltaCached(prevDoc)` yields a
 * state canonically equal to `nodeToDeltaCached(nextDoc)`. Op granularity
 * and modify-pairing may differ from a global `delta.diff` of the two
 * snapshots in rare ambiguous windows; both stay inside the documented
 * "Diffing ambiguity" class (CAVEATS.md) and converge identically.
 *
 * @param {Node} prevDoc
 * @param {Node} nextDoc
 * @param {NodeCompare} [compare] the same pairing predicate semantics as
 *   `delta.diff`'s `compare` option; threaded into every window diff and
 *   into the walk's own single-pair decision
 * @param {import('lib0/delta/position').Pos} [hint] where the change starts,
 *   as a doc-rooted delta position (see `resolvedPositionToDeltaPosition`),
 *   mirroring `delta.diff`'s `options.hint`: within a run of equally valid
 *   diffs (repeated characters) the first edit is placed at the hint. A
 *   wrong hint only shifts placement, never correctness.
 * @return {delta.DeltaBuilderAny} the change, `done(false)`
 */
export const pmDocDiff = (prevDoc, nextDoc, compare, hint) => {
  const pn = canonicalNodeName(prevDoc.type.name)
  const nn = canonicalNodeName(nextDoc.type.name)
  return pmNodeDiff(prevDoc, nextDoc, compare, pn === nn ? pn : null, hint)
}

/**
 * Apply node-level format (node marks) at `pos`. When the resulting attribution
 * marks change the node's {@link attributedVariant}, flip the node type with a
 * single size-preserving `setNodeMarkup` (which also sets the resulting mark
 * set atomically - this avoids an intermediate state where the canonical type
 * would carry a mark it does not declare). Otherwise this is byte-identical to
 * the previous per-key `addNodeMark`/`removeNodeMark` loop.
 *
 * @param {import('prosemirror-state').Transaction} tr
 * @param {number} pos
 * @param {Record<string, any> | null | undefined} format
 * @param {AttributedNodesPredicate} attributedNodes
 */
const applyNodeFormat = (tr, pos, format, attributedNodes) => {
  const schema = tr.doc.type.schema
  const node = tr.doc.nodeAt(pos)
  if (node == null) return
  // Resolved only when a mark is added: this runs for every retained node of
  // a change, and resolving is linear in the number of siblings.
  const parentType = () => tr.doc.resolve(pos).parent.type
  /**
   * Format keys this node can hold: a clear of a mark the schema does not
   * declare has nothing to remove, an addition the schema cannot hold here is
   * dropped with a warning.
   *
   * @type {Record<string, any>}
   */
  const applicable = {}
  object.forEach(format ?? {}, (v, k) => {
    const markName = yattr2markname(k)
    const value = resolveYattrFormatValue(markName, v)
    if (value == null) {
      if (schema.marks[markName] != null) applicable[k] = null
    } else {
      const markType = declaredMarkType(schema, k)
      if (markType != null && allowedIn(parentType(), markType)) applicable[k] = value
    }
  })
  let resultingMarks = node.marks
  object.forEach(applicable, (value, k) => {
    const markName = yattr2markname(k)
    const markType = schema.marks[markName]
    // For overlapping marks, remove the specific instance carried by this
    // (hashed) key rather than every mark of the type.
    const mark = node.marks.find(m => markToYattrName(m) === k)
    resultingMarks = value == null
      ? (mark ?? markType).removeFromSet(resultingMarks)
      : schema.mark(markName, wrapYattrMarkValue(markName, value)).addToSet(resultingMarks)
  })
  const targetType = schema.nodes[
    attributedVariant(canonicalNodeName(node.type.name), marksToFormattingAttributes(resultingMarks), attributedNodes, schema)
  ]
  if (targetType !== node.type) {
    tr.setNodeMarkup(pos, targetType, object.assign({ 'y-attributed': true }, node.attrs), resultingMarks)
  } else {
    object.forEach(applicable, (value, k) => {
      const markName = yattr2markname(k)
      if (value == null) {
        const mark = node.marks.find(m => markToYattrName(m) === k)
        tr.removeNodeMark(pos, mark ?? schema.marks[markName])
      } else {
        tr.addNodeMark(pos, schema.mark(markName, wrapYattrMarkValue(markName, value)))
      }
    })
  }
}

/**
 * A single child op of a {@link ProsemirrorDelta} (retain / modify / insert /
 * text / delete).
 *
 * @typedef {delta.ChildrenOpAny} ProsemirrorDeltaOp
 */

/**
 * A grouped run of insert/text and/or delete ops sharing one anchor position,
 * applied as a single atomic replace step (see {@link deltaToPSteps}).
 *
 * @typedef {object} ReplaceBundle
 * @property {Array<delta.InsertOp<any>|delta.TextOp>} inserts insert/text ops, in delta order
 * @property {Array<delta.DeleteOp>} deletes delete ops, in delta order
 */

/**
 * @param {import('prosemirror-state').Transaction} tr
 * @param {ProsemirrorDelta} d
 * @param {Node} [pnode]
 * @param {{ i: number }} [currPos]
 * @param {AttributedNodesPredicate} [attributedNodes]
 * @return {import('prosemirror-state').Transaction}
 */
export const deltaToPSteps = (tr, d, pnode = tr.doc, currPos = { i: 0 }, attributedNodes = defaultAttributedNodes) => {
  const schema = tr.doc.type.schema
  let currParentIndex = 0
  let nOffset = 0
  const pchildren = pnode.children
  for (const attr of d.attrs) {
    if (delta.$setAttrOp.check(attr)) {
      // can be a delete attr op iff attribution node is transformed back to a normal node
      // `currPos.i - 1` is the position of the node `d` describes; the root
      // (the doc node) has no position and takes a doc-attribute step
      const pos = currPos.i - 1
      if (pos < 0) tr.setDocAttribute(attr.key, attr.value)
      else tr.setNodeAttribute(pos, attr.key, attr.value)
    } else if (delta.$deleteAttrOp.check(attr)) {
      // Y no longer holds the attribute (a change render of a hard-deleted
      // attr). A ProseMirror node materializes every attribute, so the
      // deletion becomes the schema default. A required attr has none: on a
      // pending-deleted node it becomes `null`, mirroring the fresh render in
      // `deltaToPNodeOrDrop` so peers agree whichever path rendered the node
      // (writes into a pending delete are never re-asserted, see
      // `ProsemirrorRdt.applyDelta`); on a live node it is left alone and the
      // fix re-asserts the last known value into Y.
      const pos = currPos.i - 1
      const node = pos < 0 ? tr.doc : tr.doc.nodeAt(pos)
      const spec = node?.type.spec.attrs?.[attr.key]
      if (node == null || spec == null) continue
      if (object.hasProperty(spec, 'default')) {
        if (pos < 0) tr.setDocAttribute(attr.key, spec.default)
        else tr.setNodeAttribute(pos, attr.key, spec.default)
      } else if (pos >= 0 && isPendingDeleteNode(node)) {
        tr.setNodeAttribute(pos, attr.key, null)
      }
    }
  }
  // Group ops into maximal runs bounded by retain/modify ops (the only ops that
  // re-anchor position relative to `pchildren`; `delta.diff` never emits a retain
  // inside a replace run, so every op within a run shares the same anchor). Each
  // run of inserts/deletes is applied as a single atomic replace `bundle`
  // (`{ inserts, deletes }`), so ProseMirror validates only the final state - a
  // pure insert is a replace with no deletes, a pure delete a replace with no
  // inserts. Applying delete and insert as separate steps would expose an
  // intermediate that some content expressions reject - e.g. `attributed*
  // (block|attributed) attributed*` (one non-attributed block flanked by
  // attributed nodes) rejects both the delete-first (empty) and insert-first
  // (two-block) intermediates.
  /** @type {Array<ProsemirrorDeltaOp | ReplaceBundle>} */
  const ordered = []
  /** @type {Array<delta.InsertOp<any>|delta.TextOp>} */
  let runInserts = []
  /** @type {Array<delta.DeleteOp>} */
  let runDeletes = []
  const flushRun = () => {
    if (runInserts.length > 0 || runDeletes.length > 0) {
      ordered.push({ inserts: runInserts, deletes: runDeletes })
    }
    runInserts = []
    runDeletes = []
  }
  // `DeltaAny`: iterating the recursive ProsemirrorDelta children type here
  // exceeds TypeScript's instantiation depth limit (TS2589)
  for (const op of /** @type {delta.DeltaAny} */ (d).children) {
    if (delta.$retainOp.check(op) || delta.$modifyOp.check(op)) {
      flushRun()
      ordered.push(op)
    } else if (delta.$deleteOp.check(op)) {
      runDeletes.push(op)
    } else { // insert / text
      runInserts.push(/** @type {any} */ (op))
    }
  }
  flushRun()

  ordered.forEach(op => {
    if (delta.$retainOp.check(op)) {
      // skip over i children
      let i = op.retain
      while (i > 0) {
        const pc = pchildren[currParentIndex]
        if (pc === undefined) {
          throw new Error('[y/prosemirror]: retain operation is out of bounds')
        }
        if (pc.isText) {
          if (op.format != null) {
            const from = currPos.i
            const to = currPos.i + math.min(pc.nodeSize - nOffset, i)
            object.forEach(op.format, (v, k) => {
              if (v == null) {
                // A clear of a mark the schema does not declare has nothing to
                // remove. It must not reach `removeMark` without a mark: that
                // removes every mark in the range.
                const markType = schema.marks[yattr2markname(k)]
                if (markType == null) return
                // A format-remove carries no attrs, so match the specific
                // instance on the current text node - sibling overlaps of the
                // same type (e.g. another comment) must not be removed with it.
                // Their relative array order is not significant (see CAVEATS).
                const mark = pc.marks.find(m => markToYattrName(m) === k)
                tr.removeMark(from, to, mark ?? markType)
              } else {
                const markType = declaredMarkType(schema, k)
                if (markType == null || !allowedIn(pnode.type, markType)) return
                tr.addMark(from, to, markType.create(wrapYattrMarkValue(markType.name, v)))
              }
            })
          }
          if (i + nOffset < pc.nodeSize) {
            nOffset += i
            currPos.i += i
            i = 0
          } else {
            currParentIndex++
            i -= pc.nodeSize - nOffset
            currPos.i += pc.nodeSize - nOffset
            nOffset = 0
          }
        } else {
          // TODO see schema.js for more info on marking nodes
          applyNodeFormat(tr, currPos.i, op.format, attributedNodes)
          currParentIndex++
          currPos.i += pc.nodeSize
          i--
        }
      }
    } else if (delta.$modifyOp.check(op)) {
      applyNodeFormat(tr, currPos.i, op.format, attributedNodes)
      const child = pchildren[currParentIndex++]
      const childStart = currPos.i
      // Snapshot `tr.doc.content.size` so we can detect inserts/deletes
      // appended inside the recursion below.
      const sizeBefore = tr.doc.content.size
      currPos.i = childStart + 1
      deltaToPSteps(tr, op.value, child, currPos, attributedNodes)
      // `lib0/delta.diff` produces short deltas that omit trailing
      // retains, so the recursive call may exit before `currPos.i`
      // reaches the child's close tag. Snap forward to the position right
      // after the child's close in the *current* `tr.doc`, accounting for
      // any size delta from inserts/deletes inside the recursion.
      const netChange = tr.doc.content.size - sizeBefore
      currPos.i = childStart + child.nodeSize + netChange
    } else {
      // Atomic replace bundle: build the inserted content, measure the deleted
      // range (advancing currParentIndex/nOffset exactly like a delete would),
      // and replace in one step. currPos.i ends past the inserted content,
      // matching delete-then-insert (delete leaves currPos.i, insert advances
      // it). Delete sizing reads the frozen `pchildren` snapshot, which is what
      // makes the single combined range correct.
      const bundle = /** @type {ReplaceBundle} */ (op)
      /** @type {Array<Node>} */
      const newPChildren = []
      for (const ins of bundle.inserts) {
        if (delta.$insertOp.check(ins)) {
          for (const n of ins.insert) {
            // A node whose content cannot satisfy the schema is dropped here;
            // the RDT fix deletes it from Y (see deltaToPNodeOrDrop).
            const pNode = deltaToPNodeOrDrop(n, schema, ins.format, attributedNodes, pnode.type)
            if (pNode !== null) newPChildren.push(pNode)
          }
        } else { // text op
          newPChildren.push(schema.text(ins.insert, formattingAttributesToMarks(ins.format, schema, pnode.type)))
        }
      }
      const insertedFrag = Fragment.from(newPChildren)
      let deletedSize = 0
      for (const del of bundle.deletes) {
        for (let remainingDelLen = del.delete; remainingDelLen > 0;) {
          const pc = pchildren[currParentIndex]
          if (pc === undefined) {
            throw new Error('[y/prosemirror]: delete operation is out of bounds')
          }
          if (pc.isText) {
            const delLen = math.min(pc.nodeSize - nOffset, remainingDelLen)
            deletedSize += delLen
            nOffset += delLen
            if (nOffset === pc.nodeSize) {
              nOffset = 0
              currParentIndex++
            }
            remainingDelLen -= delLen
          } else {
            deletedSize += pc.nodeSize
            currParentIndex++
            remainingDelLen--
          }
        }
      }
      if (deletedSize > 0 || insertedFrag.size > 0) {
        // Skipped when every inserted node was dropped and nothing is deleted:
        // an empty replace would only mark the transaction as changed.
        tr.step(new ReplaceStep(currPos.i, currPos.i + deletedSize, new Slice(insertedFrag, 0, 0)))
      }
      currPos.i += insertedFrag.size
    }
  })
  return tr
}

/**
 * Build the ProseMirror node for `d`, or drop it.
 *
 * Children are built first (a dropped child is simply absent from the
 * parent's content), then the node's own content expression is checked with
 * `contentMatch.matchFragment` plus `validEnd`. Marks the schema cannot hold
 * where they sit (undeclared, or not allowed by the parent) are dropped with
 * a warning instead (see {@link formattingAttributesToMarks}); the node
 * itself is kept.
 *
 * - Valid content: created as-is (`createAndFill` adds nothing).
 * - Invalid content on the schema's top node: filled through `createAndFill`.
 *   The document itself can never be dropped, and the filler reaches Y through
 *   the RDT fix. An unfillable top node throws.
 * - Invalid content on any other node: dropped (`null`). Two individually
 *   valid concurrent changes can compose into an invalid parent, e.g. both
 *   paragraphs of a `block+` blockquote deleted by two peers. The only
 *   schema-valid resolution is deleting the parent, and every peer derives
 *   that deletion locally through its fix, so all peers converge
 *   (yjs/y-prosemirror#258). Filling instead would make every peer write its
 *   own filler into Y.
 * - Invalid content on a node rendered as a pending delete
 *   (`y-attributed-delete`): created UNFILLED and UNCHECKED through
 *   `NodeType.create`. The view can neither delete such a node (the Y side
 *   keeps rendering it until the suggestion is resolved) nor fill it (the Y
 *   side reverts writes into a deleted node with their inverse, which the
 *   view cannot apply without emptying the node again); either would loop
 *   forever. Rendering it as-is makes the fix empty. The node disappears once
 *   the deletion is accepted or a peer editing the base document drops it.
 * - A required attribute (no schema default) that Y does not hold makes the
 *   node exactly as invalid as rejected content and takes the same path:
 *   dropped, or - on the top node and on a pending delete, which cannot be
 *   dropped - held as `null` (`computeAttrs` treats only `undefined` as
 *   missing). Y content like that comes from outside the binding (a peer with
 *   a different schema, or an accept that shipped a node without its attrs);
 *   throwing here would escape into Y's event delivery and desync the view.
 *
 * @param {ProsemirrorDelta} d
 * @param {import('prosemirror-model').Schema} schema
 * @param {delta.Formats|null} dformat
 * @param {AttributedNodesPredicate} attributedNodes
 * @param {import('prosemirror-model').NodeType | null} [parentType] the type
 *   of the node that will hold this one (checks its node marks); `null` when
 *   unknown
 * @return {Node|null} `null` when the node was dropped
 */
const deltaToPNodeOrDrop = (d, schema, dformat, attributedNodes, parentType = null) => {
  /**
   * @type {Object<string,any>}
   */
  const attrs = {}
  for (const attr of d.attrs) {
    // only a `setAttr` carries a value; a `deleteAttr` (a change render of a
    // hard-deleted attribute) leaves the key unset, handled below
    if (delta.$setAttrOp.check(attr)) attrs[attr.key] = attr.value
  }
  const canonical = d.name == null ? schema.topNodeType.name : canonicalNodeName(d.name)
  const nodeType = schema.nodes[attributedVariant(canonical, dformat, attributedNodes, schema)]
  if (!nodeType) {
    throw new Error(
      '[y/prosemirror]: node type does not exist in the schema: ' + d.name
    )
  }
  /**
   * @type {Array<Node>}
   */
  const inputChildren = []
  // `DeltaAny`: see the children loop in deltaToPSteps (TS2589)
  for (const c of /** @type {delta.DeltaAny} */ (d).children) {
    if (delta.$insertOp.check(c)) {
      for (const cn of c.insert) {
        const child = deltaToPNodeOrDrop(cn, schema, c.format, attributedNodes, nodeType)
        if (child !== null) inputChildren.push(child)
      }
    } else if (delta.$textOp.check(c)) {
      inputChildren.push(schema.text(c.insert, formattingAttributesToMarks(c.format, schema, nodeType)))
    }
  }
  const inputMarks = formattingAttributesToMarks(dformat, schema, parentType)
  const finalAttrs = canonical !== nodeType.name
    ? object.assign({
      'y-attributed': true
    }, attrs)
    : attrs
  const undroppable = nodeType === schema.topNodeType || attributionKinds(dformat).delete
  const attrSpecs = nodeType.spec.attrs
  for (const key in attrSpecs) {
    // required = no `default` in the spec (`Attribute.hasDefault` in prosemirror-model)
    if (!object.hasProperty(attrSpecs[key], 'default') && finalAttrs[key] === undefined) {
      if (!undroppable) return null
      finalAttrs[key] = null
    }
  }
  const content = Fragment.from(inputChildren)
  const match = nodeType.contentMatch.matchFragment(content)
  if ((match === null || !match.validEnd) && nodeType !== schema.topNodeType) {
    if (!attributionKinds(dformat).delete) return null
    return nodeType.create(finalAttrs, content, inputMarks)
  }
  const pNode = nodeType.createAndFill(
    finalAttrs,
    content,
    inputMarks
  )
  if (pNode === null) {
    throw new Error('[y/prosemirror]: failed to create node: ' + d.name)
  }
  return pNode
}

/**
 * Public node factory: {@link deltaToPNodeOrDrop} with a non-null contract.
 * Invalid descendants are dropped; a `d` that is itself invalid (and not the
 * document node) throws instead of being returned as `null`.
 *
 * @param {ProsemirrorDelta} d
 * @param {import('prosemirror-model').Schema} schema
 * @param {delta.Formats|null} dformat
 * @param {AttributedNodesPredicate} [attributedNodes]
 * @return {Node}
 */
export const deltaToPNode = (d, schema, dformat, attributedNodes = defaultAttributedNodes) => {
  const pNode = deltaToPNodeOrDrop(d, schema, dformat, attributedNodes)
  if (pNode === null) {
    throw new Error('[y/prosemirror]: failed to create node: ' + d.name)
  }
  return pNode
}
