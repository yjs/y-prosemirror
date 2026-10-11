/**
 * The format attribution a span's own insert or delete attribution implies is
 * not rendered: a user who inserts (or deletes) a span and formats it leaves
 * `{ insert: ['A'], format: { strong: ['A'] } }` on it, and we render the
 * insert mark alone. See `dropImpliedFormatAttribution` (src/sync-utils.js)
 * and ATTRIBUTION.md.
 */

import * as YPM from '@y/prosemirror'
import * as Y from '@y/y'
import * as array from 'lib0/array'
import * as delta from 'lib0/delta'
import * as t from 'lib0/testing'
import { schema } from './complexSchema.js'
import { createPMView, setupTwoWaySync } from './cohort.js'

const PM_KEY = 'prosemirror'

// === Expected-JSON helpers ===

const em = { type: 'em' }
const strong = { type: 'strong' }

/**
 * @param {Array<string>} userIds
 */
const insertMark = userIds => ({ type: 'y-attributed-insert', attrs: { userIds, timestamp: null } })

/**
 * @param {Array<string>} userIds
 */
const deleteMark = userIds => ({ type: 'y-attributed-delete', attrs: { userIds, timestamp: null } })

/**
 * @param {Record<string, Array<string>>} userIdsByAttr
 */
const formatMark = userIdsByAttr => ({
  type: 'y-attributed-format',
  attrs: { userIds: array.unique(Object.values(userIdsByAttr).flat()), userIdsByAttr, timestamp: null }
})

/**
 * @param {string} text
 * @param {Array<any>} [marks]
 */
const txt = (text, marks) => marks == null ? { type: 'text', text } : { type: 'text', text, marks }

/**
 * @param {Array<any>} content
 */
const paragraphDoc = content => ({ type: 'doc', content: [{ type: 'paragraph', content }] })

/**
 * JSON round-trip before comparing: PM creates mark attrs with a null
 * prototype, which `t.compare` rejects against plain objects.
 *
 * @param {import('prosemirror-model').Node} doc
 * @param {object} expected
 * @param {string} message
 */
const assertDocJSON = (doc, expected, message) => {
  t.compare(JSON.parse(JSON.stringify(doc.toJSON())), expected, message)
}

/**
 * @param {Array<import('prosemirror-view').EditorView>} views
 * @param {object} expected
 * @param {string} message
 */
const assertAllViews = (views, expected, message) => {
  views.forEach((view, i) => assertDocJSON(view.state.doc, expected, `${message} (view ${i})`))
}

// === Harness ===

/**
 * The suggestion architecture with named users:
 *
 *     base (client 0)
 *       <- rViewer (view suggestions)  -> viewerDoc (client 1)
 *       <- rA      (suggestion mode)   -> docA      (client 2, user 'A')
 *       <- rB      (suggestion mode)   -> docB      (client 3, user 'B')
 *
 * One content map attributes every id of client 2 to 'A' and of client 3 to
 * 'B'. The `deletes` map is keyed by the ids of the *deleted content*, so
 * base content (client 0) deleted in a suggestion doc is attributed to the
 * deleter 'A'; only 'A' deletes in these tests.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.anonymous] use an empty content map (every user id is `[]`)
 */
const createNamedSetup = ({ anonymous = false } = {}) => {
  const base = new Y.Doc({ gc: false, guid: 'base' })
  base.clientID = 0
  const viewerDoc = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'viewer' })
  viewerDoc.clientID = 1
  const docA = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'a' })
  docA.clientID = 2
  const docB = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'b' })
  docB.clientID = 3

  const attrs = Y.createContentMap()
  if (!anonymous) {
    attrs.inserts.add(2, 0, 2 ** 30, [Y.createContentAttribute('insert', 'A')])
    attrs.inserts.add(3, 0, 2 ** 30, [Y.createContentAttribute('insert', 'B')])
    attrs.deletes.add(0, 0, 2 ** 30, [Y.createContentAttribute('delete', 'A')])
  }
  const rViewer = Y.createDiffRenderer(base, viewerDoc, { attributions: attrs })
  rViewer.suggestionMode = false
  const rA = Y.createDiffRenderer(base, docA, { attributions: attrs })
  rA.suggestionMode = true
  const rB = Y.createDiffRenderer(base, docB, { attributions: attrs })
  rB.suggestionMode = true

  setupTwoWaySync(viewerDoc, docA)
  setupTwoWaySync(docA, docB)

  /** @type {Array<Error>} */
  const internalErrors = []
  /** @type {(err: Error, errCode: number) => any} */
  const onInternalError = err => { internalErrors.push(err) }
  const viewOpts = { schema, onInternalError }

  const baseView = createPMView(base.get(PM_KEY), null, viewOpts)
  const viewer = createPMView(viewerDoc.get(PM_KEY), rViewer, viewOpts)
  const viewA = createPMView(docA.get(PM_KEY), rA, viewOpts)
  const viewB = createPMView(docB.get(PM_KEY), rB, viewOpts)

  base.get(PM_KEY).applyDelta(
    delta.create().insert([delta.create('paragraph', {}, 'hello world')]).done()
  )

  /**
   * Every suggestion-rendering view: the pure viewer plus both suggestion-mode
   * editors. They must always agree.
   */
  const suggestionViews = [viewer, viewA, viewB]

  /**
   * A fresh hydration of the viewer doc must equal the live viewer, and the
   * standalone conversion must render the same document.
   *
   * @param {string} message
   */
  const assertFixpoint = (message) => {
    const rendered = YPM.ynodeToPmnode(viewerDoc.get(PM_KEY), schema, { renderer: rViewer })
    t.assert(rendered.eq(viewer.state.doc), `${message}: ynodeToPmnode renders what the viewer shows`)
    const fresh = createPMView(viewerDoc.get(PM_KEY), rViewer, viewOpts)
    t.assert(fresh.state.doc.eq(viewer.state.doc), `${message}: fresh hydration matches steady state`)
    fresh.destroy()
    t.assert(internalErrors.length === 0, `${message}: no internal errors`)
  }

  return { base, viewerDoc, docA, docB, rViewer, rA, rB, baseView, viewer, viewA, viewB, suggestionViews, internalErrors, assertFixpoint }
}

// `'hello world'` sits at 1..12; `'hello '` is 1..7, `'world'` 7..12.
const NEW_FROM = 7
const NEW_TO = 11 // after `insertText('new ', 7)`: `'hello new world'`, `'new '` at 7..11

// === Pure helper ===

/**
 * The rule as a table: which `format` keys the insert/delete attribution
 * implies, what survives, and that the input is never mutated.
 *
 * @param {t.TestCase} _tc
 */
export const testDropImpliedFormatAttributionTable = _tc => {
  /** @type {Array<[any, any, string]>} */
  const cases = [
    [{ format: { strong: ['A'] } }, 'same', 'no insert or delete: untouched'],
    [{ insert: ['A'], format: { strong: ['A'] } }, { insert: ['A'] }, 'inserter formatted: dropped'],
    [{ insert: ['A'], format: { strong: [] } }, { insert: ['A'] }, 'anonymous format on an attributed insert: dropped'],
    [{ insert: [], format: { strong: [] } }, { insert: [] }, 'anonymous everything: dropped'],
    [{ insert: [], format: { strong: ['A'] } }, 'same', 'named format on an anonymous insert: untouched'],
    [{ insert: ['A'], format: { strong: ['A', 'B'] } }, 'same', 'another user shares the key: untouched, user list included'],
    [{ insert: ['A', 'B'], format: { strong: ['B'] } }, { insert: ['A', 'B'] }, 'one of several inserters formatted: dropped'],
    [{ insert: ['A'], insertAt: 1, formatAt: 2, format: { strong: ['A'], em: ['B'] } }, { insert: ['A'], insertAt: 1, formatAt: 2, format: { em: ['B'] } }, 'mixed keys: only the implied key goes, formatAt stays'],
    [{ insert: ['A'], insertAt: 1, formatAt: 2, format: { strong: ['A'] } }, { insert: ['A'], insertAt: 1 }, 'nothing survives: format and formatAt go'],
    [{ delete: ['A'], format: { em: ['A'] } }, { delete: ['A'] }, 'deleter formatted: dropped'],
    [{ delete: ['A'], format: { em: ['B'] } }, 'same', 'someone else formatted a pending delete: untouched'],
    [{ delete: [], format: { em: [] } }, { delete: [] }, 'anonymous pending delete: dropped'],
    [{ insert: ['A'], delete: ['B'], format: { em: ['B'] } }, { insert: ['A'], delete: ['B'] }, 'actors are the union of inserters and deleters'],
    [{ insert: ['A'] }, 'same', 'no format: untouched']
  ]
  cases.forEach(([input, expected, message]) => {
    const frozen = JSON.parse(JSON.stringify(input))
    const out = YPM.dropImpliedFormatAttribution(input)
    if (expected === 'same') {
      t.assert(out === input, `${message} (identity)`)
    } else {
      t.compare(out, expected, message)
    }
    t.compare(input, frozen, `${message} (input not mutated)`)
  })
}

/**
 * The adapter every mapper goes through applies the rule before the mapper
 * runs: the format handler clears the mark for an implied format, the insert
 * handler is unaffected, and an instruction-form attribution (an accepted
 * insert, `insert: null`) still renders another user's format.
 *
 * @param {t.TestCase} _tc
 */
export const testAdapterAppliesTheRule = _tc => {
  const conf = YPM.attributionMapperToConf(YPM.defaultMapAttributionToMark)
  const implied = { insert: ['A'], format: { strong: ['A'] } }
  t.assert(/** @type {any} */ (conf).format(implied) === null, 'implied format clears the format mark')
  t.compare(/** @type {any} */ (conf).insert(implied), { userIds: ['A'], timestamp: null }, 'insert mark unaffected')
  t.compare(
    /** @type {any} */ (conf).format({ insert: null, format: { strong: ['B'] } }),
    { userIds: ['B'], userIdsByAttr: { strong: ['B'] }, timestamp: null },
    'after the insert is accepted, the other user\'s format renders'
  )
  t.compare(
    /** @type {any} */ (conf).format({ insert: ['A'], format: { strong: ['A'], em: ['B'] } }),
    { userIds: ['B'], userIdsByAttr: { em: ['B'] }, timestamp: null },
    'only the surviving key is rendered'
  )
}

// === Suggestion mode ===

/**
 * A inserts text and bolds it: the inserter's format is implied, so every
 * suggestion view renders the insert mark alone.
 *
 * @param {t.TestCase} _tc
 */
export const testInserterFormatRendersInsertMarkOnly = _tc => {
  const { viewA, suggestionViews, assertFixpoint } = createNamedSetup()
  viewA.dispatch(viewA.state.tr.insertText('new ', NEW_FROM))
  viewA.dispatch(viewA.state.tr.addMark(NEW_FROM, NEW_TO, schema.marks.strong.create()))
  assertAllViews(suggestionViews, paragraphDoc([
    txt('hello '),
    txt('new ', [strong, insertMark(['A'])]),
    txt('world')
  ]), 'inserter-formatted span carries the insert mark only')
  assertFixpoint('inserter format')
}

/**
 * B italicizes A's pending insertion: that is B's own suggestion, so both
 * marks render, with only B's key in the format mark.
 *
 * @param {t.TestCase} _tc
 */
export const testOtherUserFormatOnPendingInsertKeepsBothMarks = _tc => {
  const { viewA, viewB, suggestionViews, assertFixpoint } = createNamedSetup()
  viewA.dispatch(viewA.state.tr.insertText('new ', NEW_FROM))
  viewA.dispatch(viewA.state.tr.addMark(NEW_FROM, NEW_TO, schema.marks.strong.create()))
  viewB.dispatch(viewB.state.tr.addMark(NEW_FROM, NEW_TO, schema.marks.em.create()))
  assertAllViews(suggestionViews, paragraphDoc([
    txt('hello '),
    txt('new ', [em, strong, insertMark(['A']), formatMark({ em: ['B'] })]),
    txt('world')
  ]), 'another user\'s format on a pending insert renders both marks')
  assertFixpoint('other user format on insert')
}

/**
 * A bolds base text: nothing implies that format, so the format mark renders.
 *
 * @param {t.TestCase} _tc
 */
export const testInserterFormatOnBaseTextRendersFormatMark = _tc => {
  const { viewA, suggestionViews, assertFixpoint } = createNamedSetup()
  viewA.dispatch(viewA.state.tr.addMark(1, 6, schema.marks.strong.create()))
  assertAllViews(suggestionViews, paragraphDoc([
    txt('hello', [strong, formatMark({ strong: ['A'] })]),
    txt(' world')
  ]), 'format on base text renders the format mark')
  assertFixpoint('format on base text')
}

/**
 * A bolds base text and then deletes it: the deleter's format is implied by
 * the pending delete, so the span renders the delete mark alone.
 *
 * @param {t.TestCase} _tc
 */
export const testDeleterFormatRendersDeleteMarkOnly = _tc => {
  const { viewA, suggestionViews, assertFixpoint } = createNamedSetup()
  viewA.dispatch(viewA.state.tr.addMark(1, 6, schema.marks.strong.create()))
  viewA.dispatch(viewA.state.tr.delete(1, 6))
  assertAllViews(suggestionViews, paragraphDoc([
    txt('hello', [strong, deleteMark(['A'])]),
    txt(' world')
  ]), 'deleter-formatted pending delete carries the delete mark only')
  assertFixpoint('deleter format')
}

/**
 * B bolds base text and A deletes it: B's format is a suggestion of its own
 * and stays visible next to the delete mark.
 *
 * @param {t.TestCase} _tc
 */
export const testOtherUserFormatOnPendingDeleteKeepsBothMarks = _tc => {
  const { viewA, viewB, suggestionViews, assertFixpoint } = createNamedSetup()
  viewB.dispatch(viewB.state.tr.addMark(1, 6, schema.marks.strong.create()))
  viewA.dispatch(viewA.state.tr.delete(1, 6))
  assertAllViews(suggestionViews, paragraphDoc([
    txt('hello', [strong, deleteMark(['A']), formatMark({ strong: ['B'] })]),
    txt(' world')
  ]), 'another user\'s format on a pending delete renders both marks')
  assertFixpoint('other user format on delete')
}

/**
 * Accepting everything resolves the insertion together with its formatting:
 * the bold text becomes base content without any attribution mark.
 *
 * @param {t.TestCase} _tc
 */
export const testAcceptAllClearsMarksAndKeepsFixpoint = _tc => {
  const { viewA, viewer, baseView, suggestionViews, assertFixpoint } = createNamedSetup()
  viewA.dispatch(viewA.state.tr.insertText('new ', NEW_FROM))
  viewA.dispatch(viewA.state.tr.addMark(NEW_FROM, NEW_TO, schema.marks.strong.create()))
  assertFixpoint('before accept')
  YPM.acceptAllChanges()(viewer.state, viewer.dispatch)
  const accepted = paragraphDoc([txt('hello '), txt('new ', [strong]), txt('world')])
  assertAllViews(suggestionViews, accepted, 'accepted: bold text without marks')
  assertDocJSON(baseView.state.doc, accepted, 'base received the bold insertion')
  assertFixpoint('after accept')
}

/**
 * A inserts and bolds, B italicizes the whole paragraph. Accepting A's range
 * accepts A's text and bold together; B's italic stays a suggestion, and it
 * now shows on the accepted span too (the format attribution is no longer
 * implied once the insert attribution is gone).
 *
 * @param {t.TestCase} _tc
 */
export const testPartialAcceptLeavesOtherUsersFormat = _tc => {
  const { viewA, viewB, viewer, suggestionViews, assertFixpoint } = createNamedSetup()
  viewA.dispatch(viewA.state.tr.insertText('new ', NEW_FROM))
  viewA.dispatch(viewA.state.tr.addMark(NEW_FROM, NEW_TO, schema.marks.strong.create()))
  viewB.dispatch(viewB.state.tr.addMark(1, 16, schema.marks.em.create()))
  assertAllViews(suggestionViews, paragraphDoc([
    txt('hello ', [em, formatMark({ em: ['B'] })]),
    txt('new ', [em, strong, insertMark(['A']), formatMark({ em: ['B'] })]),
    txt('world', [em, formatMark({ em: ['B'] })])
  ]), 'before the partial accept')
  YPM.acceptChanges(NEW_FROM, NEW_TO)(viewer.state, viewer.dispatch)
  assertAllViews(suggestionViews, paragraphDoc([
    txt('hello ', [em, formatMark({ em: ['B'] })]),
    txt('new ', [em, strong, formatMark({ em: ['B'] })]),
    txt('world', [em, formatMark({ em: ['B'] })])
  ]), 'after accepting A\'s insertion, B\'s format shows on it')
  assertFixpoint('partial accept')
}

/**
 * Rejecting the insertion removes the text with its formatting.
 *
 * @param {t.TestCase} _tc
 */
export const testRejectRangeClearsMarks = _tc => {
  const { viewA, viewer, baseView, suggestionViews, assertFixpoint } = createNamedSetup()
  viewA.dispatch(viewA.state.tr.insertText('new ', NEW_FROM))
  viewA.dispatch(viewA.state.tr.addMark(NEW_FROM, NEW_TO, schema.marks.strong.create()))
  YPM.rejectChanges(NEW_FROM, NEW_TO)(viewer.state, viewer.dispatch)
  const rejected = paragraphDoc([txt('hello world')])
  assertAllViews(suggestionViews, rejected, 'rejected: the insertion is gone')
  assertDocJSON(baseView.state.doc, rejected, 'base unchanged')
  assertFixpoint('reject')
}

/**
 * Without an `attributions` map every user id is `[]`: inserter and formatter
 * cannot be told apart, so any format on a pending insert is implied, even one
 * another peer added.
 *
 * @param {t.TestCase} _tc
 */
export const testAnonymousSuggestionsCollapseFormatOnPendingInsert = _tc => {
  const { viewA, viewB, suggestionViews, assertFixpoint } = createNamedSetup({ anonymous: true })
  viewA.dispatch(viewA.state.tr.insertText('new ', NEW_FROM))
  viewA.dispatch(viewA.state.tr.addMark(NEW_FROM, NEW_TO, schema.marks.strong.create()))
  assertAllViews(suggestionViews, paragraphDoc([
    txt('hello '),
    txt('new ', [strong, insertMark([])]),
    txt('world')
  ]), 'anonymous inserter format: insert mark only')
  viewB.dispatch(viewB.state.tr.addMark(NEW_FROM, NEW_TO, schema.marks.em.create()))
  assertAllViews(suggestionViews, paragraphDoc([
    txt('hello '),
    txt('new ', [em, strong, insertMark([])]),
    txt('world')
  ]), 'anonymous peer format on a pending insert is implied too')
  viewB.dispatch(viewB.state.tr.addMark(1, 6, schema.marks.em.create()))
  assertAllViews(suggestionViews, paragraphDoc([
    txt('hello', [em, formatMark({ em: [] })]),
    txt(' '),
    txt('new ', [em, strong, insertMark([])]),
    txt('world')
  ]), 'anonymous format on base text still renders')
  assertFixpoint('anonymous')
}

/**
 * An inserted inline node the inserter also formatted carries the insert
 * mark alone, like text.
 *
 * @param {t.TestCase} _tc
 */
export const testInserterFormatOnInsertedInlineNode = _tc => {
  const { viewA, suggestionViews, assertFixpoint } = createNamedSetup()
  viewA.dispatch(viewA.state.tr.insert(NEW_FROM, schema.nodes.image.create({ src: 'x.png' })))
  viewA.dispatch(viewA.state.tr.addMark(NEW_FROM, NEW_FROM + 1, schema.marks.strong.create()))
  assertAllViews(suggestionViews, paragraphDoc([
    txt('hello '),
    { type: 'image', attrs: { src: 'x.png', alt: null, title: null }, marks: [strong, insertMark(['A'])] },
    txt('world')
  ]), 'inserted inline node with the inserter\'s format: insert mark only')
  assertFixpoint('inline node')
}

// === Version rendering ===

/**
 * The same rule on the version-diff path (`AttributionsRenderer` through
 * `ynodeToPmnode`): A wrote and bolded the paragraph, B italicized 'hello',
 * A italicized and deleted 'world'. The paragraph node itself carries A's
 * insert node mark; the renderer shows the deleted span without its format.
 *
 * @param {t.TestCase} _tc
 */
export const testVersionRenderingDropsImpliedFormat = _tc => {
  const doc = new Y.Doc({ gc: false })
  const ytype = doc.get(PM_KEY)
  doc.clientID = 1
  ytype.applyDelta(delta.create().insert([delta.create('paragraph', {}, 'hello new world')]).done())
  // 'hello' 0..5, ' ' 5, 'new ' 6..10, 'world' 10..15
  ytype.applyDelta(delta.create().modify(delta.create().retain(6).retain(4, { strong: true })).done())
  ytype.applyDelta(delta.create().modify(delta.create().retain(10).retain(5, { em: true })).done())
  ytype.applyDelta(delta.create().modify(delta.create().retain(10).delete(5)).done())
  doc.clientID = 2
  ytype.applyDelta(delta.create().modify(delta.create().retain(5, { em: true })).done())

  /**
   * @param {Array<any>} helloMarks
   */
  const expected = helloMarks => ({
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [
        txt('hello', helloMarks),
        txt(' ', [insertMark(['A'])]),
        txt('new ', [strong, insertMark(['A'])]),
        txt('world', [deleteMark(['A'])])
      ],
      marks: [insertMark(['A'])]
    }]
  })

  const attrs = Y.createContentMap()
  attrs.inserts.add(1, 0, 2 ** 30, [Y.createContentAttribute('insert', 'A')])
  attrs.inserts.add(2, 0, 2 ** 30, [Y.createContentAttribute('insert', 'B')])
  attrs.deletes.add(1, 0, 2 ** 30, [Y.createContentAttribute('delete', 'A')])
  const rendered = YPM.ynodeToPmnode(ytype, schema, { renderer: Y.createAttributionsRenderer(attrs) })
  assertDocJSON(
    rendered,
    expected([em, insertMark(['A']), formatMark({ em: ['B'] })]),
    'version rendering: implied formats dropped, B\'s format kept'
  )

  // everything attributed to one user: nothing but insert and delete marks remain
  const all = Y.createContentMapFromContentIds(
    Y.createContentIdsFromDoc(doc, false),
    [Y.createContentAttribute('insert', 'A')],
    [Y.createContentAttribute('delete', 'A')]
  )
  const renderedAll = YPM.ynodeToPmnode(ytype, schema, { renderer: Y.createAttributionsRenderer(all) })
  assertDocJSON(
    renderedAll,
    expected([em, insertMark(['A'])]),
    'version rendering with a single author: insert and delete marks only'
  )
}
