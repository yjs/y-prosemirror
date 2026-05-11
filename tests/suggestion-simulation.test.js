/**
 * Suggestion-mode realtime collaboration fuzz tests.
 *
 * We spin up a fixed cohort of collaborating users in three different "view modes":
 *   - 'no-suggestions'   → edits the base doc directly, no AttributionManager
 *   - 'view-suggestions' → sees suggestions, but their own edits go to the base doc
 *   - 'suggestion-mode'  → sees suggestions, their own edits stay as suggestions
 *
 * We then drive a stream of random ProseMirror operations (insertText, delete,
 * format, split, etc.) generated from `tc.prng`, dispatched against random users.
 *
 * Everything in y-prosemirror, @y/y, and lib0 is fully synchronous: the moment
 * `view.dispatch` returns, every cascading observeDeep / AM-change listener /
 * sync-plugin appendTransaction has finished. So the simulation does not need
 * to yield to the event loop between ops, and the tests stay synchronous.
 *
 * Invariant under test: at the end of the simulation, all users in the same
 * mode must render the same ProseMirror document. Since we drive operations
 * sequentially, there is no concurrent-conflict resolution to test. Any
 * divergence is a real-time sync bug.
 *
 * The framework is loosely modeled after Yjs's `applyRandomTests`
 * (testHelper.js): a list of `mods` (operation generators), a per-iteration
 * driver, and a final `compare`.
 */

import * as YPM from '@y/prosemirror'
import * as Y from '@y/y'
import * as ldelta from 'lib0/delta'
import * as t from 'lib0/testing'
import * as prng from 'lib0/prng'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { schema } from './complexSchema.js'

const PM_KEY = 'prosemirror'

// === Setup helpers ===

/**
 * Create a ProseMirror EditorView backed by a Y.js type.
 * @param {Y.Type} ytype
 * @param {Y.AbstractAttributionManager} attributionManager
 */
const createPMView = (ytype, attributionManager) => {
  const view = new EditorView(
    { mount: document.createElement('div') },
    {
      state: EditorState.create({
        schema,
        plugins: [YPM.syncPlugin({})]
      })
    }
  )
  YPM.configureYProsemirror({ ytype, attributionManager })(view.state, view.dispatch)
  return view
}

/**
 * Two-way Yjs sync between two docs. Applying an update a peer already has is a
 * no-op via the state vector, so chaining/cycling is safe.
 * @param {Y.Doc} doc1
 * @param {Y.Doc} doc2
 */
const setupTwoWaySync = (doc1, doc2) => {
  Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
  Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))
  doc1.on('update', (u) => Y.applyUpdate(doc2, u))
  doc2.on('update', (u) => Y.applyUpdate(doc1, u))
}

// === User & Simulation ===

/** @typedef {'no-suggestions' | 'view-suggestions' | 'suggestion-mode'} UserMode */

/**
 * One simulated collaborator.
 */
class SimUser {
  /**
   * @param {number} idx
   * @param {UserMode} mode
   * @param {Y.Doc} baseDoc
   * @param {Y.Attributions} sharedAttrs
   */
  constructor (idx, mode, baseDoc, sharedAttrs) {
    this.idx = idx
    this.mode = mode
    if (mode === 'no-suggestions') {
      this.suggestionDoc = null
      this.am = Y.noAttributionsManager
      this.view = createPMView(baseDoc.get(PM_KEY), Y.noAttributionsManager)
    } else {
      // Each suggestion-aware user gets their own suggestion Doc; we sync them
      // amongst each other. The AM internally bridges baseDoc<->this.suggestionDoc.
      this.suggestionDoc = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: `sugg-${idx}` })
      this.am = Y.createAttributionManagerFromDiff(baseDoc, this.suggestionDoc, { attrs: sharedAttrs })
      this.am.suggestionMode = mode === 'suggestion-mode'
      this.view = createPMView(this.suggestionDoc.get(PM_KEY), this.am)
    }
  }

  destroy () {
    this.view.destroy()
    this.am?.destroy?.()
  }
}

/**
 * Top-level simulation: a base doc shared by all users and a star/chain of
 * suggestionDoc syncs across the suggestion-aware users.
 */
class Simulation {
  /**
   * @param {Array<UserMode>} modeAssignments
   */
  constructor (modeAssignments) {
    this.baseDoc = new Y.Doc({ gc: false, guid: 'base' })
    this.sharedAttrs = new Y.Attributions()
    this.users = modeAssignments.map((m, i) => new SimUser(i, m, this.baseDoc, this.sharedAttrs))
    // Chain-sync every suggestion-aware user. Linear chain is enough since
    // applyUpdate is idempotent under state-vector and propagates transitively.
    const suggUsers = this.users.filter(u => u.suggestionDoc !== null)
    for (let i = 0; i + 1 < suggUsers.length; i++) {
      setupTwoWaySync(
        /** @type {Y.Doc} */ (suggUsers[i].suggestionDoc),
        /** @type {Y.Doc} */ (suggUsers[i + 1].suggestionDoc)
      )
    }
  }

  /**
   * Group users by mode.
   * @returns {Map<UserMode, Array<SimUser>>}
   */
  byMode () {
    /** @type {Map<UserMode, Array<SimUser>>} */
    const m = new Map()
    for (const u of this.users) {
      const arr = m.get(u.mode) || []
      arr.push(u)
      m.set(u.mode, arr)
    }
    return m
  }

  destroy () {
    for (const u of this.users) u.destroy()
  }
}

// === Random ProseMirror operations ===
//
// Each op takes (user, gen) and dispatches a transaction; safe-fails on invalid
// transforms (PM throws on unschema-able edits). We only generate edits at PM
// positions that the sync-plugin would also see in real usage.

/**
 * @param {prng.PRNG} gen
 * @param {number} maxLen
 */
const randomWord = (gen, maxLen = 5) => {
  let s = ''
  const n = prng.int32(gen, 1, maxLen)
  for (let i = 0; i < n; i++) s += prng.letter(gen)
  return s
}

/**
 * Pick a random PM position in [1, docSize-1]. Returns null if doc is too small.
 * @param {import('prosemirror-model').Node} doc
 * @param {prng.PRNG} gen
 */
const randomPos = (doc, gen) => {
  const size = doc.content.size
  if (size <= 1) return null
  return prng.int32(gen, 1, size - 1)
}

/**
 * Pick a random PM range [from, to] with from < to.
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

/**
 * @param {SimUser} user
 * @param {prng.PRNG} gen
 */
const opInsertText = (user, gen) => {
  const { state } = user.view
  const pos = randomPos(state.doc, gen)
  if (pos == null) return
  const text = randomWord(gen, 5)
  try {
    // tr.insertText finds the nearest valid inline position itself.
    user.view.dispatch(state.tr.insertText(text, pos))
  } catch (_) { /* invalid pos in non-text node; skip */ }
}

/**
 * Insert plain text using an explicit text node so we don't inherit any active
 * marks at the insertion position - useful to vary mark behavior across runs.
 * @param {SimUser} user
 * @param {prng.PRNG} gen
 */
const opInsertPlainText = (user, gen) => {
  const { state } = user.view
  const pos = randomPos(state.doc, gen)
  if (pos == null) return
  const text = randomWord(gen, 5)
  try {
    const $pos = state.doc.resolve(pos)
    if (!$pos.parent.isTextblock) return
    user.view.dispatch(state.tr.insert(pos, schema.text(text)))
  } catch (_) { /* skip */ }
}

/**
 * @param {SimUser} user
 * @param {prng.PRNG} gen
 */
const opDeleteRange = (user, gen) => {
  const { state } = user.view
  const range = randomRange(state.doc, gen)
  if (range == null) return
  try {
    user.view.dispatch(state.tr.delete(range.from, range.to))
  } catch (_) { /* skip */ }
}

/**
 * @param {SimUser} user
 * @param {prng.PRNG} gen
 */
const opAddMark = (user, gen) => {
  const { state } = user.view
  const range = randomRange(state.doc, gen)
  if (range == null) return
  const markName = prng.oneOf(gen, ['em', 'strong', 'code'])
  const mark = schema.marks[markName].create()
  try {
    user.view.dispatch(state.tr.addMark(range.from, range.to, mark))
  } catch (_) { /* skip */ }
}

/**
 * @param {SimUser} user
 * @param {prng.PRNG} gen
 */
const opRemoveMark = (user, gen) => {
  const { state } = user.view
  const range = randomRange(state.doc, gen)
  if (range == null) return
  const markName = prng.oneOf(gen, ['em', 'strong', 'code'])
  const markType = schema.marks[markName]
  try {
    user.view.dispatch(state.tr.removeMark(range.from, range.to, markType))
  } catch (_) { /* skip */ }
}

/**
 * Split the current block - i.e. press Enter at a random position.
 * @param {SimUser} user
 * @param {prng.PRNG} gen
 */
const opSplitBlock = (user, gen) => {
  const { state } = user.view
  const pos = randomPos(state.doc, gen)
  if (pos == null) return
  try {
    const $pos = state.doc.resolve(pos)
    if (!$pos.parent.isTextblock) return
    user.view.dispatch(state.tr.split(pos))
  } catch (_) { /* skip */ }
}

/**
 * Insert a fresh paragraph at a top-level position.
 * @param {SimUser} user
 * @param {prng.PRNG} gen
 */
const opInsertParagraph = (user, gen) => {
  const { state } = user.view
  const doc = state.doc
  // Top-level insertion positions: 0, after each direct child, doc.content.size
  const tops = [0]
  let acc = 0
  doc.forEach(child => {
    acc += child.nodeSize
    tops.push(acc)
  })
  const pos = prng.oneOf(gen, tops)
  const text = randomWord(gen, 4)
  try {
    user.view.dispatch(state.tr.insert(pos, schema.nodes.paragraph.create(null, schema.text(text))))
  } catch (_) { /* skip */ }
}

const ALL_OPS = [
  opInsertText,
  opInsertPlainText,
  opDeleteRange,
  opAddMark,
  opRemoveMark,
  opSplitBlock,
  opInsertParagraph
]

// === Driver & assertions ===

/**
 * @param {Simulation} sim
 * @param {prng.PRNG} gen
 * @param {number} iterations
 * @param {(e: Error, ctx: { user: SimUser, op: typeof ALL_OPS[number], iter: number }) => void} [onError]
 */
const runSim = (sim, gen, iterations, onError) => {
  for (let i = 0; i < iterations; i++) {
    const user = prng.oneOf(gen, sim.users)
    const op = prng.oneOf(gen, ALL_OPS)
    // Catch sync-plugin throws that bubble up through the dispatch lifecycle.
    // The stack is fully sync; nothing fires later out-of-band.
    try {
      op(user, gen)
    } catch (e) {
      onError?.(/** @type {Error} */ (e), { user, op, iter: i })
    }
  }
}

/**
 * Assert that all users in each mode show identical ProseMirror docs.
 * Pretty-prints divergence for debugging when it fires.
 * @param {Simulation} sim
 * @param {string} [label]
 */
/**
 * Stable JSON.stringify that recursively sorts object keys before serialising.
 * Necessary because mark `attrs` (e.g. `userIdsByAttr`) carry plain objects
 * whose key order depends on the order of operations across peers - identical
 * docs can render with different key orderings, which a naive string compare
 * would flag as a (spurious) divergence. Use this for any cross-peer compare
 * of `doc.toJSON()` output.
 *
 * @param {any} v
 * @return {string}
 */
const stableStringify = (v) => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'
  const keys = Object.keys(v).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}'
}

/**
 * @param {Simulation} sim
 * @param {string} label
 */
const assertConsistency = (sim, label = '') => {
  const groups = sim.byMode()
  /** @type {Array<{ mode: string, a: number, b: number, jsonA: any, jsonB: any }>} */
  const divergences = []
  for (const [mode, users] of groups) {
    if (users.length < 2) continue
    const baseJSON = JSON.parse(JSON.stringify(users[0].view.state.doc.toJSON()))
    const baseStr = stableStringify(baseJSON)
    for (let i = 1; i < users.length; i++) {
      const otherJSON = JSON.parse(JSON.stringify(users[i].view.state.doc.toJSON()))
      if (stableStringify(otherJSON) !== baseStr) {
        divergences.push({ mode, a: users[0].idx, b: users[i].idx, jsonA: baseJSON, jsonB: otherJSON })
      }
    }
  }
  if (divergences.length > 0) {
    for (const d of divergences) {
      console.log(`\n=== Divergence (${label}) in mode "${d.mode}" between user ${d.a} and user ${d.b} ===`)
      console.log(`-- user ${d.a} --`)
      console.log(JSON.stringify(d.jsonA, null, 2))
      console.log(`-- user ${d.b} --`)
      console.log(JSON.stringify(d.jsonB, null, 2))
    }
    t.fail(`${divergences.length} divergence(s) detected${label ? ' [' + label + ']' : ''}`)
  }
}

/**
 * Standard six-user cohort: two of each mode.
 */
const STANDARD_COHORT = /** @type {Array<UserMode>} */ ([
  'no-suggestions', 'no-suggestions',
  'view-suggestions', 'view-suggestions',
  'suggestion-mode', 'suggestion-mode'
])

/**
 * Seed the base doc with a paragraph of starter text.
 * @param {Simulation} sim
 * @param {string} text
 */
const seedBase = (sim, text) => {
  sim.baseDoc.get(PM_KEY).applyDelta(
    ldelta.create()
      .insert([ldelta.create('paragraph', {}, text)])
      .done()
  )
}

// === Tests ===

/**
 * Sanity check: the framework itself converges with no edits.
 * @param {t.TestCase} _tc
 */
export const testSimSetupConverges = (_tc) => {
  const sim = new Simulation(STANDARD_COHORT)
  seedBase(sim, 'hello world')
  assertConsistency(sim, 'init')
  sim.destroy()
}

/**
 * Single deterministic edit by one suggestion-mode user; everyone in that mode
 * (and view-suggestions) must agree.
 * @param {t.TestCase} _tc
 */
export const testSimSingleSuggestionEditConverges = (_tc) => {
  const sim = new Simulation(STANDARD_COHORT)
  seedBase(sim, 'hello world')
  const sm = sim.users.find(u => u.mode === 'suggestion-mode')
  if (!sm) throw new Error('no suggestion-mode user')
  sm.view.dispatch(sm.view.state.tr.insertText(' more', 12))
  assertConsistency(sim, 'after one suggestion insert')
  sim.destroy()
}

/**
 * The headline fuzz test. Randomly drives ~30 ops across 6 users and verifies
 * mode-internal consistency. Repeating (the test name starts with "repeat...")
 * makes lib0/testing run it many times with new seeds, surfacing rare bugs.
 * @param {t.TestCase} tc
 */
export const testRepeatGeneratingSuggestionEdits = (tc) => {
  const sim = new Simulation(STANDARD_COHORT)
  seedBase(sim, 'lorem ipsum dolor sit amet')
  runSim(sim, tc.prng, 30)
  assertConsistency(sim, `seed=${tc.seed}`)
  sim.destroy()
}

/**
 * Higher-iteration variant - useful for digging up edge cases in CI without
 * the infinite-repeat harness.
 * @param {t.TestCase} tc
 */
export const testSimLongRunningFuzz = (tc) => {
  const sim = new Simulation(STANDARD_COHORT)
  seedBase(sim, 'lorem ipsum dolor sit amet')
  runSim(sim, tc.prng, 100)
  assertConsistency(sim, `long seed=${tc.seed}`)
  sim.destroy()
}
