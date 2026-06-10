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
 * `view.dispatch` returns, every cascading observeDeep / AM-change /
 * appendTransaction has finished.
 */

import * as YPM from '@y/prosemirror'
import * as prng from 'lib0/prng'
import * as t from 'lib0/testing'
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

const MARK_NAMES = ['em', 'strong', 'code']

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
  applyTracedOp(cohort, { user: user.idx, op: 'addMark', args: { ...range, markName: prng.oneOf(gen, MARK_NAMES) } })
}

/**
 * @param {Cohort} cohort
 * @param {CohortUser} user
 * @param {prng.PRNG} gen
 */
const opRemoveMark = (cohort, user, gen) => {
  const range = randomRange(user.view.state.doc, gen)
  if (range == null) return
  applyTracedOp(cohort, { user: user.idx, op: 'removeMark', args: { ...range, markName: prng.oneOf(gen, MARK_NAMES) } })
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
 * DiffAttributionManager (view-suggestions / suggestion-mode); silently
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

// === Position mapping stress tests ===
//
// The sync-plugin's write path maps clean-coordinate diffs to attributed
// coordinates via `embedDeletedContent`. These fuzz tests bias toward the
// delete-then-edit-nearby pattern that exercises that mapping.

/**
 * Ops biased toward delete-then-insert/delete sequences within a single
 * suggestion-mode user. This stresses the inline position mapping path
 * where retains must skip over AM-deleted items.
 */
const DELETE_THEN_EDIT_OPS = [opDeleteRange, opDeleteRange, opInsertText, opInsertText, opInsertPlainText, opSplitBlock]

/**
 * Drive ops that bias toward delete-then-edit-nearby: each round picks a
 * suggestion-mode user, deletes a range, then immediately performs another
 * edit (insert/delete/split) on the same user's view.
 *
 * @param {Cohort} cohort
 * @param {prng.PRNG} gen
 * @param {number} rounds
 */
const runDeleteThenEditSim = (cohort, gen, rounds) => {
  const suggestionUsers = cohort.users.filter(u => u.mode === 'suggestion-mode')
  if (!suggestionUsers.length) return
  for (let i = 0; i < rounds; i++) {
    const user = prng.oneOf(gen, suggestionUsers)
    opDeleteRange(cohort, user, gen)
    const followUp = prng.oneOf(gen, DELETE_THEN_EDIT_OPS)
    followUp(cohort, user, gen)
    if (prng.bool(gen)) {
      const other = prng.oneOf(gen, cohort.users)
      const otherOp = prng.oneOf(gen, ALL_OPS)
      otherOp(cohort, other, gen)
    }
  }
}

/**
 * Fuzz: suggestion-mode user deletes then edits nearby, repeated with
 * varying seeds. Stresses the inline position mapping in the sync-plugin
 * write path.
 *
 * @param {TestCase} tc
 */
export const testRepeatDeleteThenEditNearby = (tc) => {
  const cohort = new Cohort(STANDARD_COHORT)
  cohort.seed('the quick brown fox jumps over the lazy dog')
  runDeleteThenEditSim(cohort, tc.prng, 15)
  assertCohortConsistency(cohort, `delete-then-edit seed=${tc.seed}`)
  cohort.destroy()
}

/**
 * Extended delete-then-edit fuzz with multi-paragraph content and more
 * rounds to stress block-level position mapping (paragraph deletions
 * followed by edits in neighboring paragraphs).
 *
 * @param {TestCase} tc
 */
export const testRepeatDeleteThenEditMultiParagraph = (tc) => {
  const cohort = new Cohort(STANDARD_COHORT)
  cohort.seed('first paragraph here')
  cohort.seed('second paragraph here')
  cohort.seed('third paragraph here')
  runDeleteThenEditSim(cohort, tc.prng, 20)
  assertCohortConsistency(cohort, `multi-para seed=${tc.seed}`)
  cohort.destroy()
}

// === Nested block and whole-block deletion fuzz ===

/**
 * Delete an entire top-level block by index.
 *
 * @param {Cohort} cohort
 * @param {import('./cohort.js').CohortUser} user
 * @param {prng.PRNG} gen
 */
const opDeleteBlock = (cohort, user, gen) => {
  const doc = user.view.state.doc
  if (doc.childCount === 0) return
  const blockIndex = prng.int32(gen, 0, doc.childCount - 1)
  applyTracedOp(cohort, { user: user.idx, op: 'deleteBlock', args: { blockIndex } })
}

/**
 * Wrap a random block range in a blockquote.
 *
 * @param {Cohort} cohort
 * @param {import('./cohort.js').CohortUser} user
 * @param {prng.PRNG} gen
 */
const opWrapInBlockquote = (cohort, user, gen) => {
  const doc = user.view.state.doc
  if (doc.childCount === 0) return
  const range = randomRange(doc, gen)
  if (!range) return
  applyTracedOp(cohort, { user: user.idx, op: 'wrapInBlockquote', args: range })
}

/**
 * Ops biased toward whole-block deletions mixed with text edits and
 * block structure changes (wraps, splits, paragraph inserts).
 */
const BLOCK_DELETE_OPS = [opDeleteBlock, opDeleteBlock, opInsertText, opDeleteRange, opSplitBlock, opInsertParagraph, opWrapInBlockquote]

/**
 * Drive ops that mix whole-block deletion with text edits and structural
 * changes. Each round picks a suggestion-mode user and performs a
 * block-level or text-level operation, optionally followed by a second
 * operation from any user.
 *
 * @param {Cohort} cohort
 * @param {prng.PRNG} gen
 * @param {number} rounds
 */
const runBlockDeleteSim = (cohort, gen, rounds) => {
  const suggestionUsers = cohort.users.filter(u => u.mode === 'suggestion-mode')
  if (!suggestionUsers.length) return
  for (let i = 0; i < rounds; i++) {
    const user = prng.oneOf(gen, suggestionUsers)
    const op = prng.oneOf(gen, BLOCK_DELETE_OPS)
    op(cohort, user, gen)
    if (prng.bool(gen)) {
      const other = prng.oneOf(gen, cohort.users)
      prng.oneOf(gen, ALL_OPS)(cohort, other, gen)
    }
  }
}

/**
 * Fuzz: mix of whole-paragraph deletions, text deletions, inserts, and
 * blockquote wrapping. Stresses both inline and block-level position
 * mapping in the sync-plugin write path.
 *
 * @param {TestCase} tc
 */
export const testRepeatBlockDeleteAndEditNearby = (tc) => {
  const cohort = new Cohort(STANDARD_COHORT)
  cohort.seed('alpha bravo charlie')
  cohort.seed('delta echo foxtrot')
  cohort.seed('golf hotel india')
  cohort.seed('juliet kilo lima')
  runBlockDeleteSim(cohort, tc.prng, 20)
  assertCohortConsistency(cohort, `block-delete seed=${tc.seed}`)
  cohort.destroy()
}

/**
 * Fuzz: nested block structures (blockquotes wrapping paragraphs) with
 * deletions and edits at multiple nesting levels.
 *
 * @param {TestCase} tc
 */
/**
 * Deterministic reproduction of step-based sync divergence:
 * blockquote-wrapped paragraphs + suggestion-mode insertText.
 */
/**
 * @param {TestCase} _tc
 */
export const testStepSyncDivergenceInBlockquote = (_tc) => {
  // Deterministic reproduction: blockquote wrapping + suggestion-mode insert
  // causes step-based sync to diverge between two suggestion-mode peers.
  const cohort = new Cohort(STANDARD_COHORT)
  cohort.seed('outer paragraph one')
  cohort.seed('outer paragraph two')
  cohort.seed('outer paragraph three')
  // doc is now: [p("outer paragraph three"), p("outer paragraph two"), p("outer paragraph one")]
  // Wrap all paragraphs in a blockquote via a no-suggestions user
  const baseUser = /** @type {import('./cohort.js').CohortUser} */ (cohort.users.find(u => u.mode === 'no-suggestions'))
  applyTracedOp(cohort, { user: baseUser.idx, op: 'wrapInBlockquote', args: { from: 1, to: baseUser.view.state.doc.content.size - 1 } })
  // doc is: blockquote([p("outer paragraph three"), p("outer paragraph two"), p("outer paragraph one")])
  // User 5 (suggestion-mode) inserts "d" into the third paragraph's text
  const user5 = cohort.users[5]
  t.assert(user5.mode === 'suggestion-mode')
  // p("outer paragraph three") = nodeSize 23, p("outer paragraph two") = nodeSize 21
  // pos 1 (bq open) + 23 (p1) + 21 (p2) + 1 (p3 open) + 1 (after "o") = 47
  applyTracedOp(cohort, { user: 5, op: 'insertText', args: { pos: 47, text: 'd' } })
  assertCohortConsistency(cohort, 'step-sync blockquote divergence')
  cohort.destroy()
}

/**
 * @param {TestCase} tc
 */
export const testRepeatNestedBlockDeleteAndEdit = (tc) => {
  const cohort = new Cohort(STANDARD_COHORT)
  cohort.seed('outer paragraph one')
  cohort.seed('outer paragraph two')
  cohort.seed('outer paragraph three')
  // Wrap the first two paragraphs in a blockquote using a no-suggestions user
  // so the structure is in the base doc
  const baseUser = cohort.users.find(u => u.mode === 'no-suggestions')
  if (baseUser) {
    opWrapInBlockquote(cohort, baseUser, tc.prng)
  }
  runBlockDeleteSim(cohort, tc.prng, 20)
  assertCohortConsistency(cohort, `nested-block seed=${tc.seed}`)
  cohort.destroy()
}
