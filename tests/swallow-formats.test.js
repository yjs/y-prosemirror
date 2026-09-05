/**
 * Tests for the `swallowFormats` pipeline stage
 * (`src/transformers/swallow-formats.js`) - the one-way gate that lets the
 * reserved `y-attributed-*` format keys flow data -> view only.
 *
 * Two tiers:
 *
 * 1. **Unit** - the transformer on its own (`swallowFormats($d).init()`), fed
 *    hand-built changes. Transformers are *owning* consumers of the delta they
 *    are handed, so every case builds a fresh private builder.
 * 2. **End-to-end** - a bound `EditorView`, checking that a pasted attribution
 *    mark is corrected away in the view and that nothing reaches the ytype.
 */

import * as t from 'lib0/testing'
import * as delta from 'lib0/delta'
import * as dpos from 'lib0/delta/position'
import * as Y from '@y/y'
import { swallowFormats, defaultSwallowedFormats } from '../src/transformers/swallow-formats.js'
import { createPMView, Cohort, assertCohortConsistency } from './cohort.js'
import { schema as complexSchema } from './complexSchema.js'

const PM_KEY = 'prosemirror'
const Y_INS = 'y-attributed-insert'

/**
 * A fresh transformer over `$deltaAny`.
 *
 * @param {Array<string>} [formats]
 */
const mkTransformer = (formats) => swallowFormats(delta.$deltaAny, formats).init()

/**
 * `d.toJSON()`, or `null` for an absent side - the shape every assertion here
 * compares.
 *
 * @param {any} d
 */
const json = d => d == null ? null : d.toJSON()

/**
 * No `y-attributed-*` format key anywhere in a ytype's stored content.
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

/**
 * Count nodes carrying `markName` anywhere in a PM doc.
 *
 * @param {import('prosemirror-model').Node} doc
 * @param {string} markName
 */
const countMarked = (doc, markName) => {
  let n = 0
  doc.descendants(node => {
    if (node.marks.some(m => m.type.name === markName)) n++
    return true
  })
  return n
}

// === Unit: the transformer on its own ===

/**
 * Data -> view is a pure passthrough: the rendered attribution formats reach
 * the view untouched, and nothing is sent back to the Y side.
 *
 * @param {t.TestCase} _tc
 */
export const testSwallowForwardsFormatsToTheView = _tc => {
  const tr = mkTransformer()
  const d = delta.create().retain(3, {
    bold: true,
    'y-attributed-insert': { userIds: ['a'], timestamp: 1 },
    'y-attributed-format': { userIds: ['b'] }
  }).done(false)
  const res = tr.applyA(/** @type {any} */ (d))
  t.compare(json(res.a), null, 'nothing flows back to the data side')
  t.compare(json(res.b), json(d), 'the change reaches the view verbatim')
}

/**
 * A view-side *removal* is swallowed whole: it is not written to Y (the
 * attribution lives there and is unchanged) and it is not pushed back at the
 * view either - re-asserting a mark the node may be unable to hold would loop
 * forever.
 *
 * @param {t.TestCase} _tc
 */
export const testSwallowRemovalIsSwallowed = _tc => {
  const tr = mkTransformer()
  const d = delta.create().retain(3, { [Y_INS]: null }).done(false)
  const res = tr.applyB(/** @type {any} */ (d))
  t.compare(json(res.a), null, 'nothing reaches the Y side')
  t.compare(json(res.b), null, 'the view is not corrected back')
}

/**
 * A view-side *addition* on existing content (a mark inherited from an
 * attributed neighborhood) is swallowed AND corrected away in the view.
 *
 * @param {t.TestCase} _tc
 */
export const testSwallowAdditionIsCorrected = _tc => {
  const tr = mkTransformer()
  const d = delta.create().retain(2).retain(3, { [Y_INS]: { userIds: ['a'] } }).done(false)
  const res = tr.applyB(/** @type {any} */ (d))
  t.compare(json(res.a), null, 'nothing reaches the Y side')
  t.compare(
    json(res.b),
    json(delta.create().retain(2).retain(3, { [Y_INS]: null }).done(false)),
    'the view is corrected at exactly that range'
  )
}

/**
 * Pasted content: the keys are stripped off the insert before it reaches Y,
 * and the correction removes them from the view - recursively, so a mark
 * buried inside an inserted subtree is cleared too.
 *
 * @param {t.TestCase} _tc
 */
export const testSwallowPastedContentIsCorrected = _tc => {
  const tr = mkTransformer()
  const child = delta.create('paragraph').insert('hi', { [Y_INS]: { userIds: ['a'] } }).done(false)
  const d = delta.create()
    .insert('xy', { bold: true, [Y_INS]: { userIds: ['a'] } })
    .insert([(child)])
    .done(false)
  const res = tr.applyB(/** @type {any} */ (d))
  const expectedA = delta.create()
    .insert('xy', { bold: true })
    .insert([(delta.create('paragraph').insert('hi').done(false))])
    .done(false)
  t.compare(json(res.a), json(expectedA), 'the keys never reach the Y side')
  const expectedB = delta.create()
    .retain(2, { [Y_INS]: null })
    .modify(/** @type {any} */ (delta.create().retain(2, { [Y_INS]: null }).done(false)))
    .done(false)
  t.compare(json(res.b), json(expectedB), 'the view is corrected, nested content included')
}

/**
 * A change that also carries a real edit still reaches Y - only the swallowed
 * keys are taken out of it.
 *
 * @param {t.TestCase} _tc
 */
export const testSwallowKeepsRealEdits = _tc => {
  const tr = mkTransformer()
  const d = delta.create()
    .retain(2, { [Y_INS]: null })
    .insert('abc')
    .retain(1, { bold: true, [Y_INS]: { userIds: ['a'] } })
    .delete(2)
    .done(false)
  const res = tr.applyB(/** @type {any} */ (d))
  t.compare(
    json(res.a),
    json(delta.create().retain(2).insert('abc').retain(1, { bold: true }).delete(2).done(false)),
    'the text edit survives, the attribution keys do not'
  )
  t.compare(
    json(res.b),
    json(delta.create().retain(2).retain(3).retain(1, { [Y_INS]: null }).done(false)),
    'only the added key is corrected, in post-change coordinates'
  )
}

/**
 * A `modify` op recurses on both sides, and a node-level `y-attributed-attrs`
 * addition on the parent op is corrected like any other.
 *
 * @param {t.TestCase} _tc
 */
export const testSwallowRecursesIntoModify = _tc => {
  const tr = mkTransformer()
  const inner = delta.create().retain(1, { [Y_INS]: { userIds: ['a'] } }).insert('q').done(false)
  const d = delta.create()
    .modify(/** @type {any} */ (inner), { 'y-attributed-attrs': { level: { userIds: ['a'] } } })
    .done(false)
  const res = tr.applyB(/** @type {any} */ (d))
  t.compare(
    json(res.a),
    json(delta.create().modify(/** @type {any} */ (delta.create().retain(1).insert('q').done(false))).done(false)),
    'the nested key is stripped, the nested insert survives'
  )
  t.compare(
    json(res.b),
    json(delta.create().modify(
      /** @type {any} */ (delta.create().retain(1, { [Y_INS]: null }).retain(1).done(false)),
      { 'y-attributed-attrs': null }
    ).done(false)),
    'both the node-level and the nested addition are corrected'
  )
}

/**
 * The swallowed list is configurable: keys outside it are ordinary formats and
 * round-trip to Y untouched.
 *
 * @param {t.TestCase} _tc
 */
export const testSwallowCustomFormatList = _tc => {
  const tr = mkTransformer(['my-render-only'])
  const d = delta.create()
    .retain(1, { 'my-render-only': { x: 1 }, [Y_INS]: { userIds: ['a'] } })
    .done(false)
  const res = tr.applyB(/** @type {any} */ (d))
  t.compare(
    json(res.a),
    json(delta.create().retain(1, { [Y_INS]: { userIds: ['a'] } }).done(false)),
    'an unlisted key is an ordinary format and reaches Y'
  )
  t.compare(
    json(res.b),
    json(delta.create().retain(1, { 'my-render-only': null }).done(false)),
    'only the listed key is corrected away'
  )
  t.compare(
    defaultSwallowedFormats,
    ['y-attributed-insert', 'y-attributed-delete', 'y-attributed-format', 'y-attributed-attrs'],
    'the default list is the reserved attribution namespace'
  )
}

/**
 * The "nothing left worth sending" shortcut may only fire on a change that is
 * pure positioning: node attributes and root (cursor) marks keep it alive.
 *
 * @param {t.TestCase} _tc
 */
export const testSwallowKeepsAttrsAndMarks = _tc => {
  const withAttr = delta.create().setAttr('level', 2).retain(3, { [Y_INS]: null }).done(false)
  t.compare(
    json(mkTransformer().applyB(/** @type {any} */ (withAttr)).a),
    json(delta.create().setAttr('level', 2).retain(3).done(false)),
    'an attr change survives the swallow'
  )
  const withMark = /** @type {any} */ (delta.create())
  withMark.addMark(dpos.create([1]), 'cursor-1')
  withMark.retain(3, { [Y_INS]: null })
  withMark.done(false)
  const res = mkTransformer().applyB(withMark)
  t.assert(res.a != null && res.a.marks !== null && res.a.marks.size === 1, 'a cursor mark survives the swallow')
}

// === End-to-end: through a bound view ===

/**
 * Attribution marks pasted into the editor (here: text inserted with the mark
 * already on it) are corrected away by the binding and never reach the ytype.
 *
 * @param {t.TestCase} _tc
 */
export const testSwallowPastedMarkIsRemovedFromView = _tc => {
  const ydoc = new Y.Doc({ gc: false })
  ydoc.get(PM_KEY).applyDelta(
    delta.create().insert([delta.create('paragraph', {}, 'hello')]).done()
  )
  const view = createPMView(ydoc.get(PM_KEY))
  try {
    const mark = complexSchema.marks[Y_INS].create({ userIds: ['pasted'], timestamp: 1 })
    view.dispatch(view.state.tr.insert(3, complexSchema.text('XY', [mark])))
    t.assert(view.state.doc.textContent === 'heXYllo', 'the pasted text itself is kept')
    t.compare(countMarked(view.state.doc, Y_INS), 0, 'the pasted attribution mark is corrected away')
    assertNoAttributionLeak(/** @type {any} */ (ydoc.get(PM_KEY).toDeltaDeep()), 'ydoc')
  } finally {
    view.destroy()
  }
}

/**
 * A node whose schema forbids the attribution marks (`code_block` declares
 * `marks: ''`): the render's marks are dropped by ProseMirror, the loss comes
 * back as a fix, and the stage swallows it - the fix loop terminates and the
 * ytype stays clean. (The forward leg still materializes the mark through
 * `createAndFill`; that is the separate known issue pinned as
 * `testRdtKnownIssueCodeBlockAttribution` in `prosemirror-rdt.test.js`, so
 * this test deliberately does not call `doc.check()`.)
 *
 * @param {t.TestCase} _tc
 */
export const testSwallowSchemaForbiddenMark = _tc => {
  const cohort = new Cohort(['no-suggestions', 'suggestion-mode'])
  try {
    cohort.seed('lorem ipsum')
    const base = cohort.user(0)
    base.view.dispatch(base.view.state.tr.setNodeMarkup(0, complexSchema.nodes.code_block, null))
    const sm = cohort.user(1)
    sm.view.dispatch(sm.view.state.tr.insertText('XYZ', 3))
    // reaching this line at all is the assertion: an unswallowed format-clear
    // would keep the binding's fix loop going forever
    t.assert(sm.view.state.doc.textContent.includes('XYZ'), 'the suggested insert landed')
    assertNoAttributionLeak(/** @type {any} */ (cohort.baseDoc.get(PM_KEY).toDeltaDeep()), 'baseDoc')
    assertCohortConsistency(cohort, 'code_block suggestion insert')
  } finally {
    cohort.destroy()
  }
}
