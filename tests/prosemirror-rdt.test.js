/**
 * ProsemirrorRdt invariant + fuzz suite.
 *
 * Pins the view-side RDT (src/rdt/prosemirror.js) against a set of
 * implementation-agnostic oracles, so the incremental-pull optimization
 * (memoized canonical snapshots + reference-walk change detection) can land
 * without changing observable behavior. The oracles are deliberately valid
 * for BOTH the full-snapshot implementation and the incremental one:
 *
 *   A. `rdt._state` deep-equals a from-scratch canonical snapshot of the
 *      document, built over a fresh node tree (`schema.nodeFromJSON`) so a
 *      node-keyed memo cannot serve cached entries. Fingerprints must match,
 *      and a `cloneDeep` (which recomputes all fingerprints) must agree with
 *      the memoized fingerprint - a mismatch means a stale memo.
 *   B. The change emitted by `pull()` replays the previous `_state` onto the
 *      new `_state` (outcome equality via an empty diff; op granularity and
 *      modify-pairing may legitimately differ between implementations).
 *   C. A second `pull()` immediately after emits nothing.
 *   D. Two bound views converge (normalized docs equal) and no
 *      `y-attributed-*` format key ever leaks into a ytype.
 *   E. `view.state.doc.check()` passes and no "Readonly Delta can't be
 *      modified" error surfaces anywhere (strict traced-op dispatch).
 *   F. Old `_state` snapshot objects stay deep-intact as later operations run
 *      (a persistence ring catches silent aliasing corruption).
 *
 * Two tiers: tier 1 drives a bare, unbound view + a directly-constructed
 * `ProsemirrorRdt` (manual `pull()`, surgical emission capture); tier 2
 * drives fully-bound views (sync plugin, renderers, cohorts) and checks pull
 * emissions at the emit call itself via `probeBinding`.
 */

import * as YPM from '@y/prosemirror'
import * as Y from '@y/y'
import * as delta from 'lib0/delta'
import * as env from 'lib0/environment'
import * as prng from 'lib0/prng'
import * as t from 'lib0/testing'
import { Fragment, Schema } from 'prosemirror-model'
import { EditorState, Plugin } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { ProsemirrorRdt } from '../src/rdt/prosemirror.js'
import { pmDocDiff } from '../src/sync-utils.js'
import {
  applyTracedOp,
  assertCohortConsistency,
  Cohort,
  createPMView,
  normalizeDoc,
  setupTwoWaySync,
  stableStringify
} from './cohort.js'
import { marks as complexMarks, nodes as complexNodes, schema as complexSchema } from './complexSchema.js'

/** @typedef {import('lib0/testing').TestCase} TestCase */

const PM_KEY = 'prosemirror'

// === Node / doc builders (complexSchema) ===

const nodes = complexSchema.nodes

/**
 * @param {string} text
 * @param {Array<import('prosemirror-model').Mark>} [marks]
 */
const txt = (text, marks) => complexSchema.text(text, marks)

/**
 * @param {...(import('prosemirror-model').Node | string)} content
 */
const p = (...content) => nodes.paragraph.create(null, content.map(c => typeof c === 'string' ? txt(c) : c))

/**
 * @param {...import('prosemirror-model').Node} children
 */
const mkDoc = (...children) => nodes.doc.create(null, children)

// === Oracles ===

/**
 * A from-scratch canonical snapshot of the view's document, computed over a
 * FRESH node tree so that a node-keyed memo inside `nodeToDelta` cannot
 * short-circuit: `nodeFromJSON` allocates new node objects for the whole
 * tree, so every memo lookup misses and the snapshot is honestly rebuilt
 * through the same code path.
 *
 * @param {EditorView} view
 * @return {ProsemirrorDelta}
 */
const referenceState = view =>
  YPM.nodeToDelta(view.state.schema.nodeFromJSON(view.state.doc.toJSON()), undefined, true)

/**
 * Normalize a delta's JSON for outcome comparison: merge adjacent text runs
 * whose formats are (order-insensitively) equal. `apply` may split text runs
 * differently than a fresh snapshot and may merge format objects in a
 * different key order - both are canonically insignificant, while every
 * structural difference still surfaces.
 *
 * @param {any} node
 * @return {any}
 */
const normalizeDeltaJson = node => {
  if (node == null || typeof node !== 'object') return node
  const out = { ...node }
  if (Array.isArray(node.children)) {
    /** @type {Array<any>} */
    const merged = []
    for (const rawOp of node.children) {
      const op = { ...rawOp }
      if (Array.isArray(op.insert)) op.insert = op.insert.map(normalizeDeltaJson)
      if (op.value != null) op.value = normalizeDeltaJson(op.value)
      const last = merged[merged.length - 1]
      if (
        last != null && last.type === 'insert' && op.type === 'insert' &&
        typeof last.insert === 'string' && typeof op.insert === 'string' &&
        stableStringify(last.format ?? null) === stableStringify(op.format ?? null)
      ) {
        merged[merged.length - 1] = { ...last, insert: last.insert + op.insert }
      } else {
        merged.push(op)
      }
    }
    out.children = merged
  }
  return out
}

/**
 * Canonical string form of a delta state, for invariant-B outcome equality.
 *
 * @param {any} d
 * @return {string}
 */
const canonicalDeltaJSON = d => stableStringify(normalizeDeltaJson(d.toJSON()))

/**
 * Invariant A + E: `_state` equals the reference snapshot (deep equality and
 * fingerprint), no stale fingerprint memo anywhere in the tree, and the PM
 * document validates. Skipped while the initial-content gate or a desync is
 * active - in those windows `_state` intentionally diverges from the doc.
 *
 * @param {ProsemirrorRdt} rdt
 * @param {EditorView} view
 * @param {string} label
 */
const checkStateOracle = (rdt, view, label) => {
  t.assert(rdt._pullStats.walkError === 0, `${label}: no pull ever errored out of the incremental walk`)
  if (rdt._defaultFingerprint != null || rdt._desynced) return
  const ref = referenceState(view)
  t.compare(/** @type {any} */ (rdt._state), /** @type {any} */ (ref), `${label}: _state equals a from-scratch canonical snapshot`)
  t.assert(rdt._state.fingerprint === ref.fingerprint, `${label}: _state fingerprint equals the reference fingerprint`)
  t.assert(
    delta.cloneDeep(/** @type {any} */ (rdt._state)).fingerprint === rdt._state.fingerprint,
    `${label}: no stale memoized fingerprint in _state`
  )
  view.state.doc.check()
}

/**
 * The walk-liveness gate: the incremental path must actually have run - a
 * regression that silently degrades every pull to the diff fallback (the
 * walk's own try/catch makes that invisible to the outcome oracles) fails
 * here instead of passing green.
 *
 * @param {ProsemirrorRdt} rdt
 * @param {string} label
 */
const checkWalkTaken = (rdt, label) => {
  t.assert(rdt._pullStats.walk > 0, `${label}: at least one pull took the incremental walk (walk=${rdt._pullStats.walk}, fallback=${rdt._pullStats.fallback})`)
  t.assert(rdt._pullStats.walkError === 0, `${label}: zero walk errors`)
}

/**
 * Pull once on a tier-1 (unbound) RDT, capturing the emission and the
 * pre-pull state as private deep clones.
 *
 * @param {ProsemirrorRdt} rdt
 * @return {{ prev: any, changes: Array<any> }}
 */
const recordedPull = rdt => {
  const prev = delta.cloneDeep(/** @type {any} */ (rdt._state))
  /** @type {Array<any>} */
  const changes = []
  /**
   * @param {ProsemirrorDelta} d
   * @param {any} origin
   */
  const h = (d, origin) => {
    if (origin === rdt) changes.push(delta.cloneDeep(/** @type {any} */ (d)))
  }
  rdt.on('delta', h)
  rdt.pull()
  rdt.off('delta', h)
  return { prev, changes }
}

/**
 * Invariants B + C for a tier-1 pull: replay the emitted change onto the
 * previous state and require an empty diff against the new state (outcome
 * equality - boundary-insensitive, unlike a structural compare), then pull
 * again and require silence.
 *
 * @param {ProsemirrorRdt} rdt
 * @param {string} label
 * @return {any} the emitted change (deep clone), or null when the pull was empty
 */
const checkPull = (rdt, label) => {
  const { prev, changes } = recordedPull(rdt)
  t.assert(changes.length <= 1, `${label}: pull emits at most one change`)
  if (changes.length === 1) {
    const replay = /** @type {any} */ (delta.clone(/** @type {any} */ (prev)))
    replay.apply(delta.cloneDeep(changes[0]), { final: true })
    const ok = canonicalDeltaJSON(replay.done(false)) === canonicalDeltaJSON(rdt._state)
    if (!ok) {
      console.log('PREV  ', JSON.stringify(prev.toJSON()))
      console.log('CHANGE', JSON.stringify(changes[0].toJSON()))
      console.log('REPLAY', JSON.stringify(replay.toJSON()))
      console.log('NEXT  ', JSON.stringify(/** @type {any} */ (rdt._state).toJSON()))
    }
    t.assert(ok, `${label}: emitted change replays the previous state onto the next state`)
  }
  const again = recordedPull(rdt)
  t.assert(again.changes.length === 0, `${label}: second pull emits nothing`)
  return changes.length === 1 ? changes[0] : null
}

/**
 * Invariant F: a ring of `{ live object, private deep clone }` pairs of past
 * `_state`s. Aliasing bugs mutate an old snapshot through a shared subtree -
 * re-checking every ring entry after each op surfaces that immediately.
 *
 * @param {number} size
 */
const mkRing = size => {
  /** @type {Array<{ ref: any, snap: any }>} */
  const entries = []
  return {
    /**
     * @param {ProsemirrorRdt} rdt
     */
    push: rdt => {
      entries.push({ ref: rdt._state, snap: delta.cloneDeep(/** @type {any} */ (rdt._state)) })
      if (entries.length > size) entries.shift()
    },
    /**
     * @param {string} label
     */
    check: label => {
      entries.forEach((e, i) => {
        t.assert(e.ref.equals(e.snap), `${label}: historic _state snapshot ${i} is unmutated`)
      })
    }
  }
}

/**
 * Tier-2 pull probe: wraps `rdt.emit` so a pull emission is checked at the
 * exact moment it fires - `_state` is already the post-pull state and no
 * binding listener has run yet. `probe.last` resyncs on every emission and
 * must additionally be resynced by the driver after each op (non-emitting
 * `applyDelta` branches move `_state` without an emission).
 *
 * @param {ProsemirrorRdt} rdt
 */
const probeBinding = rdt => {
  const origEmit = rdt.emit.bind(rdt)
  const probe = {
    last: delta.cloneDeep(/** @type {any} */ (rdt._state)),
    pulls: 0,
    /** @type {Array<string>} */
    failures: [],
    resync: () => { probe.last = delta.cloneDeep(/** @type {any} */ (rdt._state)) }
  }
  const anyRdt = /** @type {any} */ (rdt)
  anyRdt.emit = (/** @type {any} */ name, /** @type {any} */ args) => {
    if (name === 'delta') {
      const [change, origin] = args
      if (origin === rdt) {
        probe.pulls++
        try {
          const replay = /** @type {any} */ (delta.clone(probe.last))
          replay.apply(delta.cloneDeep(change), { final: true })
          if (canonicalDeltaJSON(replay.done(false)) !== canonicalDeltaJSON(rdt._state)) {
            probe.failures.push(`pull ${probe.pulls}: change does not replay prev onto next`)
          }
        } catch (err) {
          probe.failures.push(`pull ${probe.pulls}: replay threw ${/** @type {Error} */ (err).message}`)
        }
      }
      probe.last = delta.cloneDeep(/** @type {any} */ (rdt._state))
    }
    return origEmit(name, args)
  }
  return probe
}

/**
 * @param {ReturnType<typeof probeBinding>} probe
 * @param {string} label
 */
const checkProbe = (probe, label) => {
  t.compare(probe.failures, [], `${label}: pull probe recorded no failures`)
}

/**
 * Invariant D (second half): no `y-attributed-*` format key anywhere in a
 * ytype's stored content - the reverse transformer must have stripped the
 * view-space attribution projection on every write.
 *
 * @param {any} d a lib0 delta node (`ytype.toDeltaDeep()`)
 * @param {string} label
 */
const assertNoAttributionLeak = (d, label) => {
  for (const op of d.children) {
    const format = /** @type {any} */ (op).format
    for (const k in (format ?? {})) {
      t.assert(!k.startsWith('y-attributed-'), `${label}: format key ${k} leaked into Y`)
    }
    if (delta.$insertOp.check(op)) {
      op.insert.forEach((/** @type {any} */ c) => {
        if (delta.$deltaAny.check(c)) assertNoAttributionLeak(c, label)
      })
    } else if (delta.$modifyOp.check(op)) {
      assertNoAttributionLeak(op.value, label)
    }
  }
}

// === Harness ===

/**
 * Tier-1 rig: a bare, unbound EditorView plus a directly-constructed
 * `ProsemirrorRdt`. Nothing subscribes and nothing pulls automatically - the
 * test dispatches, then drives `pull()` by hand through `recordedPull`.
 *
 * @param {import('prosemirror-model').Node} doc
 * @param {Array<Plugin>} [plugins]
 */
const mkSolo = (doc, plugins = []) => {
  const view = new EditorView(
    { mount: document.createElement('div') },
    { state: EditorState.create({ doc, plugins }) }
  )
  const rdt = new ProsemirrorRdt({ view, getMeta: () => null })
  return { view, rdt }
}

/**
 * Adapter so the shared `applyTracedOp` dispatcher (tests/cohort.js) drives a
 * bare view: the only cohort surface the dispatcher touches is
 * `cohort.user(i).view`.
 *
 * @param {EditorView} view
 * @return {Cohort}
 */
const soloCohort = view => /** @type {any} */ ({ user: () => ({ view }) })

/**
 * The live view-side RDT of a bound view (tier 2).
 *
 * @param {EditorView} view
 * @return {ProsemirrorRdt}
 */
const getPmRdt = view => /** @type {ProsemirrorRdt} */ (/** @type {any} */ (YPM.ySyncPluginKey.getState(view.state)).binding.b)

// === Random arg pickers ===

/**
 * @param {prng.PRNG} gen
 * @param {number} [maxLen]
 */
const randomWord = (gen, maxLen = 5) => {
  let s = ''
  const n = prng.int32(gen, 1, maxLen)
  for (let i = 0; i < n; i++) s += prng.letter(gen)
  return s
}

/**
 * @param {import('prosemirror-model').Node} doc
 * @param {prng.PRNG} gen
 */
const randomPos = (doc, gen) => {
  const size = doc.content.size
  if (size <= 1) return null
  return prng.int32(gen, 1, size - 1)
}

/**
 * @param {import('prosemirror-model').Node} doc
 * @param {prng.PRNG} gen
 */
const randomRange = (doc, gen) => {
  const size = doc.content.size
  if (size <= 2) return null
  let from = prng.int32(gen, 1, size - 1)
  let to = prng.int32(gen, 1, size - 1)
  if (from > to) [from, to] = [to, from]
  if (from === to) to = Math.min(size - 1, from + 1)
  if (from === to) return null
  return { from, to }
}

const MARK_NAMES = ['em', 'strong', 'code', 'comment']

/**
 * @param {prng.PRNG} gen
 * @return {{ markName: string, markAttrs?: Record<string, any> }}
 */
const randomMark = gen => {
  const markName = prng.oneOf(gen, MARK_NAMES)
  return markName === 'comment'
    ? { markName, markAttrs: { id: prng.int32(gen, 0, 5) } }
    : { markName }
}

/**
 * `(pos, node)` pairs for every node with fuzzable attributes.
 *
 * @param {import('prosemirror-model').Node} doc
 */
const attrTargets = doc => {
  /** @type {Array<{ pos: number, node: import('prosemirror-model').Node }>} */
  const out = []
  doc.descendants((node, pos) => {
    const name = node.type.name
    if (name === 'heading' || name === 'custom' || name === 'image') out.push({ pos, node })
    return true
  })
  return out
}

/**
 * Positions of the document's direct children (for setNodeMarkup / join).
 *
 * @param {import('prosemirror-model').Node} doc
 */
const topLevelPositions = doc => {
  /** @type {Array<number>} */
  const starts = [0]
  let acc = 0
  doc.forEach(child => {
    acc += child.nodeSize
    starts.push(acc)
  })
  return starts
}

/**
 * A random attr assignment for one of the fuzzable node types.
 *
 * @param {import('prosemirror-model').Node} node
 * @param {prng.PRNG} gen
 * @return {{ attr: string, value: any } | null}
 */
const randomAttrFor = (node, gen) => {
  switch (node.type.name) {
    case 'heading': return { attr: 'level', value: prng.int32(gen, 1, 6) }
    case 'custom': return { attr: 'checked', value: prng.bool(gen) }
    case 'image': return prng.bool(gen)
      ? { attr: 'alt', value: randomWord(gen) }
      : { attr: 'title', value: randomWord(gen) }
    default: return null
  }
}

// === Random op pickers ===
//
// Each picker maps `(doc, gen)` to a `TracedOp` (user index 0; cohort drivers
// override it) or `null` when the doc cannot support the op.

/** @typedef {import('./cohort.js').TracedOp} TracedOp */
/** @typedef {(doc: import('prosemirror-model').Node, gen: prng.PRNG) => TracedOp | null} OpPicker */

/** @type {OpPicker} */
const pickInsertText = (doc, gen) => {
  const pos = randomPos(doc, gen)
  return pos == null ? null : { user: 0, op: 'insertText', args: { pos, text: randomWord(gen) } }
}

/** @type {OpPicker} */
const pickInsertPlainText = (doc, gen) => {
  const pos = randomPos(doc, gen)
  return pos == null ? null : { user: 0, op: 'insertPlainText', args: { pos, text: randomWord(gen) } }
}

/** @type {OpPicker} */
const pickDeleteRange = (doc, gen) => {
  const range = randomRange(doc, gen)
  return range == null ? null : { user: 0, op: 'deleteRange', args: range }
}

/** @type {OpPicker} */
const pickAddMark = (doc, gen) => {
  const range = randomRange(doc, gen)
  return range == null ? null : { user: 0, op: 'addMark', args: { ...range, ...randomMark(gen) } }
}

/** @type {OpPicker} */
const pickRemoveMark = (doc, gen) => {
  const range = randomRange(doc, gen)
  return range == null ? null : { user: 0, op: 'removeMark', args: { ...range, ...randomMark(gen) } }
}

/** @type {OpPicker} */
const pickSplitBlock = (doc, gen) => {
  const pos = randomPos(doc, gen)
  return pos == null ? null : { user: 0, op: 'splitBlock', args: { pos } }
}

/** @type {OpPicker} */
const pickInsertParagraph = (doc, gen) =>
  ({ user: 0, op: 'insertParagraph', args: { pos: prng.oneOf(gen, topLevelPositions(doc)), text: randomWord(gen, 4) } })

/** @type {OpPicker} */
const pickSetNodeAttribute = (doc, gen) => {
  const targets = attrTargets(doc)
  if (targets.length === 0) return null
  const { pos, node } = prng.oneOf(gen, targets)
  const assignment = randomAttrFor(node, gen)
  return assignment == null ? null : { user: 0, op: 'setNodeAttribute', args: { pos, ...assignment } }
}

/** @type {OpPicker} */
const pickSetNodeMarkup = (doc, gen) => {
  const starts = topLevelPositions(doc)
  starts.pop() // the end position addresses no child
  if (starts.length === 0) return null
  const typeName = prng.oneOf(gen, ['paragraph', 'heading', 'code_block'])
  return {
    user: 0,
    op: 'setNodeMarkup',
    args: {
      pos: prng.oneOf(gen, starts),
      typeName,
      attrs: typeName === 'heading' ? { level: prng.int32(gen, 1, 6) } : null
    }
  }
}

/** @type {OpPicker} */
const pickJoinBlocks = (doc, gen) => {
  const starts = topLevelPositions(doc)
  // interior boundaries only - joining at 0 or the very end is meaningless
  const boundaries = starts.slice(1, -1)
  if (boundaries.length === 0) return null
  return { user: 0, op: 'joinBlocks', args: { pos: prng.oneOf(gen, boundaries) } }
}

/** @type {OpPicker} */
const pickWrapRange = (doc, gen) => {
  const range = randomRange(doc, gen)
  return range == null ? null : { user: 0, op: 'wrapRange', args: { ...range, typeName: 'blockquote' } }
}

/** @type {OpPicker} */
const pickLiftRange = (doc, gen) => {
  const range = randomRange(doc, gen)
  return range == null ? null : { user: 0, op: 'liftRange', args: range }
}

/** @type {OpPicker} */
const pickInsertNode = (doc, gen) => {
  const pos = randomPos(doc, gen)
  if (pos == null) return null
  const variant = prng.int32(gen, 0, 6)
  /** @type {Record<string, any>} */
  const args = { pos }
  if (variant === 0) {
    args.typeName = 'image'
    args.attrs = { src: `${randomWord(gen)}.png` }
  } else if (variant === 1) {
    args.typeName = 'hard_break'
  } else if (variant === 2) {
    args.typeName = 'horizontal_rule'
    args.pos = prng.oneOf(gen, topLevelPositions(doc))
  } else if (variant === 3) {
    args.typeName = 'custom'
    args.attrs = { checked: prng.bool(gen) }
    args.pos = prng.oneOf(gen, topLevelPositions(doc))
  } else if (variant === 4) {
    args.typeName = 'heading'
    args.attrs = { level: prng.int32(gen, 1, 6) }
    args.text = randomWord(gen)
    args.pos = prng.oneOf(gen, topLevelPositions(doc))
  } else if (variant === 5) {
    args.typeName = 'code_block'
    args.text = randomWord(gen)
    args.pos = prng.oneOf(gen, topLevelPositions(doc))
  } else {
    args.typeName = 'blockquote'
    args.text = randomWord(gen)
    args.pos = prng.oneOf(gen, topLevelPositions(doc))
  }
  return { user: 0, op: 'insertNode', args }
}

/** @type {OpPicker} */
const pickReplaceRangeWith = (doc, gen) => {
  const range = randomRange(doc, gen)
  if (range == null) return null
  const typeName = prng.oneOf(gen, ['paragraph', 'heading'])
  return {
    user: 0,
    op: 'replaceRangeWith',
    args: {
      ...range,
      typeName,
      attrs: typeName === 'heading' ? { level: prng.int32(gen, 1, 3) } : null,
      text: randomWord(gen)
    }
  }
}

/** @type {OpPicker} */
const pickMultiOp = (doc, gen) => {
  const pos = randomPos(doc, gen)
  const range = randomRange(doc, gen)
  if (pos == null || range == null) return null
  /** @type {Array<Record<string, any>>} */
  const parts = [
    { kind: 'insertText', pos, text: randomWord(gen) },
    { kind: 'delete', from: range.from, to: Math.min(range.to, range.from + 3) }
  ]
  const targets = attrTargets(doc)
  if (targets.length > 0) {
    const { pos: apos, node } = prng.oneOf(gen, targets)
    const assignment = randomAttrFor(node, gen)
    if (assignment != null) parts.push({ kind: 'setNodeAttribute', pos: apos, ...assignment })
  }
  return { user: 0, op: 'multiOp', args: { parts } }
}

/**
 * The weighted picker pool. Text edits dominate (they are the hot path);
 * structural and attribute ops keep the shape churn high.
 *
 * @type {Array<OpPicker>}
 */
const OP_PICKERS = [
  pickInsertText, pickInsertText, pickInsertText,
  pickInsertPlainText,
  pickDeleteRange, pickDeleteRange,
  pickAddMark, pickRemoveMark,
  pickSplitBlock, pickInsertParagraph,
  pickSetNodeAttribute, pickSetNodeMarkup,
  pickJoinBlocks, pickWrapRange, pickLiftRange,
  pickInsertNode, pickInsertNode,
  pickReplaceRangeWith,
  pickMultiOp
]

/**
 * Pick a random traced op for the given view, biased to deletions once the
 * doc grows past a soft cap so fuzz iterations stay fast.
 *
 * @param {EditorView} view
 * @param {prng.PRNG} gen
 * @return {TracedOp | null}
 */
const pickRandomOp = (view, gen) => {
  const doc = view.state.doc
  const picker = doc.content.size > 500 ? pickDeleteRange : prng.oneOf(gen, OP_PICKERS)
  return picker(doc, gen)
}

/**
 * Tier-1 only: apply a foreign (Y-originated shaped) delta directly through
 * `rdt.applyDelta`. Mixes handcrafted schema-valid changes with deliberately
 * unfittable ones (an unknown node type) - the latter exercise the
 * `deltaToPSteps`-throw -> whole-doc-replace fallback and the error path
 * (an unappliable delta must leave `_state` consistent either way).
 *
 * @param {ProsemirrorRdt} rdt
 * @param {prng.PRNG} gen
 */
const opForeignDelta = (rdt, gen) => {
  const state = rdt._state
  const childCnt = state.childCnt
  const kind = prng.int32(gen, 0, 3)
  /** @type {any} */
  let d
  if (kind === 0) {
    // unknown node type: unappliable, must be survivable
    d = delta.create('doc').retain(prng.int32(gen, 0, childCnt)).insert([delta.create('no-such-node', {}, randomWord(gen))])
  } else if (kind === 1) {
    d = delta.create('doc').retain(prng.int32(gen, 0, childCnt)).insert([delta.create('paragraph', {}, randomWord(gen))])
  } else if (kind === 2 && childCnt > 0) {
    d = delta.create('doc').retain(prng.int32(gen, 0, childCnt - 1)).delete(1)
  } else if (childCnt > 0) {
    d = prng.bool(gen)
      ? delta.create('doc').retain(prng.int32(gen, 0, childCnt - 1)).modify(delta.create().insert(randomWord(gen)))
      : delta.create('doc').retain(prng.int32(gen, 0, childCnt - 1)).modify(delta.create().setAttr('level', prng.int32(gen, 1, 6)))
  } else {
    return
  }
  try {
    rdt.applyDelta(/** @type {any} */ (d.done(false)), 'fuzz-peer')
  } catch (_err) { /* unappliable foreign content - state consistency is checked after */ }
}

// === Tier-1 tests ===

/**
 * Every schema node type once, six scripted edits, full oracle after each.
 * The readable canary: when something is broken, this fails first.
 *
 * @param {TestCase} _tc
 */
export const testRdtPullOracleSmoke = _tc => {
  const { view, rdt } = mkSolo(mkDoc(
    p('hello world'),
    nodes.heading.create({ level: 2 }, txt('title')),
    nodes.blockquote.create(null, p('quoted')),
    nodes.code_block.create(null, txt('code')),
    p('a', nodes.image.create({ src: 'x.png' }), 'b', nodes.hard_break.create(), 'c'),
    nodes.custom.create({ checked: true }),
    nodes.horizontal_rule.create()
  ))
  try {
    checkStateOracle(rdt, view, 'initial')
    /** @type {Array<[string, (view: EditorView) => void]>} */
    const edits = [
      ['insert text', v => v.dispatch(v.state.tr.insertText('X', 3))],
      ['heading attr', v => {
        const target = attrTargets(v.state.doc).find(e => e.node.type.name === 'heading')
        if (target == null) throw new Error('no heading')
        v.dispatch(v.state.tr.setNodeAttribute(target.pos, 'level', 4))
      }],
      ['cross-block delete', v => v.dispatch(v.state.tr.delete(4, 17))],
      ['add em mark', v => v.dispatch(v.state.tr.addMark(1, 4, complexSchema.marks.em.create()))],
      ['split first block', v => v.dispatch(v.state.tr.split(3))],
      ['toggle custom checked', v => {
        const target = attrTargets(v.state.doc).find(e => e.node.type.name === 'custom')
        if (target == null) throw new Error('no custom node')
        v.dispatch(v.state.tr.setNodeAttribute(target.pos, 'checked', false))
      }]
    ]
    for (const [label, edit] of edits) {
      edit(view)
      checkPull(rdt, label)
      checkStateOracle(rdt, view, label)
    }
    checkWalkTaken(rdt, 'smoke')
  } finally {
    view.destroy()
  }
}

/**
 * Direct unit coverage for `pmDocDiff` (the incremental reference-walk),
 * with headless `EditorState` transforms producing before/after documents
 * that genuinely structure-share (hand-built pairs would share nothing and
 * only ever exercise the whole-document window). Checks the outcome
 * contract - the change applied to the cached previous snapshot lands
 * canonically on the cached next snapshot - plus shape expectations on the
 * hot paths.
 *
 * @param {TestCase} _tc
 */
export const testPmDocDiffUnit = _tc => {
  /**
   * @param {string} label
   * @param {import('prosemirror-model').Node} startDoc
   * @param {(tr: import('prosemirror-state').Transaction) => import('prosemirror-state').Transaction} mutate
   * @param {(change: any) => void} [shapeCheck]
   */
  const runCase = (label, startDoc, mutate, shapeCheck) => {
    let state = EditorState.create({ doc: startDoc })
    const before = state.doc
    state = state.apply(mutate(state.tr))
    const after = state.doc
    t.assert(before !== after, `${label}: the transform changed the doc`)
    const change = pmDocDiff(before, after)
    const replay = /** @type {any} */ (delta.clone(/** @type {any} */ (YPM.nodeToDeltaCached(before))))
    replay.apply(delta.cloneDeep(/** @type {any} */ (change)), { final: true })
    t.assert(
      canonicalDeltaJSON(replay.done(false)) === canonicalDeltaJSON(YPM.nodeToDeltaCached(after)),
      `${label}: pmDocDiff replays the cached previous snapshot onto the cached next snapshot`
    )
    if (shapeCheck != null) shapeCheck(change)
  }
  /**
   * @param {any} d
   * @param {(op: any) => void} cb
   */
  const eachOpDeep = (d, cb) => {
    for (const op of d.children) {
      cb(op)
      if (delta.$modifyOp.check(op)) eachOpDeep(op.value, cb)
    }
  }
  const baseDoc = mkDoc(p('lorem ipsum'), nodes.heading.create({ level: 1 }, txt('title')), p('dolor sit'))
  runCase('typing pairs in place', baseDoc, tr => tr.insertText('X', 3), change => {
    let modifies = 0
    eachOpDeep(change, op => {
      t.assert(!delta.$deleteOp.check(op), 'typing produced no delete')
      if (delta.$modifyOp.check(op)) modifies++
    })
    t.assert(modifies === 1, 'typing modifies exactly the edited block')
  })
  runCase('attr-only change carries only attr ops', baseDoc, tr => tr.setNodeAttribute(13, 'level', 4), change => {
    eachOpDeep(change, op => {
      t.assert(!delta.$textOp.check(op) && !delta.$insertOp.check(op) && !delta.$deleteOp.check(op), 'no content ops for an attr change')
    })
  })
  runCase('block delete', baseDoc, tr => tr.delete(13, 20))
  runCase('block insert at the end', baseDoc, tr => tr.insert(baseDoc.content.size, nodes.paragraph.create(null, txt('tail'))))
  runCase('split', baseDoc, tr => tr.split(4))
  runCase('cross-block delete', baseDoc, tr => tr.delete(4, 16))
  runCase('mark change', baseDoc, tr => tr.addMark(1, 6, complexSchema.marks.strong.create()))
  // walkPairable parity: a compare that rejects the heading pairing forces a
  // wholesale replace, exactly like lib0 diff's compare would
  {
    let state = EditorState.create({ doc: baseDoc })
    const before = state.doc
    state = state.apply(state.tr.setNodeAttribute(13, 'level', 5))
    const after = state.doc
    /** @type {NodeCompare} */
    const strict = (a, b) => a.name === b.name && (a.name !== 'heading' || /** @type {any} */ (a.attrs).level?.value === /** @type {any} */ (b.attrs).level?.value)
    const change = pmDocDiff(before, after, strict)
    let sawDelete = false
    let sawHeadingModify = false
    eachOpDeep(change, op => {
      if (delta.$deleteOp.check(op)) sawDelete = true
      if (delta.$modifyOp.check(op) && op.value.name === 'heading') sawHeadingModify = true
    })
    t.assert(sawDelete && !sawHeadingModify, 'a rejecting compare forces replace instead of modify')
  }
}

/**
 * The headline tier-1 fuzz: random traced ops and foreign deltas against a
 * bare RDT, all invariants after every op.
 *
 * @param {TestCase} tc
 */
export const testRepeatRdtDirectFuzz = tc => {
  const gen = tc.prng
  const { view, rdt } = mkSolo(mkDoc(p('lorem ipsum dolor'), nodes.heading.create({ level: 2 }, txt('title')), p('sit amet')))
  try {
    const ring = mkRing(4)
    ring.push(rdt)
    for (let i = 0; i < 15; i++) {
      const label = `seed=${tc.seed} op=${i}`
      if (prng.int32(gen, 0, 5) === 0) {
        opForeignDelta(rdt, gen)
      } else {
        const top = pickRandomOp(view, gen)
        if (top != null) applyTracedOp(soloCohort(view), top, complexSchema, { strict: true })
      }
      checkPull(rdt, label)
      checkStateOracle(rdt, view, label)
      ring.push(rdt)
      ring.check(label)
    }
    checkWalkTaken(rdt, `seed=${tc.seed}`)
  } finally {
    view.destroy()
  }
}

/**
 * Fixed-size long-run variant of the direct fuzz (seeds still come from
 * `tc.prng`, so `--seed` reproduces). Deeper persistence ring; under
 * `--extensive` every historic snapshot is re-verified after every op.
 *
 * @param {TestCase} tc
 */
export const testRdtDirectFuzzLong = tc => {
  const gen = tc.prng
  const iterations = t.extensive ? 30 : 10
  for (let iter = 0; iter < iterations; iter++) {
    const { view, rdt } = mkSolo(mkDoc(p('lorem ipsum dolor'), p('sit amet consectetur')))
    try {
      const ring = mkRing(t.extensive ? 64 : 8)
      ring.push(rdt)
      for (let i = 0; i < 30; i++) {
        const label = `seed=${tc.seed} iter=${iter} op=${i}`
        if (prng.int32(gen, 0, 5) === 0) {
          opForeignDelta(rdt, gen)
        } else {
          const top = pickRandomOp(view, gen)
          if (top != null) applyTracedOp(soloCohort(view), top, complexSchema, { strict: true })
        }
        checkPull(rdt, label)
        checkStateOracle(rdt, view, label)
        ring.push(rdt)
        ring.check(label)
      }
      checkWalkTaken(rdt, `seed=${tc.seed} iter=${iter}`)
    } finally {
      view.destroy()
    }
  }
}

// === Tier-2 tests ===

/**
 * Seed a fresh pair of two-way-synced Y docs with one paragraph and bind a
 * view to each.
 */
const mkTwoViewRig = () => {
  const ydoc1 = new Y.Doc({ gc: false })
  ydoc1.clientID = 1
  const ydoc2 = new Y.Doc({ gc: false })
  ydoc2.clientID = 2
  ydoc1.get(PM_KEY).applyDelta(
    delta.create().insert([delta.create('paragraph', {}, 'lorem ipsum dolor')]).done()
  )
  setupTwoWaySync(ydoc1, ydoc2)
  const view1 = createPMView(ydoc1.get(PM_KEY))
  const view2 = createPMView(ydoc2.get(PM_KEY))
  return { ydoc1, ydoc2, view1, view2 }
}

/**
 * Invariant D headline: random ops alternating between two bound views;
 * per-op state oracles and pull probes on both sides, final convergence and
 * no-leak checks.
 *
 * @param {TestCase} tc
 */
export const testRepeatRdtTwoViewConvergence = tc => {
  const gen = tc.prng
  const { ydoc1, ydoc2, view1, view2 } = mkTwoViewRig()
  try {
    const rdt1 = getPmRdt(view1)
    const rdt2 = getPmRdt(view2)
    const probe1 = probeBinding(rdt1)
    const probe2 = probeBinding(rdt2)
    for (let i = 0; i < 20; i++) {
      const label = `seed=${tc.seed} op=${i}`
      const view = prng.bool(gen) ? view1 : view2
      const top = pickRandomOp(view, gen)
      if (top != null) applyTracedOp(soloCohort(view), top, complexSchema, { strict: true })
      probe1.resync()
      probe2.resync()
      checkStateOracle(rdt1, view1, `${label} view1`)
      checkStateOracle(rdt2, view2, `${label} view2`)
      checkProbe(probe1, `${label} view1`)
      checkProbe(probe2, `${label} view2`)
    }
    t.compare(
      stableStringify(normalizeDoc(view1.state.doc.toJSON())),
      stableStringify(normalizeDoc(view2.state.doc.toJSON())),
      `seed=${tc.seed}: both views converge`
    )
    assertNoAttributionLeak(/** @type {any} */ (ydoc1.get(PM_KEY).toDeltaDeep()), 'ydoc1')
    assertNoAttributionLeak(/** @type {any} */ (ydoc2.get(PM_KEY).toDeltaDeep()), 'ydoc2')
    t.assert(recordedPull(rdt1).changes.length === 0, 'view1: settled pull emits nothing')
    t.assert(recordedPull(rdt2).changes.length === 0, 'view2: settled pull emits nothing')
    t.assert(rdt1._pullStats.walk + rdt2._pullStats.walk > 0, `seed=${tc.seed}: the incremental walk ran on at least one side`)
  } finally {
    view1.destroy()
    view2.destroy()
  }
}

/**
 * Standard six-user cohort, mirroring the suggestion-simulation layout.
 *
 * @type {Array<import('./cohort.js').UserMode>}
 */
const STANDARD_COHORT = [
  'no-suggestions', 'no-suggestions',
  'view-suggestions', 'view-suggestions',
  'suggestion-mode', 'suggestion-mode'
]

/**
 * Pick a cohort traced op: the shared picker pool plus renderer-only ops
 * (range accept/reject) and attribution-projection tampering (removing a
 * `y-attributed-*` mark, which must be reverted by the corrective pull).
 *
 * KNOWN ISSUES (pre-existing, found by this suite, reproduced on the
 * unoptimized pipeline; see {@link testRdtKnownIssueCodeBlockAttribution}
 * and {@link testRdtKnownIssueAttrChangeNonConvergence}):
 *
 * 1. `code_block` declares `marks: ''`, but the attribution render applies
 *    `y-attributed-*` marks to suggestion-inserted content inside it,
 *    producing a document that fails `doc.check()` (`RangeError: Invalid
 *    content for node code_block`). Cohort fuzzing therefore remaps
 *    `code_block` ops to `paragraph`; non-renderer tiers keep fuzzing
 *    `code_block` unrestricted.
 * 2. A `setNodeAttribute` on content inside suggestion-wrapped structure can
 *    drive the reconcile fix loop into non-convergence (an infinite
 *    propagate loop - the unbounded-propagate caveat in ARCHITECTURE.md),
 *    with or without `y-attributed-attrs` declared. Cohort fuzzing therefore
 *    skips node-attr ops (and strips them out of `multiOp`); the attr paths
 *    stay fully fuzzed in the non-renderer tiers.
 * 3. Rare op sequences surface `Unexpected case` from lib0's `diff` inside
 *    `YSyncRdt.applyDelta`'s fix computation (a non-insert op in a state
 *    delta, i.e. the maintained ytype cache or the applied expectation is
 *    off; reproduced on the unoptimized pipeline, e.g. cohort fuzz seed
 *    4028796619). Before this suite's strict dispatch the error was
 *    silently swallowed inside the dispatch. The driver aborts the run
 *    when it surfaces.
 * 4. Structural wraps over suggestion-rendered content can make two
 *    view-suggestions peers converge to differently ORDERED documents:
 *    schema-fitting materializes filler blocks (complexSchema's `custom` is
 *    the first `block`-group member) per peer during the fix cascade, and
 *    the resulting concurrent writes land in different orders (the
 *    diffing-ambiguity caveat). Reproduced on the unoptimized pipeline; see
 *    {@link testRdtKnownIssueWrapFittingDivergence} for the minimized
 *    trace. Cohort fuzzing therefore skips `wrapRange`/`liftRange`; both
 *    stay fully fuzzed in the non-renderer tiers.
 *
 * @param {import('./cohort.js').CohortUser} user
 * @param {prng.PRNG} gen
 * @return {TracedOp | null}
 */
const pickCohortOp = (user, gen) => {
  const doc = user.view.state.doc
  const roll = prng.int32(gen, 0, 9)
  if (roll === 0) {
    const range = randomRange(doc, gen)
    if (range == null) return null
    return { user: user.idx, op: prng.bool(gen) ? 'acceptRangeChanges' : 'rejectRangeChanges', args: range }
  }
  if (roll === 1) {
    const range = randomRange(doc, gen)
    if (range == null) return null
    return {
      user: user.idx,
      op: 'removeMark',
      args: { ...range, markName: prng.oneOf(gen, ['y-attributed-insert', 'y-attributed-delete', 'y-attributed-format']) }
    }
  }
  const top = pickRandomOp(user.view, gen)
  if (top == null) return null
  if (top.op === 'setNodeAttribute') return null // known issue 2
  if (top.op === 'wrapRange' || top.op === 'liftRange') return null // known issue 4
  if (top.op === 'multiOp') {
    return { ...top, user: user.idx, args: { parts: top.args.parts.filter((/** @type {any} */ part) => part.kind !== 'setNodeAttribute') } }
  }
  if ((top.op === 'setNodeMarkup' || top.op === 'insertNode' || top.op === 'replaceRangeWith') && top.args.typeName === 'code_block') {
    return { ...top, user: user.idx, args: { ...top.args, typeName: 'paragraph', attrs: null } } // known issue 1
  }
  return { ...top, user: user.idx }
}

/**
 * Guard against the KNOWN pre-existing reconcile non-convergence (see
 * {@link testRdtKnownIssueAttrChangeNonConvergence}): some op sequences send
 * the fix loop into an infinite propagate cycle INSIDE a synchronous
 * dispatch, which would hang CI. Every propagate cycle emits a `'delta'` on
 * a view-side RDT, so we count emissions per traced op and throw a
 * loop-breaker error past the threshold; the strict dispatcher rethrows it
 * (see `isDeltaContractError` in cohort.js) and the fuzz driver aborts the
 * run gracefully. Legitimate ops stay far below the threshold.
 *
 * @param {Cohort} cohort
 */
const installLoopBreaker = cohort => {
  const counter = { current: 0 }
  for (const u of cohort.users) {
    const rdt = getPmRdt(u.view)
    const origEmit = rdt.emit.bind(rdt)
    const anyRdt = /** @type {any} */ (rdt)
    anyRdt.emit = (/** @type {any} */ name, /** @type {any} */ args) => {
      if (name === 'delta' && ++counter.current > 300) {
        throw new Error('rdt-fuzz-loop-breaker: reconcile loop did not converge (known pre-existing issue)')
      }
      return origEmit(name, args)
    }
  }
  return counter
}

/**
 * Drive random cohort ops with strict dispatch and periodic per-user state
 * oracles (every op under `--extensive`).
 *
 * @param {Cohort} cohort
 * @param {prng.PRNG} gen
 * @param {number} iterations
 * @param {string} label
 * @return {boolean} `false` when the run was aborted by the loop breaker
 *   (known pre-existing non-convergence) - final assertions must be skipped,
 *   the cohort state is mid-loop
 */
const runRdtCohortSim = (cohort, gen, iterations, label) => {
  const counter = installLoopBreaker(cohort)
  for (let i = 0; i < iterations; i++) {
    const user = prng.oneOf(gen, cohort.users)
    const top = pickCohortOp(user, gen)
    if (env.hasConf('rdt-fuzz-trace')) console.log('op', i, JSON.stringify(top))
    counter.current = 0
    try {
      if (top != null) applyTracedOp(cohort, top, undefined, { strict: true })
    } catch (err) {
      const msg = /** @type {Error} */ (err).message
      if (msg.includes('rdt-fuzz-loop-breaker')) {
        t.info(`${label} op=${i}: aborted - known pre-existing non-convergence (see testRdtKnownIssueAttrChangeNonConvergence); op=${JSON.stringify(top)}`)
        return false
      }
      if (/unexpected case/i.test(msg)) {
        t.info(`${label} op=${i}: aborted - pre-existing pipeline error surfaced (known issue 3 in the pickCohortOp notes); op=${JSON.stringify(top)}`)
        return false
      }
      throw err
    }
    if (t.extensive || i % 10 === 9 || i === iterations - 1) {
      cohort.users.forEach(u => {
        checkStateOracle(getPmRdt(u.view), u.view, `${label} op=${i} user=${u.idx} (${u.mode})`)
      })
    }
  }
  return true
}

/**
 * Full-pipeline fuzz: suggestion cohort, renderer ops, attribution
 * tampering, strict dispatch, internal-error probe, final consistency and
 * no-leak checks.
 *
 * @param {TestCase} tc
 */
export const testRdtSuggestionCohortFuzz = tc => {
  /** @type {Array<{ err: Error, errCode: number }>} */
  const internalErrors = []
  const cohort = new Cohort(STANDARD_COHORT, { onInternalError: (err, errCode) => internalErrors.push({ err, errCode }) })
  try {
    cohort.seed('lorem ipsum dolor sit amet')
    if (runRdtCohortSim(cohort, tc.prng, 30, `seed=${tc.seed}`)) {
      t.assert(
        cohort.users.reduce((n, u) => n + getPmRdt(u.view)._pullStats.walk, 0) > 0,
        `seed=${tc.seed}: the incremental walk ran somewhere in the cohort`
      )
      assertCohortConsistency(cohort, `rdt cohort seed=${tc.seed}`)
      assertNoAttributionLeak(/** @type {any} */ (cohort.baseDoc.get(PM_KEY).toDeltaDeep()), 'baseDoc')
      for (const u of cohort.users) {
        if (u.suggestionDoc != null) {
          assertNoAttributionLeak(/** @type {any} */ (u.suggestionDoc.get(PM_KEY).toDeltaDeep()), `suggestionDoc ${u.idx}`)
        }
      }
      t.compare(internalErrors, [], 'no internal errors surfaced')
    }
  } finally {
    cohort.destroy()
  }
}

/**
 * Short cohort variant under the repeat harness, so CI's seed rotation also
 * reaches the full pipeline (one 8-op iteration fits the default repetition
 * budget).
 *
 * @param {TestCase} tc
 */
export const testRepeatRdtCohortFuzzShort = tc => {
  const cohort = new Cohort(STANDARD_COHORT)
  try {
    cohort.seed('lorem ipsum')
    if (runRdtCohortSim(cohort, tc.prng, 8, `seed=${tc.seed}`)) {
      assertCohortConsistency(cohort, `rdt cohort short seed=${tc.seed}`)
    }
  } finally {
    cohort.destroy()
  }
}

// === Deterministic edge pins (tier 1 unless noted) ===

/**
 * One fresh solo rig, one edit, full oracle - the shape of most pins below.
 *
 * @param {string} label
 * @param {() => import('prosemirror-model').Node} mkDocFn
 * @param {(view: EditorView) => void} edit
 */
const pinCase = (label, mkDocFn, edit) => {
  const { view, rdt } = mkSolo(mkDocFn())
  try {
    edit(view)
    checkPull(rdt, label)
    checkStateOracle(rdt, view, label)
  } finally {
    view.destroy()
  }
}

/**
 * Attr-only changes reuse the node's children Fragment by object identity -
 * the change must carry only attr ops (no content churn), for an inner node
 * and for a childless leaf.
 *
 * @param {TestCase} _tc
 */
export const testRdtEdgeAttrOnlyChange = _tc => {
  const mk = () => mkDoc(p('one'), p('two'), nodes.heading.create({ level: 1 }, txt('title')), p('three'), nodes.custom.create({ checked: false }), p('four'))
  const { view, rdt } = mkSolo(mk())
  try {
    const headingPos = /** @type {{pos: number}} */ (attrTargets(view.state.doc).find(e => e.node.type.name === 'heading')).pos
    view.dispatch(view.state.tr.setNodeAttribute(headingPos, 'level', 3))
    const change = checkPull(rdt, 'heading attr')
    t.assert(change != null, 'attr change emits')
    // the change must not rebuild content: no insert/delete/text ops anywhere
    /**
     * @param {any} d
     */
    const assertNoContentChurn = d => {
      for (const op of d.children) {
        t.assert(!delta.$textOp.check(op) && !delta.$insertOp.check(op) && !delta.$deleteOp.check(op), 'attr-only change carries no content ops')
        if (delta.$modifyOp.check(op)) assertNoContentChurn(op.value)
      }
    }
    assertNoContentChurn(change)
    checkStateOracle(rdt, view, 'heading attr')
    const customPos = /** @type {{pos: number}} */ (attrTargets(view.state.doc).find(e => e.node.type.name === 'custom')).pos
    view.dispatch(view.state.tr.setNodeAttribute(customPos, 'checked', true))
    const leafChange = checkPull(rdt, 'custom leaf attr')
    t.assert(leafChange != null, 'leaf attr change emits')
    assertNoContentChurn(leafChange)
    checkStateOracle(rdt, view, 'custom leaf attr')
  } finally {
    view.destroy()
  }
}

/**
 * Off-by-one traps at every window edge of `p("abc") p("def") p("ghi")`.
 *
 * @param {TestCase} _tc
 */
export const testRdtEdgeTextEditAtWindowBoundaries = _tc => {
  const mk = () => mkDoc(p('abc'), p('def'), p('ghi'))
  pinCase('insert at very start', mk, v => v.dispatch(v.state.tr.insertText('X', 1)))
  pinCase('insert at very end', mk, v => v.dispatch(v.state.tr.insertText('X', v.state.doc.content.size - 1)))
  pinCase('delete first char of middle block', mk, v => v.dispatch(v.state.tr.delete(6, 7)))
  pinCase('delete last char of middle block', mk, v => v.dispatch(v.state.tr.delete(8, 9)))
  pinCase('delete across block boundary', mk, v => v.dispatch(v.state.tr.delete(3, 7)))
  pinCase('replace whole middle block content', mk, v => v.dispatch(v.state.tr.insertText('DEF', 6, 9)))
}

/**
 * PM child indices vs delta positions (text length vs element slot) with
 * atoms mixed into one textblock, plus text-run coalescing.
 *
 * @param {TestCase} _tc
 */
export const testRdtEdgeMixedInlineWindow = _tc => {
  const mk = () => mkDoc(p('ab', nodes.image.create({ src: 'x.png' }), 'cd', nodes.hard_break.create(), 'ef'))
  pinCase('insert before atom', mk, v => v.dispatch(v.state.tr.insertText('X', 3)))
  pinCase('insert after atom', mk, v => v.dispatch(v.state.tr.insertText('X', 4)))
  pinCase('insert between atoms', mk, v => v.dispatch(v.state.tr.insertText('X', 5)))
  pinCase('delete atom alone', mk, v => v.dispatch(v.state.tr.delete(3, 4)))
  pinCase('delete text plus atom', mk, v => v.dispatch(v.state.tr.delete(2, 4)))
  pinCase('delete second atom', mk, v => v.dispatch(v.state.tr.delete(6, 7)))
}

/**
 * Split and join produce delete+insert pairs adjacent to identical content.
 *
 * @param {TestCase} _tc
 */
export const testRdtEdgeSplitJoin = _tc => {
  const { view, rdt } = mkSolo(mkDoc(p('aaaa'), p('bbbb'), p('cccc')))
  try {
    view.dispatch(view.state.tr.split(9))
    checkPull(rdt, 'split middle block')
    checkStateOracle(rdt, view, 'split middle block')
    // the split turned p("bbbb") [6,12) into p("bb") [6,10) + p("bb") [10,16)
    view.dispatch(view.state.tr.join(10))
    checkPull(rdt, 'join back')
    checkStateOracle(rdt, view, 'join back')
  } finally {
    view.destroy()
  }
  // heading + paragraph join: the merged node keeps the heading type
  const { view: view2, rdt: rdt2 } = mkSolo(mkDoc(nodes.heading.create({ level: 2 }, txt('head')), p('tail')))
  try {
    view2.dispatch(view2.state.tr.join(6))
    checkPull(rdt2, 'join heading and paragraph')
    checkStateOracle(rdt2, view2, 'join heading and paragraph')
  } finally {
    view2.destroy()
  }
}

/**
 * A mark change spanning an element node changes the PARENT op's format
 * while the element's own subtree stays identical - a memo hit on the child
 * must not skip the format difference.
 *
 * @param {TestCase} _tc
 */
export const testRdtEdgeMarkOnElementNode = _tc => {
  const mk = () => mkDoc(p('ab', nodes.image.create({ src: 'x.png' }), 'cd'))
  pinCase('add mark across atom', mk, v => v.dispatch(v.state.tr.addMark(1, 6, complexSchema.marks.em.create())))
  const { view, rdt } = mkSolo(mk())
  try {
    view.dispatch(view.state.tr.addMark(1, 6, complexSchema.marks.em.create()))
    checkPull(rdt, 'add mark')
    view.dispatch(view.state.tr.removeMark(1, 6, complexSchema.marks.em))
    checkPull(rdt, 'remove mark again')
    checkStateOracle(rdt, view, 'remove mark again')
  } finally {
    view.destroy()
  }
}

/**
 * Root (doc) attribute changes flow through the snapshot's root attrs.
 *
 * @param {TestCase} _tc
 */
export const testRdtEdgeDocAttrsChange = _tc => {
  const docSpec = /** @type {any} */ (complexSchema.spec.nodes.get('doc'))
  const langSchema = new Schema({
    nodes: complexSchema.spec.nodes.update('doc', { ...docSpec, attrs: { lang: { default: 'en' } } }),
    marks: complexSchema.spec.marks
  })
  const view = new EditorView(
    { mount: document.createElement('div') },
    { state: EditorState.create({ doc: langSchema.nodes.doc.create(null, langSchema.nodes.paragraph.create(null, langSchema.text('hello'))) }) }
  )
  const rdt = new ProsemirrorRdt({ view, getMeta: () => null })
  try {
    view.dispatch(view.state.tr.setDocAttribute('lang', 'de'))
    const change = checkPull(rdt, 'doc attr')
    t.assert(change != null, 'doc attr change emits')
    checkStateOracle(rdt, view, 'doc attr')
  } finally {
    view.destroy()
  }
}

/**
 * Identity trimming with content-identical (but distinct) siblings: deleting
 * or editing among equal-looking blocks must not over-trim.
 *
 * @param {TestCase} _tc
 */
export const testRdtEdgeIdenticalSiblings = _tc => {
  const mk = () => mkDoc(p('same'), p('same'), p('same'))
  pinCase('delete middle identical sibling', mk, v => v.dispatch(v.state.tr.delete(6, 12)))
  pinCase('edit last identical sibling', mk, v => v.dispatch(v.state.tr.insertText('X', 17)))
  pinCase('edit first identical sibling', mk, v => v.dispatch(v.state.tr.insertText('X', 1)))
}

/**
 * The same node INSTANCE twice in one fragment (PM nodes are persistent
 * values, so this is legal): an identity-keyed memo returns one delta for
 * both occurrences, and trimming must count positionally.
 *
 * @param {TestCase} _tc
 */
export const testRdtEdgeDuplicatedNodeObjects = _tc => {
  const shared = p('same')
  const { view, rdt } = mkSolo(mkDoc(p('a'), p('b')))
  try {
    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, Fragment.from([shared, shared])))
    checkPull(rdt, 'duplicate instance twice')
    checkStateOracle(rdt, view, 'duplicate instance twice')
    view.dispatch(view.state.tr.delete(0, shared.nodeSize))
    checkPull(rdt, 'delete one duplicate')
    checkStateOracle(rdt, view, 'delete one duplicate')
    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, Fragment.from([shared, p('mid'), shared])))
    checkPull(rdt, 'duplicates around a distinct block')
    checkStateOracle(rdt, view, 'duplicates around a distinct block')
    view.dispatch(view.state.tr.delete(shared.nodeSize, shared.nodeSize + 5))
    checkPull(rdt, 'delete the distinct middle')
    checkStateOracle(rdt, view, 'delete the distinct middle')
  } finally {
    view.destroy()
  }
}

/**
 * Foreign change then an immediate local edit: the state tracked after
 * `applyDelta` must be a valid baseline for the very next pull.
 *
 * @param {TestCase} _tc
 */
export const testRdtEdgeEditAfterApplyDelta = _tc => {
  const { ydoc1, ydoc2, view1, view2 } = mkTwoViewRig()
  try {
    const rdt1 = getPmRdt(view1)
    const rdt2 = getPmRdt(view2)
    const probe2 = probeBinding(rdt2)
    view1.dispatch(view1.state.tr.insertText('AB', 1))
    probe2.resync()
    view2.dispatch(view2.state.tr.insertText('CD', 5))
    checkProbe(probe2, 'local edit right after a foreign delta')
    checkStateOracle(rdt1, view1, 'view1')
    checkStateOracle(rdt2, view2, 'view2')
    t.compare(
      stableStringify(normalizeDoc(view1.state.doc.toJSON())),
      stableStringify(normalizeDoc(view2.state.doc.toJSON())),
      'views converge'
    )
    assertNoAttributionLeak(/** @type {any} */ (ydoc1.get(PM_KEY).toDeltaDeep()), 'ydoc1')
    assertNoAttributionLeak(/** @type {any} */ (ydoc2.get(PM_KEY).toDeltaDeep()), 'ydoc2')
  } finally {
    view1.destroy()
    view2.destroy()
  }
}

/**
 * Schema whose doc REQUIRES a blockquote - `createAndFill` materializes a
 * non-empty default document, arming the initial-content gate against an
 * empty ytype (mirrors the y-sync-rdt init-race rigs).
 */
const requiredBlockquoteSchema = new Schema({
  nodes: complexSchema.spec.nodes.update('doc', {
    ...(complexSchema.spec.nodes.get('doc')),
    content: 'blockquote'
  }),
  marks: complexSchema.spec.marks
})

/**
 * Gate pin, local-first: a gated pull emits nothing, the first real local
 * edit seeds the empty ytype through one full-content insert, and from then
 * on the RDT behaves normally.
 *
 * @param {TestCase} _tc
 */
export const testRdtEdgeGateFirstLocalEdit = _tc => {
  const ydoc = new Y.Doc({ gc: false })
  const ytype = ydoc.get(PM_KEY)
  const view = createPMView(ytype, null, { schema: requiredBlockquoteSchema })
  try {
    const rdt = getPmRdt(view)
    t.assert(rdt._defaultFingerprint != null, 'gate is armed on an empty ytype')
    t.assert(recordedPull(rdt).changes.length === 0, 'gated pull emits nothing')
    view.dispatch(view.state.tr.insertText('hi', 2))
    t.assert(rdt._defaultFingerprint == null, 'gate cleared by the first real edit')
    t.assert(ytype.length === 1, 'the edit seeded exactly the blockquote')
    checkStateOracle(rdt, view, 'after gate-clearing edit')
    t.assert(recordedPull(rdt).changes.length === 0, 'pull after the gate-clearing edit is clean')
    view.dispatch(view.state.tr.insertText('!', 4))
    checkStateOracle(rdt, view, 'after second edit')
    t.compare(
      /** @type {any} */ (YPM.docToDelta(view.state.doc).done(false)),
      /** @type {any} */ (ytype.toDeltaDeep()),
      'view and ytype agree'
    )
  } finally {
    view.destroy()
  }
}

/**
 * Gate pin, foreign-first: the first render replaces the gated skeleton
 * wholesale; subsequent local edits work against the rendered content.
 *
 * @param {TestCase} _tc
 */
export const testRdtEdgeGateForeignFirstRender = _tc => {
  const ydoc1 = new Y.Doc({ gc: false })
  ydoc1.clientID = 1
  const ydoc2 = new Y.Doc({ gc: false })
  ydoc2.clientID = 2
  setupTwoWaySync(ydoc1, ydoc2)
  const view1 = createPMView(ydoc1.get(PM_KEY), null, { schema: requiredBlockquoteSchema })
  const view2 = createPMView(ydoc2.get(PM_KEY), null, { schema: requiredBlockquoteSchema })
  try {
    const rdt1 = getPmRdt(view1)
    const rdt2 = getPmRdt(view2)
    t.assert(rdt1._defaultFingerprint != null && rdt2._defaultFingerprint != null, 'both gates armed')
    view1.dispatch(view1.state.tr.insertText('hi', 2))
    t.assert(rdt2._defaultFingerprint == null, 'foreign render cleared the second gate')
    checkStateOracle(rdt1, view1, 'seeder')
    checkStateOracle(rdt2, view2, 'foreign-rendered')
    view2.dispatch(view2.state.tr.insertText('!', 4))
    checkStateOracle(rdt1, view1, 'seeder after reply')
    checkStateOracle(rdt2, view2, 'replier')
    t.compare(
      stableStringify(normalizeDoc(view1.state.doc.toJSON())),
      stableStringify(normalizeDoc(view2.state.doc.toJSON())),
      'views converge'
    )
    view1.state.doc.check()
    view2.state.doc.check()
  } finally {
    view1.destroy()
    view2.destroy()
  }
}

/**
 * Desync pin: a filtered dispatch parks the RDT (`_desynced`), pulls stay
 * silent, further foreign deltas track the projection, and recovery restores
 * everything once dispatches land again.
 *
 * @param {TestCase} _tc
 */
export const testRdtEdgeDesyncRecovery = _tc => {
  let allow = true
  const filter = new Plugin({ filterTransaction: () => allow })
  const { view, rdt } = mkSolo(mkDoc(p('base')), [filter])
  try {
    allow = false
    const foreign1 = /** @type {any} */ (delta.create('doc').retain(1).insert([delta.create('paragraph', {}, 'first')]).done(false))
    t.assert(rdt.applyDelta(foreign1, 'peer') == null, 'blocked applyDelta returns no fix')
    t.assert(rdt._desynced, 'RDT is desynced after the filtered dispatch')
    t.assert(rdt.delta.childCnt === 2, 'projection tracks the foreign content')
    t.assert(recordedPull(rdt).changes.length === 0, 'desynced pull emits nothing')
    // second foreign delta while still blocked: the !_recover() branch
    const foreign2 = /** @type {any} */ (delta.create('doc').retain(2).insert([delta.create('paragraph', {}, 'second')]).done(false))
    t.assert(rdt.applyDelta(foreign2, 'peer') == null, 'still-blocked applyDelta returns no fix')
    t.assert(rdt.delta.childCnt === 3, 'projection keeps tracking')
    t.assert(view.state.doc.childCount === 1, 'the document itself is still behind')
    allow = true
    t.assert(recordedPull(rdt).changes.length === 0, 'recovery pull emits nothing (the doc catches up to the projection)')
    t.assert(!rdt._desynced, 'recovered')
    t.assert(view.state.doc.childCount === 3, 'document caught up')
    checkStateOracle(rdt, view, 'after recovery')
    view.dispatch(view.state.tr.insertText('X', 1))
    checkPull(rdt, 'local edit after recovery')
    checkStateOracle(rdt, view, 'local edit after recovery')
  } finally {
    view.destroy()
  }
}

/**
 * The `y-attributed-*` projection is read-only: locally stripping it is
 * reverted by the corrective pull, nothing leaks into Y, and the cohort
 * stays consistent.
 *
 * @param {TestCase} _tc
 */
export const testRdtEdgeAttributionCorrection = _tc => {
  const cohort = new Cohort(['view-suggestions', 'suggestion-mode'])
  try {
    cohort.seed('hello world')
    const sm = cohort.user(1)
    sm.view.dispatch(sm.view.state.tr.insertText('XYZ', 6))
    const vs = cohort.user(0)
    /**
     * @param {import('prosemirror-model').Node} d
     */
    const countAttributed = d => {
      let n = 0
      d.descendants(node => {
        if (node.marks.some(m => m.type.name === 'y-attributed-insert')) n++
        return true
      })
      return n
    }
    t.assert(countAttributed(vs.view.state.doc) > 0, 'suggestion renders attributed in the view-suggestions view')
    vs.view.dispatch(vs.view.state.tr.removeMark(0, vs.view.state.doc.content.size, vs.view.state.schema.marks['y-attributed-insert']))
    t.assert(countAttributed(vs.view.state.doc) > 0, 'the corrective pull restored the read-only projection')
    checkStateOracle(getPmRdt(vs.view), vs.view, 'view-suggestions user after correction')
    assertCohortConsistency(cohort, 'after attribution tampering')
    assertNoAttributionLeak(/** @type {any} */ (cohort.baseDoc.get(PM_KEY).toDeltaDeep()), 'baseDoc')
  } finally {
    cohort.destroy()
  }
}

/**
 * One transaction with several disjoint steps = exactly one pull emission
 * carrying a composite multi-window change.
 *
 * @param {TestCase} _tc
 */
export const testRdtEdgeMultiOpTransaction = _tc => {
  const ydoc = new Y.Doc({ gc: false })
  ydoc.get(PM_KEY).applyDelta(
    delta.create().insert([
      delta.create('paragraph', {}, 'first block'),
      delta.create('heading', { level: 1 }, 'title'),
      delta.create('paragraph', {}, 'last block')
    ]).done()
  )
  const view = createPMView(ydoc.get(PM_KEY))
  try {
    const rdt = getPmRdt(view)
    const probe = probeBinding(rdt)
    const headingPos = /** @type {{pos: number}} */ (attrTargets(view.state.doc).find(e => e.node.type.name === 'heading')).pos
    const tr = view.state.tr
    tr.insertText('XY', 1)
    tr.setNodeAttribute(tr.mapping.map(headingPos), 'level', 3)
    tr.delete(tr.doc.content.size - 3, tr.doc.content.size - 1)
    view.dispatch(tr)
    t.assert(probe.pulls === 1, 'one dispatch, one pull emission')
    checkProbe(probe, 'multi-op transaction')
    checkStateOracle(rdt, view, 'multi-op transaction')
  } finally {
    view.destroy()
  }
}

/**
 * Compact per-path pull-idempotence pin: after a local pull and after a
 * foreign applyDelta, the next pull is silent.
 *
 * @param {TestCase} _tc
 */
export const testRdtEdgePullAfterEveryPath = _tc => {
  const { view, rdt } = mkSolo(mkDoc(p('base')))
  try {
    view.dispatch(view.state.tr.insertText('X', 1))
    checkPull(rdt, 'after local edit')
    rdt.applyDelta(/** @type {any} */ (delta.create('doc').retain(1).insert([delta.create('paragraph', {}, 'peer')]).done(false)), 'peer')
    t.assert(recordedPull(rdt).changes.length === 0, 'pull after applyDelta emits nothing')
    checkStateOracle(rdt, view, 'after foreign delta')
  } finally {
    view.destroy()
  }
}

/**
 * The lib0 contract the optimization rests on: freezing (`done()`) a
 * snapshot's children is shape-stable, structure-sharing `clone` plus
 * copy-on-write leaves old snapshots intact, and the RDT keeps working after
 * its state was cloned-and-frozen externally.
 *
 * @param {TestCase} _tc
 */
export const testRdtEdgeFrozenShareIsCopyOnWrite = _tc => {
  const { view, rdt } = mkSolo(mkDoc(p('alpha'), nodes.heading.create({ level: 1 }, txt('beta')), p('gamma')))
  try {
    const s0 = rdt._state
    const c0 = delta.cloneDeep(/** @type {any} */ (s0))
    // freeze s0's children in place, exactly like the optimized applyDelta's
    // `delta.clone(_state)` will
    const sharedClone = delta.clone(/** @type {any} */ (s0))
    t.assert(!sharedClone.isEmpty(), 'structure-sharing clone holds the content')
    // an extra done() on a nested snapshot child must not change its shape
    for (const op of s0.children) {
      if (delta.$insertOp.check(op)) {
        for (const el of op.insert) {
          if (delta.$deltaAny.check(el)) {
            const before = { fp: el.fingerprint, cnt: el.childCnt }
            el.done()
            t.assert(el.fingerprint === before.fp && el.childCnt === before.cnt, 'freezing a snapshot child is shape-stable')
          }
        }
      }
    }
    for (let i = 0; i < 10; i++) {
      view.dispatch(view.state.tr.insertText(String.fromCharCode(97 + i), 1 + i))
      checkPull(rdt, `edit ${i} after external freeze`)
    }
    rdt.applyDelta(/** @type {any} */ (delta.create('doc').retain(1).insert([delta.create('paragraph', {}, 'peer')]).done(false)), 'peer')
    t.assert(s0.equals(c0), 'the pre-freeze snapshot is deep-intact')
    checkStateOracle(rdt, view, 'after freeze + edits + foreign delta')
  } finally {
    view.destroy()
  }
}

/**
 * The Y side's `insertContent` injects format-negation keys into an applied
 * op's format container IN PLACE (bypassing lib0's freeze and fingerprint
 * invalidation), so `pmToFragment` must never hand the shared memoized
 * snapshot to `fragment.applyDelta` directly - it clones the top level per
 * call. This pin seeds a fragment twice with a document whose top-level
 * blocks carry (differing) node marks - the shape that makes the negation
 * path fire on the second call - and asserts the process-wide cache entry
 * stayed intact.
 *
 * @param {TestCase} _tc
 */
export const testRdtEdgeMemoSurvivesPmToFragment = _tc => {
  const marked1 = nodes.paragraph.create(null, txt('one'), [complexSchema.marks['y-attributed-insert'].create()])
  const marked2 = nodes.paragraph.create(null, txt('two'), [complexSchema.marks['y-attributed-format'].create()])
  const pmDoc = mkDoc(marked1, marked2)
  const cached = YPM.nodeToDeltaCached(pmDoc)
  // materialize the fingerprint memo and the JSON image BEFORE seeding, so
  // both a raw mutation and a mutation-with-stale-memo are caught
  const jsonBefore = stableStringify(cached.toJSON())
  const fpBefore = cached.fingerprint
  const ydoc = new Y.Doc({ gc: false })
  YPM.pmToFragment(pmDoc, ydoc.get(PM_KEY))
  YPM.pmToFragment(pmDoc, ydoc.get(PM_KEY))
  t.assert(YPM.nodeToDeltaCached(pmDoc) === cached, 'the memo still serves the same entry')
  t.assert(stableStringify(cached.toJSON()) === jsonBefore, 'the cached snapshot is deep-intact after seeding')
  t.assert(delta.cloneDeep(/** @type {any} */ (cached)).fingerprint === fpBefore, 'a from-scratch fingerprint still matches the pre-seeding one')
}

/**
 * Schema with an attributed paragraph variant (mirrors
 * attributed-nodes.test.js), for the canonicalization-isolation pin.
 */
const attributedVariantSchema = new Schema({
  nodes: {
    ...complexNodes,
    'paragraph--attributed': {
      attrs: { 'y-attributed': {} },
      content: 'inline*',
      group: 'block attributed',
      toDOM () {
        return ['p', { 'data-attributed': 'true' }, 0]
      }
    }
  },
  marks: complexMarks
})

/**
 * A node-keyed snapshot memo must key on the exact canonical shape: calling
 * the exported non-canonical `nodeToDelta` over a document that renders
 * attributed variants must not poison the canonical `_state` (and vice
 * versa).
 *
 * @param {TestCase} _tc
 */
export const testRdtEdgeMemoCanonicalizationIsolation = _tc => {
  const baseDoc = new Y.Doc({ gc: false, guid: 'base' })
  const suggDoc = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'sugg' })
  const renderer = Y.createDiffRenderer(baseDoc, suggDoc, { attributions: Y.createContentMap() })
  renderer.suggestionMode = true
  const editor = createPMView(suggDoc.get(PM_KEY), renderer, {
    schema: attributedVariantSchema,
    attributedNodes: (_name, kinds) => kinds.insert === true
  })
  try {
    baseDoc.get(PM_KEY).applyDelta(delta.create().insert([delta.create('paragraph', {}, 'hello')]).done())
    editor.dispatch(editor.state.tr.insert(
      editor.state.doc.content.size,
      attributedVariantSchema.nodes.paragraph.create(null, attributedVariantSchema.text('new block'))
    ))
    t.assert(editor.state.doc.lastChild?.type.name === 'paragraph--attributed', 'the inserted block renders under its attributed variant')
    const rdt = getPmRdt(editor)
    /**
     * @param {any} d
     * @param {string} label
     */
    const assertCanonical = (d, label) => {
      const json = JSON.stringify(d.toJSON())
      t.assert(!json.includes('--attributed'), `${label}: no variant names in the canonical state`)
      t.assert(!json.includes('"y-attributed":'), `${label}: no render-only y-attributed attr in the canonical state`)
    }
    assertCanonical(rdt._state, 'before poisoning attempt')
    // poisoning attempt: a non-canonical export over the very same nodes
    const nonCanonical = YPM.nodeToDelta(editor.state.doc)
    t.assert(JSON.stringify(nonCanonical.toJSON()).includes('--attributed'), 'the non-canonical export keeps variant names')
    editor.dispatch(editor.state.tr.insertText('x', editor.state.doc.content.size - 1))
    checkStateOracle(rdt, editor, 'after edit following the non-canonical export')
    assertCanonical(rdt._state, 'after poisoning attempt')
    const nonCanonical2 = YPM.nodeToDelta(editor.state.doc)
    t.assert(JSON.stringify(nonCanonical2.toJSON()).includes('--attributed'), 'the non-canonical export still keeps variant names')
  } finally {
    editor.destroy()
    const anyRenderer = /** @type {any} */ (renderer)
    anyRenderer.destroy?.()
  }
}

/**
 * A `customCompare` that refuses to pair headings across level changes: the
 * Y-side change must be a wholesale replace (delete + insert), never a
 * modify. Outcome-equality oracles cannot see this difference, so it gets
 * its own change-shape assertion.
 *
 * @param {TestCase} _tc
 */
export const testRdtEdgeCustomCompareParity = _tc => {
  /** @type {NodeCompare} */
  const levelStrictCompare = (a, b) =>
    a.name === b.name && (a.name !== 'heading' || /** @type {any} */ (a.attrs).level?.value === /** @type {any} */ (b.attrs).level?.value)
  const ydoc1 = new Y.Doc({ gc: false })
  ydoc1.clientID = 1
  const ydoc2 = new Y.Doc({ gc: false })
  ydoc2.clientID = 2
  ydoc1.get(PM_KEY).applyDelta(
    delta.create().insert([delta.create('heading', { level: 1 }, 'title'), delta.create('paragraph', {}, 'body')]).done()
  )
  setupTwoWaySync(ydoc1, ydoc2)
  const view1 = createPMView(ydoc1.get(PM_KEY), null, { customCompare: levelStrictCompare })
  const view2 = createPMView(ydoc2.get(PM_KEY), null, { customCompare: levelStrictCompare })
  try {
    /** @type {Array<any>} */
    const yChanges = []
    ydoc1.get(PM_KEY).on('delta', (/** @type {any} */ d) => { yChanges.push(d) })
    view1.dispatch(view1.state.tr.setNodeMarkup(0, complexSchema.nodes.heading, { level: 2 }))
    let sawDelete = false
    let sawHeadingInsert = false
    let sawHeadingModify = false
    /**
     * @param {any} d
     */
    const walk = d => {
      for (const op of d.children) {
        if (delta.$deleteOp.check(op)) sawDelete = true
        if (delta.$insertOp.check(op)) {
          op.insert.forEach((/** @type {any} */ c) => {
            if (delta.$deltaAny.check(c) && c.name === 'heading') sawHeadingInsert = true
          })
        }
        if (delta.$modifyOp.check(op)) {
          if (op.value.name === 'heading') sawHeadingModify = true
          walk(op.value)
        }
      }
    }
    yChanges.forEach(walk)
    t.assert(sawDelete && sawHeadingInsert, 'the strict compare forces a wholesale heading replace in Y')
    t.assert(!sawHeadingModify, 'no in-place heading modify slipped through')
    t.assert(view1.state.doc.firstChild?.attrs.level === 2, 'the edit applied')
    checkStateOracle(getPmRdt(view1), view1, 'view1')
    checkStateOracle(getPmRdt(view2), view2, 'view2')
    t.compare(
      stableStringify(normalizeDoc(view1.state.doc.toJSON())),
      stableStringify(normalizeDoc(view2.state.doc.toJSON())),
      'views converge'
    )
  } finally {
    view1.destroy()
    view2.destroy()
  }
}

/**
 * KNOWN ISSUE pin (skipped): suggestion-inserted content inside a
 * `code_block` is rendered with `y-attributed-*` marks although the
 * `code_block` schema declares `marks: ''` - the resulting document fails
 * `doc.check()`. Found by this suite's fuzz vocabulary on the UNOPTIMIZED
 * pipeline (e.g. `--filter "rdt suggestion cohort fuzz" --seed 11` with the
 * code_block remap in `pickCohortOp` removed). Unskip after fixing the
 * attribution render to respect the schema's mark constraints, and drop the
 * code_block remap in `pickCohortOp`.
 *
 * @param {TestCase} _tc
 */
export const testRdtKnownIssueCodeBlockAttribution = _tc => {
  t.skip()
  const cohort = new Cohort(['no-suggestions', 'suggestion-mode'])
  try {
    cohort.seed('lorem ipsum')
    // the base user turns the paragraph into a code_block (no marks involved)
    applyTracedOp(cohort, { user: 0, op: 'setNodeMarkup', args: { pos: 0, typeName: 'code_block', attrs: null } }, undefined, { strict: true })
    // the suggestion-mode user types into it - the renderer must not apply
    // attribution marks that the code_block content forbids
    const sm = cohort.user(1)
    sm.view.dispatch(sm.view.state.tr.insertText('XYZ', 3))
    cohort.users.forEach(u => u.view.state.doc.check())
    assertCohortConsistency(cohort, 'code_block suggestion insert')
  } finally {
    cohort.destroy()
  }
}

/**
 * KNOWN ISSUE pin (skipped): this minimized 5-op trace (from
 * `rdt suggestion cohort fuzz --seed 777` on the UNOPTIMIZED pipeline)
 * drives the reconcile fix loop into an infinite propagate loop - the
 * process hangs on the final `setNodeAttribute` (an image `title` change on
 * content sitting inside suggestion-wrapped blockquotes). Reproduced both
 * with and without the `y-attributed-attrs` mark declared. Unskip after
 * fixing the non-convergence, and drop the `setNodeAttribute` skip in
 * `pickCohortOp`.
 *
 * @param {TestCase} _tc
 */
export const testRdtKnownIssueAttrChangeNonConvergence = _tc => {
  t.skip()
  const cohort = new Cohort(STANDARD_COHORT)
  try {
    cohort.seed('lorem ipsum dolor sit amet')
    /** @type {Array<TracedOp>} */
    const trace = [
      { user: 4, op: 'insertPlainText', args: { pos: 3, text: 'e' } },
      { user: 3, op: 'insertNode', args: { pos: 17, typeName: 'image', attrs: { src: 'wa.png' } } },
      { user: 1, op: 'wrapRange', args: { from: 10, to: 12, typeName: 'blockquote' } },
      { user: 4, op: 'wrapRange', args: { from: 15, to: 20, typeName: 'blockquote' } },
      { user: 1, op: 'setNodeAttribute', args: { pos: 17, attr: 'title', value: 'vx' } }
    ]
    for (const step of trace) applyTracedOp(cohort, step)
    assertCohortConsistency(cohort, 'attr change inside suggestion-wrapped structure')
  } finally {
    cohort.destroy()
  }
}

/**
 * KNOWN ISSUE pin (skipped): this minimized 3-op trace (from cohort fuzz
 * seed 4220155005, reproduced byte-identically on the UNOPTIMIZED pipeline)
 * leaves the two view-suggestions peers with the same blocks in different
 * ORDER: wrapping suggestion-rendered content makes each peer's fix cascade
 * materialize schema-filler blocks (`custom` is complexSchema's first
 * `block`-group member) as its own concurrent writes, and the merged order
 * differs per peer (the diffing-ambiguity caveat in CAVEATS.md). Unskip
 * after fixing the fitting/cascade convergence, and drop the
 * `wrapRange`/`liftRange` skip in `pickCohortOp`.
 *
 * @param {TestCase} _tc
 */
export const testRdtKnownIssueWrapFittingDivergence = _tc => {
  t.skip()
  const cohort = new Cohort(STANDARD_COHORT)
  try {
    cohort.seed('lorem ipsum')
    /** @type {Array<TracedOp>} */
    const trace = [
      { user: 3, op: 'wrapRange', args: { from: 2, to: 4, typeName: 'blockquote' } },
      { user: 5, op: 'replaceRangeWith', args: { from: 3, to: 13, typeName: 'paragraph', attrs: null, text: 'fx' } },
      { user: 2, op: 'wrapRange', args: { from: 2, to: 10, typeName: 'blockquote' } }
    ]
    for (const step of trace) applyTracedOp(cohort, step)
    assertCohortConsistency(cohort, 'wrap over suggestion-rendered content')
  } finally {
    cohort.destroy()
  }
}

// === Perf sanity (log-only, extensive runs) ===

/**
 * Non-asserting timings on a larger bound document: one keystroke dispatch
 * (includes the pull), an attr-only change, a settled no-op pull, and - for
 * contrast - a full from-scratch snapshot. Machine-dependent, so log-only.
 *
 * @param {TestCase} _tc
 */
export const testRdtPerfPullLargeDoc = _tc => {
  if (!t.extensive) {
    t.skip()
    return
  }
  const ydoc = new Y.Doc({ gc: false })
  const children = Array.from({ length: 400 }, (_, i) => delta.create('paragraph', {}, `paragraph number ${i} with some real text in it`))
  children.splice(200, 0, /** @type {any} */ (delta.create('heading', { level: 2 }, 'a heading in the middle')))
  ydoc.get(PM_KEY).applyDelta(delta.create().insert(/** @type {any} */ (children)).done())
  const view = createPMView(ydoc.get(PM_KEY))
  try {
    const rdt = getPmRdt(view)
    t.measureTime('bound keystroke dispatch (pull + Y-side write)', () => {
      view.dispatch(view.state.tr.insertText('X', 5))
    })
    const headingPos = /** @type {{pos: number}} */ (attrTargets(view.state.doc).find(e => e.node.type.name === 'heading')).pos
    t.measureTime('bound attr-only dispatch (pull + Y-side write)', () => {
      view.dispatch(view.state.tr.setNodeAttribute(headingPos, 'level', 5))
    })
    t.measureTime('settled no-op pull', () => {
      rdt.pull()
    })
    t.measureTime('full from-scratch reference snapshot', () => {
      referenceState(view)
    })
    checkStateOracle(rdt, view, 'large doc')
  } finally {
    view.destroy()
  }
  // tier-1 section: the view-side pull in isolation (no binding, no Y write)
  const soloDoc = complexSchema.nodeFromJSON({
    type: 'doc',
    content: Array.from({ length: 400 }, (_, i) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: `paragraph number ${i} with some real text in it` }]
    }))
  })
  const { view: solo, rdt: soloRdt } = mkSolo(soloDoc)
  try {
    solo.dispatch(solo.state.tr.insertText('X', 5))
    t.measureTime('solo pull, incremental walk path', () => {
      soloRdt.pull()
    })
    solo.dispatch(solo.state.tr.insertText('Y', 9))
    soloRdt._pmstate = null
    t.measureTime('solo pull, memoized diff fallback path', () => {
      soloRdt.pull()
    })
    solo.dispatch(solo.state.tr.insertText('Z', 13))
    const coldPrev = delta.cloneDeep(/** @type {any} */ (soloRdt._state))
    t.measureTime('pre-optimization cost model (fresh snapshot + cold diff)', () => {
      const freshNext = referenceState(solo)
      delta.diff(/** @type {any} */ (coldPrev), /** @type {any} */ (freshNext), {})
    })
    soloRdt.pull()
    checkStateOracle(soloRdt, solo, 'solo large doc')
  } finally {
    solo.destroy()
  }
}
