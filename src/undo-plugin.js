import { Plugin } from 'prosemirror-state'
import { relativePositionStoreMapping } from './positions.js'
import { yUndoPluginKey, ySyncPluginKey } from './keys.js'

/**
 * @typedef {Object} UndoPluginState
 * @property {import('@y/y').UndoManager} undoManager
 * @property {{ bookmark: import('prosemirror-state').SelectionBookmark, restoreMapping: ReturnType<typeof relativePositionStoreMapping>['restoreMapping'] } | null} prevSel
 * @property {boolean} hasUndoOps
 * @property {boolean} hasRedoOps
 * @property {boolean} addToHistory
 */

/**
 * Captures the current selection as a bookmark mapped through relative positions.
 *
 * A bookmark is a document independent representation of the selection. We capture
 * it as relative positions and then restore it to another document on-demand.
 *
 * @param {import('prosemirror-state').EditorState} state
 * @returns {UndoPluginState['prevSel']}
 */
const getRelativeSelectionBookmark = (state) => {
  const syncState = ySyncPluginKey.getState(state)
  if (!syncState?.ytype || syncState.ytype.length === 0) return null
  const { captureMapping, restoreMapping } = relativePositionStoreMapping(syncState.ytype)
  const mappable = captureMapping(state.doc, syncState.attributionManager, true)
  const bookmark = state.selection.getBookmark().map(mappable)
  return { bookmark, restoreMapping }
}

/**
 * Adds or removes the sync plugin from UndoManager.trackedOrigins based on
 * whether history tracking should be suppressed or restored.
 *
 * @param {import('prosemirror-state').Transaction} tr
 * @param {import('@y/y').UndoManager} undoManager
 * @param {import('prosemirror-state').EditorState} newState
 * @param {boolean} prevAddToHistory
 * @returns {boolean} The new addToHistory value
 */
const updateTrackedOrigins = (tr, undoManager, newState, prevAddToHistory) => {
  const isSyncOrigin = tr.getMeta('y-sync-transaction') || tr.getMeta(ySyncPluginKey) || tr.getMeta('y-sync-append')
  if (isSyncOrigin || tr.getMeta(yUndoPluginKey)) return prevAddToHistory

  // Check whether this transaction or its root (via appendedTransaction)
  // has addToHistory: false. ProseMirror sets appendedTransaction to the
  // root transaction for all appended transactions, so a single check
  // covers the entire batch (yjs/y-prosemirror#141).
  const rootTr = tr.getMeta('appendedTransaction')
  const shouldSuppressHistory = tr.getMeta('addToHistory') === false ||
    !!(rootTr && rootTr.getMeta('addToHistory') === false)

  if (shouldSuppressHistory) {
    const syncPlugin = ySyncPluginKey.get(newState)
    if (syncPlugin) undoManager.trackedOrigins.delete(syncPlugin)
    return false
  }

  // Restore tracked origin after a previously non-tracked transaction
  if (prevAddToHistory === false) {
    const syncPlugin = ySyncPluginKey.get(newState)
    if (syncPlugin) undoManager.trackedOrigins.add(syncPlugin)
  }

  return true
}

/**
 * Constructs the next plugin state, returning the previous state object
 * unchanged when nothing has changed (preserving reference equality).
 *
 * @param {UndoPluginState} val
 * @param {UndoPluginState['prevSel']} prevSel
 * @param {boolean} addToHistory
 * @returns {UndoPluginState}
 */
const buildNextState = (val, prevSel, addToHistory) => {
  const hasUndoOps = val.undoManager.undoStack.length > 0
  const hasRedoOps = val.undoManager.redoStack.length > 0

  if (prevSel !== val.prevSel) {
    return { undoManager: val.undoManager, prevSel, hasUndoOps, hasRedoOps, addToHistory }
  }
  if (hasUndoOps !== val.hasUndoOps || hasRedoOps !== val.hasRedoOps || val.addToHistory !== addToHistory) {
    return { ...val, hasUndoOps, hasRedoOps, addToHistory }
  }
  return val
}

/**
 * Creates UndoManager event handlers for storing and restoring selections
 * on undo stack items.
 *
 * @param {import('prosemirror-view').EditorView} view
 * @returns {{ onStackItemAdded: (...args: any[]) => void, onStackItemPopped: (...args: any[]) => void, resetStackLength: (length: number) => void }}
 */
const createStackHandlers = (view) => {
  let lastUndoStackLength = 0
  /** @type {UndoPluginState['prevSel']} */
  let currentGroupSel = null

  return {
    resetStackLength: (length) => {
      lastUndoStackLength = length
    },

    onStackItemAdded: (/** @type {{ stackItem: any, type: string }} */ { stackItem, type }) => {
      if (type !== 'undo') return
      const prevSel = yUndoPluginKey.getState(view.state)?.prevSel
      const um = yUndoPluginKey.getState(view.state)?.undoManager
      if (!um) return
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
    },

    onStackItemPopped: (/** @type {{ stackItem: any }} */ { stackItem }) => {
      const um = yUndoPluginKey.getState(view.state)?.undoManager
      if (um) lastUndoStackLength = um.undoStack.length
      currentGroupSel = null
      const sel = stackItem.meta.get(yUndoPluginKey)
      if (!sel) return
      const syncState = ySyncPluginKey.getState(view.state)
      if (!syncState?.ytype) return
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
}

/**
 * @param {import('@y/y').UndoManager} undoManager
 */
export const yUndoPlugin = (undoManager) => {
  return new Plugin({
    key: yUndoPluginKey,
    state: {
      init: () => {
        return /** @type {UndoPluginState} */ ({
          undoManager,
          prevSel: null,
          hasUndoOps: undoManager.undoStack.length > 0,
          hasRedoOps: undoManager.redoStack.length > 0,
          addToHistory: true
        })
      },
      apply: (tr, val, oldState, newState) => {
        const addToHistory = updateTrackedOrigins(
          tr, val.undoManager, newState, val.addToHistory
        )
        if (addToHistory === false) {
          return { ...val, addToHistory: false }
        }

        // Plugin transactions (sync, appends) would overwrite prevSel with intermediate
        // positions, causing the cursor to land at the wrong location after undo
        // (see yjs/y-prosemirror#38).
        const isPluginTr = tr.getMeta('addToHistory') === false ||
          tr.getMeta('y-sync-transaction') || tr.getMeta(ySyncPluginKey) || tr.getMeta('y-sync-append')
        const prevSel = isPluginTr ? val.prevSel : getRelativeSelectionBookmark(oldState)
        return buildNextState(val, prevSel, addToHistory)
      }
    },
    view: view => {
      const pluginState = yUndoPluginKey.getState(view.state)
      if (!pluginState) {
        throw new Error('Undo plugin state not found')
      }
      let undoManager = pluginState.undoManager
      /** @type {ReturnType<typeof createStackHandlers> | null} */
      let handlers = null

      const bindUndoManager = () => {
        handlers = createStackHandlers(view)
        handlers.resetStackLength(undoManager.undoStack.length)
        undoManager.on('stack-item-added', handlers.onStackItemAdded)
        undoManager.on('stack-item-popped', handlers.onStackItemPopped)
        undoManager.trackedOrigins.add(ySyncPluginKey.get(view.state))
      }

      const unbindUndoManager = () => {
        if (!handlers) {
          // Undo manager not bound yet, or already unbound
          return
        }
        undoManager.off('stack-item-added', handlers.onStackItemAdded)
        undoManager.off('stack-item-popped', handlers.onStackItemPopped)
        undoManager.trackedOrigins.delete(ySyncPluginKey.get(view.state))
        handlers = null
      }

      if (undoManager) {
        bindUndoManager()
      }

      return {
        update (view) {
          const pluginState = yUndoPluginKey.getState(view.state)
          if (pluginState?.undoManager && pluginState.undoManager !== undoManager) {
            unbindUndoManager()
            undoManager = pluginState.undoManager
            bindUndoManager()
          }
        },
        destroy: unbindUndoManager
      }
    }
  })
}
