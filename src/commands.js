import * as d from 'lib0/delta'
import { ySyncPluginKey, yUndoPluginKey } from './keys.js'
import { deltaToPSteps, deltaAttributionToFormat, nodeToDelta, deltaToPNode } from './sync-utils.js'
import * as Y from '@y/y'
import { absolutePositionToRelativePosition } from './positions.js'

/**
 * Switch to pause mode (stop synchronization between prosemirror and ytype)
 * @param {import('prosemirror-state').EditorState} state
 * @param {CommandDispatch?} dispatch
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

const debugging = false

/**
 * Reconfigure y-prosemirror.
 * - enable syncing to (different) ytype
 * - render attributions
 * - pause sync (by setting ytype=null)
 *
 * @param {object} [opts]
 * @param {YType?} [opts.ytype] Sync different ytype. Set to null to pause sync
 * @param {AttributionManager?} [opts.attributionManager] Optional attribution manager to switch to
 * @returns {import('prosemirror-state').Command}
 */
export const configureYProsemirror = (opts = {}) => (state, dispatch) => {
  const pluginState = ySyncPluginKey.getState(state)
  const ytype = opts.ytype
  const attributionManager = opts.attributionManager
  if (pluginState == null || (ytype === pluginState.ytype && attributionManager === pluginState.attributionManager)) {
    return false
  }
  if (dispatch) {
    const tr = state.tr.setMeta(ySyncPluginKey, opts)
    tr.setMeta('addToHistory', false)
    if (ytype) {
      /**
       * @type {ProsemirrorDelta}
       */
      const ycontent = deltaAttributionToFormat(ytype.toDeltaDeep(attributionManager || Y.noAttributionsManager), pluginState.attributionMapper)
      // @todo it is preferred to apply the minimal diff - at least for debugging purposes. the
      // document replacal is more reliable though
      if (debugging) {
        const pcontent = nodeToDelta(tr.doc, undefined, true)
        const diff = d.diff(pcontent.done(), ycontent.done())
        deltaToPSteps(tr, diff, undefined, undefined, pluginState.attributedNodes)
      } else {
        tr.replaceWith(0, tr.doc.content.size, deltaToPNode(ycontent, tr.doc.type.schema, null, pluginState.attributedNodes))
      }
    }
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
  if (!pluginState?.ytype || !(pluginState?.attributionManager instanceof Y.DiffAttributionManager)) {
    return false
  }
  if (dispatch) {
    const relStart = absolutePositionToRelativePosition(state.doc.resolve(start), pluginState.ytype, pluginState.attributionManager)
    const relEnd = absolutePositionToRelativePosition(state.doc.resolve(end), pluginState.ytype, pluginState.attributionManager)

    pluginState.attributionManager.rejectChanges(relStart.item, relEnd.item)
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
  if (!pluginState?.ytype || !(pluginState?.attributionManager instanceof Y.DiffAttributionManager)) {
    return false
  }
  if (dispatch) {
    const relStart = absolutePositionToRelativePosition(state.doc.resolve(start), pluginState.ytype, pluginState.attributionManager)
    const relEnd = absolutePositionToRelativePosition(state.doc.resolve(end), pluginState.ytype, pluginState.attributionManager)

    pluginState.attributionManager.acceptChanges(relStart.item, relEnd.item)
  }
  return true
}

/**
 * Accept all changes
 * @returns {import('prosemirror-state').Command}
 */
export const acceptAllChanges = () => (state, dispatch) => {
  const pluginState = ySyncPluginKey.getState(state)
  if (!pluginState?.ytype || !(pluginState?.attributionManager instanceof Y.DiffAttributionManager)) {
    return false
  }
  if (dispatch) {
    pluginState.attributionManager.acceptAllChanges()
  }
  return true
}

/**
 * Reject all changes
 * @returns {import('prosemirror-state').Command}
 */
export const rejectAllChanges = () => (state, dispatch) => {
  const pluginState = ySyncPluginKey.getState(state)
  if (!pluginState?.ytype || !(pluginState?.attributionManager instanceof Y.DiffAttributionManager)) {
    return false
  }
  if (dispatch) {
    pluginState.attributionManager.rejectAllChanges()
  }
  return true
}
