import * as t from 'lib0/testing'
import * as Y from '@y/y'
import * as delta from 'lib0/delta'
import { Schema } from 'prosemirror-model'
import { YSyncRdt } from '../src/rdt/y-sync.js'
import { createPMView, setupTwoWaySync, normalizeDoc, stableStringify } from './cohort.js'
import { schema as complexSchema } from './complexSchema.js'

/**
 * Unit tests for the two-mode `YSyncRdt` (see its module doc): steady state
 * consumes the native `'delta'` payloads and the maintained `ytype.delta`
 * cache (no full re-renders); writes issued mid-transaction/mid-cleanup enter
 * the uncertain window (full-render override, self-healing diffs) and settle
 * once the doc's cleanup queue drains.
 */

const PLUGIN_ORIGIN = { name: 'sync-plugin-origin' }

/**
 * A suggestion-mode setup: base doc with one committed paragraph, a
 * suggestion doc, a DiffRenderer, and a YSyncRdt over the suggestion doc's
 * fragment.
 *
 * @param {boolean} suggestionMode
 */
const setup = (suggestionMode) => {
  const doc = new Y.Doc({ gc: false })
  const suggestionDoc = new Y.Doc({ isSuggestionDoc: true, gc: false })
  const renderer = Y.createDiffRenderer(doc, suggestionDoc, { attrs: new Y.Attributions() })
  renderer.suggestionMode = suggestionMode
  doc.get('prosemirror').applyDelta(delta.create().insert([delta.create('paragraph', {}, 'base para')]).done())
  const ytype = suggestionDoc.get('prosemirror')
  const rdt = new YSyncRdt({ ytype, renderer, origin: PLUGIN_ORIGIN })
  return { doc, suggestionDoc, renderer, ytype, rdt }
}

const paragraph = (/** @type {string} */ text) => {
  const p = delta.create('paragraph')
  p.insert(text)
  return p.done()
}

/**
 * Steady state: a local write's fix carries the renderer-added attribution
 * (computed from the maintained cache, no full render), and the state getter
 * serves the live cache.
 *
 * @param {t.TestCase} _tc
 */
export const testYSyncRdtSteadyStateFixCarriesAttribution = _tc => {
  const { ytype, rdt } = setup(true)
  const fix = rdt.applyDelta(delta.create().retain(1).insert([paragraph('sugg')]).done(), null)
  t.assert(fix != null, 'suggestion-mode insert returns an attribution fix')
  t.assert(JSON.stringify(/** @type {any} */ (fix).toJSON()).includes('"attribution"'), 'the fix carries the renderer attribution')
  t.assert(rdt._stateOverride === null, 'top-level write stays in steady state')
  t.assert(rdt.delta === ytype.delta, 'state getter serves the live maintained cache')
  t.assert(ytype.delta.equals(ytype.toDelta({ deep: true })), 'cache equals a fresh render')
}

/**
 * Steady state: foreign changes are forwarded as the native payloads —
 * the exact event object, positioned against the cache.
 *
 * @param {t.TestCase} _tc
 */
export const testYSyncRdtSteadyStateForwardsNativePayloads = _tc => {
  const { ytype, rdt } = setup(true)
  /** @type {Array<{ d: any, origin: any }>} */
  const emitted = []
  rdt.on('delta', (d, origin) => emitted.push({ d, origin }))
  /** @type {Array<any>} */
  const native = []
  ytype.on('delta', (d) => native.push(d))
  // a foreign write directly on the ytype (e.g. a provider applying a remote update)
  ytype.applyDelta(delta.create().retain(1).insert([paragraph('remote')]).done(), 'remote-peer')
  t.assert(emitted.length === 1 && native.length === 1, 'one forwarded emission per native event')
  t.assert(emitted[0].d === native[0], 'the native payload is forwarded verbatim')
  t.assert(emitted[0].origin === 'remote-peer', 'the transaction origin is forwarded')
}

/**
 * A write issued during a foreign transaction's cleanup (the binding's
 * fix-ping-pong path) defers its events — the wrapper must enter the
 * uncertain window, serve a correct post-write state, and settle after the
 * drain. Covers the zero-own-emission case (a fully reverted tombstone fix)
 * that broke counter-based lifecycles.
 *
 * @param {t.TestCase} _tc
 */
export const testYSyncRdtNestedWriteEntersUncertainWindow = _tc => {
  const { suggestionDoc, ytype, rdt } = setup(true)
  // suggestion-delete the base paragraph so a tombstone (deleted-but-rendered
  // node) exists — a modify into it is fully reverted and emits nothing
  rdt.applyDelta(delta.create().modify(delta.create().delete('base para'.length), undefined).done(), null)
  /** @type {any} */
  let nestedFix = 'unset'
  let sawUncertain = false
  /** @type {boolean?} */
  let settled = null
  const onDelta = () => {
    if (nestedFix !== 'unset') return // only act on the first (trigger) event
    // we are inside the trigger transaction's cleanup: a write now defers its events
    nestedFix = rdt.applyDelta(delta.create().modify(delta.create().retain(2).insert('X'), undefined).done(), null)
    sawUncertain = rdt._stateOverride !== null
    // the state getter must already serve the post-write truth (fresh render)
    settled = rdt.delta === rdt._stateOverride
  }
  ytype.on('delta', onDelta)
  // the foreign trigger: another paragraph inserted by a "remote peer"
  suggestionDoc.transact(() => {
    ytype.applyDelta(delta.create().retain(1).insert([paragraph('trigger')]).done(), 'remote-peer')
  }, 'remote-peer')
  ytype.off('delta', onDelta)
  t.assert(sawUncertain, 'the nested write entered the uncertain window')
  t.assert(settled === true, 'the state getter served the override inside the window')
  // after the outer transaction fully drained, the wrapper settles back to the cache
  t.assert(rdt._stateOverride !== null, 'override persists until the next entry point')
  const state = rdt.delta // drain check runs here
  t.assert(rdt._stateOverride === null, 'settled back to steady state after the drain')
  t.assert(state.equals(ytype.toDelta({ deep: true })), 'state equals a fresh render after settling')
  t.assert(ytype.delta.equals(ytype.toDelta({ deep: true })), 'cache caught up (no drift)')
}

/**
 * The merged-transaction case: app code wraps the write in its own
 * `doc.transact(fn, appOrigin)`. The single merged emission carries the app
 * origin and contains our write — the uncertain-window diff must net it out
 * instead of double-emitting, and the wrapper must still emit genuinely
 * foreign content from the same merged transaction.
 *
 * @param {t.TestCase} _tc
 */
export const testYSyncRdtMergedTransactionNoDoubleApply = _tc => {
  const { suggestionDoc, ytype, rdt } = setup(true)
  /** @type {Array<any>} */
  const emitted = []
  rdt.on('delta', (d) => emitted.push(delta.cloneDeep(d)))
  /** @type {any} */
  let fix = null
  suggestionDoc.transact(() => {
    fix = rdt.applyDelta(delta.create().retain(1).insert([paragraph('ours')]).done(), null)
  }, 'app-origin')
  // the merged emission (origin 'app-origin', containing our write) must not
  // have been forwarded verbatim: our own content would double-apply. The
  // uncertain-window diff nets it to the attribution part already covered by
  // the returned fix... which itself could not include the renderer
  // attribution (it materializes only at the deferred cleanup), so the
  // wrapper may emit the residual attribution as a follow-up — but never the
  // content itself.
  for (const d of emitted) {
    t.assert(!JSON.stringify(d.toJSON()).includes('"ours"'), 'our own content is never re-emitted')
  }
  t.assert(fix != null || emitted.length > 0 || JSON.stringify(rdt.delta.toJSON()).includes('"attribution"') === false, 'sanity: write landed')
  // consistency after the window settles
  const state = rdt.delta
  t.assert(rdt._stateOverride === null, 'settled after the drain')
  t.assert(state.equals(ytype.toDelta({ deep: true })), 'state equals a fresh render')
  t.assert(JSON.stringify(state.toJSON()).includes('"ours"'), 'the write itself landed in the ytype')
}

/**
 * The complex schema with the doc constrained to exactly one blockquote, so a
 * fresh editor can never be empty — PM auto-fills `doc > blockquote >
 * paragraph`, which the initial bind writes back into an empty ytype as a
 * schema-normalization fix.
 */
const requiredBlockquoteSchema = new Schema({
  nodes: complexSchema.spec.nodes.update('doc', {
    .../** @type {any} */ (complexSchema.spec.nodes.get('doc')),
    content: 'blockquote'
  }),
  marks: complexSchema.spec.marks
})

/**
 * Initialization race: two clients each bind a fresh editor to their own
 * (empty) Y.Doc before ever syncing. Each binding independently pushes the
 * schema-mandated default content (one blockquote) into its ydoc; merging the
 * two docs must not duplicate it. Desired behavior: after sync, exactly one
 * blockquote survives and both editors converge on a schema-valid doc.
 *
 * @param {t.TestCase} _tc
 */
export const testInitRaceWithRequiredDocContent = _tc => {
  const ydoc1 = new Y.Doc({ gc: false })
  ydoc1.clientID = 1
  const ydoc2 = new Y.Doc({ gc: false })
  ydoc2.clientID = 2
  // bind both editors while the docs are still offline from each other
  const view1 = createPMView(ydoc1.get('prosemirror'), Y.baseRenderer, { schema: requiredBlockquoteSchema })
  const view2 = createPMView(ydoc2.get('prosemirror'), Y.baseRenderer, { schema: requiredBlockquoteSchema })
  try {
    // sanity: each binding wrote its schema-default content into its own ydoc
    t.assert(ydoc1.get('prosemirror').length === 1, 'client 1 initialized its ytype with one blockquote')
    t.assert(ydoc2.get('prosemirror').length === 1, 'client 2 initialized its ytype with one blockquote')
    // the clients connect and merge their histories
    setupTwoWaySync(ydoc1, ydoc2)
    // desired behavior: the schema-mandated default content is not duplicated
    t.assert(
      ydoc1.get('prosemirror').length === 1,
      `merged ytype has exactly one top-level blockquote (got ${ydoc1.get('prosemirror').length})`
    )
    view1.state.doc.check()
    view2.state.doc.check()
    t.compare(
      stableStringify(normalizeDoc(view1.state.doc.toJSON())),
      stableStringify(normalizeDoc(view2.state.doc.toJSON())),
      'both editors converge on the same doc'
    )
  } finally {
    view1.destroy()
    view2.destroy()
  }
}
