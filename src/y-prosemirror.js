/**
 * @module bindings/prosemirror
 */

import { createMutex } from 'lib0/mutex.js'
import * as PModel from 'prosemirror-model'
import { EditorView,  Decoration, DecorationSet } from 'prosemirror-view' // eslint-disable-line
import { Plugin, PluginKey, EditorState, TextSelection } from 'prosemirror-state' // eslint-disable-line
import * as math from 'lib0/math.js'
import * as object from 'lib0/object.js'
import { simpleDiff } from 'lib0/diff.js'
import * as error from 'lib0/error.js'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness.js' // eslint-disable-line

export const isVisible = (item, snapshot) => snapshot === undefined ? !item._deleted : (snapshot.sm.has(item._id.user) && snapshot.sm.get(item._id.user) > item._id.clock && !snapshot.ds.isDeleted(item._id))

/**
 * @typedef {Map<Y.AbstractType, Object>} ProsemirrorMapping
 */

/**
 * The unique prosemirror plugin key for prosemirrorPlugin.
 *
 * @public
 */
export const prosemirrorPluginKey = new PluginKey('yjs')

/**
 * This plugin listens to changes in prosemirror view and keeps yXmlState and view in sync.
 *
 * This plugin also keeps references to the type and the shared document so other plugins can access it.
 * @param {Y.XmlFragment} yXmlFragment
 * @return {Plugin} Returns a prosemirror plugin that binds to this type
 */
export const prosemirrorPlugin = (yXmlFragment) => {
  let changedInitialContent = false
  const plugin = new Plugin({
    props: {
      editable: (state) => prosemirrorPluginKey.getState(state).snapshot == null
    },
    key: prosemirrorPluginKey,
    state: {
      init: (initargs, state) => {
        return {
          type: yXmlFragment,
          doc: yXmlFragment.doc,
          binding: null,
          snapshot: null,
          isChangeOrigin: false
        }
      },
      apply: (tr, pluginState) => {
        const change = tr.getMeta(prosemirrorPluginKey)
        if (change !== undefined) {
          pluginState = Object.assign({}, pluginState)
          for (let key in change) {
            pluginState[key] = change[key]
          }
        }
        // always set isChangeOrigin. If undefined, this is not change origin.
        pluginState.isChangeOrigin = change !== undefined && !!change.isChangeOrigin
        if (pluginState.binding !== null) {
          if (change !== undefined && change.snapshot !== undefined) {
            // snapshot changed, rerender next
            setTimeout(() => {
              if (change.restore == null) {
                pluginState.binding._renderSnapshot(change.snapshot, change.prevSnapshot)
              } else {
                pluginState.binding._renderSnapshot(change.snapshot, change.snapshot)
                // reset to current prosemirror state
                delete pluginState.restore
                delete pluginState.snapshot
                delete pluginState.prevSnapshot
                pluginState.binding._prosemirrorChanged(pluginState.binding.prosemirrorView.state.doc)
              }
            }, 0)
          }
        }
        return pluginState
      }
    },
    view: view => {
      const binding = new ProsemirrorBinding(yXmlFragment, view)
      view.dispatch(view.state.tr.setMeta(prosemirrorPluginKey, { binding }))
      return {
        update: () => {
          const pluginState = plugin.getState(view.state)
          if (pluginState.snapshot == null) {
            if (changedInitialContent || view.state.doc.content.size > 2) {
              changedInitialContent = true
              binding._prosemirrorChanged(view.state.doc)
            }
          }
        },
        destroy: () => {
          binding.destroy()
        }
      }
    }
  })
  return plugin
}

/**
 * The unique prosemirror plugin key for cursorPlugin.type
 *
 * @public
 */
export const cursorPluginKey = new PluginKey('yjs-cursor')

/**
 * A prosemirror plugin that listens to awareness information on Yjs.
 * This requires that a `prosemirrorPlugin` is also bound to the prosemirror.
 *
 * @public
 * @param {Awareness} awareness
 * @return {Plugin}
 */
export const cursorPlugin = awareness => new Plugin({
  key: cursorPluginKey,
  props: {
    decorations: state => {
      const ystate = prosemirrorPluginKey.getState(state)
      const y = ystate.doc
      const decorations = []
      if (ystate.snapshot != null || ystate.binding === null) {
        // do not render cursors while snapshot is active
        return
      }
      awareness.getStates().forEach((aw, clientId) => {
        if (clientId === y.clientID) {
          return
        }
        if (aw.cursor != null) {
          let user = aw.user || {}
          if (user.color == null) {
            user.color = '#ffa500'
          }
          if (user.name == null) {
            user.name = `User: ${clientId}`
          }
          let anchor = relativePositionToAbsolutePosition(y, ystate.type, Y.createRelativePositionFromJSON(aw.cursor.anchor), ystate.binding.mapping)
          let head = relativePositionToAbsolutePosition(y, ystate.type, Y.createRelativePositionFromJSON(aw.cursor.head), ystate.binding.mapping)
          if (anchor !== null && head !== null) {
            let maxsize = math.max(state.doc.content.size - 1, 0)
            anchor = math.min(anchor, maxsize)
            head = math.min(head, maxsize)
            decorations.push(Decoration.widget(head, () => {
              const cursor = document.createElement('span')
              cursor.classList.add('ProseMirror-yjs-cursor')
              cursor.setAttribute('style', `border-color: ${user.color}`)
              const userDiv = document.createElement('div')
              userDiv.setAttribute('style', `background-color: ${user.color}`)
              userDiv.insertBefore(document.createTextNode(user.name), null)
              cursor.insertBefore(userDiv, null)
              return cursor
            }, { key: clientId + '' }))
            const from = math.min(anchor, head)
            const to = math.max(anchor, head)
            decorations.push(Decoration.inline(from, to, { style: `background-color: ${user.color}70` }))
          }
        }
      })
      return DecorationSet.create(state.doc, decorations)
    }
  },
  view: view => {
    const ystate = prosemirrorPluginKey.getState(view.state)
    const awarenessListener = () => {
      view.updateState(view.state)
    }
    const updateCursorInfo = () => {
      const current = awareness.getLocalState() || {}
      if (view.hasFocus() && ystate.binding !== null) {
        /**
         * @type {Y.RelativePosition}
         */
        const anchor = absolutePositionToRelativePosition(view.state.selection.anchor, ystate.type, ystate.binding.mapping)
        /**
         * @type {Y.RelativePosition}
         */
        const head = absolutePositionToRelativePosition(view.state.selection.head, ystate.type, ystate.binding.mapping)
        if (current.cursor == null || !Y.compareRelativePositions(Y.createRelativePositionFromJSON(current.cursor.anchor), anchor) || !Y.compareRelativePositions(Y.createRelativePositionFromJSON(current.cursor.head), head)) {
          awareness.setLocalStateField('cursor', {
            anchor, head
          })
        }
      } else if (current.cursor !== null) {
        awareness.setLocalStateField('cursor', null)
      }
    }
    awareness.on('change', awarenessListener)
    view.dom.addEventListener('focusin', updateCursorInfo)
    view.dom.addEventListener('focusout', updateCursorInfo)
    return {
      update: updateCursorInfo,
      destroy: () => {
        const y = prosemirrorPluginKey.getState(view.state).doc
        y.setAwarenessField('cursor', null)
        y.off('change', awarenessListener)
      }
    }
  }
})

/**
 * Transforms a Prosemirror based absolute position to a Yjs Cursor (relative position in the Yjs model).
 *
 * @param {number} pos
 * @param {Y.XmlFragment} type
 * @param {ProsemirrorMapping} mapping
 * @return {any} relative position
 */
export const absolutePositionToRelativePosition = (pos, type, mapping) => {
  if (pos === 0) {
    return Y.createRelativePositionFromTypeIndex(type, 0)
  }
  let n = type._first === null ? null : /** @type {Y.ContentType} */ (type._first.content).type
  while (n !== null && type !== n) {
    const pNodeSize = (mapping.get(n) || { nodeSize: 0 }).nodeSize
    if (n.constructor === Y.XmlText) {
      if (n._length >= pos) {
        return Y.createRelativePositionFromTypeIndex(n, pos)
      } else {
        pos -= n._length
      }
      if (n._item !== null && n._item.next !== null) {
        n = /** @type {Y.ContentType} */ (n._item.next.content).type
      } else {
        do {
          n = n._item === null ? null : n._item.parent
          pos--
        } while (n !== type && n !== null && n._item !== null && n._item.next === null)
        if (n !== null && n !== type) {
          // @ts-gnore we know that n.next !== null because of above loop conditition
          n = n._item === null ? null : /** @type {Y.ContentType} */ (/** @type Y.Item */ (n._item.next).content).type
        }
      }
    } else if (n._first !== null && pos < pNodeSize) {
      n = /** @type {Y.ContentType} */ (n._first.content).type
      pos--
    } else {
      if (pos === 1 && n._length === 0 && pNodeSize > 1) {
        // edge case, should end in this paragraph
        return new Y.RelativePosition(n._item === null ? null : n._item.id, n._item === null ? Y.findRootTypeKey(n) : null, null)
      }
      pos -= pNodeSize
      if (n._item !== null && n._item.next !== null) {
        n = /** @type {Y.ContentType} */ (n._item.next.content).type
      } else {
        if (pos === 0) {
          // set to end of n.parent
          n = n._item === null ? n : n._item.parent
          return new Y.RelativePosition(n._item === null ? null : n._item.id, n._item === null ? Y.findRootTypeKey(n) : null, null)
        }
        do {
          n = /** @type {Y.Item} */ (n._item).parent
          pos--
        } while (n !== type && /** @type {Y.Item} */ (n._item).next === null)
        // if n is null at this point, we have an unexpected case
        if (n !== type) {
          // We know that n._item.next is defined because of above loop condition
          n = /** @type {Y.ContentType} */ (/** @type {Y.Item} */ (/** @type {Y.Item} */ (n._item).next).content).type
        }
      }
    }
    if (n === null) {
      throw error.unexpectedCase()
    }
    if (pos === 0 && n.constructor !== Y.XmlText && n !== type) { // TODO: set to <= 0
      return new Y.RelativePosition(n._item === null ? null : n._item.id, n._item === null ? Y.findRootTypeKey(n) : null, null)
    }
  }
  return Y.createRelativePositionFromTypeIndex(type, type._length)
}

/**
 * @param {Y.Doc} y
 * @param {Y.XmlFragment} yDoc Top level type that is bound to pView
 * @param {any} relPos Encoded Yjs based relative position
 * @param {ProsemirrorMapping} mapping
 */
export const relativePositionToAbsolutePosition = (y, yDoc, relPos, mapping) => {
  const decodedPos = Y.createAbsolutePositionFromRelativePosition(relPos, y)
  if (decodedPos === null) {
    return null
  }
  let type = decodedPos.type
  let pos = 0
  if (type.constructor === Y.XmlText) {
    pos = decodedPos.index
  } else if (type._item === null || !type._item.deleted) {
    let n = type._first
    let i = 0
    while (i < type._length && i < decodedPos.index && n !== null) {
      i++
      const t = /** @type {Y.ContentType} */ (n.content).type
      if (t.constructor === Y.XmlText) {
        pos += t._length
      } else {
        pos += mapping.get(t).nodeSize
      }
      n = /** @type {Y.Item} */ (n.next)
    }
    pos += 1 // increase because we go out of n
  }
  while (type !== yDoc) {
    // @ts-ignore
    const parent = type._item.parent
    // @ts-ignore
    if (parent._item === null || !parent._item.deleted) {
      pos += 1 // the start tag
      let n = parent._first
      // now iterate until we found type
      while (n !== null) {
        const contentType = /** @type {Y.ContentType} */ (n.content).type
        if (contentType === type) {
          break
        }
        if (contentType.constructor === Y.XmlText) {
          pos += contentType._length
        } else {
          pos += mapping.get(contentType).nodeSize
        }
        n = n.next
      }
    }
    type = parent
  }
  return pos - 1 // we don't count the most outer tag, because it is a fragment
}

/**
 * Binding for prosemirror.
 *
 * @protected
 */
export class ProsemirrorBinding {
  /**
   * @param {Y.XmlFragment} yXmlFragment The bind source
   * @param {EditorView} prosemirrorView The target binding
   */
  constructor (yXmlFragment, prosemirrorView) {
    this.type = yXmlFragment
    this.prosemirrorView = prosemirrorView
    this.mux = createMutex()
    /**
     * @type {ProsemirrorMapping}
     */
    this.mapping = new Map()
    this._observeFunction = this._typeChanged.bind(this)
    /**
     * @type {Y.Doc}
     */
    // @ts-ignore
    this.doc = yXmlFragment.doc
    /**
     * current selection as relative positions in the Yjs model
     */
    this._relSelection = null
    this.doc.on('beforeTransaction', e => {
      this._relSelection = {
        anchor: absolutePositionToRelativePosition(this.prosemirrorView.state.selection.anchor, yXmlFragment, this.mapping),
        head: absolutePositionToRelativePosition(this.prosemirrorView.state.selection.head, yXmlFragment, this.mapping)
      }
    })
    yXmlFragment.observeDeep(this._observeFunction)
  }
  _forceRerender () {
    this.mapping = new Map()
    this.mux(() => {
      const fragmentContent = this.type.toArray().map(t => createNodeFromYElement(/** @type {Y.XmlElement} */ (t), this.prosemirrorView.state.schema, this.mapping)).filter(n => n !== null)
      const tr = this.prosemirrorView.state.tr.replace(0, this.prosemirrorView.state.doc.content.size, new PModel.Slice(new PModel.Fragment(fragmentContent), 0, 0))
      this.prosemirrorView.dispatch(tr)
    })
  }
  /**
   *
   * @param {Y.Snapshot} snapshot
   * @param {Y.Snapshot} prevSnapshot
   */
  _renderSnapshot (snapshot, prevSnapshot) {
    // clear mapping because we are going to rerender
    this.mapping = new Map()
    this.mux(() => {
      const fragmentContent = Y.typeListToArraySnapshot(this.type, new Y.Snapshot(prevSnapshot.ds, snapshot.sm)).map(t => createNodeFromYElement(t, this.prosemirrorView.state.schema, new Map(), snapshot, prevSnapshot)).filter(n => n !== null)
      const tr = this.prosemirrorView.state.tr.replace(0, this.prosemirrorView.state.doc.content.size, new PModel.Slice(new PModel.Fragment(fragmentContent), 0, 0))
      this.prosemirrorView.dispatch(tr)
    })
  }
  /**
   * @param {Array<Y.YEvent>} events
   * @param {Y.Transaction} transaction
   */
  _typeChanged (events, transaction) {
    if (events.length === 0 || prosemirrorPluginKey.getState(this.prosemirrorView.state).snapshot != null) {
      // drop out if snapshot is active
      return
    }
    this.mux(() => {
      const delStruct = (_, struct) => this.mapping.delete(struct)
      Y.iterateDeletedStructs(transaction.deleteSet, this.doc.store, struct => struct.constructor === Y.Item && this.mapping.delete(/** @type {Y.Item} */ (struct).content.type))
      transaction.changed.forEach(delStruct)
      transaction.changedParentTypes.forEach(delStruct)
      const fragmentContent = this.type.toArray().map(t => createNodeIfNotExists(/** @type {Y.XmlElement | Y.XmlHook} */ (t), this.prosemirrorView.state.schema, this.mapping)).filter(n => n !== null)
      let tr = this.prosemirrorView.state.tr.replace(0, this.prosemirrorView.state.doc.content.size, new PModel.Slice(new PModel.Fragment(fragmentContent), 0, 0))
      const relSel = this._relSelection
      if (relSel !== null && relSel.anchor !== null && relSel.head !== null) {
        const anchor = relativePositionToAbsolutePosition(this.doc, this.type, relSel.anchor, this.mapping)
        const head = relativePositionToAbsolutePosition(this.doc, this.type, relSel.head, this.mapping)
        if (anchor !== null && head !== null) {
          tr = tr.setSelection(TextSelection.create(tr.doc, anchor, head))
        }
      }
      tr = tr.setMeta(prosemirrorPluginKey, { isChangeOrigin: true })
      this.prosemirrorView.dispatch(tr)
    })
  }
  _prosemirrorChanged (doc) {
    this.mux(() => {
      updateYFragment(this.doc, this.type, doc.content, this.mapping)
    })
  }
  destroy () {
    this.type.unobserveDeep(this._observeFunction)
  }
}

/**
 * @private
 * @param {Y.XmlElement | Y.XmlHook} el
 * @param {PModel.Schema} schema
 * @param {ProsemirrorMapping} mapping
 * @param {Y.Snapshot} [snapshot]
 * @param {Y.Snapshot} [prevSnapshot]
 * @return {PModel.Node | null}
 */
export const createNodeIfNotExists = (el, schema, mapping, snapshot, prevSnapshot) => {
  const node = mapping.get(el)
  if (node === undefined) {
    if (el instanceof Y.XmlElement) {
      return createNodeFromYElement(el, schema, mapping, snapshot, prevSnapshot)
    } else {
      throw error.methodUnimplemented() // we are currently not handling hooks
    }
  }
  return node
}

/**
 * @private
 * @param {Y.XmlElement} el
 * @param {PModel.Schema} schema
 * @param {ProsemirrorMapping} mapping
 * @param {Y.Snapshot} [snapshot]
 * @param {Y.Snapshot} [prevSnapshot]
 * @return {PModel.Node | null} Returns node if node could be created. Otherwise it deletes the yjs type and returns null
 */
export const createNodeFromYElement = (el, schema, mapping, snapshot, prevSnapshot) => {
  let _snapshot = snapshot
  let _prevSnapshot = prevSnapshot
  if (snapshot !== undefined && prevSnapshot !== undefined) {
    if (!isVisible(el, snapshot)) {
      // if this element is already rendered as deleted (ychange), then do not render children as deleted
      _snapshot = new Y.Snapshot(prevSnapshot.ds, snapshot.sm)
      _prevSnapshot = _snapshot
    } else if (!isVisible(el, prevSnapshot)) {
      _prevSnapshot = _snapshot
    }
  }
  const children = []
  const createChildren = type => {
    if (type.constructor === Y.XmlElement) {
      const n = createNodeIfNotExists(type, schema, mapping, _snapshot, _prevSnapshot)
      if (n !== null) {
        children.push(n)
      }
    } else {
      const ns = createTextNodesFromYText(type, schema, mapping, _snapshot, _prevSnapshot)
      if (ns !== null) {
        ns.forEach(textchild => {
          if (textchild !== null) {
            children.push(textchild)
          }
        })
      }
    }
  }
  if (snapshot === undefined || prevSnapshot === undefined) {
    el.toArray().forEach(createChildren)
  } else {
    Y.typeListToArraySnapshot(el, new Y.Snapshot(prevSnapshot.ds, snapshot.sm)).forEach(createChildren)
  }
  let node
  try {
    const attrs = el.getAttributes(_snapshot)
    if (snapshot !== undefined) {
      if (!isVisible(el, snapshot)) {
        attrs.ychange = { client: /** @type {Y.Item} */ (el._item).id.client, state: 'removed' }
      } else if (!isVisible(el, prevSnapshot)) {
        attrs.ychange = { client: /** @type {Y.Item} */ (el._item).id.client, state: 'added' }
      }
    }
    node = schema.node(el.nodeName.toLowerCase(), attrs, children)
  } catch (e) {
    // an error occured while creating the node. This is probably a result of a concurrent action.
    /** @type {Y.Doc} */ (el.doc).transact(transaction => {
      /** @type {Y.Item} */ (el._item).delete(transaction)
    })
    return null
  }
  mapping.set(el, node)
  return node
}

/**
 * @private
 * @param {Y.XmlText} text
 * @param {PModel.Schema} schema
 * @param {ProsemirrorMapping} mapping
 * @param {Y.Snapshot} [snapshot]
 * @param {Y.Snapshot} [prevSnapshot]
 * @return {Array<PModel.Node>|null}
 */
export const createTextNodesFromYText = (text, schema, mapping, snapshot, prevSnapshot) => {
  const nodes = []
  const deltas = text.toDelta(snapshot, prevSnapshot)
  try {
    for (let i = 0; i < deltas.length; i++) {
      const delta = deltas[i]
      const marks = []
      for (let markName in delta.attributes) {
        marks.push(schema.mark(markName, delta.attributes[markName]))
      }
      nodes.push(schema.text(delta.insert, marks))
    }
    if (nodes.length > 0) {
      mapping.set(text, nodes[0]) // only map to first child, all following children are also considered bound to this type
    }
  } catch (e) {
    // an error occured while creating the node. This is probably a result of a concurrent action.
    /** @type {Y.Doc} */ (text.doc).transact(transaction => {
      /** @type {Y.Item} */ (text._item).delete(transaction)
    })
    return null
  }
  // @ts-ignore
  return nodes
}

/**
 * @private
 * @param {Object} node prosemirror node
 * @param {ProsemirrorMapping} mapping
 * @return {Y.XmlElement | Y.XmlText}
 */
export const createTypeFromNode = (node, mapping) => {
  let type
  if (node.isText) {
    type = new Y.XmlText()
    const attrs = {}
    node.marks.forEach(mark => {
      if (mark.type.name !== 'ychange') {
        attrs[mark.type.name] = mark.attrs
      }
    })
    type.insert(0, node.text, attrs)
  } else {
    type = new Y.XmlElement(node.type.name)
    for (let key in node.attrs) {
      const val = node.attrs[key]
      if (val !== null && key !== 'ychange') {
        type.setAttribute(key, val)
      }
    }
    const ins = []
    for (let i = 0; i < node.childCount; i++) {
      ins.push(createTypeFromNode(node.child(i), mapping))
    }
    type.insert(0, ins)
  }
  mapping.set(type, node)
  return type
}

const equalAttrs = (pattrs, yattrs) => {
  const keys = Object.keys(pattrs).filter(key => pattrs[key] !== null)
  let eq = keys.length === Object.keys(yattrs).filter(key => yattrs[key] !== null).length
  for (let i = 0; i < keys.length && eq; i++) {
    const key = keys[i]
    const l = pattrs[key]
    const r = yattrs[key]
    eq = key === 'ychange' || l === r || (typeof l === 'object' && typeof r === 'object' && equalAttrs(l, r))
  }
  return eq
}

const equalYTextPText = (ytext, ptext) => {
  const delta = ytext.toDelta()
  if (delta.length === 0) {
    return ptext.text === ''
  }
  const d = delta[0]
  return d.insert === ptext.text && object.keys(d.attributes || {}).length === ptext.marks.length && ptext.marks.every(mark => equalAttrs(d.attributes[mark.type.name], mark.attrs))
}

const equalYTypePNode = (ytype, pnode) =>
  ytype.constructor === Y.XmlText
    ? equalYTextPText(ytype, pnode)
    : (matchNodeName(ytype, pnode) && ytype.length === pnode.childCount && equalAttrs(ytype.getAttributes(), pnode.attrs) && ytype.toArray().every((ychild, i) => equalYTypePNode(ychild, pnode.child(i))))

const computeChildEqualityFactor = (ytype, pnode, mapping) => {
  const yChildren = ytype.toArray()
  const pChildCnt = pnode.childCount
  const yChildCnt = yChildren.length
  const minCnt = math.min(yChildCnt, pChildCnt)
  let left = 0
  let right = 0
  let foundMappedChild = false
  for (; left < minCnt; left++) {
    const leftY = yChildren[left]
    const leftP = pnode.child(left)
    if (mapping.get(leftY) === leftP) {
      foundMappedChild = true// definite (good) match!
    } else if (!equalYTypePNode(leftY, leftP)) {
      break
    }
  }
  for (; left + right < minCnt; right++) {
    const rightY = yChildren[yChildCnt - right - 1]
    const rightP = pnode.child(pChildCnt - right - 1)
    if (mapping.get(rightY) !== rightP) {
      foundMappedChild = true
    } else if (!equalYTypePNode(rightP, rightP)) {
      break
    }
  }
  return {
    equalityFactor: left + right,
    foundMappedChild
  }
}

/**
 * @private
 * @param {Y.Doc} y
 * @param {Y.XmlFragment} yDomFragment
 * @param {Object} pContent
 * @param {ProsemirrorMapping} mapping
 */
const updateYFragment = (y, yDomFragment, pContent, mapping) => {
  if (yDomFragment instanceof Y.XmlElement && yDomFragment.nodeName.toLowerCase() !== pContent.type.name) {
    throw new Error('node name mismatch!')
  }
  mapping.set(yDomFragment, pContent)
  // update attributes
  if (yDomFragment instanceof Y.XmlElement) {
    const yDomAttrs = yDomFragment.getAttributes()
    const pAttrs = pContent.attrs
    for (let key in pAttrs) {
      if (pAttrs[key] !== null) {
        if (yDomAttrs[key] !== pAttrs[key] && key !== 'ychange') {
          yDomFragment.setAttribute(key, pAttrs[key])
        }
      } else {
        yDomFragment.removeAttribute(key)
      }
    }
    // remove all keys that are no longer in pAttrs
    for (let key in yDomAttrs) {
      if (pAttrs[key] === undefined) {
        yDomFragment.removeAttribute(key)
      }
    }
  }
  // update children
  const pChildCnt = pContent.childCount
  const yChildren = yDomFragment.toArray()
  const yChildCnt = yChildren.length
  const minCnt = math.min(pChildCnt, yChildCnt)
  let left = 0
  let right = 0
  // find number of matching elements from left
  for (;left < minCnt; left++) {
    const leftY = yChildren[left]
    const leftP = pContent.child(left)
    if (mapping.get(leftY) !== leftP) {
      if (equalYTypePNode(leftY, leftP)) {
        // update mapping
        mapping.set(leftY, leftP)
      } else {
        break
      }
    }
  }
  // find number of matching elements from right
  for (;right + left < minCnt; right++) {
    const rightY = yChildren[yChildCnt - right - 1]
    const rightP = pContent.child(pChildCnt - right - 1)
    if (mapping.get(rightY) !== rightP) {
      if (equalYTypePNode(rightY, rightP)) {
        // update mapping
        mapping.set(rightY, rightP)
      } else {
        break
      }
    }
  }
  y.transact(() => {
    // try to compare and update
    while (yChildCnt - left - right > 0 && pChildCnt - left - right > 0) {
      const leftY = yChildren[left]
      const leftP = pContent.child(left)
      const rightY = yChildren[yChildCnt - right - 1]
      const rightP = pContent.child(pChildCnt - right - 1)
      if (leftY instanceof Y.XmlText && leftP.isText) {
        if (!equalYTextPText(leftY, leftP)) {
          // try to apply diff. Only if attrs don't match, delete insert
          // TODO: use a single ytext to hold all following Prosemirror Text nodes
          const pattrs = {}
          leftP.marks.forEach(mark => {
            if (mark.type.name !== 'ychange') {
              pattrs[mark.type.name] = mark.attrs
            }
          })
          const delta = leftY.toDelta()
          if (delta.length === 1 && delta[0].insert && equalAttrs(pattrs, delta[0].attributes || {})) {
            const diff = simpleDiff(delta[0].insert, leftP.text)
            leftY.delete(diff.index, diff.remove)
            leftY.insert(diff.index, diff.insert, delta[0].attributes || {})
          } else {
            yDomFragment.delete(left, 1)
            yDomFragment.insert(left, [createTypeFromNode(leftP, mapping)])
          }
        }
        left += 1
      } else {
        let updateLeft = leftY instanceof Y.XmlElement && matchNodeName(leftY, leftP)
        let updateRight = rightY instanceof Y.XmlElement && matchNodeName(rightY, rightP)
        if (updateLeft && updateRight) {
          // decide which which element to update
          const equalityLeft = computeChildEqualityFactor(leftY, leftP, mapping)
          const equalityRight = computeChildEqualityFactor(rightY, rightP, mapping)
          if (equalityLeft.foundMappedChild && !equalityRight.foundMappedChild) {
            updateRight = false
          } else if (!equalityLeft.foundMappedChild && equalityRight.foundMappedChild) {
            updateLeft = false
          } else if (equalityLeft.equalityFactor < equalityRight.equalityFactor) {
            updateLeft = false
          } else {
            updateRight = false
          }
        }
        if (updateLeft) {
          updateYFragment(y, /** @type {Y.XmlFragment} */ (leftY), leftP, mapping)
          left += 1
        } else if (updateRight) {
          updateYFragment(y, /** @type {Y.XmlFragment} */ (rightY), rightP, mapping)
          right += 1
        } else {
          yDomFragment.delete(left, 1)
          yDomFragment.insert(left, [createTypeFromNode(leftP, mapping)])
          left += 1
        }
      }
    }
    const yDelLen = yChildCnt - left - right
    if (yDelLen > 0) {
      yDomFragment.delete(left, yDelLen)
    }
    if (left + right < pChildCnt) {
      const ins = []
      for (let i = left; i < pChildCnt - right; i++) {
        ins.push(createTypeFromNode(pContent.child(i), mapping))
      }
      yDomFragment.insert(left, ins)
    }
  })
}

/**
 * @function
 * @param {Y.XmlElement} yElement
 * @param {any} pNode Prosemirror Node
 */
const matchNodeName = (yElement, pNode) => yElement.nodeName === pNode.type.name.toUpperCase()
