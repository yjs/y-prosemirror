import * as Y from '@y/y'
import { Plugin } from 'prosemirror-state'
import {
  attributionMapperToConf,
  defaultAttributedNodes,
  defaultMapAttributionToMark
} from './sync-utils.js'
import { YSyncRdt } from './rdt/y-sync.js'
import { ProsemirrorRdt } from './rdt/prosemirror.js'
import { renderedAttributions } from './transformers/rendered-attributions.js'
import { bind } from 'lib0/delta/rdt'
import * as dt from 'lib0/delta/transformer'
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
   * If provided, will switch to the given renderer instead of the current renderer
   */
  renderer: Y.$renderer.nullable,
  attributionMapper: /** @type {s.Schema<AttributionMapper>} */ (s.$function),
  /**
   * Predicate deciding which attributed nodes render under their
   * `{nodeName}--attributed` variant. See {@link syncPlugin}.
   */
  attributedNodes: /** @type {s.Schema<AttributedNodesPredicate>} */ (s.$function),
  /**
   * Custom pairing predicate that shifts the diffing boundary (forwarded to
   * `lib0/delta.diff` as its `compare` option). `null` keeps lib0's name-only
   * default. See {@link NodeCompare} and {@link syncPlugin}.
   */
  customCompare: /** @type {s.Schema<NodeCompare>} */ (s.$function).nullable
})

export const $syncPluginStateUpdate = s.$object({
  ytype: Y.$ytypeAny.nullable.optional,
  renderer: Y.$renderer.nullable.optional,
  attributionMapper: /** @type {s.Schema<AttributionMapper>} */ (s.$function).nullable.optional,
  attributedNodes: /** @type {s.Schema<AttributedNodesPredicate>} */ (s.$function).nullable.optional,
  customCompare: /** @type {s.Schema<NodeCompare>} */ (s.$function).nullable.optional,
  change: /** @type {s.Schema<Y.YEvent<any>>} */ (s.$any).nullable.optional
})
const $maybeSyncPluginStateUpdate = $syncPluginStateUpdate.nullable

/**
 * This Prosemirror {@link Plugin} is responsible for synchronizing the prosemirror {@link EditorState} with a {@link Y.XmlFragment}
 *
 * The two sides are modeled as lib0 `RDT`s ({@link YSyncRdt} around the ytype,
 * {@link ProsemirrorRdt} around the view) connected through a transformer
 * pipeline (`lib0/delta/rdt.bind`):
 *
 *     YSyncRdt ⇄ pipe(fullAttributions, ...opts.transformers, attributionToFormat) ⇄ ProsemirrorRdt
 *
 * Data → view (`applyA`), the pipeline expands each change's attribution to
 * the full accumulated attribution (`fullAttributions`) and renders it into
 * the reserved `y-attributed-*` format keys (`attributionToFormat`) that the
 * view applies as marks. View → data (`applyB`), the `y-attributed-*` keys are
 * stripped back out — the view never attributes; the Y side re-attributes
 * through its renderer and returns the resulting marks as a fix.
 *
 * The PM->Y pull runs in the plugin's `view().update` hook (i.e. after the
 * dispatch has been committed to the view), not in `appendTransaction`.
 * Running it in `appendTransaction` would cause speculative `state.apply`
 * callers to write to Y as a side effect.
 *
 * @param {object} opts
 * @param {Y.Doc} [opts.suggestionDoc] A {@link Y.Doc} to use for suggestion tracking
 * @param {AttributionMapper} [opts.mapAttributionToMark] A function to map the {@link Y.Attribution} to a {@link import('prosemirror-model').Mark} - the mark names *must* be one of: `y-attributed-insert`, `y-attributed-delete`, `y-attributed-format`. No other mark names are permitted
 * @param {AttributedNodesPredicate} [opts.attributedNodes] Optional predicate `(nodeName, kinds) => boolean`. When it returns `true` for an attributed node *and* a `{nodeName}--attributed` type exists in the schema, that node is rendered under the variant type (the `y-attributed-*` marks are still applied). `kinds` is `{ insert?, delete?, format? }`. The variant is a pure rendering concern - the canonical name is what is stored in the Y document. The predicate must be deterministic in `(nodeName, kinds)`.
 * @param {NodeCompare} [opts.customCompare] Optional predicate `(a, b) => boolean` that shifts the *diffing boundary*. To sync, y-prosemirror diffs the ProseMirror doc against the Y document as `lib0/delta` trees; lib0's `diff` decides for each candidate node pair whether to pair them (diff *in place* via a `modify` op) or to **replace the old subtree wholesale** (delete + insert). By default a pair is matched purely on node name (`a.name === b.name`). Supply this to move the boundary - e.g. make a `blockContainer` only pair when its first child type also matches (`(a, b) => a.name === b.name && (a.name !== 'blockContainer' || firstChildName(a) === firstChildName(b))`), so changing the first child replaces the whole container instead of editing it in place. Receives the raw `lib0/delta` nodes `(fromNode, toNode)` (each exposing `.name`, `.attrs`, `.children`) and is forwarded to `lib0/delta.diff` as its `compare` option, applied recursively down the tree. Generally keep the `a.name === b.name` check; omit the option to keep lib0's name-only default.
 * @param {Array<(($d: s.Schema<any>) => dt.Template<any, any>)>} [opts.transformers] Optional custom transformer stages, slotted into the pipeline **between** `fullAttributions` and `attributionToFormat`, in data→view (`applyA`) order. Each is a `$d => Template` factory (see `lib0/delta/transformer`); the input schema is threaded left to right. Custom transformers see changes in canonical document space, with the complete accumulated attribution on every attribution-bearing op.
 * @returns {Plugin}
 */
export function syncPlugin (opts = {}) {
  return new Plugin({
    key: ySyncPluginKey,
    state: {
      init: () => {
        return $syncPluginState.expect({
          ytype: null,
          renderer: null,
          attributionMapper: opts.mapAttributionToMark || defaultMapAttributionToMark,
          attributedNodes: opts.attributedNodes || defaultAttributedNodes,
          customCompare: opts.customCompare || null
        })
      },
      apply: (tr, prevPluginState) => {
        const stateUpdate = $maybeSyncPluginStateUpdate.expect(tr.getMeta(ySyncPluginKey) || null)
        if (!stateUpdate) {
          return prevPluginState
        }
        return object.assign({}, prevPluginState, stateUpdate, stateUpdate.renderer == null ? { renderer: Y.baseRenderer } : {})
      }
    },
    view () {
      /**
       * @type {{ yRdt: YSyncRdt, pmRdt: ProsemirrorRdt, binding: import('lib0/delta/rdt').Binding<any, any> } | null}
       */
      let rdts = null
      const teardown = () => {
        if (rdts == null) return
        rdts.binding.destroy()
        rdts.yRdt.destroy()
        rdts.pmRdt.destroy()
        rdts = null
      }
      /**
       * (Re)create both RDTs and the binding for the current plugin state.
       * A fresh binding also means fresh transformer state (the
       * `fullAttributions` overlay tracks the change stream and must never be
       * reused across a ytype/renderer switch).
       *
       * @param {import('prosemirror-view').EditorView} view
       * @param {SyncPluginState} pluginState
       */
      const setup = (view, pluginState) => {
        teardown()
        const ytype = pluginState.ytype
        if (ytype == null) return // paused
        const renderer = pluginState.renderer || Y.baseRenderer
        const compare = pluginState.customCompare
        const conf = attributionMapperToConf(pluginState.attributionMapper)
        const yRdt = new YSyncRdt({
          ytype,
          renderer,
          origin: ySyncPluginKey.get(view.state),
          compare
        })
        const pmRdt = new ProsemirrorRdt({
          view,
          attributedNodes: pluginState.attributedNodes,
          compare,
          // an empty ytype must not receive the editor's schema-default
          // content — see "Initial-content gate" in ProsemirrorRdt's doc
          gateInitialContent: ytype.length === 0,
          getMeta: () => $syncPluginStateUpdate.expect({
            change: null,
            renderer: pluginState.renderer,
            attributionMapper: pluginState.attributionMapper,
            ytype
          })
        })
        // Store the rdts *before* binding: the Binding constructor runs the
        // initial sync synchronously, which dispatches into the view and
        // re-enters this plugin's `update` hook.
        rdts = { yRdt, pmRdt, binding: /** @type {any} */ (null) }
        rdts.binding = bind(yRdt, pmRdt, $d => /** @type {any} */ (dt.pipe)(
          $d,
          // y-prosemirror-specific replacement for lib0's `fullAttributions` —
          // resolves full attributions from the Y render instead of a stateful
          // overlay (see transformers/rendered-attributions.js for why)
          (/** @type {s.Schema<any>} */ $d2) => renderedAttributions($d2, () => yRdt.delta),
          ...(opts.transformers ?? []),
          (/** @type {s.Schema<any>} */ $d2) => dt.attributionToFormat($d2, conf)
          // `diffCompare` applies `customCompare` to the initial-state sync
          // diff as well. The RDTs' own diffs (view-side pulls, fixes, the
          // Y side's uncertain-window emissions) already use it; the Y side's
          // steady-state emissions are the native change deltas — the change
          // as it actually happened — which are never re-paired by `diff`,
          // so `customCompare` does not apply there (see YSyncRdt).
        ), { diffCompare: compare ?? undefined })
      }
      return {
        update (view, prevState) {
          const pluginState = $syncPluginState.cast(ySyncPluginKey.getState(view.state))
          const prevPluginState = ySyncPluginKey.getState(prevState)
          if (
            prevPluginState?.ytype !== pluginState.ytype ||
            prevPluginState?.renderer !== pluginState.renderer ||
            prevPluginState?.attributionMapper !== pluginState.attributionMapper ||
            prevPluginState?.attributedNodes !== pluginState.attributedNodes ||
            prevPluginState?.customCompare !== pluginState.customCompare
          ) {
            setup(view, pluginState)
          }
          if (rdts == null) return
          // our own dispatch re-entering the hook — `applyDelta` handles state
          if (rdts.pmRdt.isApplying) return
          if (view.state.doc === prevState.doc) return
          rdts.pmRdt.pull()
        },
        destroy () {
          teardown()
        }
      }
    }
  })
}
