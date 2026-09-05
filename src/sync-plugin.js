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
import { inlineAnonymousNodes } from './transformers/inline-anonymous-nodes.js'
import { swallowFormats, defaultSwallowedFormats } from './transformers/swallow-formats.js'
import { bind, Binding } from 'lib0/delta/rdt'
import * as dt from 'lib0/delta/transformer'
import { ySyncPluginKey } from './keys.js'
import * as s from 'lib0/schema'
import * as object from 'lib0/object'

/**
 * The y-prosemirror binding is a bi-directional synchronization with the provided Y.Node and the EditorView
 * Any change applied to the EditorView will be applied (via deltas) to the Y.Node, and vice versa.
 */
export const $syncPluginState = s.$object({
  ytype: Y.$nodeAny.nullable,
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
  customCompare: /** @type {s.Schema<NodeCompare>} */ (s.$function).nullable,
  /**
   * The live RDT binding (null while paused / before the first setup). `binding.t` is the
   * data(Y render)⇄view(PM doc) transformer that cursor positions are mapped through.
   */
  binding: /** @type {s.Schema<import('lib0/delta/rdt').Binding<any, any>>} */ (s.$instanceOf(Binding)).nullable
})

export const $syncPluginStateUpdate = s.$object({
  ytype: Y.$nodeAny.nullable.optional,
  renderer: Y.$renderer.nullable.optional,
  attributionMapper: /** @type {s.Schema<AttributionMapper>} */ (s.$function).nullable.optional,
  attributedNodes: /** @type {s.Schema<AttributedNodesPredicate>} */ (s.$function).nullable.optional,
  customCompare: /** @type {s.Schema<NodeCompare>} */ (s.$function).nullable.optional,
  binding: /** @type {s.Schema<import('lib0/delta/rdt').Binding<any, any>>} */ (s.$instanceOf(Binding)).nullable.optional,
  change: /** @type {s.Schema<Y.YEvent<any>>} */ (s.$any).nullable.optional
})
const $maybeSyncPluginStateUpdate = $syncPluginStateUpdate.nullable

/**
 * The binding transformer for a sync plugin state, but only when the binding actually
 * belongs to the state's current ytype/renderer. During a `configureYProsemirror`
 * dispatch a plugin-state overlay can pair a NEW ytype with the not-yet-replaced OLD
 * binding (`setup()` runs later, in the sync plugin's view update) - mapping positions
 * through it would resolve them against the wrong render.
 *
 * @param {{ytype: Y.Node | null, renderer: Y.AbstractRenderer | null, binding?: import('lib0/delta/rdt').Binding<any, any> | null} | undefined} ystate
 * @return {import('lib0/delta/transformer').Transformer<any, any> | null}
 */
export const usableTransformer = (ystate) => {
  const binding = ystate?.binding
  if (binding == null) {
    return null
  }
  const yRdt = /** @type {import('./rdt/y-sync.js').YSyncRdt} */ (binding.a)
  return (yRdt.ytype === ystate?.ytype && (yRdt.renderer ?? null) === (ystate?.renderer ?? null))
    ? binding.t
    : null
}

/**
 * Schemas already audited by {@link warnUnsupportedAttributionMarks}, so a
 * ytype/renderer switch (which rebuilds the binding) does not re-log.
 *
 * @type {WeakSet<import('prosemirror-model').Schema>}
 */
const auditedSchemas = new WeakSet()

/**
 * Warn once per schema about node types that cannot hold the reserved
 * `y-attributed-*` marks the binding renders.
 *
 * **Only call this for a binding that has a renderer.** Attribution is
 * produced exclusively by the renderer, so a renderer-less binding applies no
 * attribution marks and has nothing to audit. The caller enforces that; the
 * helper assumes it, and treats a schema declaring none of the marks as a
 * misconfiguration rather than an opt-out.
 *
 * Attribution is a *projection* of the Y side and is written to the view as
 * marks. When the target node's schema does not admit them, ProseMirror drops
 * them silently (`tr.addMark` checks `parent.type.allowsMarkType`) or throws
 * from `tr.addNodeMark`, and the reverse leg swallows the loss (see
 * {@link swallowFormats}) - so the view renders stale attribution with no
 * error to go on. The check is cheap, deterministic and runs before any
 * editing, which makes it a far better diagnostic than the transformer's
 * per-change warning: at swallow time a schema refusal is indistinguishable
 * from an ordinary edit to the projection.
 *
 * Leaf node types are skipped - they hold no content that could carry a mark.
 * The test is `NodeType.allowsMarkType`, i.e. the *resolved* `markSet`, not
 * the `marks:` spec string: ProseMirror resolves an omitted `marks:` on a
 * node without inline content to `[]`, so a container can exclude the marks
 * without ever writing `marks: ''`.
 *
 * @param {import('prosemirror-model').Schema} schema
 */
const warnUnsupportedAttributionMarks = (schema) => {
  if (auditedSchemas.has(schema)) return
  auditedSchemas.add(schema)
  const markTypes = defaultSwallowedFormats
    .map(name => schema.marks[name])
    .filter(markType => markType != null)
  if (markTypes.length === 0) {
    // the caller only gets here with a renderer configured, so this is a
    // misconfiguration rather than an opt-out: suggestions were asked for and
    // the schema has nothing to display them with
    console.warn(
      '[y/prosemirror] a renderer is configured (suggestions / versioning), but this schema ' +
      'declares none of the y-attributed-* marks - no attribution will be rendered. Declare ' +
      'y-attributed-insert / -delete / -format (and y-attributed-attrs for node-attribute ' +
      'changes) and whitelist them on every node that holds attributable content. See ' +
      'ATTRIBUTION.md.'
    )
    return
  }
  /**
   * @type {Array<string>}
   */
  const offenders = []
  for (const nodeName in schema.nodes) {
    const nodeType = schema.nodes[nodeName]
    if (nodeType.isLeaf) continue // no content to carry a mark
    const missing = markTypes.filter(markType => !nodeType.allowsMarkType(markType))
    if (missing.length > 0) {
      offenders.push(`  ${nodeName}: ${missing.map(m => m.name).join(', ')}`)
    }
  }
  if (offenders.length === 0) return
  console.warn(
    '[y/prosemirror] these node types do not allow the attribution marks this binding renders:\n' +
    offenders.join('\n') +
    '\nProseMirror drops those marks silently (or throws from `tr.addNodeMark`) and the binding ' +
    'swallows the loss, so attribution will not render inside those nodes. Add the marks by name ' +
    "to each node's `marks` content expression, or extend its `markSet` after editor construction."
  )
}

/**
 * This Prosemirror {@link Plugin} is responsible for synchronizing the prosemirror {@link EditorState} with a {@link Y.XmlFragment}
 *
 * The two sides are modeled as lib0 `RDT`s ({@link YSyncRdt} around the ytype,
 * {@link ProsemirrorRdt} around the view) connected through a transformer
 * pipeline (`lib0/delta/rdt.bind`):
 *
 *     YSyncRdt ⇄ pipe(fullAttributions, inlineAnonymousNodes, ...opts.transformers, attributionToFormat, swallowFormats) ⇄ ProsemirrorRdt
 *
 * Data → view (`applyA`), the pipeline expands each change's attribution to
 * the full accumulated attribution (`fullAttributions`) and renders it into
 * the reserved `y-attributed-*` format keys (`attributionToFormat`) that the
 * view applies as marks. View → data (`applyB`), `swallowFormats` gates those
 * keys: a view-side *removal* is dropped (nothing reaches Y, nothing is pushed
 * back) and a view-side *addition* is dropped and corrected away in the view —
 * the view never attributes; the Y side re-attributes through its renderer and
 * returns the resulting marks as a fix.
 *
 * The PM->Y pull runs in the plugin's `view().update` hook (i.e. after the
 * dispatch has been committed to the view), not in `appendTransaction`.
 * Running it in `appendTransaction` would cause speculative `state.apply`
 * callers to write to Y as a side effect.
 *
 * @param {object} opts
 * @param {Y.Doc} [opts.suggestionDoc] A {@link Y.Doc} to use for suggestion tracking
 * @param {AttributionMapper} [opts.mapAttributionToMark] A function to map the {@link Y.ContentAttribute} to a {@link import('prosemirror-model').Mark} - the mark names *must* be one of: `y-attributed-insert`, `y-attributed-delete`, `y-attributed-format`, `y-attributed-attrs`. No other mark names are permitted. `y-attributed-attrs` is the node-level mark for *attribute* changes (e.g. a suggested heading-level change): it is materialized automatically when the schema declares it (declare `attrs: { changes: { default: null } }` and — unlike the other three — keep the DEFAULT `excludes`, so a re-render *replaces* the mark instead of stacking instances). Its payload is not routed through the mapper by default; a mapper may take control by emitting the `y-attributed-attrs` key.
 * @param {AttributedNodesPredicate} [opts.attributedNodes] Optional predicate `(nodeName, kinds) => boolean`. When it returns `true` for an attributed node *and* a `{nodeName}--attributed` type exists in the schema, that node is rendered under the variant type (the `y-attributed-*` marks are still applied). `kinds` is `{ insert?, delete?, format? }`. The variant is a pure rendering concern - the canonical name is what is stored in the Y document. The predicate must be deterministic in `(nodeName, kinds)`.
 * @param {NodeCompare} [opts.customCompare] Optional predicate `(a, b) => boolean` that shifts the *diffing boundary*. To sync, y-prosemirror diffs the ProseMirror doc against the Y document as `lib0/delta` trees; lib0's `diff` decides for each candidate node pair whether to pair them (diff *in place* via a `modify` op) or to **replace the old subtree wholesale** (delete + insert). By default a pair is matched purely on node name (`a.name === b.name`). Supply this to move the boundary - e.g. make a `blockContainer` only pair when its first child type also matches (`(a, b) => a.name === b.name && (a.name !== 'blockContainer' || firstChildName(a) === firstChildName(b))`), so changing the first child replaces the whole container instead of editing it in place. Receives the raw `lib0/delta` nodes `(fromNode, toNode)` (each exposing `.name`, `.attrs`, `.children`) and is forwarded to `lib0/delta.diff` as its `compare` option, applied recursively down the tree. Generally keep the `a.name === b.name` check; omit the option to keep lib0's name-only default.
 * @param {Array<(($d: s.Schema<any>) => dt.Template<any, any>)>} [opts.transformers] Optional custom transformer stages, slotted into the pipeline **between** the built-in compat flattening stage ({@link inlineAnonymousNodes}) and `attributionToFormat`, in data→view (`applyA`) order (i.e. before the closing `attributionToFormat` / {@link swallowFormats} pair). Each is a `$d => Template` factory (see `lib0/delta/transformer`); the input schema is threaded left to right. Custom transformers see changes in the flattened document space (old-representation anonymous text containers already spliced into their parents), with the complete accumulated attribution on every attribution-bearing op.
 * @param {null|((err:Error,errCode:number)=>any)} [opts.onInternalError] Listen to internal
 * errors for debugging purposes. This API is unstable and can be changed/removed at any time!
 * (errCode 0: applyDelta failed)
 * @returns {Plugin}
 */
export const syncPlugin = (opts = {}) => {
  return new Plugin({
    key: ySyncPluginKey,
    state: {
      init: () => {
        return $syncPluginState.expect({
          ytype: null,
          renderer: null,
          attributionMapper: opts.mapAttributionToMark || defaultMapAttributionToMark,
          attributedNodes: opts.attributedNodes || defaultAttributedNodes,
          customCompare: opts.customCompare || null,
          binding: null
        })
      },
      apply: (tr, prevPluginState) => {
        const stateUpdate = $maybeSyncPluginStateUpdate.expect(tr.getMeta(ySyncPluginKey) || null)
        if (!stateUpdate) {
          return prevPluginState
        }
        return object.assign({}, prevPluginState, stateUpdate, stateUpdate.renderer == null ? { renderer: null } : {})
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
        if (ytype == null) {
          // paused - clear the exposed binding. `renderer` must ride along on every
          // state-update meta: `apply` force-nulls it when omitted.
          if (pluginState.binding != null) {
            view.dispatch(view.state.tr.setMeta(ySyncPluginKey, $syncPluginStateUpdate.expect({
              binding: null,
              renderer: pluginState.renderer
            })).setMeta('addToHistory', false))
          }
          return
        }
        const renderer = pluginState.renderer || null
        // Attribution exists only where a renderer produces it (`renderer: null`
        // renders plain content - see YSyncRdt, and `@y/y`'s no-renderer path,
        // which hardcodes `attrs: null`). A renderer-less binding therefore
        // never applies a `y-attributed-*` mark, so auditing the schema for
        // them would be noise. Setting a renderer is the moment the integrator
        // asks for suggestions / versioning - and a renderer change rebuilds
        // the binding, so this gate is also "audit once, when a renderer is set".
        if (renderer != null) warnUnsupportedAttributionMarks(view.state.schema)
        const compare = pluginState.customCompare
        const conf = attributionMapperToConf(pluginState.attributionMapper)
        // The attr-attribution lift (lib0's `y-attributed-attrs` format) is
        // schema-gated: without the mark declared there is nothing to
        // materialize it into, and an unmaterialized expected-format would
        // break the render⇄doc fixpoint. Removing the handler restores the
        // exact pre-existing behavior (attr-op attribution dropped).
        if (view.state.schema.marks['y-attributed-attrs'] == null) {
          delete conf.attrs
        }
        const yRdt = new YSyncRdt({
          ytype,
          renderer,
          origin: ySyncPluginKey.get(view.state),
          compare,
          onInternalError: opts.onInternalError ?? null
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
          // compat: flatten old-representation nested anonymous text
          // containers. Must run AFTER renderedAttributions (which
          // parallel-walks the structured yRdt.delta) and BEFORE custom
          // transformers, which see the flattened space.
          (/** @type {s.Schema<any>} */ $d2) => inlineAnonymousNodes($d2),
          ...(opts.transformers ?? []),
          (/** @type {s.Schema<any>} */ $d2) => dt.attributionToFormat($d2, conf),
          // the one-way gate for the `y-attributed-*` projection. MUST be
          // last: an `applyB` change flows right-to-left, so any earlier
          // position would let `attributionToFormat`'s own strip erase the
          // keys before this stage could decide to swallow or correct them.
          (/** @type {s.Schema<any>} */ $d2) => swallowFormats($d2)
          // `diffCompare` applies `customCompare` to the initial-state sync
          // diff as well. The RDTs' own diffs (view-side pulls, fixes, the
          // Y side's uncertain-window emissions) already use it; the Y side's
          // steady-state emissions are the native change deltas — the change
          // as it actually happened — which are never re-paired by `diff`,
          // so `customCompare` does not apply there (see YSyncRdt).
        ), { diffCompare: compare ?? undefined })
        // Expose the live binding on the plugin state so the cursor plugin can map
        // positions through its transformer. `renderer` must ride along: `apply`
        // force-nulls it when omitted, which would tear down an active renderer (and
        // re-trigger setup, forever). The re-entrant dispatch is safe - `binding` is
        // not part of the identity comparison in `update` below.
        view.dispatch(view.state.tr.setMeta(ySyncPluginKey, $syncPluginStateUpdate.expect({
          binding: rdts.binding,
          renderer: pluginState.renderer
        })).setMeta('addToHistory', false))
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
          rdts.pmRdt.pull(prevState.doc)
        },
        destroy () {
          teardown()
        }
      }
    }
  })
}
