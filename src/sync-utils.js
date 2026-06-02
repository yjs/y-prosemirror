import * as Y from '@y/y'
import * as array from 'lib0/array'
import * as delta from 'lib0/delta'
import * as error from 'lib0/error'
import * as math from 'lib0/math'
import * as object from 'lib0/object'
import * as s from 'lib0/schema'
import { Node, Slice, Fragment } from 'prosemirror-model'
import {
  AddMarkStep,
  AddNodeMarkStep,
  AttrStep,
  DocAttrStep,
  RemoveMarkStep,
  RemoveNodeMarkStep,
  ReplaceAroundStep,
  ReplaceStep
} from 'prosemirror-transform'

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
  const kinds = {
    insert: format?.['y-attributed-insert'] != null,
    delete: format?.['y-attributed-delete'] != null,
    format: format?.['y-attributed-format'] != null
  }
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
 * against the freshly-rendered AM delta (where the key is absent).
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
 * Transform delta with attributions to delta with formats (marks).
 * @param {delta.DeltaAny} d
 * @param {function} attributionsToFormat
 */
export const deltaAttributionToFormat = (d, attributionsToFormat) => {
  const r = delta.create(d.name, $prosemirrorDelta)
  for (const attr of d.attrs) {
    // @ts-ignore
    r.attrs[attr.key] = attr.clone()
  }
  for (const child of d.children) {
    if (delta.$deleteOp.check(child)) {
      r.delete(child.delete)
    } else {
      const format = child.attribution ? attributionsToFormat(child.format, child.attribution) : child.format
      if (delta.$insertOp.check(child)) {
        r.insert(child.insert.map(c => delta.$deltaAny.check(c) ? deltaAttributionToFormat(c, attributionsToFormat) : c), format)
      } else if (delta.$textOp.check(child)) {
        r.insert(child.insert, format)
      } else if (delta.$retainOp.check(child)) {
        r.retain(child.retain, format)
      } else if (delta.$modifyOp.check(child)) {
        // @ts-ignore
        r.modify(/** @type {any} */ (deltaAttributionToFormat(child.value, attributionsToFormat)), format)
      } else {
        error.unexpectedCase()
      }
    }
  }
  return /** @type {ProsemirrorDelta} */ (r.done(false))
}

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
    formatting[mark.type.name] = mark.attrs
  })
  return formatting
}

/**
 * Convert a delta `format` object to PM marks. `null` entries (which mean
 * "this mark is absent / cleared") are filtered out - a custom attribution
 * mapper may emit `null` for absent attribution kinds, and a fresh insert
 * should not materialize a mark for them.
 *
 * @param {{[key:string]:any}|null} formatting
 * @param {import('prosemirror-model').Schema} schema
 */
export const formattingAttributesToMarks = (formatting, schema) =>
  object.map(formatting ?? {}, (v, k) => v != null ? schema.mark(k, v) : null).filter(m => m != null)

/**
 * @param {Array<Node>} ns
 * @return {ProsemirrorDelta}
 */
export const nodesToDelta = ns => {
  /**
   * @type {delta.DeltaBuilderAny}
   */
  const d = delta.create($prosemirrorDelta)
  ns.forEach(n => {
    d.insert(n.isText ? (n.text ?? []) : [nodeToDelta(n)], marksToFormattingAttributes(n.marks))
  })
  return d.done(false)
}

/**
 * Transforms a {@link Node} into a {@link Y.XmlFragment}
 * @param {Node} node
 * @param {Y.Type} fragment
 * @param {Object} [opts]
 * @param {Y.AbstractAttributionManager} [opts.attributionManager]
 * @returns {Y.Type}
 */
export function pmToFragment (node, fragment, { attributionManager = Y.noAttributionsManager } = {}) {
  // Canonicalize so the Y document never stores an attributed-variant name
  // (`--attributed` is a reserved suffix - identity when no variant is present).
  const initialPDelta = nodeToDelta(node, undefined, true).done()
  fragment.applyDelta(initialPDelta, attributionManager)

  return fragment
}

/**
 * Applies a {@link Y.XmlFragment}'s content as a ProseMirror {@link Transaction}
 * @param {Y.Type} fragment
 * @param {import('prosemirror-state').Transaction} tr
 * @param {object} ctx
 * @param {Y.AbstractAttributionManager} [ctx.attributionManager]
 * @param {typeof defaultMapAttributionToMark} [ctx.mapAttributionToMark]
 * @param {AttributedNodesPredicate} [ctx.attributedNodes]
 * @returns {import('prosemirror-state').Transaction}
 */
export function fragmentToTr (fragment, tr, {
  attributionManager = Y.noAttributionsManager,
  mapAttributionToMark = defaultMapAttributionToMark,
  attributedNodes = defaultAttributedNodes
} = {}) {
  const fragmentContent = deltaAttributionToFormat(
    fragment.toDelta(attributionManager, { deep: true }),
    mapAttributionToMark
  )
  const initialPDelta = nodeToDelta(tr.doc, undefined, true).done()
  const deltaBetweenPmAndFragment = delta.diff(initialPDelta, fragmentContent).done()

  return deltaToPSteps(tr, deltaBetweenPmAndFragment, undefined, undefined, attributedNodes).setMeta('y-sync-hydration', {
    delta: deltaBetweenPmAndFragment
  })
}

/**
 * Transforms a {@link Y.XmlFragment} into a {@link Node}
 * @param {Y.Type} fragment
 * @param {import('prosemirror-state').Transaction} tr
 * @return {Node}
 */
export function fragmentToPm (fragment, tr) {
  return fragmentToTr(fragment, tr).doc
}

/**
 * @param {Node} n
 * @param {string?} nodeName
 * @param {boolean} [canonicalize] When `true`, the emitted name has the
 *   {@link ATTRIBUTED_SUFFIX} stripped (PM -> Y direction). The flag propagates
 *   through the child recursion.
 * @return {ProsemirrorDelta}
 */
export const nodeToDelta = (n, nodeName = n.type.name, canonicalize = false) => {
  const d = delta.create(canonicalize && nodeName != null ? canonicalNodeName(nodeName) : nodeName, $prosemirrorDelta)
  d.setAttrs(n.attrs)
  n.content.content.forEach(c => {
    d.insert(c.isText ? (c.text ?? []) : [nodeToDelta(c, undefined, canonicalize)], marksToFormattingAttributes(c.marks))
  })
  return d.done(false)
}

/**
 * @param {Node} doc
 */
export const docToDelta = doc => nodeToDelta(doc, null)

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
  let resultingMarks = node.marks
  object.forEach(format ?? {}, (v, k) => {
    const markType = schema.marks[k]
    if (markType == null) return
    resultingMarks = v == null
      ? markType.removeFromSet(resultingMarks)
      : schema.mark(k, v).addToSet(resultingMarks)
  })
  const targetType = schema.nodes[
    attributedVariant(canonicalNodeName(node.type.name), marksToFormattingAttributes(resultingMarks), attributedNodes, schema)
  ]
  if (targetType !== node.type) {
    // TODO this assumes that when flipping the node type, that the new type fits in the same position within the parent
    // This is not always true and will fail with a single required node like BlockNote's blockContainer
    tr.setNodeMarkup(pos, targetType, object.assign({ 'yjs-suggestion-node': true }, node.attrs), resultingMarks)
  } else {
    object.forEach(format ?? {}, (v, k) => {
      if (v == null) {
        tr.removeNodeMark(pos, schema.marks[k])
      } else {
        tr.addNodeMark(pos, schema.mark(k, v))
      }
    })
  }
}

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
    tr.setNodeAttribute(currPos.i - 1, attr.key, attr.value)
  }
  d.children.forEach(op => {
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
                tr.removeMark(from, to, schema.marks[k])
              } else {
                tr.addMark(from, to, schema.mark(k, v))
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
    } else if (delta.$insertOp.check(op)) {
      const newPChildren = op.insert.map(ins => deltaToPNode(ins, schema, op.format, attributedNodes))
      tr.step(new ReplaceStep(currPos.i, currPos.i, new Slice(Fragment.from(newPChildren), 0, 0)))
      currPos.i += newPChildren.reduce((s, c) => c.nodeSize + s, 0)
    } else if (delta.$textOp.check(op)) {
      tr.step(new ReplaceStep(currPos.i, currPos.i, new Slice(Fragment.from(schema.text(op.insert, formattingAttributesToMarks(op.format, schema))), 0, 0)))
      currPos.i += op.length
    } else if (delta.$deleteOp.check(op)) {
      for (let remainingDelLen = op.delete; remainingDelLen > 0;) {
        const pc = pchildren[currParentIndex]
        if (pc === undefined) {
          throw new Error('[y/prosemirror]: delete operation is out of bounds')
        }
        if (pc.isText) {
          const delLen = math.min(pc.nodeSize - nOffset, remainingDelLen)
          tr.step(new ReplaceStep(currPos.i, currPos.i + delLen, Slice.empty))
          nOffset += delLen
          if (nOffset === pc.nodeSize) {
            // TODO this can't actually "jump out" of the current node
            // jump to next node
            nOffset = 0
            currParentIndex++
          }
          remainingDelLen -= delLen
        } else {
          tr.step(new ReplaceStep(currPos.i, currPos.i + pc.nodeSize, Slice.empty))
          currParentIndex++
          remainingDelLen--
        }
      }
    }
  })
  return tr
}

/**
 * @param {ProsemirrorDelta} d
 * @param {import('prosemirror-model').Schema} schema
 * @param {delta.FormattingAttributes|null} dformat
 * @param {AttributedNodesPredicate} [attributedNodes]
 * @return {Node}
 */
export const deltaToPNode = (d, schema, dformat, attributedNodes = defaultAttributedNodes) => {
  /**
   * @type {Object<string,any>}
   */
  const attrs = {}
  for (const attr of d.attrs) {
    attrs[attr.key] = attr.value
  }
  const dc = d.children.map(c => delta.$insertOp.check(c) ? c.insert.map(cn => deltaToPNode(cn, schema, c.format, attributedNodes)) : (delta.$textOp.check(c) ? [schema.text(c.insert, formattingAttributesToMarks(c.format, schema))] : []))
  const canonical = d.name == null ? 'doc' : canonicalNodeName(d.name)
  const nodeType = schema.nodes[attributedVariant(canonical, dformat, attributedNodes, schema)]
  if (!nodeType) {
    throw new Error(
      '[y/prosemirror]: node type does not exist in the schema: ' + d.name
    )
  }
  const inputChildren = dc.flat(1)
  const inputMarks = formattingAttributesToMarks(dformat, schema)
  const finalAttrs = canonical !== nodeType.name
    ? object.assign({
      'yjs-suggestion-node': true
    }, attrs)
    : attrs
  const pNode = nodeType.createAndFill(
    finalAttrs,
    inputChildren,
    inputMarks
  )
  if (pNode === null) {
    throw new Error('[y/prosemirror]: failed to create node: ' + d.name)
  }
  return pNode
}

/**
 * @param {Node} beforeDoc
 * @param {Node} afterDoc
 */
export const docDiffToDelta = (beforeDoc, afterDoc) => {
  const initialDelta = nodeToDelta(beforeDoc)
  const finalDelta = nodeToDelta(afterDoc)
  return delta.diff(initialDelta.done(), finalDelta.done())
}

/**
 * @param {Transaction} tr
 */
export const trToDelta = (tr) => {
  // const d = delta.create($prosemirrorDelta)
  // tr.steps.forEach((step, i) => {
  //   const stepDelta = stepToDelta(step, tr.docs[i])
  //   console.log('stepDelta', JSON.stringify(stepDelta.toJSON(), null, 2))
  //   console.log('d', JSON.stringify(d.toJSON(), null, 2))
  //   d.apply(stepDelta)
  // })
  // return d.done()
  // Calculate delta from initial and final document states to avoid composition issues with delete operations
  // This is more reliable than composing step-by-step, which can lose delete operations and cause "Unexpected case" errors
  // after lib0 upgrades that change delta composition behavior
  const initialDelta = nodeToDelta(tr.before)
  const finalDelta = nodeToDelta(tr.doc)
  const resultDelta = delta.diff(initialDelta.done(), finalDelta.done())
  return resultDelta
}

const _stepToDelta = s.match({ beforeDoc: Node, afterDoc: Node })
  .if([ReplaceStep, ReplaceAroundStep], (step, { beforeDoc, afterDoc }) => {
    const oldStart = beforeDoc.resolve(step.from)
    const oldEnd = beforeDoc.resolve(step.to)
    const newStart = afterDoc.resolve(step.from)

    const newEnd = afterDoc.resolve(step instanceof ReplaceAroundStep ? step.getMap().map(step.to) : step.from + step.slice.size)

    const oldBlockRange = oldStart.blockRange(oldEnd)
    const newBlockRange = newStart.blockRange(newEnd)
    const oldDelta = deltaForBlockRange(oldBlockRange)
    const newDelta = deltaForBlockRange(newBlockRange)
    const diffD = delta.diff(oldDelta, newDelta)
    const stepDelta = deltaModifyNodeAt(beforeDoc, oldBlockRange?.start || newBlockRange?.start || 0, d => { d.append(diffD) })
    return stepDelta
  })
  .if(AddMarkStep, (step, { beforeDoc }) =>
    deltaModifyNodeAt(beforeDoc, step.from, d => { d.retain(step.to - step.from, marksToFormattingAttributes([step.mark])) })
  )
  .if(AddNodeMarkStep, (step, { beforeDoc }) =>
    deltaModifyNodeAt(beforeDoc, step.pos, d => { d.retain(1, marksToFormattingAttributes([step.mark])) })
  )
  .if(RemoveMarkStep, (step, { beforeDoc }) =>
    deltaModifyNodeAt(beforeDoc, step.from, d => { d.retain(step.to - step.from, { [step.mark.type.name]: null }) })
  )
  .if(RemoveNodeMarkStep, (step, { beforeDoc }) =>
    deltaModifyNodeAt(beforeDoc, step.pos, d => { d.retain(1, { [step.mark.type.name]: null }) })
  )
  .if(AttrStep, (step, { beforeDoc }) =>
    deltaModifyNodeAt(beforeDoc, step.pos, d => { d.modify(delta.create().setAttr(step.attr, step.value)) })
  )
  .if(DocAttrStep, step =>
    delta.create().setAttr(step.attr, step.value)
  )
  .else(_step => {
    // unknown step kind
    error.unexpectedCase()
  })
  .done()

/**
 * @param {import('prosemirror-transform').Step} step
 * @param {import('prosemirror-model').Node} beforeDoc
 * @return {ProsemirrorDelta}
 */
export const stepToDelta = (step, beforeDoc) => {
  const stepResult = step.apply(beforeDoc)
  if (stepResult.failed) {
    throw new Error('[y/prosemirror]: step failed to apply')
  }
  return _stepToDelta(step, { beforeDoc, afterDoc: /** @type {Node} */ (stepResult.doc) })
}

/**
 * @param {import('prosemirror-model').NodeRange | null} blockRange
 * @return {ProsemirrorDelta}
 */
function deltaForBlockRange (blockRange) {
  if (blockRange === null) {
    return delta.create($prosemirrorDelta).done()
  }
  const { startIndex, endIndex, parent } = blockRange
  return nodesToDelta(parent.content.content.slice(startIndex, endIndex))
}

/**
 * This function is used to find the delta offset for a given prosemirror offset in a node.
 * Given the following document:
 * <doc><p>Hello world</p><blockquote><p>Hello world!</p></blockquote></doc>
 * The delta structure would look like this:
 *  0: p
 *   - 0: text("Hello world")
 *  1: blockquote
 *   - 0: p
 *     - 0: text("Hello world!")
 * So the prosemirror position 10 would be within the delta offset path: 0, 0 and have an offset into the text node of 9 (since it is the 9th character in the text node).
 *
 * So the return value would be [0, 9], which is the path of: p, text("Hello wor")
 *
 * @param {Node} node
 * @param {number} searchPmOffset The p offset to find the delta offset for
 * @return {number[]} The delta offset path for the search pm offset
 */
export function pmToDeltaPath (node, searchPmOffset = 0) {
  if (searchPmOffset === 0) {
    // base case
    return [0]
  }

  const resolvedOffset = node.resolve(searchPmOffset)
  const depth = resolvedOffset.depth
  const path = []
  if (depth === 0) {
    // if the offset is at the root node, return the index of the node
    return [resolvedOffset.index(0)]
  }
  // otherwise, add the index of each parent node to the path
  for (let d = 0; d < depth; d++) {
    path.push(resolvedOffset.index(d))
  }

  // add any offset into the parent node to the path
  path.push(resolvedOffset.parentOffset)

  return path
}

/**
 * Inverse of {@link pmToDeltaPath}
 * @param {number[]} deltaPath
 * @param {Node} node
 * @return {number} The prosemirror offset for the delta path
 */
export function deltaPathToPm (deltaPath, node) {
  let pmOffset = 0
  let curNode = node

  // Special case: if path has only one element, it's a child index at depth 0
  if (deltaPath.length === 1) {
    const childIndex = deltaPath[0]
    // Add sizes of all children before the target index
    for (let j = 0; j < childIndex; j++) {
      pmOffset += curNode.children[j].nodeSize
    }
    return pmOffset
  }

  // Handle all elements except the last (which is an offset)
  for (let i = 0; i < deltaPath.length - 1; i++) {
    const childIndex = deltaPath[i]
    // Add sizes of all children before the target child
    for (let j = 0; j < childIndex; j++) {
      pmOffset += curNode.children[j].nodeSize
    }
    // Add 1 for the opening tag of the target child, then navigate into it
    pmOffset += 1
    curNode = curNode.children[childIndex]
  }

  // Last element is an offset within the current node
  pmOffset += deltaPath[deltaPath.length - 1]

  return pmOffset
}

/**
 * @param {Node} node
 * @param {number} pmOffset
 * @param {(d:delta.DeltaBuilderAny)=>any} mod
 * @return {ProsemirrorDelta}
 */
export const deltaModifyNodeAt = (node, pmOffset, mod) => {
  const dpath = pmToDeltaPath(node, pmOffset)
  let currentOp = delta.create($prosemirrorDelta)
  const lastIndex = dpath.length - 1
  currentOp.retain(lastIndex >= 0 ? dpath[lastIndex] : 0)
  mod(currentOp)
  for (let i = lastIndex - 1; i >= 0; i--) {
    // @ts-ignore
    currentOp = delta.create($prosemirrorDelta).retain(dpath[i]).modify(currentOp)
  }
  return currentOp
}
