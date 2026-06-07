import * as Y from '@y/y'
import * as delta from 'lib0/delta'
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

/** @typedef {import('lib0/schema').Unwrap<typeof $prosemirrorDelta>} ProsemirrorDelta */

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
  const initialPDelta = nodeToDelta(node).done()
  fragment.applyDelta(initialPDelta, attributionManager)

  return fragment
}

/**
 * @param {Node} n
 * @param {string?} nodeName
 * @return {ProsemirrorDelta}
 */
export const nodeToDelta = (n, nodeName = n.type.name) => {
  const d = delta.create(nodeName, $prosemirrorDelta)
  d.setAttrs(n.attrs)
  n.content.content.forEach(c => {
    d.insert(c.isText ? (c.text ?? []) : [nodeToDelta(c)], marksToFormattingAttributes(c.marks))
  })
  return d.done(false)
}

/**
 * @param {Node} doc
 */
export const docToDelta = doc => nodeToDelta(doc, null)

/**
 * Apply node-level format (node marks) at `pos`.
 *
 * @param {import('prosemirror-state').Transaction} tr
 * @param {number} pos
 * @param {Record<string, any> | null | undefined} format
 */
const applyNodeFormat = (tr, pos, format) => {
  const schema = tr.doc.type.schema
  object.forEach(format ?? {}, (v, k) => {
    if (v == null) {
      tr.removeNodeMark(pos, schema.marks[k])
    } else {
      tr.addNodeMark(pos, schema.mark(k, v))
    }
  })
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
 * @return {import('prosemirror-state').Transaction}
 */
export const deltaToPSteps = (tr, d, pnode = tr.doc, currPos = { i: 0 }) => {
  const schema = tr.doc.type.schema
  let currParentIndex = 0
  let nOffset = 0
  const pchildren = pnode.children
  for (const attr of d.attrs) {
    if (delta.$setAttrOp.check(attr)) {
      // can be a delete attr op iff attribution node is transformed back to a normal node
      tr.setNodeAttribute(currPos.i - 1, attr.key, attr.value)
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
  // @ts-ignore TS2589: tsc hits "excessively deep" expanding the recursive
  // `$prosemirrorDelta` op type while iterating; the `delta.$*Op.check` guards
  // below re-narrow each op precisely.
  for (const op of d.children) {
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
          applyNodeFormat(tr, currPos.i, op.format)
          currParentIndex++
          currPos.i += pc.nodeSize
          i--
        }
      }
    } else if (delta.$modifyOp.check(op)) {
      applyNodeFormat(tr, currPos.i, op.format)
      const child = pchildren[currParentIndex++]
      const childStart = currPos.i
      // Snapshot `tr.doc.content.size` so we can detect inserts/deletes
      // appended inside the recursion below.
      const sizeBefore = tr.doc.content.size
      currPos.i = childStart + 1
      deltaToPSteps(tr, op.value, child, currPos)
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
      const newPChildren = []
      for (const ins of bundle.inserts) {
        if (delta.$insertOp.check(ins)) {
          for (const n of ins.insert) {
            newPChildren.push(deltaToPNode(n, schema, ins.format))
          }
        } else { // text op
          newPChildren.push(schema.text(ins.insert, formattingAttributesToMarks(ins.format, schema)))
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
      tr.step(new ReplaceStep(currPos.i, currPos.i + deletedSize, new Slice(insertedFrag, 0, 0)))
      currPos.i += insertedFrag.size
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
export const deltaToPNode = (d, schema, dformat) => {
  /**
   * @type {Object<string,any>}
   */
  const attrs = {}
  for (const attr of d.attrs) {
    attrs[attr.key] = attr.value
  }
  const dc = d.children.map(c => delta.$insertOp.check(c) ? c.insert.map(cn => deltaToPNode(cn, schema, c.format)) : (delta.$textOp.check(c) ? [schema.text(c.insert, formattingAttributesToMarks(c.format, schema))] : []))
  const nodeName = d.name == null ? 'doc' : d.name
  const nodeType = schema.nodes[nodeName]
  if (!nodeType) {
    throw new Error(
      '[y/prosemirror]: node type does not exist in the schema: ' + d.name
    )
  }
  const inputChildren = dc.flat(1)
  const inputMarks = formattingAttributesToMarks(dformat, schema)
  const pNode = nodeType.createAndFill(
    attrs,
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
 * @param {import('prosemirror-state').Transaction} tr
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
  .if(AddMarkStep, (step, { beforeDoc, afterDoc }) => {
    const fromResolved = beforeDoc.resolve(step.from)
    const toResolved = beforeDoc.resolve(step.to)
    if (fromResolved.sameParent(toResolved)) {
      return deltaModifyNodeAt(beforeDoc, step.from, d => { d.retain(step.to - step.from, marksToFormattingAttributes([step.mark])) })
    }
    const oldBlockRange = fromResolved.blockRange(toResolved)
    const newBlockRange = afterDoc.resolve(step.from).blockRange(afterDoc.resolve(step.to))
    const diffD = delta.diff(deltaForBlockRange(oldBlockRange), deltaForBlockRange(newBlockRange))
    return deltaModifyNodeAt(beforeDoc, oldBlockRange?.start || newBlockRange?.start || 0, d => { d.append(diffD) })
  })
  .if(RemoveMarkStep, (step, { beforeDoc, afterDoc }) => {
    const fromResolved = beforeDoc.resolve(step.from)
    const toResolved = beforeDoc.resolve(step.to)
    if (fromResolved.sameParent(toResolved)) {
      return deltaModifyNodeAt(beforeDoc, step.from, d => { d.retain(step.to - step.from, { [step.mark.type.name]: null }) })
    }
    const oldBlockRange = fromResolved.blockRange(toResolved)
    const newBlockRange = afterDoc.resolve(step.from).blockRange(afterDoc.resolve(step.to))
    const diffD = delta.diff(deltaForBlockRange(oldBlockRange), deltaForBlockRange(newBlockRange))
    return deltaModifyNodeAt(beforeDoc, oldBlockRange?.start || newBlockRange?.start || 0, d => { d.append(diffD) })
  })
  .if(AddNodeMarkStep, (step, { beforeDoc }) =>
    deltaModifyNodeAt(beforeDoc, step.pos, d => { d.retain(1, marksToFormattingAttributes([step.mark])) })
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
  // @ts-ignore TS2589: tsc hits "excessively deep" expanding the recursive matcher
  .else((step, { beforeDoc, afterDoc }) => {
    const map = step.getMap()
    let oldFrom = Infinity
    let oldTo = 0
    map.forEach(/** @param {number} from @param {number} to @param {number} _newSize */ (from, to, _newSize) => {
      oldFrom = math.min(oldFrom, from)
      oldTo = math.max(oldTo, to)
    })
    if (oldFrom === Infinity) {
      return delta.create($prosemirrorDelta)
    }
    const mappedTo = map.map(oldTo)
    const oldStart = beforeDoc.resolve(oldFrom)
    const oldEnd = beforeDoc.resolve(oldTo)
    const newStart = afterDoc.resolve(oldFrom)
    const newEnd = afterDoc.resolve(mappedTo)
    const oldBlockRange = oldStart.blockRange(oldEnd)
    const newBlockRange = newStart.blockRange(newEnd)
    const oldDelta = deltaForBlockRange(oldBlockRange)
    const newDelta = deltaForBlockRange(newBlockRange)
    const diffD = delta.diff(oldDelta, newDelta)
    return deltaModifyNodeAt(beforeDoc, oldBlockRange?.start || newBlockRange?.start || 0, d => { d.append(diffD) })
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

  if (resolvedOffset.parent.inlineContent) {
    path.push(resolvedOffset.parentOffset)
  } else {
    path.push(resolvedOffset.index(depth))
  }

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

  const lastEl = deltaPath[deltaPath.length - 1]
  if (curNode.inlineContent) {
    pmOffset += lastEl
  } else {
    for (let j = 0; j < lastEl; j++) {
      pmOffset += curNode.children[j].nodeSize
    }
  }

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
