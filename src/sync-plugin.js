import * as Y from '@y/y'
import * as mux from 'lib0/mutex'
import { Plugin } from 'prosemirror-state'
import {
  defaultMapAttributionToMark,
  deltaAttributionToFormat,
  deltaToPSteps,
  nodeToDelta
} from './sync-utils.js'
import * as d from 'lib0/delta'
import { ySyncPluginKey } from './keys.js'
import * as s from 'lib0/schema'
import * as object from 'lib0/object'

/**
 * The y-prosemirror binding is a bi-directional synchronization with the provided Y.Type and the EditorView
 * Any change applied to the EditorView will be applied (via deltas) to the Y.Type, and vice versa.
 */
export const $syncPluginState = s.$object({
  ytype: Y.$ytypeAny.nullable,
  /**
   * If provided, will switch to the given attribution manager instead of the current attribution manager
   */
  attributionManager: Y.$attributionManager.nullable,
  attributionMapper: /** @type {s.Schema<AttributionMapper>} */ (s.$function)
})

export const $syncPluginStateUpdate = s.$object({
  ytype: Y.$ytypeAny.nullable.optional,
  attributionManager: Y.$attributionManager.nullable.optional,
  attributionMapper: /** @type {s.Schema<AttributionMapper>} */ (s.$function).nullable.optional
})
const $maybeSyncPluginStateUpdate = $syncPluginStateUpdate.nullable

/**
 * This Prosemirror {@link Plugin} is responsible for synchronizing the prosemirror {@link EditorState} with a {@link Y.XmlFragment}
 * @param {object} opts
 * @param {Y.Doc} [opts.suggestionDoc] A {@link Y.Doc} to use for suggestion tracking
 * @param {AttributionMapper} [opts.mapAttributionToMark] A function to map the {@link Y.Attribution} to a {@link import('prosemirror-model').Mark}
 * @returns {Plugin}
 */
export function syncPlugin (opts = {}) {
  const mutex = mux.createMutex()
  // Store the current subscription unsubscribe function
  /** @type {(() => void) | null} */
  let unsubscribeFn = null
  /**
   * Subscribe to ytype changes and apply remote updates to prosemirror
   * @param {object} opts
   * @param {import('prosemirror-view').EditorView} opts.view
   * @param {Y.Type?} opts.ytype
   * @param {Y.AbstractAttributionManager?} opts.attributionManager
   * @param {AttributionMapper} opts.attributionMapper
   */
  function subscribeToYType ({ view, ytype, attributionManager, attributionMapper }) {
    // Unsubscribe from previous subscription if it exists
    unsubscribeFn?.()
    unsubscribeFn = null
    if (ytype != null) {
      const yTypeCb = ytype.observeDeep(change => {
        if (!view || view.isDestroyed) {
          return unsubscribeFn?.()
        }
        mutex(() => {
          const d = deltaAttributionToFormat(
            change.getDelta(attributionManager || Y.noAttributionsManager, { deep: true }),
            attributionMapper
          ).done()
          const ptr = deltaToPSteps(view.state.tr, d)
          ptr.setMeta('addToHistory', false)
          view.dispatch(ptr)
        })
      })
      unsubscribeFn = () => {
        ytype.unobserveDeep(yTypeCb)
        unsubscribeFn = null
      }
    }
  }
  return new Plugin({
    key: ySyncPluginKey,
    state: {
      init: () => {
        return $syncPluginState.expect({
          ytype: null,
          attributionManager: null,
          attributionMapper: opts.mapAttributionToMark || defaultMapAttributionToMark
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
            // Subscribe to the new ytype/attributionManager
            // (subscribeToYType will automatically unsubscribe from previous if needed)
            subscribeToYType({
              view,
              ytype,
              attributionManager,
              attributionMapper: pluginState.attributionMapper
            })
          }
          if (ytype != null) {
            mutex(() => {
              /**
               * @type {ProsemirrorDelta}
               */
              const ycontent = ytype.toDeltaDeep(attributionManager || Y.noAttributionsManager)
              const pcontent = nodeToDelta(view.state.doc)
              const diff = d.diff(ycontent.done(), pcontent.done())
              ytype.applyDelta(diff, attributionManager || Y.noAttributionsManager)
            })
          }
        },
        destroy () {
          unsubscribeFn?.()
        }
      }
    }
  })
}
