import * as d from 'lib0/delta'
import { ySyncPluginKey, yUndoPluginKey } from './keys.js'
import { deltaToPSteps, deltaAttributionToFormat, nodeToDelta, deltaToPNode } from './sync-utils.js'
import * as Y from '@y/y'

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
 * @returns {(state:import('prosemirror-state').EditorState, dispatch?: CommandDispatch | null ) => boolean}
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
        const pcontent = nodeToDelta(tr.doc)
        const diff = d.diff(pcontent.done(), ycontent.done())
        deltaToPSteps(tr, diff)
      } else {
        tr.replaceWith(0, tr.doc.content.size, deltaToPNode(ycontent, tr.doc.type.schema, null))
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
