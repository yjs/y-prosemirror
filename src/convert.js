import * as delta from 'lib0/delta'
import * as dt from 'lib0/delta/transformer'
import {
  $prosemirrorDelta,
  attributionMapperToConf,
  defaultAttributedNodes,
  defaultMapAttributionToMark,
  deltaToPNode,
  nodeToDeltaCached
} from './sync-utils.js'
import { renderedAttributions } from './transformers/rendered-attributions.js'
import { inlineAnonymousNodes } from './transformers/inline-anonymous-nodes.js'
import { swallowFormats } from './transformers/swallow-formats.js'

/**
 * What a {@link YProsemirrorTransformer} is materialized against.
 *
 * @typedef {object} TransformerContext
 * @property {() => delta.DeltaAny} getState the Y side's current render (the
 *   state every `applyA` change is positioned against). The
 *   `renderedAttributions` stage resolves the full attribution from it.
 * @property {import('prosemirror-model').Schema} schema the ProseMirror schema
 *   of the view side
 */

/**
 * The data (Y render) ⇄ view (ProseMirror delta) pipeline, parameterized by
 * the context only known where it is used: the binding passes its live Y
 * state, {@link ynodeToPmnode} the render it converts. Returns the
 * `$d => Template` factory that `lib0/delta/rdt.bind` takes.
 *
 * @typedef {(ctx: TransformerContext) => dt.TemplateFactory<any, any>} YProsemirrorTransformer
 */

/**
 * The transformer pipeline the sync plugin binds the ytype and the view
 * through:
 *
 *     renderedAttributions ⇄ inlineAnonymousNodes ⇄ ...transformers ⇄ attributionToFormat ⇄ swallowFormats
 *
 * Data → view (`applyA`), `renderedAttributions` expands each change's
 * attribution to the full attribution of the Y render, and
 * `attributionToFormat` renders it into the reserved `y-attributed-*` format
 * keys that the view applies as marks. View → data (`applyB`),
 * `swallowFormats` gates those keys: the view never attributes.
 *
 * The options mirror {@link import('./sync-plugin.js').syncPlugin}'s, so an
 * app that configured the plugin builds the identical pipeline for
 * {@link ynodeToPmnode} / {@link pmnodeToDelta} by passing the same values.
 *
 * @param {object} [opts]
 * @param {AttributionMapper} [opts.mapAttributionToMark]
 * @param {Array<((($d: import('lib0/schema').Schema<any>) => dt.Template<any, any>))>} [opts.transformers]
 *   custom stages, slotted between the compat flattening stage and
 *   `attributionToFormat` in data → view order
 * @return {YProsemirrorTransformer}
 */
export const defaultTransformer = ({ mapAttributionToMark = defaultMapAttributionToMark, transformers = [] } = {}) => ({ getState, schema }) => {
  const conf = attributionMapperToConf(mapAttributionToMark)
  // The attr-attribution lift (lib0's `y-attributed-attrs` format) is
  // schema-gated: without the mark declared there is nothing to materialize
  // it into, and an unmaterialized expected-format would break the
  // render⇄doc fixpoint. Removing the handler drops attr-op attribution.
  if (schema.marks['y-attributed-attrs'] == null) {
    delete conf.attrs
  }
  return $d => /** @type {any} */ (dt.pipe)(
    $d,
    // y-prosemirror-specific replacement for lib0's `fullAttributions` —
    // resolves full attributions from the Y render instead of a stateful
    // overlay (see transformers/rendered-attributions.js for why)
    (/** @type {import('lib0/schema').Schema<any>} */ $d2) => renderedAttributions($d2, getState),
    // compat: flatten old-representation nested anonymous text containers.
    // Must run AFTER renderedAttributions (which parallel-walks the
    // structured Y render) and BEFORE custom transformers, which see the
    // flattened space.
    (/** @type {import('lib0/schema').Schema<any>} */ $d2) => inlineAnonymousNodes($d2),
    ...transformers,
    (/** @type {import('lib0/schema').Schema<any>} */ $d2) => dt.attributionToFormat($d2, conf),
    // the one-way gate for the `y-attributed-*` projection. MUST be last: an
    // `applyB` change flows right-to-left, so any earlier position would let
    // `attributionToFormat`'s own strip erase the keys before this stage
    // could decide to swallow or correct them.
    (/** @type {import('lib0/schema').Schema<any>} */ $d2) => swallowFormats($d2)
  )
}

const emptyState = delta.create().done()

/**
 * Render a Y node as a ProseMirror node, the way the sync binding renders it
 * into a view: the Y render is mapped through the binding's transformer
 * pipeline, so documents in the old `y-prosemirror` representation are
 * flattened and, with a `renderer`, attribution becomes `y-attributed-*`
 * marks.
 *
 * The Y content must fit `schema`. As in the binding, a descendant whose
 * content the schema rejects is dropped and a mark the schema cannot hold
 * where it sits is dropped with a warning; a `ynode` that does not fit the
 * schema itself (e.g. an emptied `block+` element) throws.
 *
 * @param {import('@y/y').Node} ynode a root type renders as the schema's top
 *   node, an element as the node type of its name
 * @param {import('prosemirror-model').Schema} schema
 * @param {object} [opts]
 * @param {Renderer?} [opts.renderer] renders attributions (e.g. a
 *   `DiffRenderer` for suggestions). `null` renders plain content.
 * @param {YProsemirrorTransformer} [opts.transformer] defaults to
 *   {@link defaultTransformer}`()`; pass the equivalent of your
 *   `syncPlugin` options to match a customized binding
 * @param {AttributedNodesPredicate} [opts.attributedNodes] same as the
 *   `syncPlugin` option
 * @return {import('prosemirror-model').Node}
 */
export const ynodeToPmnode = (ynode, schema, { renderer = null, transformer = defaultTransformer(), attributedNodes = defaultAttributedNodes } = {}) => {
  const render = /** @type {delta.DeltaAny} */ (ynode.toDeltaDeep({ renderer }))
  const t = transformer({ getState: () => render, schema })($prosemirrorDelta).init()
  // Like lib0's binding at initial sync: project the whole state. A
  // transformer consumes its input, hence the deep clone. The self-heal for
  // the Y side (`.a`) is dropped - converting never writes. The pipeline
  // returns nothing when there is nothing to map (a node without attrs and
  // children); the render itself stands then, name included.
  /** @type {any} */
  const pdelta = t.applyA(delta.cloneDeep(render)).b ?? render
  return deltaToPNode(pdelta, schema, null, attributedNodes)
}

/**
 * Map a ProseMirror node to the delta the sync binding would write to Y for
 * it. Write it with `ynode.applyDelta(pmnodeToDelta(pmnode), origin,
 * { renderer })`.
 *
 * Only for documents rendered without a renderer. The transformer swallows
 * the attribution projection (`y-attributed-*` marks, `--attributed` node
 * variants) because only Yjs attributes, so the content of a
 * suggestion-rendered document would be written as plain content: pending
 * deletions as live text, suggested insertions as accepted.
 *
 * @param {import('prosemirror-model').Node} pmnode
 * @param {object} [opts]
 * @param {YProsemirrorTransformer} [opts.transformer] defaults to
 *   {@link defaultTransformer}`()`; pass the equivalent of your
 *   `syncPlugin` options to match a customized binding
 * @return {delta.DeltaAny}
 */
export const pmnodeToDelta = (pmnode, { transformer = defaultTransformer() } = {}) => {
  // view → data never reads the Y state (`renderedAttributions` passes
  // `applyB` through)
  const t = transformer({ getState: () => emptyState, schema: pmnode.type.schema })($prosemirrorDelta).init()
  // `nodeToDeltaCached` is a shared memoized snapshot and a transformer
  // consumes its input, so it gets a private deep clone. That also keeps the
  // memo safe from the Y side, which mutates the format containers of an
  // applied delta in place. The pipeline returns nothing when there is
  // nothing to map (a node without attrs and children); a fresh copy of the
  // snapshot stands then, name included.
  const snapshot = /** @type {any} */ (nodeToDeltaCached(pmnode))
  /** @type {any} */
  const mapped = t.applyB(delta.cloneDeep(snapshot)).a
  return /** @type {any} */ (mapped ?? delta.cloneDeep(snapshot))
}
