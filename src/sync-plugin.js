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
import * as list from 'lib0/list'

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
  attributionMapper: /** @type {s.Schema<AttributionMapper>} */ (s.$function).nullable.optional,
  change: /** @type {s.Schema<Y.YEvent<any>>} */ (s.$any).nullable.optional
})
const $maybeSyncPluginStateUpdate = $syncPluginStateUpdate.nullable

const attributedDeleteMark = 'y-attributed-delete'
const attributionMarkNames = [
  'y-attributed-insert',
  'y-attributed-format',
  attributedDeleteMark
]

/**
 * only safe to use on diffed deltas
 *
 * 1. strip formats
 * 2. transform delete-attribution to delete op
 * @param {d.DeltaAny} delta
 */
const stripAttributionFormattingFromDelta = delta => {
  for (const child of delta.children) {
    if (d.$modifyOp.check(child)) {
      stripAttributionFormattingFromDelta(child.value)
    }
    if (d.$insertOp.check(child)) {
      child.insert.forEach(ins => {
        if (d.$deltaAny.check(ins)) {
          stripAttributionFormattingFromDelta(ins)
        }
      })
    }
    if (!d.$deleteOp.check(child) && child.format != null) {
      attributionMarkNames.forEach(n => {
        delete child.format?.[n]
      })
    }
  }
}

/**
 * This Prosemirror {@link Plugin} is responsible for synchronizing the prosemirror {@link EditorState} with a {@link Y.XmlFragment}
 * @param {object} opts
 * @param {Y.Doc} [opts.suggestionDoc] A {@link Y.Doc} to use for suggestion tracking
 * @param {AttributionMapper} [opts.mapAttributionToMark] A function to map the {@link Y.Attribution} to a {@link import('prosemirror-model').Mark} - the mark names *must* be one of: `y-attributed-insert`, `y-attributed-delete`, `y-attributed-format`. No other mark names are permitted
 * @returns {Plugin}
 */
export function syncPlugin (opts = {}) {
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
        /**
         * @type {number|null}
         */
        let timeouthandler = null
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
              ptr.setMeta('y-sync-transaction', $syncPluginStateUpdate.expect({
                change,
                attributionManager,
                attributionMapper,
                ytype
              }))
              view.dispatch(ptr)
            }, () => {
              if (attributionManager == null || attributionManager === Y.noAttributionsManager) return
              timeouthandler != null && clearTimeout(timeouthandler)
              timeouthandler = setTimeout(() => {
                /**
                 * @type {ProsemirrorDelta}
                 */
                const ycontent = deltaAttributionToFormat(
                  ytype.toDeltaDeep(attributionManager || Y.noAttributionsManager),
                  attributionMapper
                )
                const pcontent = nodeToDelta(view.state.doc)
                const diff = d.diff(pcontent.done(), ycontent.done())
                if (!diff.isEmpty()) {
                  const ptr = deltaToPSteps(view.state.tr, diff)
                  ptr.setMeta('addToHistory', false)
                  ptr.setMeta('y-sync-transaction', $syncPluginStateUpdate.expect({
                    change,
                    attributionManager,
                    attributionMapper,
                    ytype
                  }))
                  view.dispatch(ptr)
                }
              }, 0)
            })
          })
          const onAttrsChanged = attributionManager?.on('change', (changes) => {
            console.log('attrs changed!!', changes)
            if (!view || view.isDestroyed) {
              return unsubscribeFn?.()
            }
            const d = deltaAttributionToFormat(
              ytype.toDelta(attributionManager, { deep: true, itemsToRender: changes, retainInserts: true, retainDeletes: true }),
              attributionMapper
            ).done()
            const ptr = deltaToPSteps(view.state.tr, d)
            ptr.setMeta('addToHistory', false)
            ptr.setMeta('y-sync-transaction', $syncPluginStateUpdate.expect({
              change: null, // @todo - remove this property
              attributionManager,
              attributionMapper,
              ytype
            }))
            view.dispatch(ptr)
          })
          unsubscribeFn = () => {
            ytype.unobserveDeep(yTypeCb)
            onAttrsChanged && attributionManager?.off('change', onAttrsChanged)
            timeouthandler != null && clearTimeout(timeouthandler)
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
            /**
             * @type {ProsemirrorDelta}
             */
            const ycontent = deltaAttributionToFormat(
              ytype.toDeltaDeep(attributionManager || Y.noAttributionsManager),
              pluginState.attributionMapper
            )
            const pcontent = nodeToDelta(view.state.doc)
            const diff = d.diff(ycontent.done(), pcontent.done())
            stripAttributionFormattingFromDelta(diff)
            if (!diff.isEmpty()) {
              mutex(() => {
                /** @type {Y.Doc} */ (ytype.doc).transact(() => {
                  ytype.applyDelta(diff, attributionManager || Y.noAttributionsManager)
                }, ySyncPluginKey.get(view.state))
              })
            }
          }
        },
        destroy () {
          unsubscribeFn?.()
        }
      }
    }
  })
}
