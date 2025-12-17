import { ySyncPluginKey } from '../keys.js'

/**
 * Switch to pause mode (stop synchronization between prosemirror and ytype)
 * @param {import('prosemirror-state').EditorState} state
 * @param {import('prosemirror-state').CommandDispatch} dispatch
 * @returns {boolean}
 */
export function pauseSync (state, dispatch) {
  const pluginState = ySyncPluginKey.getState(state)
  if (!pluginState) {
    return false
  }

  if (pluginState.type === 'paused') {
    // Already paused
    return false
  }

  if (dispatch) {
    const tr = state.tr.setMeta(ySyncPluginKey, { type: 'pause-mode' })
    tr.setMeta('addToHistory', false)
    dispatch(tr)
  }

  return true
}

/**
 * Switch to sync mode (resume/start synchronization between prosemirror and ytype)
 * Can also be used to switch ytype/attributionManager when already synced
 * @param {import('prosemirror-state').EditorState} state
 * @param {import('prosemirror-state').CommandDispatch} dispatch
 * @param {object} [opts]
 * @param {import('@y/y').XmlFragment} [opts.ytype] Optional ytype to switch to
 * @param {import('@y/y').AbstractAttributionManager} [opts.attributionManager] Optional attribution manager to switch to
 * @returns {boolean}
 */
export function resumeSync (state, dispatch, opts = {}) {
  const pluginState = ySyncPluginKey.getState(state)
  if (!pluginState) {
    return false
  }

  // If already synced and no ytype/attributionManager change requested, no-op
  if (pluginState.type === 'synced' && !opts.ytype && !opts.attributionManager) {
    return false
  }

  if (dispatch) {
    /** @type {import('./types.js').SyncPluginTransactionMeta} */
    const meta = {
      type: 'sync-mode'
    }
    if (opts.ytype) {
      meta.ytype = opts.ytype
    }
    if (opts.attributionManager) {
      meta.attributionManager = opts.attributionManager
    }

    const tr = state.tr.setMeta(ySyncPluginKey, meta)
    tr.setMeta('addToHistory', false)
    dispatch(tr)
  }

  return true
}
