import * as delta from 'lib0/delta'
import * as list from 'lib0/list'
import * as math from 'lib0/math'
import * as mux from 'lib0/mutex'
import * as Y from 'yjs'

import { Node, NodeRange, Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'

/**
 * @typedef {delta.DeltaBuilder<string,{ [key:string]:any },any,any,any>} ProsemirrorDelta
 */

export class YEditorView extends EditorView {
  /**
   * @param {ConstructorParameters<typeof EditorView>[0]} mnt
   * @param {ConstructorParameters<typeof EditorView>[1]} props
   */
  constructor (mnt, props) {
    super(mnt, {
      ...props,
      dispatchTransaction: tr => {
        // Get the new state by applying the transaction
        const newState = this.state.apply(tr)
        this.mux(() => {
          if (tr.docChanged) {
            const d = trToDelta(tr)
            console.log('editor received steps', tr.steps, 'and and applied delta to ytyp', d.toJSON())

            // TODO having some issues with applying the delta to the ytype
            this.y?.applyDelta(d)
          }
        })
        // update view with new state
        // do it at the end so that triggered changes are applied in the correct order
        this.updateState(newState)
      }
    })
    this.mux = mux.createMutex()
    /**
     * @type {Y.XmlFragment|null}
     */
    this.y = null
    /**
     * @param {Array<Y.YEvent<any>>} events
     * @param {Y.Transaction} tr
     */
    this._observer = (events, tr) => {
      this.mux(() => {
        /**
         * @type {Y.YEvent<Y.XmlFragment>}
         */
        const event = events.find(event => event.target === this.y) || new Y.YEvent(this.y, tr, new Set(null))
        const d = event.deltaDeep
        const ptr = deltaToPSteps(this.state.tr, d)
        console.log('ytype emitted event', d.toJSON(), 'and applied changes to pm', ptr.steps)
        this.dispatch(ptr)
      })
    }
  }

  /**
   * @param {Y.XmlFragment} ytype
   */
  bindYType (ytype) {
    this.y?.unobserveDeep(this._observer)
    this.y = ytype
    const initialPDelta = pstateToDelta(this.state)
    console.log('initialPDelta', initialPDelta.isDone)
    const d = ytype.getContent(Y.noAttributionsManager, { deep: true })
    console.log(JSON.stringify(d.toJSON(), null, 2))
    const initialYDelta = /** @type {ProsemirrorDelta} */ (d).slice(0, d.childCnt).rebase(initialPDelta, true)
    this.y.applyDelta(initialPDelta)
    this.dispatch(deltaToPSteps(this.state.tr, initialYDelta))
    ytype.observeDeep(this._observer)
  }
}

/**
 * @param {ProsemirrorDelta} d
 * @param {readonly Node[]} ns
 * @param {number} insertMax
 */
const addNodesToDelta = (d, ns, insertMax = Number.POSITIVE_INFINITY) => {
  ns.forEach(n => {
    if (insertMax <= 0) {
      return
    }
    insertMax--
    if (n.isText) {
      d.insert(n.text)
    } else {
      d.insert([nodeToDelta(n)])
    }
  })
  return d
}

/**
 * @param {Node} n
 * @param {number} insertMax
 */
const nodeToDelta = (n, insertMax = Number.POSITIVE_INFINITY) => addNodesToDelta(delta.create(n.type.name, n.attrs), n.content.content, insertMax)

/**
 * @param {EditorState} pstate
 * @return {ProsemirrorDelta}
 */
const pstateToDelta = pstate => {
  const d = delta.create()
  const pc = pstate.doc.content.content
  addNodesToDelta(d, pc)
  return d
}

/**
 *
 * @template {import('prosemirror-state').Transaction} TR
 *
 * @param {TR} tr
 * @param {ProsemirrorDelta} d
 * @param {Node} pnode
 * @param {{ i: number }} currPos
 * @return {TR}
 */
export const deltaToPSteps = (tr, d, pnode = tr.doc, currPos = { i: 0 }) => {
  const schema = tr.doc.type.schema
  let currParentIndex = 0
  let nOffset = 0
  const pchildren = pnode.children
  d.children.forEach(op => {
    if (delta.$retainOp.check(op)) {
      // skip over i children
      let i = op.retain
      while (i > 0) {
        const pc = pchildren[currParentIndex]
        if (pc.isText) {
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
      const newPChildren = op.insert.map(ins => deltaToPNode(ins, schema))
      tr.insert(currPos.i, newPChildren)
      currPos.i += newPChildren.reduce((s, c) => c.nodeSize + s, 0)
    } else if (delta.$textOp.check(op)) {
      tr.insert(currPos.i, schema.text(op.insert))
      currPos.i += op.length
    } else if (delta.$deleteOp.check(op)) {
      for (let remainingDelLen = op.delete; remainingDelLen > 0;) {
        const pc = pchildren[currParentIndex]
        if (pc === undefined) {
          throw new Error('delete operation is out of bounds')
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
 * @param {Schema} schema
 * @return {Node}
 */
const deltaToPNode = (d, schema) => {
  return schema.node(d.name, d.attrs, list.toArray(d.children).map(c => delta.$insertOp.check(c) ? c.insert.map(cn => deltaToPNode(cn, schema)) : (delta.$textOp.check(c) ? [schema.text(c.insert)] : [])).flat(1))
}

/**
 * @param {import('prosemirror-state').Transaction} tr
 * @return {ProsemirrorDelta}
 */
export const trToDelta = (tr) => {
  /**
   * @type {ProsemirrorDelta}
   */
  let d = delta.create()
  tr.steps.forEach((step, i) => {
    const stepDelta = stepToDelta(step, tr.docs[i])

    console.log('stepDelta', JSON.stringify(stepDelta.toJSON(), null, 2))
    console.log('d', JSON.stringify(d.toJSON(), null, 2))
    if (d.childCnt === 0) {
      // TODO there is a bug with applying a delta to an empty delta, it should just return the second arg
      d = stepDelta
    } else {
      // TODO what is with the types here?
      d = delta.diff(d, stepDelta)
    }
    console.log('d', JSON.stringify(d.toJSON(), null, 2))
  })

  return d
}

/**
 * @param {import('prosemirror-transform').Step} step
 * @param {import('prosemirror-model').Node} beforeDoc
 * @return {ProsemirrorDelta}
 */
export const stepToDelta = (step, beforeDoc) => {
  const stepResult = step.apply(beforeDoc)
  if (stepResult.failed) {
    throw new Error('step failed to apply')
  }
  const afterDoc = stepResult.doc
  const stepMap = step.getMap()

  /**
   * @type {ProsemirrorDelta}
   */
  const d = delta.create()

  // stepMap.forEach provides the start & end positions for each change made by the step
  // oldStart, oldEnd: positions in the old document (beforeDoc) that were changed
  // newStart, newEnd: corresponding positions in the new document (afterDoc)
  stepMap.forEach((oldStart, oldEnd, newStart, newEnd) => {
    const hasDeletes = oldEnd - oldStart > 0
    const hasInserts = newEnd - newStart > 0

    let oldBlockRange = beforeDoc.resolve(oldStart).blockRange(beforeDoc.resolve(oldEnd))
    let newBlockRange = afterDoc.resolve(newStart).blockRange(afterDoc.resolve(newEnd))
    if (hasInserts && !hasDeletes) {
      // purely an insert, so the old block range is invalid (null)
      oldBlockRange = beforeDoc.resolve(stepMap.invert().map(newStart)).blockRange(beforeDoc.resolve(stepMap.invert().map(newEnd)))
    }
    if (hasDeletes && !hasInserts) {
      // purely a delete, so the new block range is invalid (null)
      newBlockRange = afterDoc.resolve(stepMap.map(oldStart)).blockRange(afterDoc.resolve(stepMap.map(oldEnd)))
    }

    const oldDelta = deltaForBlockRange(oldBlockRange)
    const newDelta = deltaForBlockRange(newBlockRange)
    const diffD = delta.diff(oldDelta, newDelta)
    const { parentDelta } = deltaPathToDelta(pmToDeltaPath(beforeDoc, oldBlockRange?.start || newBlockRange?.start || 0))

    // TODO I wanted to just add my ops at the end of the parentDelta, but didn't know how to actually do that
    diffD.children.forEach(child => {
      list.pushEnd(parentDelta.children, child.clone())
    })

    d.apply(parentDelta)
  })

  return d
}

/**
 *
 * @param {NodeRange | null} blockRange
 */
function deltaForBlockRange (blockRange) {
  if (blockRange === null) {
    return delta.create()
  }
  const { startIndex, endIndex, parent } = blockRange
  const d = delta.create()
  addNodesToDelta(d, parent.content.content.slice(startIndex, endIndex))
  return d
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
 * @param {number[]} deltaPath
 * @return {{ parentDelta: ProsemirrorDelta, currentOp: ProsemirrorDelta }}
 */
export function deltaPathToDelta (deltaPath) {
  if (deltaPath.length === 0) {
    const currentOp = delta.create()
    const parentDelta = currentOp
    return { parentDelta, currentOp }
  }

  // The last element becomes the retain for currentOp
  const lastIndex = deltaPath.length - 1
  /**
   * @type {ProsemirrorDelta}
   */
  const currentOp = delta.create().retain(deltaPath[lastIndex])

  // Build parentDelta by iterating backwards through all elements except the last
  // Each element becomes a retain, and we nest modifies
  /**
   * @type {ProsemirrorDelta}
   */
  let parentDelta = currentOp
  for (let i = lastIndex - 1; i >= 0; i--) {
    parentDelta = delta.create().retain(deltaPath[i]).modify(parentDelta)
  }

  return { parentDelta, currentOp }
}
