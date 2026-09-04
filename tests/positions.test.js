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
  absolutePositionsToRelativePositions,
  deltaPositionToProsemirrorPosition,
  prosemirrorPositionToDeltaPosition,
  relativePositionsToAbsolutePositions,
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
 * Resolve a relative position to a PM position via the delta-position path (the
 * composition that replaced the removed `relativePositionToAbsolutePosition`).
 *
 * @param {Y.RelativePosition} relPos
 * @param {Y.Node} ytype
 * @param {import('prosemirror-model').Node} doc
 * @param {Y.AbstractRenderer | null} [renderer]
 * @return {number | null}
 */
const relPosToPmPos = (relPos, ytype, doc, renderer = null) => {
  const deltaPos = Y.createDeltaPositionFromRelativePosition(ytype, relPos, { renderer })
  return deltaPos == null ? null : deltaPositionToProsemirrorPosition(doc, deltaPos)
}

/**
 * Helper: for every valid position in the PM doc, convert absolute→relative→absolute
 * and assert the round-trip produces the same position.
 *
 * @param {EditorView} view
 * @param {Y.Node} ytype
 */
const assertRoundTripAllPositions = (view, ytype) => {
  const doc = view.state.doc
  const size = doc.content.size
  const failures = []
  for (let pos = 0; pos <= size; pos++) {
    const resolvedPos = doc.resolve(pos)
    const relPos = absolutePositionToRelativePosition(resolvedPos, ytype)
    const absPos = relPos == null ? null : relPosToPmPos(relPos, ytype, doc)
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

/**
 * @param {t.TestCase} _tc
 */
export const testDeltaPositionStalePmDocReturnsNull = (_tc) => {
  const { view, ytype } = createSetup(
    delta.create().insert([
      delta.create('paragraph', {}, 'a'),
      delta.create('paragraph', {}, 'b'),
      delta.create('paragraph', {}, 'c'),
      delta.create('paragraph', {}, 'd')
    ]).done()
  )
  // Capture a relative position into the 4th paragraph (PM index 3) using the up-to-date doc.
  const upToDateDoc = view.state.doc
  const posInFourthPara = upToDateDoc.resolve(upToDateDoc.content.size - 1)
  const relPos = absolutePositionToRelativePosition(posInFourthPara, ytype)
  t.assert(relPos, 'position encodes against the up-to-date doc')

  const stalePmDoc = schema.node('doc', null, [
    schema.node('paragraph', null, schema.text('a')),
    schema.node('paragraph', null, schema.text('b')),
    schema.node('paragraph', null, schema.text('c'))
  ])

  t.assert(
    relPosToPmPos(relPos, ytype, stalePmDoc) === null,
    'returns null when YJS path overruns PM doc'
  )

  t.assert(
    relPosToPmPos(relPos, ytype, upToDateDoc) !== null,
    'still resolves correctly against the up-to-date PM doc'
  )
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
  const child = /** @type {Y.Node} */ (ytype.get(0))
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

// === Delta-position converters & transformer-mapped positions ===

/**
 * A structurally varied fixture: nested list, hard breaks, heading.
 */
const complexFixture = () => createSetup(
  delta.create().insert([
    delta.create('heading', { level: 1 }, 'Title'),
    delta.create('bullet_list', {}, [
      delta.create('list_item', {}, [
        delta.create('paragraph', {}, 'de')
      ]),
      delta.create('list_item', {}, [
        delta.create('paragraph', {}, 'fg')
      ])
    ]),
    delta.create('paragraph')
      .insert('hi')
      .insert([delta.create('hard_break').done()])
      .insert('jk')
      .done()
  ]).done()
)

/**
 * Pure PM ↔ delta-position round trip for every position of a nested doc.
 *
 * @param {t.TestCase} _tc
 */
export const testDeltaPositionPmRoundTrip = (_tc) => {
  const { view } = complexFixture()
  const doc = view.state.doc
  /**
   * @type {Array<string>}
   */
  const failures = []
  for (let pos = 0; pos <= doc.content.size; pos++) {
    const dpos = prosemirrorPositionToDeltaPosition(doc.resolve(pos))
    const back = deltaPositionToProsemirrorPosition(doc, dpos)
    if (back !== pos) {
      failures.push(`pos ${pos} → ${JSON.stringify(dpos)} → ${back}`)
    }
  }
  t.assert(failures.length === 0, `PM↔delta round-trip failures:\n  ${failures.join('\n  ')}`)
}

/**
 * Full chain without a transformer: PM pos → delta pos → relative position →
 * delta pos → PM pos, batched through the yjs helpers (the Y structure mirrors
 * the PM structure here, so the identity must hold for every position).
 *
 * @param {t.TestCase} _tc
 */
export const testDeltaPositionRelativeRoundTrip = (_tc) => {
  const { view, ytype } = complexFixture()
  const doc = view.state.doc
  /**
   * @type {Array<import('lib0/delta/position').Pos>}
   */
  const dposs = []
  for (let pos = 0; pos <= doc.content.size; pos++) {
    dposs.push(prosemirrorPositionToDeltaPosition(doc.resolve(pos)))
  }
  const rposs = Y.createRelativePositionsFromDeltaPositions(ytype, dposs, { renderer: null })
  const back = Y.createDeltaPositionsFromRelativePositions(ytype, rposs, { renderer: null })
  /**
   * @type {Array<string>}
   */
  const failures = []
  back.forEach((dpos, pos) => {
    const abs = dpos == null ? null : deltaPositionToProsemirrorPosition(doc, dpos)
    if (abs !== pos) {
      failures.push(`pos ${pos} → ${JSON.stringify(dposs[pos])} → ${JSON.stringify(dpos)} → ${abs}`)
    }
  })
  t.assert(failures.length === 0, `delta↔relative round-trip failures:\n  ${failures.join('\n  ')}`)
}

/**
 * Round trip through the live binding transformer (`binding.t` exposed on the
 * sync plugin state). On a flat-representation doc the mapping is the identity.
 *
 * @param {t.TestCase} _tc
 */
export const testTransformerMappedRoundTripAllPositions = (_tc) => {
  const { view, ytype } = complexFixture()
  const binding = YPM.ySyncPluginKey.getState(view.state)?.binding
  t.assert(binding, 'binding is exposed on the sync plugin state')
  const transformer = binding.t
  const doc = view.state.doc
  /**
   * @type {Array<import('prosemirror-model').ResolvedPos>}
   */
  const resolved = []
  for (let pos = 0; pos <= doc.content.size; pos++) {
    resolved.push(doc.resolve(pos))
  }
  const rposs = absolutePositionsToRelativePositions(resolved, { ytype, renderer: null, transformer })
  const back = relativePositionsToAbsolutePositions(rposs, { ytype, renderer: null, transformer }, doc)
  /**
   * @type {Array<string>}
   */
  const failures = []
  back.forEach((abs, pos) => {
    if (abs !== pos) {
      failures.push(`pos ${pos} → ${abs}`)
    }
  })
  t.assert(failures.length === 0, `transformer round-trip failures:\n  ${failures.join('\n  ')}`)
}

/**
 * The headline case for transformer-aware mapping: an OLD-representation doc
 * (`doc > paragraph > <anonymous>"hello " + em("world")`) renders flattened, so
 * PM positions and Y positions live in different structures. Mapping through
 * the binding transformer anchors PM positions INSIDE the anonymous container
 * (where the content actually lives) and resolves Y positions from inside the
 * container back to the flattened PM doc - the direct (legacy) conversion can
 * do neither.
 *
 * @param {t.TestCase} _tc
 */
export const testTransformerMappedOldRepresentation = (_tc) => {
  const textContainer = delta.create().insert('hello ').insert('world', { em: {} })
  const paragraph = delta.create('paragraph', {}).insert(/** @type {any} */ ([textContainer]))
  const { view, ytype } = createSetup(
    delta.create().insert(/** @type {any} */ ([paragraph])).done()
  )
  t.compare(view.state.doc.textContent, 'hello world', 'old representation renders flattened')
  const binding = YPM.ySyncPluginKey.getState(view.state)?.binding
  t.assert(binding, 'binding is exposed on the sync plugin state')
  const transformer = binding.t
  const doc = view.state.doc
  // PM pos 6 = 'hello |world' inside the flattened paragraph
  const [rpos] = absolutePositionsToRelativePositions(
    [doc.resolve(6)], { ytype, renderer: null, transformer })
  t.assert(rpos != null, 'PM position maps to a relative position')
  const anon = /** @type {Y.Node} */ (/** @type {Y.Node} */ (ytype.get(0)).get(0))
  t.assert(anon.name === null, 'first paragraph child is the anonymous container')
  const decoded = Y.createAbsolutePositionFromRelativePosition(/** @type {Y.RelativePosition} */ (rpos), /** @type {Y.Doc} */ (ytype.doc))
  t.assert(decoded != null && decoded.type === anon, 'relative position anchors INSIDE the anonymous container')
  t.compare(decoded && decoded.index, 5, 'at text offset 5 within the container')
  // ... and back
  const [absBack] = relativePositionsToAbsolutePositions(
    [(rpos)], { ytype, renderer: null, transformer }, doc)
  t.compare(absBack, 6, 'round-trips back to PM pos 6')
  // Y → PM: a relative position created directly inside the container
  const rposInAnon = Y.createRelativePositionFromTypeIndex(anon, 5, 0)
  const [absFromAnon] = relativePositionsToAbsolutePositions(
    [rposInAnon], { ytype, renderer: null, transformer }, doc)
  t.compare(absFromAnon, 6, 'position inside the anonymous container resolves to the flattened PM pos')
  // without the transformer, the Y-tree delta position descends into a PM text
  // node and cannot resolve - the transformer mapping is what bridges the structures
  t.assert(
    relPosToPmPos(rposInAnon, ytype, doc) === null,
    'direct resolution cannot resolve the container position'
  )
}

/**
 * Null handling: `null` inputs and positions outside the bound type must map
 * to `null` without throwing and without disturbing valid entries of the same
 * batch.
 *
 * @param {t.TestCase} _tc
 */
export const testTransformerMappedNullHandling = (_tc) => {
  const { view, ytype } = createSetup(
    delta.create().insert([
      delta.create('paragraph', {}, 'hello')
    ]).done()
  )
  const binding = YPM.ySyncPluginKey.getState(view.state)?.binding
  t.assert(binding, 'binding is exposed on the sync plugin state')
  const transformer = binding.t
  const doc = view.state.doc
  const foreignType = /** @type {Y.Doc} */ (ytype.doc).get('other')
  const results = relativePositionsToAbsolutePositions([
    absolutePositionsToRelativePositions([doc.resolve(3)], { ytype, renderer: null, transformer })[0],
    null,
    Y.createRelativePositionFromTypeIndex(foreignType, 0, 0)
  ], { ytype, renderer: null, transformer }, doc)
  t.compare(results[0], 3, 'valid entry resolves')
  t.assert(results[1] === null, 'null input stays null')
  t.assert(results[2] === null, 'position outside the bound type maps to null')
}

/**
 * Unresolvable positions return null - never a fabricated fallback. Genuinely
 * unresolvable in the PM→Y direction means a non-terminal path step overruns the Y
 * structure (PM content the Y tree does not have); terminal overruns still resolve
 * (end-of-node anchor, matching `createRelativePositionFromTypeIndex`).
 *
 * @param {t.TestCase} _tc
 */
export const testAbsoluteToRelativeUnresolvableReturnsNull = (_tc) => {
  const { ytype } = createSetup(
    delta.create().insert([
      delta.create('paragraph', {}, 'abc')
    ]).done()
  )
  // a diverged PM doc with a second paragraph the Y tree does not have
  const divergedDoc = schema.node('doc', null, [
    schema.node('paragraph', null, schema.text('abc')),
    schema.node('paragraph', null, schema.text('extra'))
  ])
  t.assert(
    absolutePositionToRelativePosition(divergedDoc.resolve(7), ytype) === null,
    'position inside content the Y tree does not have returns null'
  )
  // empty (init-gated) ytype: the selection inside the schema-minimum paragraph
  // cannot anchor, but the doc-level position 0 still can (position-0 retention)
  const ydoc2 = new Y.Doc()
  const ytype2 = ydoc2.get('prosemirror')
  const view2 = new EditorView({ mount: document.createElement('div') }, {
    state: EditorState.create({ schema, plugins: [YPM.syncPlugin()] })
  })
  YPM.configureYProsemirror({ ytype: ytype2 })(view2.state, view2.dispatch)
  t.assert(ytype2.length === 0, 'ytype stays empty (initial-content gate)')
  t.assert(
    absolutePositionToRelativePosition(view2.state.doc.resolve(1), ytype2) === null,
    'selection inside the gated empty editor cannot anchor'
  )
  t.assert(
    absolutePositionToRelativePosition(view2.state.doc.resolve(0), ytype2) != null,
    'doc-level position 0 still anchors (position-0 retention)'
  )
  view2.destroy()
}

/**
 * Selection capture/restore through the binding transformer works on structurally
 * transformed (old-representation) docs - positions anchor inside the anonymous
 * container and restore to the flattened PM positions.
 *
 * @param {t.TestCase} _tc
 */
export const testStoreMappingTransformerOldRepresentation = (_tc) => {
  const textContainer = delta.create().insert('hello ').insert('world', { em: {} })
  const paragraph = delta.create('paragraph', {}).insert(/** @type {any} */ ([textContainer]))
  const { view, ytype } = createSetup(
    delta.create().insert(/** @type {any} */ ([paragraph])).done()
  )
  const binding = YPM.ySyncPluginKey.getState(view.state)?.binding
  t.assert(binding, 'binding is exposed on the sync plugin state')
  const ctx = { transformer: binding.t }
  const sel = TextSelection.create(view.state.doc, 2, 6)
  const { captureMapping, restoreMapping } = relativePositionStoreMapping(ytype)
  const bookmark = sel.getBookmark().map(captureMapping(view.state.doc, ctx, true))
  const restored = bookmark.map(restoreMapping(ytype, view.state.doc, ctx)).resolve(view.state.doc)
  t.assert(
    restored.from === 2 && restored.to === 6,
    `restored ${restored.from}..${restored.to}, expected 2..6`
  )
}

/**
 * Unresolvable positions are not captured; restoring them throws, so callers (the
 * undo plugin) skip selection restoration instead of receiving a fabricated position.
 *
 * @param {t.TestCase} _tc
 */
export const testStoreMappingUnresolvableSkips = (_tc) => {
  // gated empty ytype - the selection inside the schema-minimum paragraph cannot anchor
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const view = new EditorView({ mount: document.createElement('div') }, {
    state: EditorState.create({ schema, plugins: [YPM.syncPlugin()] })
  })
  YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
  const sel = TextSelection.create(view.state.doc, 1)
  const { captureMapping, restoreMapping } = relativePositionStoreMapping(ytype)
  const bookmark = sel.getBookmark().map(captureMapping(view.state.doc, {}, true))
  t.fails(() => {
    bookmark.map(restoreMapping(ytype, view.state.doc, {}))
  })
  view.destroy()
}
