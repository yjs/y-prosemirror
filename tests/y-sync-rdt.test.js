import * as t from 'lib0/testing'
import * as Y from '@y/y'
import * as delta from 'lib0/delta'
import { Schema } from 'prosemirror-model'
import { YSyncRdt } from '../src/rdt/y-sync.js'
import { createPMView, freshFingerprint, setupTwoWaySync, normalizeDoc, stableStringify } from './cohort.js'
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
  const renderer = Y.createDiffRenderer(doc, suggestionDoc, { attributions: Y.createContentMap() })
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
  rdt.applyDelta(delta.create().modify(/** @type {any} */ (delta.create().delete('base para'.length)), undefined).done(), null)
  /** @type {any} */
  let nestedFix = 'unset'
  let sawUncertain = false
  /** @type {boolean?} */
  let settled = null
  const onDelta = () => {
    if (nestedFix !== 'unset') return // only act on the first (trigger) event
    // we are inside the trigger transaction's cleanup: a write now defers its events
    nestedFix = rdt.applyDelta(delta.create().modify(/** @type {any} */ (delta.create().retain(2).insert('X')), undefined).done(), null)
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
  // the drain listener (`afterAllTransactions`) settles the wrapper back to
  // the cache as soon as the outer transaction fully drained
  t.assert(rdt._stateOverride === null, 'settled back to steady state at the drain')
  const state = rdt.delta
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
 * paragraph`. The initial-content gate (see {@link ProsemirrorRdt}) must keep
 * that schema-default skeleton out of an empty ytype.
 */
const requiredBlockquoteSchema = new Schema({
  nodes: complexSchema.spec.nodes.update('doc', {
    ...(complexSchema.spec.nodes.get('doc')),
    content: 'blockquote'
  }),
  marks: complexSchema.spec.marks
})

/**
 * Initialization race: two clients each bind a fresh editor to their own
 * (empty) Y.Doc before ever syncing. Neither binding may push the
 * schema-mandated default content (one blockquote) into its ydoc — otherwise
 * merging duplicates it into a schema-invalid doc. The gated skeleton stays
 * local until a real edit on one client seeds Y exactly once; the other
 * client's first render replaces its own skeleton with the synced content.
 *
 * @param {t.TestCase} _tc
 */
export const testInitRaceWithRequiredDocContent = _tc => {
  const ydoc1 = new Y.Doc({ gc: false })
  ydoc1.clientID = 1
  const ydoc2 = new Y.Doc({ gc: false })
  ydoc2.clientID = 2
  // bind both editors while the docs are still offline from each other
  const view1 = createPMView(ydoc1.get('prosemirror'), null, { schema: requiredBlockquoteSchema })
  const view2 = createPMView(ydoc2.get('prosemirror'), null, { schema: requiredBlockquoteSchema })
  try {
    // the schema-default content is gated — nothing is written at bind time
    // (this also pins that the binding's initial sync diffs empty vs empty)
    t.assert(ydoc1.get('prosemirror').length === 0, 'client 1 wrote nothing at bind time')
    t.assert(ydoc2.get('prosemirror').length === 0, 'client 2 wrote nothing at bind time')
    // the clients connect and merge their (empty) histories
    setupTwoWaySync(ydoc1, ydoc2)
    t.assert(ydoc1.get('prosemirror').length === 0, 'two empty docs merge to an empty doc')
    view1.state.doc.check()
    view2.state.doc.check()
    t.compare(
      stableStringify(normalizeDoc(view1.state.doc.toJSON())),
      stableStringify(normalizeDoc(view2.state.doc.toJSON())),
      'both editors show the schema-default doc'
    )
    // a real edit on client 1 opens the gate: its full content seeds ydoc1
    // exactly once and syncs over; client 2's first render replaces its own
    // gated skeleton instead of merging next to it
    view1.dispatch(view1.state.tr.insertText('hello', 2)) // pos 2 = start of the default paragraph
    t.assert(
      ydoc1.get('prosemirror').length === 1,
      `client 1 seeded exactly one top-level blockquote (got ${ydoc1.get('prosemirror').length})`
    )
    t.assert(
      ydoc2.get('prosemirror').length === 1,
      `client 2 converged on exactly one top-level blockquote (got ${ydoc2.get('prosemirror').length})`
    )
    view1.state.doc.check()
    view2.state.doc.check()
    t.assert(JSON.stringify(view2.state.doc.toJSON()).includes('hello'), 'the edit reached client 2')
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

/**
 * The complex schema with `doc > paragraph+`: the default doc is one empty
 * paragraph, and — unlike `requiredBlockquoteSchema` — a remote paragraph can
 * *legally* land next to it, so this pins that the gated first render
 * replaces the skeleton wholesale instead of applying incremental steps
 * (which would keep the stale empty paragraph and leak it into Y as a fix).
 */
const requiredParagraphSchema = new Schema({
  nodes: complexSchema.spec.nodes.update('doc', {
    ...(complexSchema.spec.nodes.get('doc')),
    content: 'paragraph+'
  }),
  marks: complexSchema.spec.marks
})

/**
 * @param {t.TestCase} _tc
 */
export const testInitRaceFirstRenderReplacesGatedSkeleton = _tc => {
  const ydoc1 = new Y.Doc({ gc: false })
  ydoc1.clientID = 1
  const ydoc2 = new Y.Doc({ gc: false })
  ydoc2.clientID = 2
  const view1 = createPMView(ydoc1.get('prosemirror'), null, { schema: requiredParagraphSchema })
  const view2 = createPMView(ydoc2.get('prosemirror'), null, { schema: requiredParagraphSchema })
  try {
    t.assert(ydoc1.get('prosemirror').length === 0, 'client 1 wrote nothing at bind time')
    t.assert(ydoc2.get('prosemirror').length === 0, 'client 2 wrote nothing at bind time')
    setupTwoWaySync(ydoc1, ydoc2)
    view1.dispatch(view1.state.tr.insertText('hi', 1)) // pos 1 = start of the default paragraph
    t.assert(ydoc1.get('prosemirror').length === 1, 'client 1 seeded exactly one paragraph')
    t.assert(
      ydoc2.get('prosemirror').length === 1,
      `client 2 must not leak its skeleton paragraph next to the synced one (got ${ydoc2.get('prosemirror').length})`
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

/**
 * The nested child deltas behind a state delta's top-level insert ops, in
 * order. Lets a test pin object identity and memoized fingerprints of the
 * cache's children across a write.
 *
 * @param {any} d
 * @return {Array<any>}
 */
const childrenOf = d => {
  /** @type {Array<any>} */
  const out = []
  for (const op of d.children) {
    if (Array.isArray(op.insert)) out.push(...op.insert)
  }
  return out
}

/**
 * A local write shares structure with the maintained cache instead of deep
 * cloning it (yjs/y-prosemirror#248): the fix is diffed between a
 * structure-sharing `clone` of the cache with the change applied and the live
 * cache itself. We pin what that relies on: the cache's fingerprints are
 * warmed at bind, untouched children keep their object identity and their
 * memoized fingerprint across the write, the touched child is replaced by a
 * copy-on-write clone, the cache root stays a mutable builder, and the cache
 * never carries a stale memo (a from-scratch rehash must agree). The last local write merges into the text op the first one
 * created, the in-place merge that the old `cloneDeep` workaround guarded
 * against.
 *
 * @param {t.TestCase} _tc
 */
export const testYSyncRdtLocalWriteSharesCacheStructure = _tc => {
  const doc = new Y.Doc({ gc: false })
  const ytype = doc.get('prosemirror')
  ytype.applyDelta(delta.create().insert([paragraph('one'), paragraph('two'), paragraph('three')]).done())
  const rdt = new YSyncRdt({ ytype, renderer: null, origin: PLUGIN_ORIGIN })
  try {
    const cache = /** @type {any} */ (ytype.delta)
    const before = childrenOf(cache)
    t.assert(before.length === 3, 'three top-level children')
    t.assert(cache._fingerprint != null, 'the cache fingerprint is warmed at bind')
    t.assert(before.every(c => c._fingerprint != null), 'every child fingerprint is warmed at bind')
    const memo = before.map(c => c._fingerprint)
    /**
     * @param {string} label
     */
    const checkCache = label => {
      t.assert(rdt._stateOverride === null, `${label}: steady state`)
      t.assert(ytype.delta === cache, `${label}: the cache is still the same object`)
      t.assert(!cache.isDone, `${label}: the cache root stays a mutable builder`)
      t.assert(freshFingerprint(cache) === cache.fingerprint, `${label}: no stale memoized fingerprint in the cache`)
      t.assert(cache.equals(ytype.toDelta({ deep: true })), `${label}: the cache equals a fresh render`)
    }
    // a local write into the middle paragraph: "two" becomes "tXwo"
    const fix = rdt.applyDelta(delta.create().retain(1).modify(/** @type {any} */ (delta.create().retain(1).insert('X'))).done(), null)
    t.assert(fix === null, 'no renderer, no fix')
    const after = childrenOf(cache)
    t.assert(after[0] === before[0] && after[2] === before[2], 'untouched children keep their identity')
    t.assert(after[0]._fingerprint === memo[0] && after[2]._fingerprint === memo[2], 'untouched children keep their memoized fingerprint')
    t.assert(after[1] !== before[1], 'the touched child was replaced by a copy-on-write clone')
    t.assert(JSON.stringify(after[1].toJSON()).includes('tXwo'), 'the touched child carries the write')
    checkCache('after the first local write')
    // a foreign write lands through the native channel and patches the cache in place
    ytype.applyDelta(delta.create().modify(/** @type {any} */ (delta.create().insert('R'))).done(), 'remote-peer')
    t.assert(JSON.stringify(childrenOf(cache)[0].toJSON()).includes('Rone'), 'the foreign write landed')
    checkCache('after a foreign write')
    // a second local write right behind the first one merges into the text op it created
    const fix2 = rdt.applyDelta(delta.create().retain(1).modify(/** @type {any} */ (delta.create().retain(2).insert('Y'))).done(), null)
    t.assert(fix2 === null, 'no fix for the merging write')
    t.assert(JSON.stringify(childrenOf(cache)[1].toJSON()).includes('tXYwo'), 'the merging write landed')
    checkCache('after the merging local write')
  } finally {
    rdt.destroy()
  }
}

/**
 * A nested document: `n` paragraphs grouped 10 per blockquote and 10
 * blockquotes per outer blockquote, so every level has bounded fan-out and
 * the document size only shows up in the number of outer blockquotes.
 *
 * @param {number} n
 * @return {Y.Node}
 */
const nestedYtype = n => {
  const doc = new Y.Doc({ gc: false })
  const paragraphs = Array.from({ length: n }, (_, i) => paragraph(`paragraph ${i} lorem ipsum dolor sit amet`))
  /**
   * @param {Array<any>} items
   * @return {Array<any>}
   */
  const group = items => {
    /** @type {Array<any>} */
    const out = []
    for (let i = 0; i < items.length; i += 10) {
      const bq = delta.create('blockquote')
      bq.insert(items.slice(i, i + 10))
      out.push(bq.done())
    }
    return out
  }
  const ytype = doc.get('prosemirror')
  ytype.applyDelta(delta.create().insert(group(group(paragraphs))).done())
  return ytype
}

/**
 * The median wall time of a keystroke write through `rdt` into paragraph `k`
 * of a {@link nestedYtype} document: three warm-up writes, then `samples`
 * timed ones.
 *
 * @param {YSyncRdt} rdt
 * @param {number} k
 * @param {number} [samples]
 * @return {number} milliseconds
 */
const medianKeystrokeMs = (rdt, k, samples = 15) => {
  /** @type {Array<number>} */
  const times = []
  const outer = Math.floor(k / 100)
  const inner = Math.floor(k / 10) % 10
  const para = k % 10
  for (let i = 0; i < samples + 3; i++) {
    const d = delta.create().retain(outer).modify(
      /** @type {any} */ (delta.create().retain(inner).modify(
        /** @type {any} */ (delta.create().retain(para).modify(/** @type {any} */ (delta.create().retain(3).insert('x'))))
      ))
    ).done()
    const start = performance.now()
    const fix = rdt.applyDelta(d, null)
    const ms = performance.now() - start
    t.assert(fix === null, 'no renderer, no fix')
    if (i >= 3) times.push(ms)
  }
  times.sort((a, b) => a - b)
  return times[times.length >> 1]
}

/**
 * The cost of a local write must follow the size of the change, not the size
 * of the document (yjs/y-prosemirror#248). Sixteen times more paragraphs must
 * not cost more than a few times more per keystroke: two deep clones plus a
 * cold diff scale linearly (about 16x here), structure sharing stays flat.
 *
 * @param {t.TestCase} _tc
 */
export const testYSyncRdtLocalWriteScalesWithChange = _tc => {
  const small = nestedYtype(200)
  const large = nestedYtype(3200)
  const rdtSmall = new YSyncRdt({ ytype: small, renderer: null, origin: PLUGIN_ORIGIN })
  const rdtLarge = new YSyncRdt({ ytype: large, renderer: null, origin: PLUGIN_ORIGIN })
  try {
    const msSmall = medianKeystrokeMs(rdtSmall, 100)
    const msLarge = medianKeystrokeMs(rdtLarge, 1600)
    t.info(`keystroke median: 200 paragraphs ${msSmall.toFixed(2)}ms, 3200 paragraphs ${msLarge.toFixed(2)}ms (ratio ${(msLarge / msSmall).toFixed(1)})`)
    t.assert(msLarge < 5 * msSmall + 0.5, `a 16x larger document must not cost more than 5x per keystroke (${msSmall.toFixed(2)}ms vs ${msLarge.toFixed(2)}ms)`)
    t.assert(msLarge < 30, `a keystroke on 3200 paragraphs stays cheap (${msLarge.toFixed(2)}ms)`)
    const cache = /** @type {any} */ (large.delta)
    t.assert(freshFingerprint(cache) === cache.fingerprint, 'no stale memoized fingerprint in the cache')
    t.assert(cache.equals(large.toDelta({ deep: true })), 'the cache equals a fresh render')
  } finally {
    rdtSmall.destroy()
    rdtLarge.destroy()
  }
}

/**
 * The stale-memo oracle must rehash from scratch. Since lib0 1.0.0-rc.31 a
 * `clone`/`cloneDeep` carries the memoized fingerprint of every
 * content-identical op and nested delta over, so `cloneDeep(d).fingerprint`
 * re-hashes only the root from the memos below it and no longer detects a
 * stale nested memo. `freshFingerprint` resets every memo on a private deep
 * clone first: a corrupted nested memo must show up there, and the original
 * tree must be left untouched.
 *
 * @param {t.TestCase} _tc
 */
export const testYSyncRdtFreshFingerprintDetectsStaleMemo = _tc => {
  const d = delta.create().insert([paragraph('one'), paragraph('two')]).done()
  const memo = d.fingerprint
  t.assert(freshFingerprint(d) === memo, 'a warmed, consistent tree rehashes to its memo')
  const first = /** @type {any} */ ([...d.children][0])
  const nested = first.insert[1]
  nested._fingerprint = 'stale'
  first._fingerprint = null
  d._fingerprint = null
  t.assert(d.fingerprint !== memo, 'the corrupted nested memo poisons the root memo')
  t.assert(freshFingerprint(d) === memo, 'a from-scratch rehash ignores the stale memo')
  t.assert(freshFingerprint(d) !== d.fingerprint, 'the oracle flags the stale memo')
  t.assert(nested._fingerprint === 'stale', 'the original tree is left untouched')
  t.info(`cloneDeep alone ${delta.cloneDeep(d).fingerprint === d.fingerprint ? 'would NOT' : 'would'} have caught it on this lib0`)
}
