import * as Y from '@y/y'
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
 *
 * NOTE: register this plugin LAST in your editor's plugin list. Its
 * `appendTransaction` runs the PM->Y diff/apply pipeline and must
 * observe the post-keymap, post-other-plugin state.
 *
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
    /**
     * Mirror PM doc changes into the Y type, then re-render the Y
     * type through the AttributionManager and append any difference
     * back to PM in the same dispatch. Idempotent: if PM already
     * matches the AM-rendered ytype, returns null.
     *
     * @param {readonly import('prosemirror-state').Transaction[]} trs
     * @param {import('prosemirror-state').EditorState} _oldState
     * @param {import('prosemirror-state').EditorState} newState
     */
    appendTransaction (trs, _oldState, newState) {
      const pluginState = $syncPluginState.cast(ySyncPluginKey.getState(newState))
      const ytype = pluginState.ytype
      if (ytype == null) return null
      if (!trs.some(tr => tr.docChanged)) return null
      if (trs.every(tr => tr.getMeta('y-sync-transaction') != null)) return null
      const attributionManager = pluginState.attributionManager
      const am = attributionManager || Y.noAttributionsManager
      const mapper = pluginState.attributionMapper
      const ycontent = deltaAttributionToFormat(
        ytype.toDeltaDeep(am),
        mapper
      ).done()
      const pcontent = nodeToDelta(newState.doc).done()
      const pmToYDiff = d.diff(ycontent, pcontent)
      stripAttributionFormattingFromDelta(pmToYDiff)
      if (!pmToYDiff.isEmpty()) {
        /** @type {Y.Doc} */ (ytype.doc).transact(() => {
          ytype.applyDelta(pmToYDiff, am)
        }, ySyncPluginKey.get(newState))
      }
      const desiredPM = deltaAttributionToFormat(
        ytype.toDeltaDeep(am),
        mapper
      ).done()
      const pmReconcileDiff = d.diff(pcontent, desiredPM)
      if (pmReconcileDiff.isEmpty()) return null
      const tr = newState.tr
      deltaToPSteps(tr, pmReconcileDiff)
      tr.setMeta('addToHistory', false)
      tr.setMeta('y-sync-transaction', $syncPluginStateUpdate.expect({
        change: null,
        attributionManager,
        attributionMapper: mapper,
        ytype
      }))
      return tr
    },
    view () {
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
        unsubscribeFn?.()
        if (ytype != null) {
          const yTypeCb = ytype.observeDeep((change, tr) => {
            if (!view || view.isDestroyed) {
              return unsubscribeFn?.()
            }
            // Skip changes we wrote ourselves from `appendTransaction`
            // - PM is already at the post-apply state, the reconcile
            // tr was already appended in the same dispatch.
            if (/** @type {any} */ (tr).origin === ySyncPluginKey.get(view.state)) return
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
          })
          const onAttrsChanged = attributionManager?.on('change', (changes) => {
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
        },
        destroy () {
          unsubscribeFn?.()
        }
      }
    }
  })
}
