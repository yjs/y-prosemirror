// @ts-nocheck
import * as t from 'lib0/testing'
import { EditorState } from 'prosemirror-state'
import { deltaPathToPm, deltaToPSteps, pmToDeltaPath, stepToDelta, trToDelta } from '../src/sync-utils.js'
import { schema, testBuilders } from './complexSchema.js'

/**
 * A custom node comparator which ignores ychange attributes
 * @param {import('prosemirror-model').Node} a
 * @param {import('prosemirror-model').Node} b
 */
function compareNodes (a, b) {
  t.compare(a.type, b.type, 'types are not the same')
  t.compare({
    ...a.attrs,
    ychange: undefined
  }, {
    ...b.attrs,
    ychange: undefined
  }, 'attrs are not the same')
  t.compare(a.content.content.length, b.content.content.length, 'content lengths are not the same')
  for (let i = 0; i < a.content.content.length; i++) {
    compareNodes(a.content.content[i], b.content.content[i])
  }
  t.compare(a.text, b.text, 'text is not the same')
  t.compare(a.marks.length, b.marks.length, 'marks lengths are not the same')
  for (let i = 0; i < a.marks.length; i++) {
    t.compare(a.marks[i].type, b.marks[i].type, 'marks types are not the same')
    t.compare({
      ...a.marks[i].attrs,
      ychange: undefined
    }, {
      ...b.marks[i].attrs,
      ychange: undefined
    }, 'marks attrs are not the same')
  }
}

/**
 * Verify that trToDelta produces a delta that roundtrips to the correct doc.
 * @param {import('prosemirror-state').EditorState} state
 * @param {import('prosemirror-state').Transaction} tr
 */
function verifyTrRoundtrip (state, tr) {
  const generatedDelta = trToDelta(tr)
  compareNodes(deltaToPSteps(state.tr, generatedDelta).doc, tr.doc)
}

/**
 * Verify that stepToDelta produces a delta that roundtrips to the correct doc.
 * @param {import('prosemirror-state').EditorState} state
 * @param {import('prosemirror-state').Transaction} tr
 */
function verifyStepRoundtrip (state, tr) {
  t.compare(tr.steps.length, 1, 'expected exactly one step')
  const generatedDelta = stepToDelta(tr.steps[0], tr.before)
  t.assert(deltaToPSteps(state.tr, generatedDelta).doc.eq(tr.doc), 'deltaToPSteps produced an incorrect document')
}

/**
 * @param {t.TestCase} _tc
 */
export function testReplaceStepToDelta (_tc) {
  const doc = testBuilders.doc(
    testBuilders.paragraph('<a>first<b> paragraph<c>'),
    testBuilders.paragraph('second<d> paragraph'),
    testBuilders.blockquote(testBuilders.paragraph('<e>in blockquote<f>')),
    testBuilders.paragraph('<g>fourth<h> paragraph'),
    testBuilders.paragraph('fifth<i> paragraph')
  )

  const state = EditorState.create({
    schema,
    doc
  })

  t.group('insert text at start of element', () => {
    const tr = state.tr
    tr.insertText('A', doc.tag.a)
    verifyTrRoundtrip(state, tr)
  })

  t.group('insert text in the middle of an element', () => {
    const tr = state.tr
    tr.insertText('B', doc.tag.b)
    verifyTrRoundtrip(state, tr)
  })

  t.group('insert text range in the middle of an element', () => {
    const tr = state.tr
    tr.insertText('BCD', doc.tag.b)
    verifyTrRoundtrip(state, tr)
  })

  t.group('insert text at end of element', () => {
    const tr = state.tr
    tr.insertText('C', doc.tag.c)
    verifyTrRoundtrip(state, tr)
  })

  t.group('delete text in the middle of an element', () => {
    const tr = state.tr
    tr.delete(doc.tag.b, doc.tag.b + 1)
    verifyTrRoundtrip(state, tr)
  })

  t.group('delete text range in the middle of an element', () => {
    const tr = state.tr
    tr.delete(doc.tag.b, doc.tag.b + 3)
    verifyTrRoundtrip(state, tr)
  })

  t.group('insert node', () => {
    const tr = state.tr
    tr.insert(doc.tag.c + 1, testBuilders.paragraph('A'))
    verifyTrRoundtrip(state, tr)
  })

  t.group('delete node', () => {
    const tr = state.tr
    const startPos = doc.tag.c + 1
    tr.delete(startPos, startPos + doc.nodeAt(startPos).nodeSize)
    verifyTrRoundtrip(state, tr)
  })

  t.group('delete a range of nodes', () => {
    const tr = state.tr
    tr.delete(doc.tag.c + 1, doc.tag.g - 1)
    verifyTrRoundtrip(state, tr)
  })

  t.group('delete across block boundaries', () => {
    const tr = state.tr
    tr.delete(doc.tag.c - 1, doc.tag.g + 1)
    verifyTrRoundtrip(state, tr)
  })

  t.group('multiple steps: inserts', () => {
    const tr = state.tr
    tr.insertText('A', doc.tag.a)
    tr.insertText('B', doc.tag.b)
    tr.insertText('C', doc.tag.c)
    verifyTrRoundtrip(state, tr)
  })

  t.group('multiple steps: deletes', () => {
    const tr = state.tr
    tr.delete(doc.tag.a, doc.tag.a + 1)
    tr.delete(doc.tag.b, doc.tag.b + 1)
    tr.delete(doc.tag.c, doc.tag.c + 1)
    verifyTrRoundtrip(state, tr)
  })

  t.group('multiple steps: insert + delete in same transaction', () => {
    const tr = state.tr
    tr.insertText('X', doc.tag.a)
    tr.delete(doc.tag.b + 1, doc.tag.b + 3)
    verifyTrRoundtrip(state, tr)
  })
}

/**
 * @param {t.TestCase} _tc
 */
export function testStepToDelta (_tc) {
  const doc = testBuilders.doc(
    testBuilders.paragraph('<a>first<b> paragraph<c>'),
    testBuilders.paragraph('second<d> paragraph'),
    testBuilders.blockquote(testBuilders.paragraph('<e>in blockquote<f>')),
    testBuilders.paragraph('<g>fourth<h> paragraph'),
    testBuilders.paragraph('fifth<i> paragraph')
  )
  const state = EditorState.create({
    schema,
    doc
  })

  t.group('insert text at start of element', () => {
    const tr = state.tr
    tr.insertText('A', doc.tag.a)
    verifyStepRoundtrip(state, tr)
  })

  t.group('insert text in the middle of a string', () => {
    const tr = state.tr
    tr.insertText('A', doc.tag.d)
    verifyStepRoundtrip(state, tr)
  })

  t.group('insert text at the end of a string', () => {
    const tr = state.tr
    tr.insertText('A', doc.tag.c)
    verifyStepRoundtrip(state, tr)
  })

  t.group('delete text from the start of a string', () => {
    const tr = state.tr
    tr.delete(doc.tag.a, doc.tag.a + 1)
    verifyStepRoundtrip(state, tr)
  })

  t.group('delete text from the middle of a string', () => {
    const tr = state.tr
    tr.delete(doc.tag.b, doc.tag.b + 1)
    verifyStepRoundtrip(state, tr)
  })

  t.group('replace text', () => {
    const tr = state.tr
    tr.insertText('NEW', doc.tag.a, doc.tag.b)
    verifyStepRoundtrip(state, tr)
  })

  t.group('delete spanning two paragraphs', () => {
    const tr = state.tr
    tr.delete(doc.tag.b, doc.tag.d)
    verifyStepRoundtrip(state, tr)
  })

  t.group('block split (Enter key)', () => {
    const tr = state.tr
    tr.split(doc.tag.b)
    verifyStepRoundtrip(state, tr)
  })

  t.group('insert into blockquote', () => {
    const tr = state.tr
    tr.insertText('X', doc.tag.e)
    verifyStepRoundtrip(state, tr)
  })
}

/**
 * @param {t.TestCase} _tc
 */
export function testMarkStepToDelta (_tc) {
  const doc = testBuilders.doc(
    testBuilders.paragraph('<a>hello<b> world<c>'),
    testBuilders.paragraph('<d>second<e> paragraph<f>')
  )
  const state = EditorState.create({ schema, doc })

  t.group('add bold mark', () => {
    const tr = state.tr
    tr.addMark(doc.tag.a, doc.tag.b, schema.marks.strong.create())
    verifyStepRoundtrip(state, tr)
  })

  t.group('add italic mark', () => {
    const tr = state.tr
    tr.addMark(doc.tag.a, doc.tag.c, schema.marks.em.create())
    verifyStepRoundtrip(state, tr)
  })

  t.group('remove mark', () => {
    const boldDoc = testBuilders.doc(
      testBuilders.paragraph(testBuilders.strong('<a>hello<b> world<c>'))
    )
    const boldState = EditorState.create({ schema, doc: boldDoc })
    const tr = boldState.tr
    tr.removeMark(boldDoc.tag.a, boldDoc.tag.b, schema.marks.strong.create())
    verifyStepRoundtrip(boldState, tr)
  })

  t.group('add mark spanning blocks via trToDelta', () => {
    const tr = state.tr
    tr.addMark(doc.tag.b, doc.tag.e, schema.marks.strong.create())
    verifyTrRoundtrip(state, tr)
  })
}

/**
 * @param {t.TestCase} _tc
 */
export function testAttrStepToDelta (_tc) {
  const doc = testBuilders.doc(
    testBuilders.heading({ level: 1 }, '<a>title<b>'),
    testBuilders.paragraph('<c>content<d>')
  )
  const state = EditorState.create({ schema, doc })

  t.group('change heading level', () => {
    const tr = state.tr
    tr.setNodeAttribute(0, 'level', 3)
    verifyStepRoundtrip(state, tr)
  })
}

/**
 * @param {t.TestCase} _tc
 */
export function testWrapStepToDelta (_tc) {
  const doc = testBuilders.doc(
    testBuilders.paragraph('<a>first<b>'),
    testBuilders.paragraph('<c>second<d>'),
    testBuilders.paragraph('<e>third<f>')
  )
  const state = EditorState.create({ schema, doc })

  t.group('wrap single paragraph in blockquote', () => {
    const tr = state.tr
    tr.wrap(tr.doc.resolve(doc.tag.a).blockRange(tr.doc.resolve(doc.tag.b)), [{ type: schema.nodes.blockquote }])
    verifyTrRoundtrip(state, tr)
  })

  t.group('wrap multiple paragraphs in blockquote', () => {
    const tr = state.tr
    tr.wrap(tr.doc.resolve(doc.tag.a).blockRange(tr.doc.resolve(doc.tag.d)), [{ type: schema.nodes.blockquote }])
    verifyTrRoundtrip(state, tr)
  })

  t.group('unwrap blockquote', () => {
    const bqDoc = testBuilders.doc(
      testBuilders.blockquote(
        testBuilders.paragraph('<a>first<b>'),
        testBuilders.paragraph('<c>second<d>')
      )
    )
    const bqState = EditorState.create({ schema, doc: bqDoc })
    const tr = bqState.tr
    const range = tr.doc.resolve(bqDoc.tag.a).blockRange(tr.doc.resolve(bqDoc.tag.d))
    tr.lift(range, 0)
    verifyTrRoundtrip(bqState, tr)
  })
}

/**
 * @param {t.TestCase} _tc
 */
export function testNodeToDeltaPath (_tc) {
  const doc = testBuilders.doc(
    testBuilders.paragraph('<a>Hello<b> world<c>'),
    testBuilders.blockquote(testBuilders.paragraph('<d>Hello<e> world!<f>')),
    testBuilders.paragraph('<g>Hello<h> world!<i>')
  )

  t.group('correctly finds the delta offset for a given prosemirror offset', () => {
    t.compare(pmToDeltaPath(doc, 0), [0])
    t.compare(pmToDeltaPath(doc, doc.tag.b), [0, 5])
    t.compare(pmToDeltaPath(doc, doc.tag.e), [1, 0, 5])
    t.compare(pmToDeltaPath(doc, doc.tag.i), [2, 12])
  })

  t.group('mirrors pmToDeltaPath and deltaPathToPm', () => {
    const results = []
    for (let i = 0; i < doc.nodeSize - 2; i++) {
      const result = pmToDeltaPath(doc, i)
      results.push({ pmOffset: i, deltaOffset: result })
    }

    for (const result of results) {
      const offset = deltaPathToPm(result.deltaOffset, doc)
      t.compare(offset, result.pmOffset)
    }
  })
}
