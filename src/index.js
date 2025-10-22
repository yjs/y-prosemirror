import * as Y from 'yjs'
import * as delta from 'lib0/delta'
import * as error from 'lib0/error'
import * as math from 'lib0/math'
import * as list from 'lib0/list'
import * as mux from 'lib0/mutex'
import * as array from 'lib0/array'

import { EditorView } from 'prosemirror-view'
import { Node, Schema } from 'prosemirror-model'
import { ReplaceStep, Transform } from 'prosemirror-transform'
import { EditorState } from 'prosemirror-state'

/**
 * @typedef {delta.Delta<string,{ [key:string]:any },any,any,any>} ProsemirrorDelta
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
        let newState = this.state.apply(tr)
        this.mux(() => {
          if (tr.docChanged) {
            /**
             * @type {ProsemirrorDelta}
             */
            let d = delta.create()
            let doc = tr.before
            tr.steps.forEach(step => {
              /**
               * @type {ProsemirrorDelta}
               */
              let sd = delta.create()
              // @ts-ignore
              const from = doc.resolve(step.from)
              // @ts-ignore
              const to = doc.resolve(step.to)
              if (step instanceof ReplaceStep) {
                const fromOffset = from.parentOffset
                const toOffset = to.parentOffset
                sd.retain(fromOffset).delete(toOffset - fromOffset)
                if (!step.slice.openStart) {
                  addNodesToDelta(sd, step.slice.content.content)
                }
              } else {
                error.unexpectedCase()
              }
              const fromPath = /** @type {any} */ (from).path
              let i = fromPath.length - 5
              debugger
              if (step.slice.openStart && step.slice.openEnd) {
                sd.delete(from.parent.nodeSize - from.parentOffset - 2)
                const p = fromPath[i]
                sd = delta.create().retain(p).modify(sd)
                const tmpNewStart = nodeToDelta(array.last(step.slice.content.content))
                tmpNewStart.apply(addNodesToDelta(delta.create(), from.parent.slice(from.parentOffset).content.content))
                sd.insert([tmpNewStart])
                i -= 3
              }
              for (; i > 0; i -= 3) {
                const p = fromPath[i]
                sd = delta.create().retain(p).modify(sd)
              }
              d.apply(sd)
            })
            console.log('editor received steps', tr.steps, 'and and applied delta to ytyp', d.toJSON())
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
    const initialYDelta = /** @type {ProsemirrorDelta} */ (ytype.getContent(Y.noAttributionsManager, { deep: true })).rebase(initialPDelta, true)
    this.y.applyDelta(initialPDelta)
    this.dispatch(deltaToPSteps(this.state.tr, initialYDelta))
    ytype.observeDeep(this._observer)
  }
}

/**
 * @param {ProsemirrorDelta} d
 * @param {readonly Node[]} ns
 */
const addNodesToDelta = (d, ns) => {
  ns.forEach(n => {
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
 */
const nodeToDelta = n => addNodesToDelta(delta.create(n.type.name).setMany(n.attrs), n.content.content)


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
 * @template {Transform} TR
 *
 * @param {TR} tr
 * @param {ProsemirrorDelta} d
 * @param {Node} pnode
 * @param {{ i: number }} currPos
 * @return {TR}
 */
const deltaToPSteps = (tr, d, pnode = tr.doc, currPos = { i: 0 }) => {
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
      deltaToPSteps(tr, op.modify, pchildren[currParentIndex++], currPos)
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
        if (pc.isText) {
          const delLen = math.min(pc.nodeSize - nOffset, remainingDelLen)
          tr.delete(currPos.i, currPos.i + delLen)
          nOffset += delLen
          if (nOffset === pc.nodeSize) {
            // jump to next node
            nOffset = 0
            currParentIndex++
          }
          remainingDelLen -= delLen
        } else {
          tr.delete(currPos.i, pc.nodeSize)
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
const deltaToPNode = (d, schema) => schema.node(d.name, d.attrs, list.toArray(d.children).map(c => delta.$insertOp.check(c) ? c.insert.map(cn => deltaToPNode(cn, schema)) : (delta.$textOp.check(c) ? [schema.text(c.insert)] : [])).flat(1))
