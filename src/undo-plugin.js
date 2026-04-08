import { Plugin } from 'prosemirror-state'
import { relativePositionStoreMapping } from './positions.js'
import { UndoManager, Item, ContentType } from '@y/y'
import { yUndoPluginKey, ySyncPluginKey } from './keys.js'

/**
 * One UndoManager per ytype — survives view destroy/recreate cycles
 * (React StrictMode, plugin reconfiguration). GC'd when the ytype is GC'd.
 * @type {WeakMap<import('@y/y').Type, import('@y/y').UndoManager>}
 */
const undoManagerByYType = new WeakMap()

/**
 * @typedef {Object} UndoPluginState
 * @property {import('@y/y').UndoManager | null} undoManager
 * @property {{ bookmark: import('prosemirror-state').SelectionBookmark, restoreMapping: ReturnType<typeof relativePositionStoreMapping>['restoreMapping'] } | null} prevSel
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
 * Returns both the bookmark and the restoreMapping function from the same closure,
 * so that restoration can look up the stored relative positions.
 *
 * @param {import('prosemirror-state').EditorState} state
 * @returns {{ bookmark: import('prosemirror-state').SelectionBookmark, restoreMapping: ReturnType<typeof relativePositionStoreMapping>['restoreMapping'] } | null}
 */
const getRelativeSelection = (state) => {
  const syncState = ySyncPluginKey.getState(state)
  if (!syncState?.ytype || syncState.ytype.length === 0) return null
  try {
    const { captureMapping, restoreMapping } = relativePositionStoreMapping(syncState.ytype)
    const mappable = captureMapping(state.doc, syncState.attributionManager, true)
    const bookmark = state.selection.getBookmark().map(mappable)
    return { bookmark, restoreMapping }
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
export const yUndoPlugin = ({ protectedNodes = defaultProtectedNodes, trackedOrigins = [], undoManager = null } = {}) => {
  /**
   * @param {import('@y/y').Type} ytype
   * @returns {import('@y/y').UndoManager}
   */
  const getOrCreateUndoManager = (ytype) => {
    let um = undoManagerByYType.get(ytype)
    if (!um) {
      um = new UndoManager(ytype, {
        trackedOrigins: new Set([ySyncPluginKey].concat(trackedOrigins)),
        deleteFilter: (item) => defaultDeleteFilter(item, protectedNodes)
      })
      undoManagerByYType.set(ytype, um)
    }
    return um
  }

  return new Plugin({
    key: yUndoPluginKey,
    state: {
      init: (_initargs, state) => {
        const ystate = ySyncPluginKey.getState(state)
        const ytype = ystate?.ytype
        const _undoManager = undoManager || (ytype ? getOrCreateUndoManager(ytype) : null)
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
        // Sync/undo plugin transactions set addToHistory:false for ProseMirror's
        // own history, not to suppress Y.js undo tracking. Skip them here.
        const isSyncOrigin = tr.getMeta('y-sync-transaction') || tr.getMeta(ySyncPluginKey) || tr.getMeta('y-sync-append')
        const isSyncTr = isSyncOrigin || meta
        if (!isSyncTr) {
        // Check whether this transaction or its root (via appendedTransaction)
        // has addToHistory: false. ProseMirror sets appendedTransaction to the
        // root transaction for all appended transactions, so a single check
        // covers the entire batch (yjs/y-prosemirror#141).
          const rootTr = tr.getMeta('appendedTransaction')
          const batchAddToHistory = tr.getMeta('addToHistory') !== false &&
          !(rootTr && rootTr.getMeta('addToHistory') === false)
          if (!batchAddToHistory) {
            val.undoManager?.trackedOrigins.delete(ySyncPluginKey)
            return { ...val, addToHistory: false }
          }
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
        // Only capture prevSel from user-initiated transactions, not plugin-generated ones.
        // Plugin transactions (sync, appends) overwrite prevSel with intermediate positions,
        // causing the cursor to land at the wrong location after undo (see yjs/y-prosemirror#38).
        const isPluginTr = isSyncOrigin || tr.getMeta('addToHistory') === false
        const prevSel = isPluginTr ? val.prevSel : getRelativeSelection(oldState)
        if (prevSel !== val.prevSel) {
          return { undoManager, prevSel, hasUndoOps, hasRedoOps, addToHistory: true }
        }
        if (hasUndoOps !== val.hasUndoOps || hasRedoOps !== val.hasRedoOps || val.addToHistory !== true) {
          return { ...val, hasUndoOps, hasRedoOps, addToHistory: true }
        }
        return val
      }
    },
    view: view => {
      const pluginState = yUndoPluginKey.getState(view.state)
      let undoManager = pluginState?.undoManager
      /** @type {((...args: any[]) => void) | null} */
      let onStackItemAdded = null
      /** @type {((...args: any[]) => void) | null} */
      let onStackItemPopped = null

      let lastUndoStackLength = 0
      /** @type {UndoPluginState['prevSel']} */
      let currentGroupSel = null

      const bindUndoManager = (/** @type {import('@y/y').UndoManager} */ um) => {
        undoManager = um
        lastUndoStackLength = um.undoStack.length
        onStackItemAdded = um.on('stack-item-added', ({ stackItem, type }) => {
          if (type !== 'undo') return
          const prevSel = yUndoPluginKey.getState(view.state)?.prevSel
          const currentLength = um.undoStack.length
          const isMerge = currentLength === lastUndoStackLength
          if (!isMerge) {
          // New undo group — capture the selection from before this edit
            currentGroupSel = prevSel ?? null
          }
          // Always set on the (possibly new/replaced) stack item, using the group's original selection
          if (currentGroupSel) {
            stackItem.meta.set(yUndoPluginKey, currentGroupSel)
          }
          lastUndoStackLength = currentLength
        })
        onStackItemPopped = um.on('stack-item-popped', ({ stackItem }) => {
          lastUndoStackLength = um.undoStack.length
          currentGroupSel = null
          const sel = stackItem.meta.get(yUndoPluginKey)
          if (sel) {
            const syncState = ySyncPluginKey.getState(view.state)
            if (syncState?.ytype) {
              try {
                const restoredBookmark = sel.bookmark.map(
                  sel.restoreMapping(syncState.ytype, view.state.doc, syncState.attributionManager)
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
              const newUm = getOrCreateUndoManager(syncState.ytype)
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
        // Don't destroy the UndoManager — it lives in the WeakMap keyed by ytype.
        // It will be reused if a new view is created for the same ytype (React StrictMode,
        // plugin reconfiguration). GC'd automatically when the ytype is GC'd.
        }
      }
    }
  })
}
