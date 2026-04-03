import * as t from 'lib0/testing'
import * as YPM from '@y/prosemirror'
import * as basicSchema from 'prosemirror-schema-basic'
import * as Y from '@y/y'
import * as delta from 'lib0/delta'
import { EditorState, TextSelection, NodeSelection } from 'prosemirror-state'
import { Schema } from 'prosemirror-model'
import { EditorView } from 'prosemirror-view'
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  relativePositionStoreMapping
} from '../src/positions.js'

const schema = new Schema({
  nodes: /** @type {any} */ (Object.assign({}, basicSchema.nodes, {
    ordered_list: {
      content: 'list_item+',
      group: 'block',
      attrs: { order: { default: 1 } },
      parseDOM: [{ tag: 'ol' }],
      toDOM () { return ['ol', 0] }
    },
    bullet_list: {
      content: 'list_item+',
      group: 'block',
      parseDOM: [{ tag: 'ul' }],
      toDOM () { return ['ul', 0] }
    },
    list_item: {
      content: 'paragraph block*',
      parseDOM: [{ tag: 'li' }],
      toDOM () { return ['li', 0] },
      defining: true
    }
  })),
  marks: basicSchema.marks
})

/**
 * @param {delta.DeltaAny} initialContent
 */
const createSetup = (initialContent) => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  ytype.applyDelta(initialContent)
  const view = new EditorView({ mount: document.createElement('div') }, {
    state: EditorState.create({
      schema,
      plugins: [YPM.syncPlugin()]
    })
  })
  YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
  return { view, ytype }
}

/**
 * Helper: for every valid position in the PM doc, convert absolute→relative→absolute
 * and assert the round-trip produces the same position.
 *
 * @param {EditorView} view
 * @param {Y.Type} ytype
 */
const assertRoundTripAllPositions = (view, ytype) => {
  const doc = view.state.doc
  const size = doc.content.size
  const failures = []
  for (let pos = 0; pos <= size; pos++) {
    const resolvedPos = doc.resolve(pos)
    const relPos = absolutePositionToRelativePosition(resolvedPos, ytype)
    const absPos = relativePositionToAbsolutePosition(relPos, ytype, doc)
    if (absPos !== pos) {
      failures.push(`pos ${pos} → ${absPos} (depth=${resolvedPos.depth}, parentOffset=${resolvedPos.parentOffset})`)
    }
  }
  t.assert(
    failures.length === 0,
    `Round-trip failures (${failures.length}/${size + 1}):\n  ${failures.join('\n  ')}`
  )
}

/**
 * Test round-trip for a simple single-paragraph document.
 *
 * Document structure (PM positions in brackets):
 *   [0]<paragraph>[1]hello[6]</paragraph>[7]
 *
 * @param {t.TestCase} _tc
 */
export const testPositionsSingleParagraph = (_tc) => {
  const { view, ytype } = createSetup(
    delta.create().insert([
      delta.create('paragraph', {}, 'hello')
    ]).done()
  )
  assertRoundTripAllPositions(view, ytype)
}

/**
 * Test round-trip for multiple paragraphs.
 *
 * Document structure:
 *   [0]<paragraph>[1]abc[4]</paragraph>[5]<paragraph>[6]defgh[11]</paragraph>[12]
 *
 * @param {t.TestCase} _tc
 */
export const testPositionsMultipleParagraphs = (_tc) => {
  const { view, ytype } = createSetup(
    delta.create().insert([
      delta.create('paragraph', {}, 'abc'),
      delta.create('paragraph', {}, 'defgh')
    ]).done()
  )
  assertRoundTripAllPositions(view, ytype)
}

/**
 * Test round-trip for a paragraph containing a hard break (inline atom node).
 *
 * Document structure:
 *   [0]<paragraph>[1]ab[3]<hard_break/>[4]cd[6]</paragraph>[7]
 *
 * @param {t.TestCase} _tc
 */
export const testPositionsHardBreak = (_tc) => {
  const { view, ytype } = createSetup(
    delta.create().insert([
      delta.create('paragraph')
        .insert('ab')
        .insert([delta.create('hard_break').done()])
        .insert('cd')
        .done()
    ]).done()
  )
  assertRoundTripAllPositions(view, ytype)
}

/**
 * Test round-trip with multiple hard breaks in a row.
 *
 * Document structure:
 *   [0]<paragraph>[1]a[2]<hard_break/>[3]<hard_break/>[4]b[5]</paragraph>[6]
 *
 * @param {t.TestCase} _tc
 */
export const testPositionsMultipleHardBreaks = (_tc) => {
  const { view, ytype } = createSetup(
    delta.create().insert([
      delta.create('paragraph')
        .insert('a')
        .insert([delta.create('hard_break').done()])
        .insert([delta.create('hard_break').done()])
        .insert('b')
        .done()
    ]).done()
  )
  assertRoundTripAllPositions(view, ytype)
}

/**
 * Test round-trip with heading and paragraph.
 *
 * @param {t.TestCase} _tc
 */
export const testPositionsHeadingAndParagraph = (_tc) => {
  const { view, ytype } = createSetup(
    delta.create().insert([
      delta.create('heading', { level: 1 }, 'Title'),
      delta.create('paragraph', {}, 'body')
    ]).done()
  )
  assertRoundTripAllPositions(view, ytype)
}

/**
 * Test round-trip with a blockquote (nested block node).
 *
 * Document structure:
 *   [0]<blockquote>[1]<paragraph>[2]quoted text[13]</paragraph>[14]</blockquote>[15]
 *
 * @param {t.TestCase} _tc
 */
export const testPositionsBlockquote = (_tc) => {
  const { view, ytype } = createSetup(
    delta.create().insert([
      delta.create('blockquote', {}, [
        delta.create('paragraph', {}, 'quoted text')
      ])
    ]).done()
  )
  assertRoundTripAllPositions(view, ytype)
}

/**
 * Test round-trip with nested blockquotes.
 *
 * @param {t.TestCase} _tc
 */
export const testPositionsNestedBlockquotes = (_tc) => {
  const { view, ytype } = createSetup(
    delta.create().insert([
      delta.create('blockquote', {}, [
        delta.create('blockquote', {}, [
          delta.create('paragraph', {}, 'deep')
        ])
      ])
    ]).done()
  )
  assertRoundTripAllPositions(view, ytype)
}

/**
 * Test round-trip with a bullet list containing multiple items.
 *
 * @param {t.TestCase} _tc
 */
export const testPositionsBulletList = (_tc) => {
  const { view, ytype } = createSetup(
    delta.create().insert([
      delta.create('bullet_list', {}, [
        delta.create('list_item', {}, [
          delta.create('paragraph', {}, 'item one')
        ]),
        delta.create('list_item', {}, [
          delta.create('paragraph', {}, 'item two')
        ])
      ])
    ]).done()
  )
  assertRoundTripAllPositions(view, ytype)
}

/**
 * Test round-trip with a nested list (list item containing a sub-list).
 *
 * @param {t.TestCase} _tc
 */
export const testPositionsNestedList = (_tc) => {
  const { view, ytype } = createSetup(
    delta.create().insert([
      delta.create('bullet_list', {}, [
        delta.create('list_item', {}, [
          delta.create('paragraph', {}, 'parent'),
          delta.create('bullet_list', {}, [
            delta.create('list_item', {}, [
              delta.create('paragraph', {}, 'child')
            ])
          ])
        ])
      ])
    ]).done()
  )
  assertRoundTripAllPositions(view, ytype)
}

/**
 * Test round-trip with a complex mixed document.
 *
 * @param {t.TestCase} _tc
 */
export const testPositionsComplexDocument = (_tc) => {
  const { view, ytype } = createSetup(
    delta.create().insert([
      delta.create('heading', { level: 1 }, 'Hello World'),
      delta.create('paragraph')
        .insert('Some text')
        .insert([delta.create('hard_break').done()])
        .insert('more text')
        .done(),
      delta.create('blockquote', {}, [
        delta.create('paragraph', {}, 'quoted')
      ]),
      delta.create('bullet_list', {}, [
        delta.create('list_item', {}, [
          delta.create('paragraph', {}, 'first')
        ]),
        delta.create('list_item', {}, [
          delta.create('paragraph')
            .insert('second')
            .insert([delta.create('hard_break').done()])
            .insert('line')
            .done()
        ])
      ]),
      delta.create('paragraph', {}, 'end')
    ]).done()
  )
  assertRoundTripAllPositions(view, ytype)
}

/**
 * Test round-trip with empty paragraphs.
 *
 * @param {t.TestCase} _tc
 */
export const testPositionsEmptyParagraphs = (_tc) => {
  const { view, ytype } = createSetup(
    delta.create().insert([
      delta.create('paragraph'),
      delta.create('paragraph', {}, 'middle'),
      delta.create('paragraph')
    ]).done()
  )
  assertRoundTripAllPositions(view, ytype)
}

/**
 * Test round-trip with a code_block.
 *
 * @param {t.TestCase} _tc
 */
export const testPositionsCodeBlock = (_tc) => {
  const { view, ytype } = createSetup(
    delta.create().insert([
      delta.create('code_block', {}, 'const x = 1'),
      delta.create('paragraph', {}, 'after')
    ]).done()
  )
  assertRoundTripAllPositions(view, ytype)
}

/**
 * Test round-trip with an ordered list.
 *
 * @param {t.TestCase} _tc
 */
export const testPositionsOrderedList = (_tc) => {
  const { view, ytype } = createSetup(
    delta.create().insert([
      delta.create('ordered_list', {}, [
        delta.create('list_item', {}, [
          delta.create('paragraph', {}, 'one')
        ]),
        delta.create('list_item', {}, [
          delta.create('paragraph', {}, 'two')
        ]),
        delta.create('list_item', {}, [
          delta.create('paragraph', {}, 'three')
        ])
      ])
    ]).done()
  )
  assertRoundTripAllPositions(view, ytype)
}

/**
 * Test round-trip with a blockquote containing paragraphs with hard breaks.
 *
 * @param {t.TestCase} _tc
 */
export const testPositionsBlockquoteWithHardBreak = (_tc) => {
  const { view, ytype } = createSetup(
    delta.create().insert([
      delta.create('blockquote', {}, [
        delta.create('paragraph')
          .insert('line1')
          .insert([delta.create('hard_break').done()])
          .insert('line2')
          .done(),
        delta.create('paragraph', {}, 'another')
      ])
    ]).done()
  )
  assertRoundTripAllPositions(view, ytype)
}

/**
 * Test deeply nested: blockquote > blockquote > list > list_item > paragraph
 *
 * @param {t.TestCase} _tc
 */
export const testPositionsDeeplyNested = (_tc) => {
  const { view, ytype } = createSetup(
    delta.create().insert([
      delta.create('blockquote', {}, [
        delta.create('blockquote', {}, [
          delta.create('bullet_list', {}, [
            delta.create('list_item', {}, [
              delta.create('paragraph', {}, 'deep')
            ])
          ])
        ])
      ])
    ]).done()
  )
  assertRoundTripAllPositions(view, ytype)
}

/**
 * Test with a horizontal_rule (atom block node).
 *
 * @param {t.TestCase} _tc
 */
export const testPositionsHorizontalRule = (_tc) => {
  const { view, ytype } = createSetup(
    delta.create().insert([
      delta.create('paragraph', {}, 'before'),
      delta.create('horizontal_rule'),
      delta.create('paragraph', {}, 'after')
    ]).done()
  )
  assertRoundTripAllPositions(view, ytype)
}

/**
 * Test with a list item containing multiple blocks (paragraph + code_block).
 *
 * @param {t.TestCase} _tc
 */
export const testPositionsListItemWithMultipleBlocks = (_tc) => {
  const { view, ytype } = createSetup(
    delta.create().insert([
      delta.create('bullet_list', {}, [
        delta.create('list_item', {}, [
          delta.create('paragraph', {}, 'text'),
          delta.create('code_block', {}, 'code here')
        ])
      ])
    ]).done()
  )
  assertRoundTripAllPositions(view, ytype)
}

/**
 * Test that positions after a PM transaction also round-trip correctly.
 *
 * @param {t.TestCase} _tc
 */
export const testPositionsAfterPMInsert = (_tc) => {
  const { view, ytype } = createSetup(
    delta.create().insert([
      delta.create('paragraph', {}, 'initial')
    ]).done()
  )
  // Insert more content via PM transaction
  view.dispatch(
    view.state.tr.insert(0, [
      schema.node('heading', { level: 2 }, schema.text('Added')),
      schema.node('paragraph', undefined, [
        schema.text('with '),
        schema.node('hard_break'),
        schema.text('break')
      ])
    ])
  )
  assertRoundTripAllPositions(view, ytype)
}

// --- relativePositionStoreMapping tests ---

/**
 * Test that relativePositionStoreMapping round-trips all positions through capture/restore.
 *
 * @param {t.TestCase} _tc
 */
export const testStoreMappingRoundTrip = (_tc) => {
  const { view, ytype } = createSetup(
    delta.create().insert([
      delta.create('heading', { level: 1 }, 'Title'),
      delta.create('paragraph', {}, 'hello world'),
      delta.create('blockquote', {}, [
        delta.create('paragraph', {}, 'quoted')
      ])
    ]).done()
  )
  const doc = view.state.doc
  const { captureMapping, restoreMapping } = relativePositionStoreMapping(ytype)
  const capture = captureMapping(doc)
  // Capture all valid positions
  for (let pos = 0; pos <= doc.content.size; pos++) {
    capture.map(pos)
  }
  // Restore and verify round-trip
  const restore = restoreMapping(ytype, doc)
  const failures = []
  for (let pos = 0; pos <= doc.content.size; pos++) {
    const restored = restore.map(pos)
    if (restored !== pos) {
      failures.push(`pos ${pos} → ${restored}`)
    }
  }
  t.assert(failures.length === 0, `Round-trip failures: ${failures.join(', ')}`)
}

/**
 * Test that relativePositionStoreMapping works with bookmark capture/restore for TextSelection.
 *
 * @param {t.TestCase} _tc
 */
export const testStoreMappingBookmarkTextSelection = (_tc) => {
  const { view, ytype } = createSetup(
    delta.create().insert([
      delta.create('paragraph', {}, 'hello world')
    ]).done()
  )
  // Create a text selection from pos 3 to pos 8 ("llo w")
  const sel = TextSelection.create(view.state.doc, 3, 8)
  const { captureMapping, restoreMapping } = relativePositionStoreMapping(ytype)
  const bookmark = sel.getBookmark().map(captureMapping(view.state.doc))
  // Restore on the same doc
  const restored = bookmark.map(restoreMapping(ytype, view.state.doc)).resolve(view.state.doc)
  t.assert(restored.from === 3, `anchor should be 3, got ${restored.from}`)
  t.assert(restored.to === 8, `head should be 8, got ${restored.to}`)
}

/**
 * Test that relativePositionStoreMapping restores positions correctly after a Y.js remote change.
 *
 * @param {t.TestCase} _tc
 */
export const testStoreMappingAfterRemoteChange = (_tc) => {
  const { view, ytype } = createSetup(
    delta.create().insert([
      delta.create('paragraph', {}, 'hello world')
    ]).done()
  )
  // Capture selection at "world" (pos 7 to 12)
  const sel = TextSelection.create(view.state.doc, 7, 12)
  const { captureMapping, restoreMapping } = relativePositionStoreMapping(ytype)
  const bookmark = sel.getBookmark().map(captureMapping(view.state.doc))

  // Simulate a remote insert at the beginning of the paragraph via Y.js
  const child = /** @type {Y.Type} */ (ytype.get(0))
  child.insert(0, 'abc ')

  // The PM doc should now have "abc hello world" — positions shifted by 4
  const newDoc = view.state.doc
  const restored = bookmark.map(restoreMapping(ytype, newDoc)).resolve(newDoc)
  t.assert(newDoc.textContent === 'abc hello world', `doc should be "abc hello world", got "${newDoc.textContent}"`)
  t.assert(restored.from === 11, `anchor should be 11 (7+4), got ${restored.from}`)
  t.assert(restored.to === 16, `head should be 16 (12+4), got ${restored.to}`)
}

/**
 * Test that relativePositionStoreMapping works with NodeSelection bookmark.
 *
 * @param {t.TestCase} _tc
 */
export const testStoreMappingBookmarkNodeSelection = (_tc) => {
  const { view, ytype } = createSetup(
    delta.create().insert([
      delta.create('paragraph', {}, 'before'),
      delta.create('horizontal_rule'),
      delta.create('paragraph', {}, 'after')
    ]).done()
  )
  // NodeSelection on the horizontal_rule (position 8 = after "before" paragraph)
  const hrPos = 8
  const sel = NodeSelection.create(view.state.doc, hrPos)
  const { captureMapping, restoreMapping } = relativePositionStoreMapping(ytype)
  const bookmark = sel.getBookmark().map(captureMapping(view.state.doc))
  // Restore on the same doc
  const restored = bookmark.map(restoreMapping(ytype, view.state.doc)).resolve(view.state.doc)
  t.assert(restored instanceof NodeSelection, 'restored selection should be NodeSelection')
  t.assert(restored.from === hrPos, `from should be ${hrPos}, got ${restored.from}`)
}
