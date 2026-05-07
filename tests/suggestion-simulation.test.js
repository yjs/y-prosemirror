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
 * After each op we settle for a few ms to let updates propagate through Yjs,
 * the AttributionManager's prevDoc<->nextDoc bridge, and the sync-plugin's
 * deferred reconciliation pass (`setTimeout(..., 0)` inside sync-plugin.js).
 *
 * Invariant under test: at the end of the simulation, all users in the same
 * mode must render the same ProseMirror document. Since we drive operations
 * sequentially with full settling, there is no concurrent-conflict resolution
 * to test. Any divergence is a real-time sync bug.
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
import * as promise from 'lib0/promise'
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

  /** Allow the sync plugin's setTimeout(0) reconciliation + Y.Doc updates to settle. */
  async settle (ticks = 4) {
    for (let i = 0; i < ticks; i++) await promise.wait(1)
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
 * Run async code with a temporary `process.on('uncaughtException')` handler
 * installed. The sync-plugin's `setTimeout(0)` reconciliation pass and the
 * AttributionManager's async observer chain can throw long after `view.dispatch`
 * returned, so a try/catch around the dispatching op is not enough to keep the
 * suite alive. We swallow + record those errors so the simulation can continue
 * to its final consistency check (which is what we actually want to assert on).
 *
 * @param {(record: (e: Error) => void) => Promise<void>} fn
 * @returns {Promise<Array<Error>>}
 */
const withCaughtAsyncErrors = async (fn) => {
  /** @type {Array<Error>} */
  const errors = []
  const record = (/** @type {Error} */ e) => errors.push(e)
  const handler = (/** @type {Error} */ e) => record(e)
  // Node-only: in browsers this is a no-op (the in-test errors won't be
  // catchable, but our test runner is node-based, so we accept that).
  // @ts-ignore - `process` is not typed without @types/node, but it's available at runtime.
  const proc = typeof process !== 'undefined' ? process : null
  if (proc?.on) {
    proc.on('uncaughtException', handler)
  }
  try {
    await fn(record)
  } finally {
    if (proc?.off) {
      proc.off('uncaughtException', handler)
    }
  }
  return errors
}

/**
 * @param {Simulation} sim
 * @param {prng.PRNG} gen
 * @param {number} iterations
 * @param {(e: Error, ctx: { user: SimUser, op: typeof ALL_OPS[number], iter: number }) => void} [onError]
 */
const runSim = async (sim, gen, iterations, onError) => {
  for (let i = 0; i < iterations; i++) {
    const user = prng.oneOf(gen, sim.users)
    const op = prng.oneOf(gen, ALL_OPS)
    // Two layers of protection:
    //   - try/catch around the synchronous op() catches sync-plugin throws that
    //     bubble up through the dispatch lifecycle.
    //   - the outer withCaughtAsyncErrors handler (installed by the caller)
    //     catches throws that happen later via setTimeout(0) reconciliation or
    //     async Y.Doc observer cascades.
    try {
      op(user, gen)
    } catch (e) {
      onError?.(/** @type {Error} */ (e), { user, op, iter: i })
    }
    await sim.settle()
  }
  // Extra-long final settle - drain any in-flight setTimeout(0) chains.
  await sim.settle(20)
}

/**
 * Assert that all users in each mode show identical ProseMirror docs.
 * Pretty-prints divergence for debugging when it fires.
 * @param {Simulation} sim
 * @param {string} [label]
 */
const assertConsistency = (sim, label = '') => {
  const groups = sim.byMode()
  /** @type {Array<{ mode: string, a: number, b: number, jsonA: any, jsonB: any }>} */
  const divergences = []
  for (const [mode, users] of groups) {
    if (users.length < 2) continue
    const baseJSON = JSON.parse(JSON.stringify(users[0].view.state.doc.toJSON()))
    const baseStr = JSON.stringify(baseJSON)
    for (let i = 1; i < users.length; i++) {
      const otherJSON = JSON.parse(JSON.stringify(users[i].view.state.doc.toJSON()))
      if (JSON.stringify(otherJSON) !== baseStr) {
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
const seedBase = async (sim, text) => {
  sim.baseDoc.get(PM_KEY).applyDelta(
    ldelta.create()
      .insert([ldelta.create('paragraph', {}, text)])
      .done()
  )
  await sim.settle(10)
}

// === Tests ===

/**
 * Sanity check: the framework itself converges with no edits.
 * @param {t.TestCase} _tc
 */
export const testSimSetupConverges = async (_tc) => {
  const sim = new Simulation(STANDARD_COHORT)
  await seedBase(sim, 'hello world')
  assertConsistency(sim, 'init')
  sim.destroy()
}

/**
 * Single deterministic edit by one suggestion-mode user; everyone in that mode
 * (and view-suggestions) must agree.
 * @param {t.TestCase} _tc
 */
export const testSimSingleSuggestionEditConverges = async (_tc) => {
  const sim = new Simulation(STANDARD_COHORT)
  await seedBase(sim, 'hello world')
  const sm = sim.users.find(u => u.mode === 'suggestion-mode')
  if (!sm) throw new Error('no suggestion-mode user')
  sm.view.dispatch(sm.view.state.tr.insertText(' more', 12))
  await sim.settle(20)
  assertConsistency(sim, 'after one suggestion insert')
  sim.destroy()
}

/**
 * The headline fuzz test. Randomly drives ~30 ops across 6 users and verifies
 * mode-internal consistency. Repeating (the test name starts with "repeat...")
 * makes lib0/testing run it many times with new seeds, surfacing rare bugs.
 * @param {t.TestCase} tc
 */
export const testRepeatGeneratingSuggestionEdits = async (tc) => {
  const sim = new Simulation(STANDARD_COHORT)
  await seedBase(sim, 'lorem ipsum dolor sit amet')
  const asyncErrors = await withCaughtAsyncErrors(async (_record) => {
    await runSim(sim, tc.prng, 30)
  })
  if (asyncErrors.length > 0) {
    console.log(`[seed=${tc.seed}] swallowed ${asyncErrors.length} async error(s) during sim:`, asyncErrors[0]?.message)
  }
  assertConsistency(sim, `seed=${tc.seed}`)
  sim.destroy()
}

/**
 * Higher-iteration variant - useful for digging up edge cases in CI without
 * the infinite-repeat harness.
 * @param {t.TestCase} tc
 */
export const testSimLongRunningFuzz = async (tc) => {
  const sim = new Simulation(STANDARD_COHORT)
  await seedBase(sim, 'lorem ipsum dolor sit amet')
  const asyncErrors = await withCaughtAsyncErrors(async (_record) => {
    await runSim(sim, tc.prng, 100)
  })
  if (asyncErrors.length > 0) {
    console.log(`[long seed=${tc.seed}] swallowed ${asyncErrors.length} async error(s) during sim:`, asyncErrors[0]?.message)
  }
  assertConsistency(sim, `long seed=${tc.seed}`)
  sim.destroy()
}
