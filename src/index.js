import * as delta from 'lib0/delta'
import * as math from 'lib0/math'
import * as mux from 'lib0/mutex'
import * as Y from 'yjs'
import * as s from 'lib0/schema'
import * as object from 'lib0/object'
import * as error from 'lib0/error'
import * as set from 'lib0/set'
import * as map from 'lib0/map'

import { Node, NodeRange } from 'prosemirror-model'
import { EditorView } from 'prosemirror-view'
import { AddMarkStep, RemoveMarkStep, AttrStep, AddNodeMarkStep, ReplaceStep, ReplaceAroundStep, RemoveNodeMarkStep, DocAttrStep } from 'prosemirror-transform'

const $prosemirrorDelta = delta.$delta({ name: s.$string, attrs: s.$record(s.$string,s.$any), text: true, recursive: true })

/**
 * @typedef {s.Unwrap<$prosemirrorDelta>} ProsemirrorDelta
 */

/**
 * @param {object|null} format
 * @param {object|null} attribution
 */
const attributionToFormat = (format, attribution) => attribution 
  ? object.assign({}, format, {
    ychange: attribution.insert 
      ? { type: 'added', user: attribution.insert?.[0] } 
      : { type: 'removed', user: attribution.delete?.[0] }
    })
  : format

/**
 * Transform delta with attributions to delta with formats (marks).
 */
const deltaAttributionToFormat = s.match()
  .if(delta.$deltaAny, d => {
    const r = delta.create(d.name)
    for (const attr of d.attrs) {
      r.attrs[attr.key] = attr.clone()
    }
    for (const child of d.children) {
      if (delta.$insertOp.check(child)) {
        const f = attributionToFormat(child.format, child.attribution)
        r.insert(child.insert.map(c => delta.$deltaAny.check(c) ? deltaAttributionToFormat(c) : c), f)
      } else if (delta.$textOp.check(child)) {
        r.insert(child.insert.slice(), attributionToFormat(child.format, child.attribution))
      } else if (delta.$deleteOp.check(child)) {
        r.delete(child.delete)
      } else if (delta.$retainOp.check(child)) {
        r.retain(child.retain, attributionToFormat(child.format, child.attribution))
      } else if (delta.$modifyOp.check(child)) {
        r.modify(deltaAttributionToFormat(child.value), attributionToFormat(child.format, child.attribution))
      } else {
        error.unexpectedCase()
      }
    }
    return r
  }).done()

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
            this.y?.ytype.applyDelta(d, this.y.am)
          }
        })
        this.updateState(newState)
      }
    })
    this.mux = mux.createMutex()
    /**
     * @type {{ ytype: Y.XmlFragment, am: Y.AbstractAttributionManager, awareness: any }?}
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
        const event = events.find(event => event.target === this.y.ytype) || new Y.YEvent(this.y.ytype, tr, new Set(null))
        const d = this.y.am === Y.noAttributionsManager ? event.deltaDeep : deltaAttributionToFormat(event.getDelta(this.y.am, { deep: true }))
        const ptr = deltaToPSteps(this.state.tr, d)
        console.log('ytype emitted event', d.toJSON(), 'and applied changes to pm', ptr.steps)
        this.dispatch(ptr)
      }, () => {
        if (this.y.am !== Y.noAttributionsManager) {
          const itemsToRender = Y.mergeIdSets([tr.insertSet, tr.deleteSet])
          /**
           * @todo this could be automatically be calculated in getContent/getDelta when
           * itemsToRender is provided
           * @type {Map<Y.AbstractType, Set<string|null>>}
           */
          const modified = new Map()
          Y.iterateStructsByIdSet(tr, itemsToRender, /** @param {any} item */ item => {
            while (item instanceof Y.Item) {
              const parent = /** @type {Y.AbstractType} */ (item.parent)
              const conf = map.setIfUndefined(modified, parent, set.create)
              if (conf.has(item.parentSub)) break // has already been marked as modified
              conf.add(item.parentSub)
              item = parent._item
            }
          })
          if (modified.has(this.y.ytype)) {
            setTimeout(() => {
              this.mux(() => {
                const d = deltaAttributionToFormat(this.y.ytype.getContent(this.y.am, { itemsToRender, retainInserts: true, deep: true, modified }))
                const ptr = deltaToPSteps(this.state.tr, d)
                console.log('attribution fix event: ', d.toJSON(), 'and applied changes to pm', ptr.steps)
                this.dispatch(ptr)
              })
            }, 0)
          }
        }
      })
    }
  }

  /**
   * @param {Y.XmlFragment} ytype
   * @param {object} opts
   * @param {any} [opts.awareness]
   * @param {Y.AbstractAttributionManager} [opts.attributionManager]
   */
  bindYType (ytype, { awareness = null, attributionManager = Y.noAttributionsManager } = {}) {
    this.y?.ytype.unobserveDeep(this._observer)
    this.y = { ytype, awareness, am: attributionManager || Y.noAttributionsManager }
    const initialPDelta = nodeToDelta(this.state.doc)
    const d = deltaAttributionToFormat(ytype.getContent(this.y.am, { deep: true }))
    const initDelta = delta.diff(initialPDelta.done(), d)
    this.mux(() => {
      this.dispatch(deltaToPSteps(this.state.tr, initDelta.done()))
    })
    ytype.observeDeep(this._observer)
  }

  destroy () {
    this.y?.ytype.unobserveDeep(this._observer)
    this.y = null
    super.destroy()
  }
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
 * @param {{[key:string]:any}} formatting
 * @param {import('prosemirror-model').Schema} schema
 */
const formattingAttributesToMarks = (formatting, schema) => object.map(formatting, (v,k) => schema.mark(k, v))

/**
 * @param {Array<Node>} ns
 */
export const nodesToDelta = ns => {
  /**
   * @type {delta.DeltaBuilderAny}
   */
  const d = delta.create($prosemirrorDelta)
  ns.forEach(n => {
    d.insert(n.isText ? n.text : [nodeToDelta(n)], marksToFormattingAttributes(n.marks))
  })
  return d
}

/**
 * @param {Node} n
 */
export const nodeToDelta = n => {
  /**
   * @type {delta.DeltaBuilderAny}
   */
  const d = delta.create(n.type.name, $prosemirrorDelta)
  d.setMany(n.attrs)
  n.content.content.forEach(c => {
    d.insert(c.isText ? c.text : [nodeToDelta(c)], marksToFormattingAttributes(c.marks))
  })
  return d
}

/**
 * @param {import('prosemirror-state').Transaction} tr
 * @param {ProsemirrorDelta} d
 * @param {Node} pnode
 * @param {{ i: number }} currPos
 * @return {import('prosemirror-state').Transaction}
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
          object.forEach(op.format, (v, k) => {
            if (v == null) {
              tr.removeNodeMark(currPos.i, schema.marks[k])
            } else {
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
 * @param {import('prosemirror-model').Schema} schema
 * @param {delta.FormattingAttributes} dformat
 * @return {Node}
 */
const deltaToPNode = (d, schema, dformat) => {
  const attrs = {}
  for (const attr of d.attrs) {
    attrs[attr.key] = attr.value
  }
  const dc = d.children.map(c => delta.$insertOp.check(c) ? c.insert.map(cn => deltaToPNode(cn, schema, c.format)) : (delta.$textOp.check(c) ? [schema.text(c.insert, formattingAttributesToMarks(c.format, schema))] : []))
  return schema.node(d.name, attrs, dc.flat(1), formattingAttributesToMarks(dformat, schema))
}

/**
 * @param {import('prosemirror-state').Transaction} tr
 * @return {ProsemirrorDelta}
 */
export const trToDelta = (tr) => {
  let d = delta.create($prosemirrorDelta)
  tr.steps.forEach((step, i) => {
    const stepDelta = stepToDelta(step, tr.docs[i])
    console.log('stepDelta', JSON.stringify(stepDelta.toJSON(), null, 2))
    console.log('d', JSON.stringify(d.toJSON(), null, 2))
    d.apply(stepDelta)
  })
  return d.done()
}

const _stepToDelta = s.match({ beforeDoc: Node, afterDoc: Node })
    .if([ReplaceStep,ReplaceAroundStep], (step, { beforeDoc, afterDoc }) => {
      const oldStart = beforeDoc.resolve(step.from)
      const oldEnd = beforeDoc.resolve(step.to)
      const newStart = afterDoc.resolve(step.from)
      const newEnd = afterDoc.resolve(step.from + step.slice.size)
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
      deltaModifyNodeAt(beforeDoc, step.pos, d => { d.modify(delta.create().set(step.attr, step.value)) })
    )
    .if(DocAttrStep, step =>
      delta.create().set(step.attr, step.value)
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
    throw new Error('step failed to apply')
  }
  return _stepToDelta(step, { beforeDoc, afterDoc: stepResult.doc })
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
