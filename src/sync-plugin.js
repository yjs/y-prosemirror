import * as Y from '@y/y'
import { Plugin } from 'prosemirror-state'
import {
  $prosemirrorDelta,
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
 * Strip attribution-mark formats (`y-attributed-*`). Returns a fresh
 * delta - **never mutates** the input. `lib0/delta.diff` reuses op
 * references (and nested delta references) from its inputs, so an
 * in-place mutation here would also mutate `pcontent`/`desiredPM` and
 * corrupt subsequent diff calls. `lib0/delta.clone` only deep-clones
 * the top level - nested deltas inside an `InsertOp.insert` array stay
 * shared by reference - so cloning then mutating is also unsafe.
 *
 * @param {d.DeltaAny} input
 * @returns {d.DeltaAny}
 */
const stripAttributionFormattingFromDelta = (input) => {
  /** @param {Record<string, unknown> | null | undefined} format */
  const stripFormat = (format) => {
    if (format == null) return format
    /** @type {Record<string, unknown>} */
    const out = {}
    for (const k in format) {
      if (!attributionMarkNames.includes(k)) out[k] = format[k]
    }
    return out
  }
  const out = /** @type {any} */ (d.create(input.name, $prosemirrorDelta))
  for (const attr of input.attrs) {
    // @ts-ignore
    out.attrs[attr.key] = attr.clone()
  }
  for (const child of input.children) {
    if (d.$retainOp.check(child)) {
      out.retain(child.retain, stripFormat(child.format))
    } else if (d.$textOp.check(child)) {
      out.insert(child.insert, stripFormat(child.format))
    } else if (d.$insertOp.check(child)) {
      const newInsert = child.insert.map(ins =>
        d.$deltaAny.check(ins) ? stripAttributionFormattingFromDelta(ins) : ins
      )
      out.insert(newInsert, stripFormat(child.format))
    } else if (d.$deleteOp.check(child)) {
      out.delete(child.delete)
    } else if (d.$modifyOp.check(child)) {
      out.modify(stripAttributionFormattingFromDelta(child.value), stripFormat(child.format))
    }
  }
  return out.done(false)
}

/**
 * This Prosemirror {@link Plugin} is responsible for synchronizing the prosemirror {@link EditorState} with a {@link Y.XmlFragment}
 *
 * The PM->Y diff/apply pipeline runs in the plugin's `view().update`
 * hook (i.e. after the dispatch has been committed to the view), not
 * in `appendTransaction`. Running it in `appendTransaction` would
 * cause speculative `state.apply` callers to write to Y as a side
 * effect.
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
          // Listen on the doc's `afterTransaction` event rather than
          // `ytype.observeDeep`. `observeDeep` skips firing for any
          // changes whose path runs through a *deleted* parent type
          // (Y.js `Transaction._callObserver` short-circuits when
          // `parent._item.deleted`). That happens in suggestion-mode
          // when one peer suggestion-deletes a paragraph and another
          // peer then inserts into it - the integrate path leaves the
          // root deep observer silent, so the PM view never reconciles
          // and goes stale (see `testCohortReplayConvergesAfterInsert
          // IntoSuggestionDeletedParagraph`). `afterTransaction` fires
          // unconditionally, so the reconcile pass always runs.
          /** @type {Y.Doc} */
          const ydoc = /** @type {Y.Doc} */ (ytype.doc)
          const onAfterTransaction = (/** @type {any} */ tr) => {
            if (!view || view.isDestroyed) {
              return unsubscribeFn?.()
            }
            // Skip changes we wrote ourselves from `view().update`
            // - the PM->Y commit there already handled the reconcile
            // dispatch in the same call.
            if (/** @type {any} */ (tr).origin === ySyncPluginKey.get(view.state)) return
            // Same pipeline as the PM->Y sync in `view().update`:
            // render ytype through the AM, diff against the current PM doc,
            // apply only the difference. Using `change.getDelta` here
            // produced wrong/asymmetric output for some interleavings
            // (notably commits-to-base from one peer that touched suggestion
            // overlays from another), causing PM views to diverge from each
            // other and from the canonical AM render. The full re-render is
            // more expensive per update but is the only diff target all
            // peers agree on.
            const am = attributionManager || Y.noAttributionsManager
            const desiredPM = deltaAttributionToFormat(
              ytype.toDeltaDeep(am),
              attributionMapper
            ).done()
            const pcontent = nodeToDelta(view.state.doc).done()
            const diff = d.diff(pcontent, desiredPM)
            if (diff.isEmpty()) return
            const ptr = deltaToPSteps(view.state.tr, diff)
            ptr.setMeta('addToHistory', false)
            ptr.setMeta('y-sync-transaction', $syncPluginStateUpdate.expect({
              change: null,
              attributionManager,
              attributionMapper,
              ytype
            }))
            view.dispatch(ptr)
          }
          ydoc.on('afterTransaction', onAfterTransaction)
          const onAttrsChanged = attributionManager?.on('change', (_changes) => {
            if (!view || view.isDestroyed) {
              return unsubscribeFn?.()
            }
            // Same pipeline as the PM->Y sync in `view().update`:
            // render ytype through the AM, diff against the current PM doc,
            // apply only the difference. We give up the `itemsToRender`
            // targeted-rerender optimization in exchange for going through
            // the same path that the rest of the plugin uses, which keeps
            // the deltas shallow (only what actually changed).
            const desiredPM = deltaAttributionToFormat(
              ytype.toDeltaDeep(attributionManager || Y.noAttributionsManager),
              attributionMapper
            ).done()
            const pcontent = nodeToDelta(view.state.doc).done()
            const diff = d.diff(pcontent, desiredPM)
            if (diff.isEmpty()) return
            const ptr = deltaToPSteps(view.state.tr, diff)
            ptr.setMeta('addToHistory', false)
            // @todo stop updating meta on every transaction
            ptr.setMeta('y-sync-transaction', $syncPluginStateUpdate.expect({
              change: null, // @todo - remove this property
              attributionManager,
              attributionMapper,
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
            // Subscribe to the new ytype/attributionManager
            // (subscribeToYType will automatically unsubscribe from previous if needed)
            subscribeToYType({
              view,
              ytype,
              attributionManager,
              attributionMapper: pluginState.attributionMapper
            })
          }
          if (ytype == null) return
          if (view.state.doc === prevState.doc) return
          // PM->Y diff/apply pipeline. Runs after the dispatch is
          // committed to the view, so speculative `state.apply` calls
          // do not write to Y. The Y `afterTransaction` observer
          // skips the write we make here via the origin check. The
          // AM `change` handler may, however, dispatch its own
          // reconcile synchronously during `transact` - so we
          // re-read `pcontent` from `view.state.doc` after the write
          // before computing our own reconcile, otherwise we'd
          // apply the same insert twice.
          const am = attributionManager || Y.noAttributionsManager
          const mapper = pluginState.attributionMapper
          const ycontent = deltaAttributionToFormat(
            ytype.toDeltaDeep(am),
            mapper
          ).done()
          const pcontent = nodeToDelta(view.state.doc).done()
          const pmToYDiff = stripAttributionFormattingFromDelta(d.diff(ycontent, pcontent))
          if (!pmToYDiff.isEmpty()) {
            /** @type {Y.Doc} */ (ytype.doc).transact(() => {
              ytype.applyDelta(pmToYDiff, am)
            }, ySyncPluginKey.get(view.state))
          }
          const desiredPM = deltaAttributionToFormat(
            ytype.toDeltaDeep(am),
            mapper
          ).done()
          const pcontentAfter = nodeToDelta(view.state.doc).done()
          const pmReconcileDiff = d.diff(pcontentAfter, desiredPM)
          if (pmReconcileDiff.isEmpty()) return
          const tr = view.state.tr
          deltaToPSteps(tr, pmReconcileDiff)
          tr.setMeta('addToHistory', false)
          tr.setMeta('y-sync-transaction', $syncPluginStateUpdate.expect({
            change: null,
            attributionManager,
            attributionMapper: mapper,
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
