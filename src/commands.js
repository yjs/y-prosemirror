import { ySyncPluginKey, yUndoPluginKey } from './keys.js'
import * as Y from '@y/y'
import { resolvedPositionsToRelativePositions } from './positions.js'
import { usableTransformer } from './sync-plugin.js'

/**
 * Switch to pause mode (stop synchronization between prosemirror and ytype)
 * @param {import('prosemirror-state').EditorState} state
 * @param {((tr: import('prosemirror-state').Transaction) => void)?} dispatch
 * @returns {boolean}
 */
export function pauseSync (state, dispatch) {
  const pluginState = ySyncPluginKey.getState(state)
  if (!pluginState) {
    return false
  }
  if (dispatch) {
    const tr = state.tr.setMeta(ySyncPluginKey, { ytype: null })
    tr.setMeta('addToHistory', false)
    dispatch(tr)
  }
  return true
}

/**
 * Reconfigure y-prosemirror.
 * - enable syncing to (different) ytype
 * - render attributions
 * - pause sync (by setting ytype=null)
 *
 * The dispatched meta makes the sync plugin's `view().update` hook (re)create
 * the RDT binding, whose initial sync renders the ytype into the view
 * synchronously (the ytype fully overwrites the ProseMirror content) — by the
 * time `dispatch` returns, the view is hydrated.
 *
 * @param {object} [opts]
 * @param {YType?} [opts.ytype] Sync different ytype. Set to null to pause sync
 * @param {Renderer?} [opts.renderer] Optional renderer to switch to
 * @returns {import('prosemirror-state').Command}
 */
export const configureYProsemirror = (opts = {}) => (state, dispatch) => {
  const pluginState = ySyncPluginKey.getState(state)
  if (pluginState == null || (opts.ytype === pluginState.ytype && opts.renderer === pluginState.renderer)) {
    return false
  }
  if (dispatch) {
    const tr = state.tr.setMeta(ySyncPluginKey, opts)
    tr.setMeta('addToHistory', false)
    dispatch(tr)
  }
  return true
}

/**
 * Undo the last user action
 *
 * @param {import('prosemirror-state').EditorState} state
 * @return {boolean} whether a change was undone
 */
export const undo = state => yUndoPluginKey.getState(state)?.undoManager?.undo() != null

/**
 * Redo the last user action
 *
 * @param {import('prosemirror-state').EditorState} state
 * @return {boolean} whether a change was redone
 */
export const redo = state => yUndoPluginKey.getState(state)?.undoManager?.redo() != null

/**
 * @type {import('prosemirror-state').Command}
 */
export const undoCommand = (state, dispatch) => dispatch == null ? (yUndoPluginKey.getState(state)?.undoManager?.canUndo() || false) : undo(state)

/**
 * @type {import('prosemirror-state').Command}
 */
export const redoCommand = (state, dispatch) => dispatch == null ? (yUndoPluginKey.getState(state)?.undoManager?.canRedo() || false) : redo(state)

/**
 * Reject changes between start and end
 * @param {number} start
 * @param {number} [end]
 * @returns {import('prosemirror-state').Command}
 */
export const rejectChanges = (start, end = start) => (state, dispatch) => {
  const pluginState = ySyncPluginKey.getState(state)
  if (!pluginState?.ytype || !(pluginState?.renderer instanceof Y.DiffRenderer)) {
    return false
  }
  if (dispatch) {
    // map through the binding transformer so the PM range anchors where the content
    // actually lives in Y (e.g. inside old-representation anonymous containers)
    const [relStart, relEnd] = resolvedPositionsToRelativePositions(
      [state.doc.resolve(start), state.doc.resolve(end)],
      { ytype: pluginState.ytype, renderer: pluginState.renderer, transformer: usableTransformer(pluginState) }
    )
    if (relStart?.item == null || relEnd?.item == null) {
      // unresolvable range - don't operate on a fabricated one
      return false
    }
    pluginState.renderer.rejectChanges(relStart.item, relEnd.item)
  }
  return true
}

/**
 * Accept changes between start and end
 * @param {number} start
 * @param {number} [end]
 * @returns {import('prosemirror-state').Command}
 */
export const acceptChanges = (start, end = start) => (state, dispatch) => {
  const pluginState = ySyncPluginKey.getState(state)
  if (!pluginState?.ytype || !(pluginState?.renderer instanceof Y.DiffRenderer)) {
    return false
  }
  if (dispatch) {
    // map through the binding transformer so the PM range anchors where the content
    // actually lives in Y (e.g. inside old-representation anonymous containers)
    const [relStart, relEnd] = resolvedPositionsToRelativePositions(
      [state.doc.resolve(start), state.doc.resolve(end)],
      { ytype: pluginState.ytype, renderer: pluginState.renderer, transformer: usableTransformer(pluginState) }
    )
    if (relStart?.item == null || relEnd?.item == null) {
      // unresolvable range - don't operate on a fabricated one
      return false
    }
    pluginState.renderer.acceptChanges(relStart.item, relEnd.item)
  }
  return true
}

/**
 * Accept all changes
 * @returns {import('prosemirror-state').Command}
 */
export const acceptAllChanges = () => (state, dispatch) => {
  const pluginState = ySyncPluginKey.getState(state)
  if (!pluginState?.ytype || !(pluginState?.renderer instanceof Y.DiffRenderer)) {
    return false
  }
  if (dispatch) {
    pluginState.renderer.acceptAllChanges()
  }
  return true
}

/**
 * Reject all changes
 * @returns {import('prosemirror-state').Command}
 */
export const rejectAllChanges = () => (state, dispatch) => {
  const pluginState = ySyncPluginKey.getState(state)
  if (!pluginState?.ytype || !(pluginState?.renderer instanceof Y.DiffRenderer)) {
    return false
  }
  if (dispatch) {
    pluginState.renderer.rejectAllChanges()
  }
  return true
}
