import { Plugin } from 'prosemirror-state'
import { relativePositionStoreMapping } from './positions.js'
import { UndoManager, Item, ContentType } from '@y/y'
import { yUndoPluginKey, ySyncPluginKey } from './keys.js'

/**
 * @typedef {Object} UndoPluginState
 * @property {import('@y/y').UndoManager | null} undoManager
 * @property {{ bookmark: import('prosemirror-state').SelectionBookmark, mapping: ReturnType<ReturnType<typeof relativePositionStoreMapping>['captureMapping']> } | null} prevSel
 * @property {boolean} hasUndoOps
 * @property {boolean} hasRedoOps
 * @property {boolean} addToHistory
 */

export const defaultProtectedNodes = new Set(['paragraph'])

/**
 * @param {import('@y/y').Item} item
 * @param {Set<string>} protectedNodes
 * @returns {boolean}
 */
export const defaultDeleteFilter = (item, protectedNodes) => !(item instanceof Item) ||
  !(item.content instanceof ContentType) ||
  !(item.content.type.name != null && protectedNodes.has(item.content.type.name)) ||
  item.content.type._length === 0

/**
 * Captures the current selection as a bookmark mapped through relative positions.
 *
 * @param {import('prosemirror-state').EditorState} state
 * @returns {{ bookmark: import('prosemirror-state').SelectionBookmark, mapping: ReturnType<ReturnType<typeof relativePositionStoreMapping>['captureMapping']> } | null}
 */
const getRelativeSelection = (state) => {
  const syncState = ySyncPluginKey.getState(state)
  if (!syncState?.ytype || syncState.ytype.length === 0) return null
  try {
    const { captureMapping } = relativePositionStoreMapping(syncState.ytype)
    const mappable = captureMapping(state.doc, syncState.attributionManager, true)
    const bookmark = state.selection.getBookmark().map(mappable)
    return { bookmark, mapping: mappable }
  } catch {
    return null
  }
}

/**
 * @param {object} [options]
 * @param {Set<string>} [options.protectedNodes]
 * @param {any[]} [options.trackedOrigins]
 * @param {import('@y/y').UndoManager | null} [options.undoManager]
 */
export const yUndoPlugin = ({ protectedNodes = defaultProtectedNodes, trackedOrigins = [], undoManager = null } = {}) => new Plugin({
  key: yUndoPluginKey,
  state: {
    init: (_initargs, state) => {
      const ystate = ySyncPluginKey.getState(state)
      const ytype = ystate?.ytype
      const _undoManager = undoManager || (ytype
        ? new UndoManager(ytype, {
          trackedOrigins: new Set([ySyncPluginKey].concat(trackedOrigins)),
          deleteFilter: (item) => defaultDeleteFilter(item, protectedNodes)
        })
        : null)
      return /** @type {UndoPluginState} */ ({
        undoManager: _undoManager,
        prevSel: null,
        hasUndoOps: _undoManager ? _undoManager.undoStack.length > 0 : false,
        hasRedoOps: _undoManager ? _undoManager.redoStack.length > 0 : false,
        addToHistory: true
      })
    },
    apply: (tr, val, oldState, newState) => {
      const meta = tr.getMeta(yUndoPluginKey)
      if (meta?.undoManager) {
        return { undoManager: meta.undoManager, prevSel: null, hasUndoOps: false, hasRedoOps: false, addToHistory: true }
      }
      if (meta?.addToHistory === false) {
        // Remove tracked origin so the next Y.js transaction won't be captured by UndoManager
        val.undoManager?.trackedOrigins.delete(ySyncPluginKey)
        return { ...val, addToHistory: false }
      }
      const undoManager = val.undoManager
      if (!undoManager) {
        return val.addToHistory === true ? val : { ...val, addToHistory: true }
      }
      // Restore tracked origin after a non-tracked transaction
      if (val.addToHistory === false) {
        undoManager.trackedOrigins.add(ySyncPluginKey)
      }
      const hasUndoOps = undoManager.undoStack.length > 0
      const hasRedoOps = undoManager.redoStack.length > 0
      const prevSel = getRelativeSelection(oldState)
      if (prevSel) {
        return { undoManager, prevSel, hasUndoOps, hasRedoOps, addToHistory: true }
      }
      if (hasUndoOps !== val.hasUndoOps || hasRedoOps !== val.hasRedoOps || val.addToHistory !== true) {
        return { ...val, hasUndoOps, hasRedoOps, addToHistory: true }
      }
      return val
    }
  },
  appendTransaction (trs, _oldState, newState) {
    const isSyncTr = trs.some(tr => tr.getMeta('y-sync-transaction') || tr.getMeta(ySyncPluginKey) || tr.getMeta('y-sync-append') || tr.getMeta(yUndoPluginKey))
    const addToHistory = isSyncTr || !trs.every(tr => tr.getMeta('addToHistory') === false)
    if (!addToHistory) {
      const tr = newState.tr
      tr.setMeta(yUndoPluginKey, { addToHistory: false })
      tr.setMeta('addToHistory', false)
      return tr
    }
    return null
  },
  view: view => {
    const pluginState = yUndoPluginKey.getState(view.state)
    let undoManager = pluginState?.undoManager
    /** @type {((...args: any[]) => void) | null} */
    let onStackItemAdded = null
    /** @type {((...args: any[]) => void) | null} */
    let onStackItemPopped = null

    const bindUndoManager = (/** @type {import('@y/y').UndoManager} */ um) => {
      undoManager = um
      onStackItemAdded = um.on('stack-item-added', ({ stackItem }) => {
        const prevSel = yUndoPluginKey.getState(view.state)?.prevSel
        if (prevSel && !stackItem.meta.has(yUndoPluginKey)) {
          stackItem.meta.set(yUndoPluginKey, prevSel)
        }
      })
      onStackItemPopped = um.on('stack-item-popped', ({ stackItem }) => {
        const sel = stackItem.meta.get(yUndoPluginKey)
        if (sel) {
          const syncState = ySyncPluginKey.getState(view.state)
          if (syncState?.ytype) {
            try {
              const { restoreMapping } = relativePositionStoreMapping(syncState.ytype)
              const restoredBookmark = sel.bookmark.map(
                restoreMapping(syncState.ytype, view.state.doc, syncState.attributionManager)
              )
              const selection = restoredBookmark.resolve(view.state.doc)
              const tr = view.state.tr.setSelection(selection)
              tr.setMeta('addToHistory', false)
              view.dispatch(tr)
            } catch {
              // Position resolution failed — skip selection restoration
            }
          }
        }
      })
    }

    const unbindUndoManager = () => {
      if (undoManager) {
        if (onStackItemAdded) undoManager.off('stack-item-added', onStackItemAdded)
        if (onStackItemPopped) undoManager.off('stack-item-popped', onStackItemPopped)
      }
      onStackItemAdded = null
      onStackItemPopped = null
    }

    if (undoManager) {
      bindUndoManager(undoManager)
    }

    return {
      update (view, prevState) {
        const pluginState = yUndoPluginKey.getState(view.state)
        // Handle deferred UndoManager creation when ytype becomes available
        if (!undoManager && pluginState) {
          const syncState = ySyncPluginKey.getState(view.state)
          if (syncState?.ytype) {
            const newUm = new UndoManager(syncState.ytype, {
              trackedOrigins: new Set([ySyncPluginKey].concat(trackedOrigins)),
              deleteFilter: (item) => defaultDeleteFilter(item, protectedNodes)
            })
            // Update the plugin state with the new UndoManager
            const tr = view.state.tr.setMeta(yUndoPluginKey, { undoManager: newUm })
            tr.setMeta('addToHistory', false)
            bindUndoManager(newUm)
            view.dispatch(tr)
          }
        }
        // Handle UndoManager changing (e.g., from external state update)
        if (pluginState?.undoManager && pluginState.undoManager !== undoManager) {
          unbindUndoManager()
          bindUndoManager(pluginState.undoManager)
        }
      },
      destroy () {
        unbindUndoManager()
        undoManager?.destroy()
      }
    }
  }
})
