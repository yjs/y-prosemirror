import * as Y from '@y/y'
import { Plugin } from 'prosemirror-state'
import {
  $prosemirrorDelta,
  defaultAttributedNodes,
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
  attributionMapper: /** @type {s.Schema<AttributionMapper>} */ (s.$function),
  /**
   * Predicate deciding which attributed nodes render under their
   * `{nodeName}--attributed` variant. See {@link syncPlugin}.
   */
  attributedNodes: /** @type {s.Schema<AttributedNodesPredicate>} */ (s.$function),
  /**
   * When `true`, the PM document contains clean content (no attribution
   * marks, no deleted text). Attribution is rendered as decorations by
   * {@link import('./suggestion-decoration-plugin.js').ySuggestionDecorationPlugin}.
   */
  decorationMode: s.$boolean
})

export const $syncPluginStateUpdate = s.$object({
  ytype: Y.$ytypeAny.nullable.optional,
  attributionManager: Y.$attributionManager.nullable.optional,
  attributionMapper: /** @type {s.Schema<AttributionMapper>} */ (s.$function).nullable.optional,
  attributedNodes: /** @type {s.Schema<AttributedNodesPredicate>} */ (s.$function).nullable.optional,
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
 * Create a proxy AM that uses clean counting for navigation while
 * preserving attribution recording. Needed in decoration mode because
 * the diff is in clean coordinates (AM-deleted items invisible), but a
 * real AM's contentLength includes deleted items at full length.
 *
 * @param {Y.AbstractAttributionManager} am
 * @returns {Y.AbstractAttributionManager}
 */
const createNavAM = (am) =>
  am === Y.noAttributionsManager
    ? am
    : new Proxy(am, {
      get (target, prop, receiver) {
        if (prop === 'contentLength') return Y.noAttributionsManager.contentLength
        if (prop === 'readContent') return Y.noAttributionsManager.readContent
        return Reflect.get(target, prop, receiver)
      }
    })

/**
 * This Prosemirror {@link Plugin} is responsible for synchronizing the prosemirror {@link EditorState} with a {@link Y.XmlFragment}
 *
 * The PM->Y diff/apply pipeline runs in the plugin's `view().update`
 * hook (i.e. after the dispatch has been committed to the view), not
 * in `appendTransaction`. Running it in `appendTransaction` would
 * cause speculative `state.apply` callers to write to Y as a side
 * effect.
 *
 * @param {object} [opts]
 * @param {Y.Doc} [opts.suggestionDoc] A {@link Y.Doc} to use for suggestion tracking
 * @param {AttributionMapper} [opts.mapAttributionToMark] A function to map the {@link Y.Attribution} to a {@link import('prosemirror-model').Mark} - the mark names *must* be one of: `y-attributed-insert`, `y-attributed-delete`, `y-attributed-format`. No other mark names are permitted
 * @param {AttributedNodesPredicate} [opts.attributedNodes] Optional predicate `(nodeName, kinds) => boolean`. When it returns `true` for an attributed node *and* a `{nodeName}--attributed` type exists in the schema, that node is rendered under the variant type (the `y-attributed-*` marks are still applied). `kinds` is `{ insert?, delete?, format? }`. The variant is a pure rendering concern - the canonical name is what is stored in the Y document. The predicate must be deterministic in `(nodeName, kinds)`.
 * @param {boolean} [opts.decorationMode] When `true`, the PM document contains **clean** content (no attribution marks, no deleted text). Attribution is rendered as decorations by {@link import('./suggestion-decoration-plugin.js').ySuggestionDecorationPlugin}. Default `false` (mark-based rendering).
 * @returns {Plugin}
 */
export function syncPlugin (opts = {}) {
  const decorationMode = opts.decorationMode || false
  return new Plugin({
    key: ySyncPluginKey,
    state: {
      init: () => {
        return $syncPluginState.expect({
          ytype: null,
          attributionManager: null,
          attributionMapper: opts.mapAttributionToMark || defaultMapAttributionToMark,
          attributedNodes: opts.attributedNodes || defaultAttributedNodes,
          decorationMode
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
       * @param {AttributedNodesPredicate} opts.attributedNodes
       */
      function subscribeToYType ({ view, ytype, attributionManager, attributionMapper, attributedNodes }) {
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
            let desiredPM, pcontent, diff, ptr
            if (decorationMode) {
              desiredPM = ytype.toDeltaDeep().done()
              pcontent = nodeToDelta(view.state.doc).done()
              diff = d.diff(pcontent, desiredPM)
              ptr = diff.isEmpty() ? view.state.tr : deltaToPSteps(view.state.tr, diff)
            } else {
              const am = attributionManager || Y.noAttributionsManager
              desiredPM = deltaAttributionToFormat(
                ytype.toDeltaDeep(am),
                attributionMapper
              ).done()
              pcontent = nodeToDelta(view.state.doc, undefined, true).done()
              diff = d.diff(pcontent, desiredPM)
              if (diff.isEmpty()) return
              ptr = deltaToPSteps(view.state.tr, diff, undefined, undefined, attributedNodes)
            }
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
            let desiredPM, pcontent, diff, ptr
            if (decorationMode) {
              desiredPM = ytype.toDeltaDeep().done()
              pcontent = nodeToDelta(view.state.doc).done()
              diff = d.diff(pcontent, desiredPM)
              ptr = diff.isEmpty() ? view.state.tr : deltaToPSteps(view.state.tr, diff)
            } else {
              desiredPM = deltaAttributionToFormat(
                ytype.toDeltaDeep(attributionManager || Y.noAttributionsManager),
                attributionMapper
              ).done()
              pcontent = nodeToDelta(view.state.doc, undefined, true).done()
              diff = d.diff(pcontent, desiredPM)
              if (diff.isEmpty()) return
              ptr = deltaToPSteps(view.state.tr, diff, undefined, undefined, attributedNodes)
            }
            ptr.setMeta('addToHistory', false)
            ptr.setMeta('y-sync-transaction', $syncPluginStateUpdate.expect({
              change: null,
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
              attributionMapper: pluginState.attributionMapper,
              attributedNodes: pluginState.attributedNodes
            })
          }
          if (ytype == null) return
          if (view.state.doc === prevState.doc) return
          const am = attributionManager || Y.noAttributionsManager
          const mapper = pluginState.attributionMapper
          const attributedNodes = pluginState.attributedNodes
          if (decorationMode) {
            const navAM = createNavAM(am)
            const ycontent = ytype.toDeltaDeep().done()
            const pcontent = nodeToDelta(view.state.doc).done()
            const pmToYDiff = d.diff(ycontent, pcontent)
            if (!pmToYDiff.isEmpty()) {
              /** @type {Y.Doc} */ (ytype.doc).transact(() => {
                ytype.applyDelta(pmToYDiff, navAM)
              }, ySyncPluginKey.get(view.state))
            }
            // Always dispatch so the decoration plugin can rebuild.
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
              attributionMapper: mapper,
              ytype
            }))
            view.dispatch(tr)
          } else {
            const ycontent = deltaAttributionToFormat(
              ytype.toDeltaDeep(am),
              mapper
            ).done()
            const pcontent = nodeToDelta(view.state.doc, undefined, true).done()
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
            const pcontentAfter = nodeToDelta(view.state.doc, undefined, true).done()
            const pmReconcileDiff = d.diff(pcontentAfter, desiredPM)
            if (pmReconcileDiff.isEmpty()) return
            const tr = view.state.tr
            deltaToPSteps(tr, pmReconcileDiff, undefined, undefined, attributedNodes)
            tr.setMeta('addToHistory', false)
            tr.setMeta('y-sync-transaction', $syncPluginStateUpdate.expect({
              change: null,
              attributionManager,
              attributionMapper: mapper,
              ytype
            }))
            view.dispatch(tr)
          }
        },
        destroy () {
          unsubscribeFn?.()
        }
      }
    }
  })
}
