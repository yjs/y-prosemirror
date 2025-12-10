// @ts-nocheck
import * as t from 'lib0/testing'
import { EditorState } from 'prosemirror-state'
import { deltaPathToDelta, deltaPathToPm, deltaToPSteps, pmToDeltaPath, stepToDelta, trToDelta } from '../src/index.js'
import { schema, testBuilders } from './complexSchema.js'
import * as delta from 'lib0/delta'

/**
 * A custom node comparator which ignores ychange attributes
 * @param {import('prosemirror-model').Node} a
 * @param {import('prosemirror-model').Node} b
 */
function compareNodes (a, b) {
  t.compare(a.type, b.type, 'types are not the same')
  t.compare({
    ...a.attrs,
    // specifically ignore ychange
    ychange: undefined
  }, {
    ...b.attrs,
    // specifically ignore ychange
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
      // specifically ignore ychange
      ychange: undefined
    }, {
      ...b.marks[i].attrs,
      // specifically ignore ychange
      ychange: undefined
    }, 'marks attrs are not the same')
  }
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

    const generatedDelta = trToDelta(tr)

    compareNodes(deltaToPSteps(state.tr, generatedDelta).doc, tr.doc)
  })

  t.group('insert text in the middle of an element', () => {
    const tr = state.tr
    tr.insertText('B', doc.tag.b)

    const generatedDelta = trToDelta(tr)

    compareNodes(deltaToPSteps(state.tr, generatedDelta).doc, tr.doc)
  })

  t.group('insert text range in the middle of an element', () => {
    const tr = state.tr
    tr.insertText('BCD', doc.tag.b)

    const generatedDelta = trToDelta(tr)

    compareNodes(deltaToPSteps(state.tr, generatedDelta).doc, tr.doc)
  })

  t.group('insert text at end of element', () => {
    const tr = state.tr
    tr.insertText('C', doc.tag.c)

    const generatedDelta = trToDelta(tr)

    compareNodes(deltaToPSteps(state.tr, generatedDelta).doc, tr.doc)
  })

  t.group('delete text in the middle of an element', () => {
    const tr = state.tr
    tr.delete(doc.tag.b, doc.tag.b + 1)

    const generatedDelta = trToDelta(tr)

    compareNodes(deltaToPSteps(state.tr, generatedDelta).doc, tr.doc)
  })

  t.group('delete text range in the middle of an element', () => {
    const tr = state.tr
    tr.delete(doc.tag.b, doc.tag.b + 3)

    const generatedDelta = trToDelta(tr)

    compareNodes(deltaToPSteps(state.tr, generatedDelta).doc, tr.doc)
  })

  t.group('insert node', () => {
    const tr = state.tr
    tr.insert(doc.tag.c + 1, testBuilders.paragraph('A'))

    const generatedDelta = trToDelta(tr)

    compareNodes(deltaToPSteps(state.tr, generatedDelta).doc, tr.doc)
  })

  t.group('delete node', () => {
    const tr = state.tr
    const startPos = doc.tag.c + 1
    tr.delete(startPos, startPos + doc.nodeAt(startPos).nodeSize)

    const generatedDelta = trToDelta(tr)

    compareNodes(deltaToPSteps(state.tr, generatedDelta).doc, tr.doc)
  })

  t.group('delete a range of nodes', () => {
    const tr = state.tr
    tr.delete(doc.tag.c + 1, doc.tag.g - 1)

    const generatedDelta = trToDelta(tr)

    compareNodes(deltaToPSteps(state.tr, generatedDelta).doc, tr.doc)
  })

  t.group('delete a random range of nodes', () => {
    const tr = state.tr
    tr.delete(doc.tag.c - 1, doc.tag.g + 1)

    const generatedDelta = trToDelta(tr)

    console.log('generatedDelta', JSON.stringify(generatedDelta.toJSON(), null, 2))

    console.log('expected', tr.doc.toString())
    console.log('actual  ', deltaToPSteps(state.tr, generatedDelta).doc.toString())

    compareNodes(deltaToPSteps(state.tr, generatedDelta).doc, tr.doc)
  })

  t.group('multiple steps', () => {
    const tr = state.tr
    tr.insertText('A', doc.tag.a)
    tr.insertText('B', doc.tag.b)
    tr.insertText('C', doc.tag.c)

    const generatedDelta = trToDelta(tr)

    console.log('generatedDelta', JSON.stringify(generatedDelta.toJSON(), null, 2))
    console.log('expected', tr.doc.toString())
    console.log('actual  ', deltaToPSteps(state.tr, generatedDelta).doc.toString())

    compareNodes(deltaToPSteps(state.tr, generatedDelta).doc, tr.doc)
  })

  t.group('multiple steps with deletes', () => {
    const tr = state.tr
    tr.delete(doc.tag.a, doc.tag.a + 1)
    tr.delete(doc.tag.b, doc.tag.b + 1)
    tr.delete(doc.tag.c, doc.tag.c + 1)

    const generatedDelta = trToDelta(tr)

    console.log('generatedDelta', JSON.stringify(generatedDelta.toJSON(), null, 2))
    console.log('expected', tr.doc.toString())
    console.log('actual  ', deltaToPSteps(state.tr, generatedDelta).doc.toString())

    compareNodes(deltaToPSteps(state.tr, generatedDelta).doc, tr.doc)
  })

  // t.group('generic steps?', () => {
  //   const tr = state.tr
  //   tr.insertText('abc', doc.tag.a, doc.tag.a)
  //   // tr.delete(doc.tag.a, doc.tag.a + 1)

  //   t.compare(tr.steps.length, 1)

  //   console.log(tr.steps)
  //   const step = tr.steps[0]

  //   if (!(step instanceof ReplaceStep)) {
  //     t.fail('step is not a ReplaceStep')
  //   }

  //   console.log(JSON.stringify(step.toJSON()))

  //   stepToDelta(step, tr.before)

  //   // const result = step.apply(state.doc)
  //   // if (result.failed) {
  //   //   t.fail('step failed to apply')
  //   // }

  //   // step.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
  //   //   console.log(oldStart, oldEnd, newStart, newEnd)
  //   //   const blockRange = state.doc.resolve(oldStart).blockRange(state.doc.resolve(oldEnd))
  //   //   console.log(blockRange.$from.depth)
  //   //   const { start, startIndex, end, endIndex } = blockRange
  //   //   console.log({ start, startIndex, end, endIndex })
  //   // })
  //   // t.compare(step.toJSON(), { stepType: 'replace', from: 6, to: 24, slice: { content: [{ type: 'text', text: 'abc' }] } })

  //   // const generatedDelta = trToDelta(tr)

  //   // t.compare(deltaToPSteps(state.tr, generatedDelta).doc.toString(), tr.doc.toString())
  // })
}

/**
 * @param {t.TestCase} _tc
 */
export function tesStepToDelta (_tc) {
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

    t.compare(tr.steps.length, 1)

    const generatedDelta = stepToDelta(tr.steps[0], tr.before)
    const expectedDelta = delta.create().modify(delta.create().insert('A'))
    t.compare(generatedDelta, expectedDelta)

    t.assert(deltaToPSteps(state.tr, generatedDelta).doc.eq(tr.doc), 'deltaToPSteps produced an incorrect document')
  })

  t.group('insert text in the middle of a string', () => {
    const tr = state.tr
    tr.insertText('A', doc.tag.d)

    t.compare(tr.steps.length, 1)

    const generatedDelta = stepToDelta(tr.steps[0], tr.before)
    const expectedDelta = delta.create().retain(1).modify(delta.create().retain(6).insert('A'))
    t.compare(generatedDelta, expectedDelta)

    t.assert(deltaToPSteps(state.tr, generatedDelta).doc.eq(tr.doc), 'deltaToPSteps produced an incorrect document')
  })

  t.group('insert text in at the end of a string', () => {
    const tr = state.tr
    tr.insertText('A', doc.tag.c)

    t.compare(tr.steps.length, 1)

    const generatedDelta = stepToDelta(tr.steps[0], tr.before)
    const expectedDelta = delta.create().modify(delta.create().retain(15).insert('A'))
    t.compare(generatedDelta, expectedDelta)

    t.assert(deltaToPSteps(state.tr, generatedDelta).doc.eq(tr.doc), 'deltaToPSteps produced an incorrect document')
  })

  t.group('delete text from the start of a string', () => {
    const tr = state.tr
    tr.delete(doc.tag.a, doc.tag.a + 1)

    t.compare(tr.steps.length, 1)

    const generatedDelta = stepToDelta(tr.steps[0], tr.before)
    const expectedDelta = delta.create().modify(delta.create().delete(1))
    t.compare(generatedDelta, expectedDelta)

    t.assert(deltaToPSteps(state.tr, generatedDelta).doc.eq(tr.doc), 'deltaToPSteps produced an incorrect document')
  })

  t.group('delete text from the middle of a string', () => {
    const tr = state.tr
    tr.delete(doc.tag.b, doc.tag.b + 1)

    t.compare(tr.steps.length, 1)

    const generatedDelta = stepToDelta(tr.steps[0], tr.before)
    const expectedDelta = delta.create().modify(delta.create().retain(5).delete(1))
    t.compare(generatedDelta, expectedDelta)

    t.assert(deltaToPSteps(state.tr, generatedDelta).doc.eq(tr.doc), 'deltaToPSteps produced an incorrect document')
  })
}

/**
 * @param {t.TestCase} _tc
 */
export function tesNodeToDeltaPath (_tc) {
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

/**
 * @param {t.TestCase} _tc
 */
export function tesDeltaPathToDelta (_tc) {
  t.group('converts delta path to delta structure', () => {
    t.group('path [1, 6]', () => {
      const { parentDelta, currentOp } = deltaPathToDelta([1, 6])
      const expectedCurrentOp = delta.create().retain(6)
      const expectedParentDelta = delta.create().retain(1).modify(expectedCurrentOp)

      t.compare(currentOp, expectedCurrentOp)
      t.compare(parentDelta, expectedParentDelta)
    })

    t.group('path [5]', () => {
      const { parentDelta, currentOp } = deltaPathToDelta([5])
      const expectedCurrentOp = delta.create().retain(5)
      const expectedParentDelta = delta.create().retain(5)

      t.compare(currentOp, expectedCurrentOp)
      t.compare(parentDelta, expectedParentDelta)
    })

    t.group('path [2, 3, 4]', () => {
      const { parentDelta, currentOp } = deltaPathToDelta([2, 3, 4])
      const expectedCurrentOp = delta.create().retain(4)
      const expectedParentDelta = delta.create().retain(2).modify(delta.create().retain(3).modify(expectedCurrentOp))

      t.compare(currentOp, expectedCurrentOp)
      t.compare(parentDelta, expectedParentDelta)
    })

    t.group('empty path []', () => {
      const { parentDelta, currentOp } = deltaPathToDelta([])
      const expectedCurrentOp = delta.create()
      const expectedParentDelta = delta.create()

      t.compare(currentOp, expectedCurrentOp)
      t.compare(parentDelta, expectedParentDelta)
    })
  })
}
