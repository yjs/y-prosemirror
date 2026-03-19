import * as Y from '@y/y'
import * as delta from 'lib0/delta'
import * as error from 'lib0/error'
import * as math from 'lib0/math'
import * as object from 'lib0/object'
import * as s from 'lib0/schema'
import { Node } from 'prosemirror-model'
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
 * @typedef {s.Unwrap<typeof $prosemirrorDelta>} ProsemirrorDelta
 **/

/**
 * @template {import('lib0/delta').Attribution} T
 * @param {Record<string, unknown> | null} format
 * @param {T} attribution
 * @returns {Record<string, unknown> | null}
 */
export const defaultMapAttributionToMark = (format, attribution) => {
  /**
   * @type {Record<string, unknown> | null}
   */
  let mergeWith = null
  if (attribution.insert) {
    mergeWith = {
      'y-attribution-insertion': {
        userIds: attribution.insert ? attribution.insert : null,
        timestamp: attribution.insertAt ? attribution.insertAt : null
      }
    }
  } else if (attribution.delete) {
    mergeWith = {
      'y-attribution-deletion': {
        userIds: attribution.delete ? attribution.delete : null,
        timestamp: attribution.deleteAt ? attribution.deleteAt : null
      }
    }
  } else if (attribution.format) {
    mergeWith = {
      'y-attribution-format': {
        userIdsByAttr: attribution.format ? attribution.format : null,
        timestamp: attribution.formatAt ? attribution.formatAt : null
      }
    }
  }
  return object.assign({}, format, mergeWith)
}

/**
 * Transform delta with attributions to delta with formats (marks).
 */
export const deltaAttributionToFormat = s.match(s.$function)
  .if(delta.$deltaAny, (d, attributionsToFormat) => {
    const r = delta.create(d.name)
    // @todo this shouldn't be necessary
    for (const attr of d.attrs) {
      r.attrs[attr.key] = attr.clone()
    }
    for (const child of d.children) {
      if (delta.$deleteOp.check(child)) {
        r.delete(child.delete)
      } else {
        const format = child.attribution ? attributionsToFormat(child.format, child.attribution) : child.format
        if (delta.$insertOp.check(child)) {
          r.insert(child.insert.map(c => delta.$deltaAny.check(c) ? deltaAttributionToFormat(c, attributionsToFormat) : c), format)
        } else if (delta.$textOp.check(child)){
          r.insert(child.insert.slice(), format)
        } else if (delta.$retainOp.check(child)) {
          r.retain(child.retain, format)
        } else if (delta.$modifyOp.check(child)) {
          r.modify(deltaAttributionToFormat(child.value, attributionsToFormat), format)
        } else {
          error.unexpectedCase()
        }
      }
    }
    return /** @type {ProsemirrorDelta} */ (r)
  }).done()

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
 * @param {{[key:string]:any}|null} formatting
 * @param {import('prosemirror-model').Schema} schema
 */
const formattingAttributesToMarks = (formatting, schema) => object.map(formatting ?? {}, (v, k) => schema.mark(k, v))

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
  const initialPDelta = nodeToDelta(node).done()
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
 * @returns {import('prosemirror-state').Transaction}
 */
export function fragmentToTr (fragment, tr, {
  attributionManager = Y.noAttributionsManager,
  mapAttributionToMark = defaultMapAttributionToMark
} = {}) {
  const fragmentContent = deltaAttributionToFormat(
    fragment.toDelta(attributionManager, { deep: true }),
    mapAttributionToMark
  )
  const initialPDelta = nodeToDelta(tr.doc).done()
  const deltaBetweenPmAndFragment = delta.diff(initialPDelta, fragmentContent).done()

  return deltaToPSteps(tr, deltaBetweenPmAndFragment).setMeta('y-sync-hydration', {
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
 */
export const nodeToDelta = n => {
  /**
   * @type {delta.DeltaBuilderAny}
   */
  const d = delta.create(n.type.name, $prosemirrorDelta)
  d.setAttrs(n.attrs)
  n.content.content.forEach(c => {
    d.insert(c.isText ? (c.text ?? []) : [nodeToDelta(c)], marksToFormattingAttributes(c.marks))
  })
  return d
}

/**
 * @param {import('prosemirror-transform').Transform} tr
 * @param {ProsemirrorDelta} d
 * @param {Node} [pnode]
 * @param {{ i: number }} [currPos]
 * @return {import('prosemirror-transform').Transform}
 */
export const deltaToPSteps = (tr, d, pnode = tr.doc, currPos = { i: 0 }) => {
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
          object.forEach(op.format ?? {}, (v, k) => {
            if (v == null) {
              tr.removeNodeMark(currPos.i, schema.marks[k])
            } else {
              // TODO see schema.js for more info on marking nodes
              tr.addNodeMark(currPos.i, schema.mark(k, v))
            }
          })
          currParentIndex++
          currPos.i += pc.nodeSize
          i--
        }
      }
    } else if (delta.$modifyOp.check(op)) {
      currPos.i++
      deltaToPSteps(tr, op.value, pchildren[currParentIndex++], currPos)
      currPos.i++
    } else if (delta.$insertOp.check(op)) {
      const newPChildren = op.insert.map(ins => deltaToPNode(ins, schema, op.format))
      tr.insert(currPos.i, newPChildren)
      currPos.i += newPChildren.reduce((s, c) => c.nodeSize + s, 0)
    } else if (delta.$textOp.check(op)) {
      tr.insert(currPos.i, schema.text(op.insert, formattingAttributesToMarks(op.format, schema)))
      currPos.i += op.length
    } else if (delta.$deleteOp.check(op)) {
      for (let remainingDelLen = op.delete; remainingDelLen > 0;) {
        const pc = pchildren[currParentIndex]
        if (pc === undefined) {
          throw new Error('[y/prosemirror]: delete operation is out of bounds')
        }
        if (pc.isText) {
          const delLen = math.min(pc.nodeSize - nOffset, remainingDelLen)
          tr.delete(currPos.i, currPos.i + delLen)
          nOffset += delLen
          if (nOffset === pc.nodeSize) {
            // TODO this can't actually "jump out" of the current node
            // jump to next node
            nOffset = 0
            currParentIndex++
          }
          remainingDelLen -= delLen
        } else {
          tr.delete(currPos.i, currPos.i + pc.nodeSize)
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
 * @return {Node}
 */
const deltaToPNode = (d, schema, dformat) => {
  /**
   * @type {Object<string,any>}
   */
  const attrs = {}
  for (const attr of d.attrs) {
    attrs[attr.key] = attr.value
  }
  const dc = d.children.map(c => delta.$insertOp.check(c) ? c.insert.map(cn => deltaToPNode(cn, schema, c.format)) : (delta.$textOp.check(c) ? [schema.text(c.insert, formattingAttributesToMarks(c.format, schema))] : []))
  return schema.node(d.name, attrs, dc.flat(1), formattingAttributesToMarks(dformat, schema))
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
 * @param {Transform} tr
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
 *
 * @param {import('prosemirror-model').NodeRange | null} blockRange
 */
function deltaForBlockRange (blockRange) {
  if (blockRange === null) {
    return delta.create()
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
    currentOp = /** @type {delta.DeltaBuilderAny} */ (delta.create($prosemirrorDelta).retain(dpath[i]).modify(currentOp))
  }
  return currentOp
}
