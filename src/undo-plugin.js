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
  const { captureMapping, restoreMapping } = relativePositionStoreMapping()
  // map through the binding transformer so positions anchor where the content actually
  // lives in Y; unresolvable positions are simply not captured (restore then skips)
  const mappable = captureMapping(state, true)
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
 * `getLatestPrevSel` returns the most recently apply()-computed prevSel.
 * sync-plugin writes to ytype from `view().update`, which can re-enter
 * dispatch and fire `stack-item-added` during the recursive call. The
 * closure ref maintained by apply() gives us the in-flight prevSel
 * regardless of where in the dispatch nesting we are.
 *
 * @param {import('prosemirror-view').EditorView} view
 * @param {() => UndoPluginState['prevSel']} getLatestPrevSel
 * @returns {{ onStackItemAdded: (...args: any[]) => void, onStackItemUpdated: (...args: any[]) => void, onStackItemPopped: (...args: any[]) => void }}
 */
const createStackHandlers = (view, getLatestPrevSel) => {
  return {
    onStackItemAdded: (/** @type {{ stackItem: any, type: string }} */ { stackItem, type }) => {
      if (type !== 'undo') return
      const prevSel = getLatestPrevSel() ?? yUndoPluginKey.getState(view.state)?.prevSel
      const um = yUndoPluginKey.getState(view.state)?.undoManager
      if (!um || um.undoing || um.redoing) return
      // New group: save both endpoints. Merged edits only update the latter.
      stackItem.meta.set(yUndoPluginKey, {
        before: prevSel,
        after: getRelativeSelectionBookmark(view.state)
      })
    },

    onStackItemUpdated: (/** @type {{ stackItem: any, type: string }} */ { stackItem, type }) => {
      const um = yUndoPluginKey.getState(view.state)?.undoManager
      if (type !== 'undo' || !um || um.undoing || um.redoing) return
      // Yjs merges into the existing item and emits updated, not added.
      // Preserve the group's first before-selection; only refresh its endpoint.
      const selections = stackItem.meta.get(yUndoPluginKey)
      if (selections) selections.after = getRelativeSelectionBookmark(view.state)
    },

    onStackItemPopped: (/** @type {{ stackItem: any, type: string }} */ { stackItem, type }) => {
      const um = yUndoPluginKey.getState(view.state)?.undoManager
      // The inverse item is added before this event fires (yjs/yjs#353).
      // Swap the group's endpoints so redo restores the original after-selection,
      // and a subsequent undo still restores the original before-selection.
      const inverseStack = type === 'undo' ? um?.redoStack : um?.undoStack
      const inverseItem = inverseStack?.[inverseStack.length - 1]
      const selections = stackItem.meta.get(yUndoPluginKey)
      if (inverseItem && selections) {
        inverseItem.meta.set(yUndoPluginKey, {
          before: selections.after,
          after: selections.before
        })
      }
      const sel = selections?.before
      if (!sel) return
      const syncState = ySyncPluginKey.getState(view.state)
      if (!syncState?.ytype) return
      try {
        const restoredBookmark = sel.bookmark.map(sel.restoreMapping(view.state))
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
  // Latest prevSel computed by apply(), shared with createStackHandlers
  // so its onStackItemAdded reads the current dispatch's value rather
  // than the (still-stale) view.state. See createStackHandlers comment.
  /** @type {UndoPluginState['prevSel']} */
  let latestPrevSel = null
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
        // Supported UndoManager swap: dispatch
        // `tr.setMeta(yUndoPluginKey, { undoManager })`. The `view().update`
        // hook below already implements the rebind correctly (unhook the old
        // manager's stack handlers and drop the sync plugin from its
        // trackedOrigins, then bind the new one) - it was simply unreachable,
        // because `undoManager` is captured in `state.init` and nothing else
        // replaces it.
        //
        // This is needed whenever one editor is re-bound to a different Y.Doc:
        // an UndoManager hooks `afterTransaction` on a single doc and its scope
        // cannot span documents, so suggestion mode and version diffs (which
        // bind a suggestion doc and a historical doc respectively) each need
        // their own manager. Re-registering the plugin is NOT an alternative:
        // any change to the plugin array makes ProseMirror destroy and recreate
        // every plugin view, which tears down the sync binding, and the sync
        // plugin only rebuilds it when the ytype/renderer identity changes.
        const swap = tr.getMeta(yUndoPluginKey)
        if (swap != null && swap.undoManager != null && swap.undoManager !== val.undoManager) {
          val = {
            ...val,
            undoManager: swap.undoManager,
            // the outgoing manager's bookmark refers to the outgoing document
            prevSel: null,
            hasUndoOps: swap.undoManager.undoStack.length > 0,
            hasRedoOps: swap.undoManager.redoStack.length > 0,
            addToHistory: true
          }
        }
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
        latestPrevSel = prevSel
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
        handlers = createStackHandlers(view, () => latestPrevSel)
        undoManager.on('stack-item-added', handlers.onStackItemAdded)
        undoManager.on('stack-item-updated', handlers.onStackItemUpdated)
        undoManager.on('stack-item-popped', handlers.onStackItemPopped)
        undoManager.trackedOrigins.add(ySyncPluginKey.get(view.state))
      }

      const unbindUndoManager = () => {
        if (!handlers) {
          // Undo manager not bound yet, or already unbound
          return
        }
        undoManager.off('stack-item-added', handlers.onStackItemAdded)
        undoManager.off('stack-item-updated', handlers.onStackItemUpdated)
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
