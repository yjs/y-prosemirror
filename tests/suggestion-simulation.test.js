/**
 * Suggestion-mode collaboration fuzz tests.
 *
 * Drives a stream of randomly-chosen PM operations (insertText, delete,
 * format, split, …) against a multi-user `Cohort`, then asserts cross-peer
 * consistency. Each fuzz iteration is just:
 *
 *     pick a random user, pick a random op kind, randomise args, dispatch.
 *
 * The cohort plumbing (base/sugg docs, AMs, chain-sync), trace-op dispatch,
 * and consistency check all live in `./cohort.js`. This file is just the
 * per-iteration driver plus the small set of randomised arg pickers.
 *
 * Everything in y-prosemirror, `@y/y`, and lib0 is fully synchronous, so the
 * simulation does not yield to the event loop between ops - the moment
 * `view.dispatch` returns, every cascading observeDeep / renderer-change /
 * appendTransaction has finished.
 */

import * as YPM from '@y/prosemirror'
import * as prng from 'lib0/prng'
import { Cohort, applyTracedOp, assertCohortConsistency } from './cohort.js'

/** @typedef {import('lib0/testing').TestCase} TestCase */

// === Random arg pickers ===

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
 * Pick a random PM position in `[1, docSize-1]`. Returns null when the doc is
 * too small to contain a valid interior position.
 *
 * @param {import('prosemirror-model').Node} doc
 * @param {prng.PRNG} gen
 */
const randomPos = (doc, gen) => {
  const size = doc.content.size
  if (size <= 1) return null
  return prng.int32(gen, 1, size - 1)
}

/**
 * Pick a random `[from, to)` range with `from < to`.
 *
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
 * Pick a random mark for a traced op. `comment` excludes nothing, so several can
 * overlap on one span - we give it a small random id so runs exercise both
 * genuine overlaps (distinct ids) and exact-duplicate merges (same id). The
 * other marks self-exclude and carry no attrs.
 *
 * @param {prng.PRNG} gen
 * @return {{ markName: string, markAttrs?: Record<string, any> }}
 */
const randomMark = gen => {
  const markName = prng.oneOf(gen, MARK_NAMES)
  return markName === 'comment'
    ? { markName, markAttrs: { id: prng.int32(gen, 0, 5) } }
    : { markName }
}

// === Op pickers ===
//
// Each picker turns a (cohort, user, gen) tuple into a single `TracedOp`
// dispatch through `applyTracedOp`. They return early when the doc state can't
// support the op (empty doc, etc.) - the simulation tolerates skipped
// iterations.

// `Cohort` is already imported above as a value; TS uses the class as a type.
/** @typedef {import('./cohort.js').CohortUser} CohortUser */

/**
 * @param {Cohort} cohort
 * @param {CohortUser} user
 * @param {prng.PRNG} gen
 */
const opInsertText = (cohort, user, gen) => {
  const pos = randomPos(user.view.state.doc, gen)
  if (pos == null) return
  applyTracedOp(cohort, { user: user.idx, op: 'insertText', args: { pos, text: randomWord(gen, 5) } })
}

/**
 * Like `opInsertText`, but inserts via an explicit text node so we don't
 * inherit any active marks at the insertion position - useful for varying
 * mark behavior across runs.
 *
 * @param {Cohort} cohort
 * @param {CohortUser} user
 * @param {prng.PRNG} gen
 */
const opInsertPlainText = (cohort, user, gen) => {
  const pos = randomPos(user.view.state.doc, gen)
  if (pos == null) return
  applyTracedOp(cohort, { user: user.idx, op: 'insertPlainText', args: { pos, text: randomWord(gen, 5) } })
}

/**
 * @param {Cohort} cohort
 * @param {CohortUser} user
 * @param {prng.PRNG} gen
 */
const opDeleteRange = (cohort, user, gen) => {
  const range = randomRange(user.view.state.doc, gen)
  if (range == null) return
  applyTracedOp(cohort, { user: user.idx, op: 'deleteRange', args: range })
}

/**
 * @param {Cohort} cohort
 * @param {CohortUser} user
 * @param {prng.PRNG} gen
 */
const opAddMark = (cohort, user, gen) => {
  const range = randomRange(user.view.state.doc, gen)
  if (range == null) return
  applyTracedOp(cohort, { user: user.idx, op: 'addMark', args: { ...range, ...randomMark(gen) } })
}

/**
 * @param {Cohort} cohort
 * @param {CohortUser} user
 * @param {prng.PRNG} gen
 */
const opRemoveMark = (cohort, user, gen) => {
  const range = randomRange(user.view.state.doc, gen)
  if (range == null) return
  applyTracedOp(cohort, { user: user.idx, op: 'removeMark', args: { ...range, ...randomMark(gen) } })
}

/**
 * @param {Cohort} cohort
 * @param {CohortUser} user
 * @param {prng.PRNG} gen
 */
const opSplitBlock = (cohort, user, gen) => {
  const pos = randomPos(user.view.state.doc, gen)
  if (pos == null) return
  applyTracedOp(cohort, { user: user.idx, op: 'splitBlock', args: { pos } })
}

/**
 * Insert a fresh paragraph at a top-level position (0, after each direct
 * child, or end).
 *
 * @param {Cohort} cohort
 * @param {CohortUser} user
 * @param {prng.PRNG} gen
 */
const opInsertParagraph = (cohort, user, gen) => {
  const doc = user.view.state.doc
  const tops = [0]
  let acc = 0
  doc.forEach(child => {
    acc += child.nodeSize
    tops.push(acc)
  })
  applyTracedOp(cohort, { user: user.idx, op: 'insertParagraph', args: { pos: prng.oneOf(gen, tops), text: randomWord(gen, 4) } })
}

/**
 * Accept all pending suggestions. Only fires for users with a
 * DiffRenderer (view-suggestions / suggestion-mode); silently
 * skips no-suggestions users.
 *
 * @param {Cohort} _cohort
 * @param {CohortUser} user
 * @param {prng.PRNG} _gen
 */
const opAcceptAllChanges = (_cohort, user, _gen) => {
  YPM.acceptAllChanges()(user.view.state, user.view.dispatch)
}

/**
 * Reject all pending suggestions. Same user-mode filtering as accept.
 *
 * @param {Cohort} _cohort
 * @param {CohortUser} user
 * @param {prng.PRNG} _gen
 */
const opRejectAllChanges = (_cohort, user, _gen) => {
  YPM.rejectAllChanges()(user.view.state, user.view.dispatch)
}

const ALL_OPS = [opInsertText, opInsertPlainText, opDeleteRange, opAddMark, opRemoveMark, opSplitBlock, opInsertParagraph, opAcceptAllChanges, opRejectAllChanges]

/**
 * Drive `iterations` random ops against the cohort.
 *
 * @param {Cohort} cohort
 * @param {prng.PRNG} gen
 * @param {number} iterations
 */
const runSim = (cohort, gen, iterations) => {
  for (let i = 0; i < iterations; i++) {
    const user = prng.oneOf(gen, cohort.users)
    const op = prng.oneOf(gen, ALL_OPS)
    op(cohort, user, gen)
  }
}

/**
 * Standard six-user cohort: two of each mode.
 *
 * @type {Array<import('./cohort.js').UserMode>}
 */
const STANDARD_COHORT = [
  'no-suggestions', 'no-suggestions',
  'view-suggestions', 'view-suggestions',
  'suggestion-mode', 'suggestion-mode'
]

// === Tests ===

/**
 * Sanity check: the framework itself converges with no edits.
 * @param {TestCase} _tc
 */
export const testSimSetupConverges = (_tc) => {
  const cohort = new Cohort(STANDARD_COHORT)
  cohort.seed('hello world')
  assertCohortConsistency(cohort, 'init')
  cohort.destroy()
}

/**
 * Single deterministic edit by one suggestion-mode user; everyone in that mode
 * (and view-suggestions) must agree.
 * @param {TestCase} _tc
 */
export const testSimSingleSuggestionEditConverges = (_tc) => {
  const cohort = new Cohort(STANDARD_COHORT)
  cohort.seed('hello world')
  const sm = cohort.users.find(u => u.mode === 'suggestion-mode')
  if (!sm) throw new Error('no suggestion-mode user')
  sm.view.dispatch(sm.view.state.tr.insertText(' more', 12))
  assertCohortConsistency(cohort, 'after one suggestion insert')
  cohort.destroy()
}

/**
 * The headline fuzz test. Randomly drives 30 ops across 6 users and verifies
 * mode-internal consistency. The "repeat..." name prefix tells lib0/testing
 * to run it many times with new seeds, surfacing rare bugs.
 *
 * @param {TestCase} tc
 */
export const testRepeatGeneratingSuggestionEdits = (tc) => {
  const cohort = new Cohort(STANDARD_COHORT)
  cohort.seed('lorem ipsum dolor sit amet')
  runSim(cohort, tc.prng, 30)
  assertCohortConsistency(cohort, `seed=${tc.seed}`)
  cohort.destroy()
}

/**
 * Higher-iteration variant - useful for digging up edge cases in CI without
 * the infinite-repeat harness.
 *
 * @param {TestCase} tc
 */
export const testSimLongRunningFuzz = (tc) => {
  const cohort = new Cohort(STANDARD_COHORT)
  cohort.seed('lorem ipsum dolor sit amet')
  runSim(cohort, tc.prng, 100)
  assertCohortConsistency(cohort, `long seed=${tc.seed}`)
  cohort.destroy()
}
