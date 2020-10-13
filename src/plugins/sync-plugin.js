/**
 * @module bindings/prosemirror
 */

import { createMutex } from 'lib0/mutex.js'
import * as PModel from 'prosemirror-model'
import { Plugin, PluginKey, EditorState, TextSelection } from 'prosemirror-state' // eslint-disable-line
import * as set from 'lib0/set.js'
import * as Y from 'yjs'
import { ySyncPluginKey } from './keys.js'
import { absolutePositionToRelativePosition, relativePositionToAbsolutePosition, updateYFragment, createNodeIfNotExists, isVisible } from '../lib.js'
import * as random from 'lib0/random.js'
import * as environment from 'lib0/environment.js'
import * as dom from 'lib0/dom.js'

/**
 * Either a node if type is YXmlElement or an Array of text nodes if YXmlText
 * @typedef {Map<Y.AbstractType, PModel.Node | Array<PModel.Node>>} ProsemirrorMapping
 */

/**
 * @typedef {Object} ColorDef
 * @property {string} ColorDef.light
 * @property {string} ColorDef.dark
 */

/**
 * @typedef {Object} YSyncOpts
 * @property {Array<ColorDef>} [YSyncOpts.colors]
 * @property {Map<string,ColorDef>} [YSyncOpts.colorMapping]
 * @property {Y.PermanentUserData|null} [YSyncOpts.permanentUserData]
 */

/**
 * @type {Array<ColorDef>}
 */
const defaultColors = [{ light: '#ecd44433', dark: '#ecd444' }]

/**
 * @param {Map<string,ColorDef>} colorMapping
 * @param {Array<ColorDef>} colors
 * @param {string} user
 * @return {ColorDef}
 */
const getUserColor = (colorMapping, colors, user) => {
  // @todo do not hit the same color twice if possible
  if (!colorMapping.has(user)) {
    if (colorMapping.size < colors.length) {
      const usedColors = set.create()
      colorMapping.forEach(color => usedColors.add(color))
      colors = colors.filter(color => !usedColors.has(color))
    }
    colorMapping.set(user, random.oneOf(colors))
  }
  return /** @type {ColorDef} */ (colorMapping.get(user))
}

/**
 * This plugin listens to changes in prosemirror view and keeps yXmlState and view in sync.
 *
 * This plugin also keeps references to the type and the shared document so other plugins can access it.
 * @param {Y.XmlFragment} yXmlFragment
 * @param {YSyncOpts} opts
 * @return {any} Returns a prosemirror plugin that binds to this type
 */
export const ySyncPlugin = (yXmlFragment, { colors = defaultColors, colorMapping = new Map(), permanentUserData = null } = {}) => {
  let changedInitialContent = false
  const plugin = new Plugin({
    props: {
      editable: (state) => {
        const syncState = ySyncPluginKey.getState(state)
        return syncState.snapshot == null && syncState.prevSnapshot == null
      }
    },
    key: ySyncPluginKey,
    state: {
      init: (initargs, state) => {
        return {
          type: yXmlFragment,
          doc: yXmlFragment.doc,
          binding: null,
          snapshot: null,
          prevSnapshot: null,
          isChangeOrigin: false,
          colors,
          colorMapping,
          permanentUserData
        }
      },
      apply: (tr, pluginState) => {
        const change = tr.getMeta(ySyncPluginKey)
        if (change !== undefined) {
          pluginState = Object.assign({}, pluginState)
          for (const key in change) {
            pluginState[key] = change[key]
          }
        }
        // always set isChangeOrigin. If undefined, this is not change origin.
        pluginState.isChangeOrigin = change !== undefined && !!change.isChangeOrigin
        if (pluginState.binding !== null) {
          if (change !== undefined && (change.snapshot != null || change.prevSnapshot != null)) {
            // snapshot changed, rerender next
            setTimeout(() => {
              if (change.restore == null) {
                pluginState.binding._renderSnapshot(change.snapshot, change.prevSnapshot, pluginState)
              } else {
                pluginState.binding._renderSnapshot(change.snapshot, change.snapshot, pluginState)
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
      // Make sure this is called in a separate context
      setTimeout(() => {
        binding._forceRerender()
        view.dispatch(view.state.tr.setMeta(ySyncPluginKey, { binding }))
      }, 0)
      return {
        update: () => {
          const pluginState = plugin.getState(view.state)
          if (pluginState.snapshot == null && pluginState.prevSnapshot == null) {
            const emptySize = view.state.doc.type.createAndFill().content.size
            if (changedInitialContent || view.state.doc.content.size > emptySize) {
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
 * @param {any} tr
 * @param {any} relSel
 * @param {ProsemirrorBinding} binding
 */
const restoreRelativeSelection = (tr, relSel, binding) => {
  if (relSel !== null && relSel.anchor !== null && relSel.head !== null) {
    const anchor = relativePositionToAbsolutePosition(binding.doc, binding.type, relSel.anchor, binding.mapping)
    const head = relativePositionToAbsolutePosition(binding.doc, binding.type, relSel.head, binding.mapping)
    if (anchor !== null && head !== null) {
      tr = tr.setSelection(TextSelection.create(tr.doc, anchor, head))
    }
  }
}

export const getRelativeSelection = (pmbinding, state) => ({
  anchor: absolutePositionToRelativePosition(state.selection.anchor, pmbinding.type, pmbinding.mapping),
  head: absolutePositionToRelativePosition(state.selection.head, pmbinding.type, pmbinding.mapping)
})

/**
 * Binding for prosemirror.
 *
 * @protected
 */
export class ProsemirrorBinding {
  /**
   * @param {Y.XmlFragment} yXmlFragment The bind source
   * @param {any} prosemirrorView The target binding
   */
  constructor(yXmlFragment, prosemirrorView) {
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
    this.beforeTransactionSelection = null
    this.doc.on('beforeAllTransactions', () => {
      if (this.beforeTransactionSelection === null) {
        this.beforeTransactionSelection = getRelativeSelection(this, prosemirrorView.state)
      }
    })
    this.doc.on('afterAllTransactions', e => {
      this.beforeTransactionSelection = null
    })
    yXmlFragment.observeDeep(this._observeFunction)

    this._domSelectionInView = null
  }

  _isLocalCursorInView() {
    if (!this.prosemirrorView.hasFocus()) return false
    if (environment.isBrowser && this._domSelectionInView === null) {
      // Calculte the domSelectionInView and clear by next tick after all events are finished
      setTimeout(() => {
        this._domSelectionInView = null
      }, 0)
      this._domSelectionInView = this._isDomSelectionInView()
    }
    return this._domSelectionInView
  }

  _isDomSelectionInView() {
    const selection = this.prosemirrorView._root.getSelection()

    const range = this.prosemirrorView._root.createRange()
    range.setStart(selection.anchorNode, selection.anchorOffset)
    range.setEnd(selection.focusNode, selection.focusOffset)

    const bounding = range.getBoundingClientRect()
    const documentElement = dom.doc.documentElement

    return bounding.bottom >= 0 && bounding.right >= 0 &&
      bounding.left <= (window.innerWidth || documentElement.clientWidth || 0) &&
      bounding.top <= (window.innerHeight || documentElement.clientHeight || 0)
  }

  renderSnapshot(snapshot, prevSnapshot) {
    if (!prevSnapshot) {
      prevSnapshot = Y.createSnapshot(Y.createDeleteSet(), new Map())
    }
    this.prosemirrorView.dispatch(this.prosemirrorView.state.tr.setMeta(ySyncPluginKey, { snapshot, prevSnapshot }))
  }

  unrenderSnapshot() {
    this.mapping = new Map()
    this.mux(() => {
      const fragmentContent = this.type.toArray().map(t => createNodeFromYElement(/** @type {Y.XmlElement} */(t), this.prosemirrorView.state.schema, this.mapping)).filter(n => n !== null)
      // @ts-ignore
      const tr = this.prosemirrorView.state.tr.replace(0, this.prosemirrorView.state.doc.content.size, new PModel.Slice(new PModel.Fragment(fragmentContent), 0, 0))
      tr.setMeta(ySyncPluginKey, { snapshot: null, prevSnapshot: null })
      this.prosemirrorView.dispatch(tr)
    })
  }

  _forceRerender() {
    this.mapping = new Map()
    this.mux(() => {
      const fragmentContent = this.type.toArray().map(t => createNodeFromYElement(/** @type {Y.XmlElement} */(t), this.prosemirrorView.state.schema, this.mapping)).filter(n => n !== null)
      // @ts-ignore
      const tr = this.prosemirrorView.state.tr.replace(0, this.prosemirrorView.state.doc.content.size, new PModel.Slice(new PModel.Fragment(fragmentContent), 0, 0))
      this.prosemirrorView.dispatch(tr)
    })
  }

  /**
   * @param {Y.Snapshot} snapshot
   * @param {Y.Snapshot} prevSnapshot
   * @param {Object} pluginState
   */
  _renderSnapshot(snapshot, prevSnapshot, pluginState) {
    if (!snapshot) {
      snapshot = Y.snapshot(this.doc)
    }
    // clear mapping because we are going to rerender
    this.mapping = new Map()
    this.mux(() => {
      this.doc.transact(transaction => {
        // before rendering, we are going to sanitize ops and split deleted ops
        // if they were deleted by seperate users.
        const pud = pluginState.permanentUserData
        if (pud) {
          pud.dss.forEach(ds => {
            Y.iterateDeletedStructs(transaction, ds, item => { })
          })
        }
        const computeYChange = (type, id) => {
          const user = type === 'added' ? pud.getUserByClientId(id.client) : pud.getUserByDeletedId(id)
          return {
            user,
            type,
            color: getUserColor(pluginState.colorMapping, pluginState.colors, user)
          }
        }
        // Create document fragment and render
        const fragmentContent = Y.typeListToArraySnapshot(this.type, new Y.Snapshot(prevSnapshot.ds, snapshot.sv)).map(t => {
          if (!t._item.deleted || isVisible(t._item, snapshot) || isVisible(t._item, prevSnapshot)) {
            return createNodeFromYElement(t, this.prosemirrorView.state.schema, new Map(), snapshot, prevSnapshot, computeYChange)
          } else {
            // No need to render elements that are not visible by either snapshot.
            // If a client adds and deletes content in the same snapshot the element is not visible by either snapshot.
            return null
          }
        }).filter(n => n !== null)
        // @ts-ignore
        const tr = this.prosemirrorView.state.tr.replace(0, this.prosemirrorView.state.doc.content.size, new PModel.Slice(new PModel.Fragment(fragmentContent), 0, 0))
        this.prosemirrorView.dispatch(tr)
      }, ySyncPluginKey)
    })
  }

  /**
   * @param {Array<Y.YEvent>} events
   * @param {Y.Transaction} transaction
   */
  _typeChanged(events, transaction) {
    const syncState = ySyncPluginKey.getState(this.prosemirrorView.state)
    if (events.length === 0 || syncState.snapshot != null || syncState.prevSnapshot != null) {
      // drop out if snapshot is active
      this.renderSnapshot(syncState.snapshot, syncState.prevSnapshot)
      return
    }
    this.mux(() => {
      /**
       * @param {any} _
       * @param {Y.AbstractType} type
       */
      const delType = (_, type) => this.mapping.delete(type)
      Y.iterateDeletedStructs(transaction, transaction.deleteSet, struct => struct.constructor === Y.Item && this.mapping.delete(/** @type {Y.ContentType} */(/** @type {Y.Item} */ (struct).content).type))
      transaction.changed.forEach(delType)
      transaction.changedParentTypes.forEach(delType)
      const fragmentContent = this.type.toArray().map(t => createNodeIfNotExists(/** @type {Y.XmlElement | Y.XmlHook} */(t), this.prosemirrorView.state.schema, this.mapping)).filter(n => n !== null)
      // @ts-ignore
      let tr = this.prosemirrorView.state.tr.replace(0, this.prosemirrorView.state.doc.content.size, new PModel.Slice(new PModel.Fragment(fragmentContent), 0, 0))
      restoreRelativeSelection(tr, this.beforeTransactionSelection, this)
      tr = tr.setMeta(ySyncPluginKey, { isChangeOrigin: true })
      if (this.beforeTransactionSelection !== null && this._isLocalCursorInView()) {
        tr.scrollIntoView()
      }
      this.prosemirrorView.dispatch(tr)
    })
  }

  _prosemirrorChanged(doc) {
    this.mux(() => {
      this.doc.transact(() => {
        updateYFragment(this.doc, this.type, doc, this.mapping)
        this.beforeTransactionSelection = getRelativeSelection(this, this.prosemirrorView.state)
      }, ySyncPluginKey)
    })
  }

  destroy() {
    this.type.unobserveDeep(this._observeFunction)
  }
}

/**
 * @private
 * @param {Y.XmlElement} el
 * @param {any} schema
 * @param {ProsemirrorMapping} mapping
 * @param {Y.Snapshot} [snapshot]
 * @param {Y.Snapshot} [prevSnapshot]
 * @param {function('removed' | 'added', Y.ID):any} [computeYChange]
 * @return {PModel.Node | null} Returns node if node could be created. Otherwise it deletes the yjs type and returns null
 */
export const createNodeFromYElement = (el, schema, mapping, snapshot, prevSnapshot, computeYChange) => {
  const children = []
  const createChildren = type => {
    if (type.constructor === Y.XmlElement) {
      const n = createNodeIfNotExists(type, schema, mapping, snapshot, prevSnapshot, computeYChange)
      if (n !== null) {
        children.push(n)
      }
    } else {
      const ns = createTextNodesFromYText(type, schema, mapping, snapshot, prevSnapshot, computeYChange)
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
    Y.typeListToArraySnapshot(el, new Y.Snapshot(prevSnapshot.ds, snapshot.sv)).forEach(createChildren)
  }
  try {
    const attrs = el.getAttributes(snapshot)
    if (snapshot !== undefined) {
      if (!isVisible(/** @type {Y.Item} */(el._item), snapshot)) {
        attrs.ychange = computeYChange ? computeYChange('removed', /** @type {Y.Item} */(el._item).id) : { type: 'removed' }
      } else if (!isVisible(/** @type {Y.Item} */(el._item), prevSnapshot)) {
        attrs.ychange = computeYChange ? computeYChange('added', /** @type {Y.Item} */(el._item).id) : { type: 'added' }
      }
    }
    const node = schema.node(el.nodeName, attrs, children)
    mapping.set(el, node)
    return node
  } catch (e) {
    // an error occured while creating the node. This is probably a result of a concurrent action.
    /** @type {Y.Doc} */ (el.doc).transact(transaction => {
      /** @type {Y.Item} */ (el._item).delete(transaction)
  }, ySyncPluginKey)
    mapping.delete(el)
    return null
  }
}

/**
 * @private
 * @param {Y.XmlText} text
 * @param {any} schema
 * @param {ProsemirrorMapping} mapping
 * @param {Y.Snapshot} [snapshot]
 * @param {Y.Snapshot} [prevSnapshot]
 * @param {function('removed' | 'added', Y.ID):any} [computeYChange]
 * @return {Array<PModel.Node>|null}
 */
export const createTextNodesFromYText = (text, schema, mapping, snapshot, prevSnapshot, computeYChange) => {
  const nodes = []
  const deltas = text.toDelta(snapshot, prevSnapshot, computeYChange)
  try {
    for (let i = 0; i < deltas.length; i++) {
      const delta = deltas[i]
      const marks = []
      for (const markName in delta.attributes) {
        marks.push(schema.mark(markName, delta.attributes[markName]))
      }
      nodes.push(schema.text(delta.insert, marks))
    }
  } catch (e) {
    // an error occured while creating the node. This is probably a result of a concurrent action.
    /** @type {Y.Doc} */ (text.doc).transact(transaction => {
      /** @type {Y.Item} */ (text._item).delete(transaction)
  }, ySyncPluginKey)
    return null
  }
  // @ts-ignore
  return nodes
}
