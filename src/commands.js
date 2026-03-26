import * as d from 'lib0/delta'
import { ySyncPluginKey } from './keys.js'
import { deltaToPSteps, deltaAttributionToFormat, nodeToDelta } from './sync-utils.js'
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
      const pcontent = nodeToDelta(tr.doc)
      const diff = d.diff(pcontent.done(), ycontent.done())
      deltaToPSteps(tr, diff)
    }
    dispatch(tr)
  }
  return true
}
