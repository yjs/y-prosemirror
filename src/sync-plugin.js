import * as Y from '@y/y'
import { Plugin } from 'prosemirror-state'
import {
  deltaToPSteps,
  nodeToDelta
} from './sync-utils.js'
import * as d from 'lib0/delta'
import { ySyncPluginKey } from './keys.js'
import * as s from 'lib0/schema'
import * as object from 'lib0/object'

/**
 * The y-prosemirror binding is a bi-directional synchronization with the provided Y.Type and the EditorView.
 * Any change applied to the EditorView will be applied (via deltas) to the Y.Type, and vice versa.
 *
 * The PM document always contains **clean** content — no attribution marks,
 * no deleted text inline. Attribution is rendered as decorations by
 * {@link import('./suggestion-decoration-plugin.js').ySuggestionDecorationPlugin}.
 */
export const $syncPluginState = s.$object({
  ytype: Y.$ytypeAny.nullable,
  attributionManager: Y.$attributionManager.nullable
})

export const $syncPluginStateUpdate = s.$object({
  ytype: Y.$ytypeAny.nullable.optional,
  attributionManager: Y.$attributionManager.nullable.optional,
  change: /** @type {s.Schema<Y.YEvent<any>>} */ (s.$any).nullable.optional
})
const $maybeSyncPluginStateUpdate = $syncPluginStateUpdate.nullable

/**
 * This Prosemirror {@link Plugin} is responsible for synchronizing the prosemirror
 * {@link EditorState} with a {@link Y.XmlFragment}.
 *
 * The PM->Y diff/apply pipeline runs in the plugin's `view().update`
 * hook (i.e. after the dispatch has been committed to the view), not
 * in `appendTransaction`. Running it in `appendTransaction` would
 * cause speculative `state.apply` callers to write to Y as a side
 * effect.
 *
 * The PM document always mirrors the **clean** Y content (no attribution
 * marks, no deleted text). The write path applies diffs through the AM
 * so edits are tagged as suggestions. Attribution rendering is handled
 * by the separate {@link import('./suggestion-decoration-plugin.js').ySuggestionDecorationPlugin}.
 *
 * @param {object} [opts]
 * @returns {Plugin}
 */
export function syncPlugin (opts = {}) {
  return new Plugin({
    key: ySyncPluginKey,
    state: {
      init: () => {
        return $syncPluginState.expect({
          ytype: null,
          attributionManager: null
        })
      },
      apply: (tr, prevPluginState) => {
        const stateUpdate = $maybeSyncPluginStateUpdate.expect(tr.getMeta(ySyncPluginKey) || null)
        if (!stateUpdate) {
          return prevPluginState
        }
        return object.assign({}, prevPluginState, stateUpdate, stateUpdate.attributionManager == null ? { attributionManager: Y.noAttributionsManager } : {})
      }
    },
    view () {
      /** @type {(() => void) | null} */
      let unsubscribeFn = null
      /**
       * Subscribe to ytype changes and apply remote updates to prosemirror.
       * @param {object} opts
       * @param {import('prosemirror-view').EditorView} opts.view
       * @param {Y.Type?} opts.ytype
       * @param {Y.AbstractAttributionManager?} opts.attributionManager
       */
      function subscribeToYType ({ view, ytype, attributionManager }) {
        unsubscribeFn?.()
        if (ytype != null) {
          /** @type {Y.Doc} */
          const ydoc = /** @type {Y.Doc} */ (ytype.doc)
          const onAfterTransaction = (/** @type {any} */ tr) => {
            if (!view || view.isDestroyed) {
              return unsubscribeFn?.()
            }
            if (/** @type {any} */ (tr).origin === ySyncPluginKey.get(view.state)) return
            const desiredPM = ytype.toDeltaDeep().done()
            const pcontent = nodeToDelta(view.state.doc).done()
            const diff = d.diff(pcontent, desiredPM)
            const ptr = diff.isEmpty() ? view.state.tr : deltaToPSteps(view.state.tr, diff)
            ptr.setMeta('addToHistory', false)
            ptr.setMeta('y-sync-transaction', $syncPluginStateUpdate.expect({
              change: null,
              attributionManager,
              ytype
            }))
            view.dispatch(ptr)
          }
          ydoc.on('afterTransaction', onAfterTransaction)
          const onAttrsChanged = attributionManager?.on('change', (_changes) => {
            if (!view || view.isDestroyed) {
              return unsubscribeFn?.()
            }
            // AM changes (accept/reject) may alter the clean content.
            // Re-render the clean Y delta and reconcile.
            const desiredPM = ytype.toDeltaDeep().done()
            const pcontent = nodeToDelta(view.state.doc).done()
            const diff = d.diff(pcontent, desiredPM)
            const ptr = diff.isEmpty() ? view.state.tr : deltaToPSteps(view.state.tr, diff)
            ptr.setMeta('addToHistory', false)
            ptr.setMeta('y-sync-transaction', $syncPluginStateUpdate.expect({
              change: null,
              attributionManager,
              ytype
            }))
            view.dispatch(ptr)
          })
          unsubscribeFn = () => {
            ydoc.off('afterTransaction', onAfterTransaction)
            onAttrsChanged && attributionManager?.off('change', onAttrsChanged)
            unsubscribeFn = null
          }
        }
      }
      return {
        update (view, prevState) {
          const pluginState = $syncPluginState.cast(ySyncPluginKey.getState(view.state))
          const prevPluginState = ySyncPluginKey.getState(prevState)
          const ytype = pluginState.ytype
          const attributionManager = pluginState.attributionManager
          const prevYtype = prevPluginState?.ytype
          const prevAttributionManager = prevPluginState?.attributionManager
          const ytypeChanged = prevYtype !== ytype
          const attributionManagerChanged = prevAttributionManager !== attributionManager
          if (ytypeChanged || attributionManagerChanged) {
            subscribeToYType({ view, ytype, attributionManager })
          }
          if (ytype == null) return
          if (view.state.doc === prevState.doc) return
          const am = attributionManager || Y.noAttributionsManager
          // Read clean Y content (no AM in the read path).
          // Write path uses the AM so edits are tagged as suggestions.
          const ycontent = ytype.toDeltaDeep().done()
          const pcontent = nodeToDelta(view.state.doc).done()
          const pmToYDiff = d.diff(ycontent, pcontent)
          if (!pmToYDiff.isEmpty()) {
            /** @type {Y.Doc} */ (ytype.doc).transact(() => {
              ytype.applyDelta(pmToYDiff, am)
            }, ySyncPluginKey.get(view.state))
          }
          // Reconcile: ensure PM matches the clean Y render after the write.
          // Always dispatch y-sync-transaction meta so the decoration plugin
          // can rebuild (even if the reconcile diff is empty).
          const desiredPM = ytype.toDeltaDeep().done()
          const pcontentAfter = nodeToDelta(view.state.doc).done()
          const pmReconcileDiff = d.diff(pcontentAfter, desiredPM)
          const tr = view.state.tr
          if (!pmReconcileDiff.isEmpty()) {
            deltaToPSteps(tr, pmReconcileDiff)
          }
          tr.setMeta('addToHistory', false)
          tr.setMeta('y-sync-transaction', $syncPluginStateUpdate.expect({
            change: null,
            attributionManager,
            ytype
          }))
          view.dispatch(tr)
        },
        destroy () {
          unsubscribeFn?.()
        }
      }
    }
  })
}
