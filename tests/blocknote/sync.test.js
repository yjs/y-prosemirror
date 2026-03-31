import * as Y from '@y/y'
import * as t from 'lib0/testing'

import {
  assertDocJSON,
  createPMView as _createPMView,
  setupTwoWaySync
} from '../helpers.js'
import {
  bnDoc,
  findEndOfFirstBlockContainer,
  findFirstTextPosition,
  mapAttributionToMark,
  schema
} from './schema.js'

/** Wrap createPMView to always pass the BlockNote attribution mapper */
const createPMView = (/** @type {import('prosemirror-model').Schema} */ s, /** @type {any} */ ytype, /** @type {any} */ am = undefined, /** @type {object} */ opts = {}) =>
  _createPMView(s, ytype, am, { mapAttributionToMark, ...opts })

/** typesAfter for tr.split(), matching what BlockNote passes */
const splitTypesAfter = [
  { type: schema.nodes.blockContainer, attrs: { id: undefined } },
  { type: schema.nodes.paragraph, attrs: {} }
]

/**
 * Assign IDs to all blockContainers that have id === null.
 * Mimics BlockNote's UniqueID appendTransaction.
 * @param {import('prosemirror-view').EditorView} view
 * @param {string[]} ids
 */
const assignBlockIds = (view, ids) => {
  const tr = view.state.tr
  let i = 0
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'blockContainer' && node.attrs.id === null) {
      tr.setNodeAttribute(pos, 'id', ids[i++])
    }
    return true
  })
  if (i > 0) view.dispatch(tr)
}

// === Tests ===

/**
 * Basic sync: typing in one client appears in the other.
 */
export const testBlockNoteTwoClientSync = () => {
  const doc1 = new Y.Doc()
  const doc2 = new Y.Doc()
  setupTwoWaySync(doc1, doc2)

  const view1 = createPMView(schema, doc1.get('prosemirror'))
  const view2 = createPMView(schema, doc2.get('prosemirror'))

  assertDocJSON(view1.state.doc, bnDoc(null), 'Client 1 starts empty')
  assertDocJSON(view2.state.doc, bnDoc(null), 'Client 2 starts empty')

  const textPos = findFirstTextPosition(view1.state.doc)
  view1.dispatch(view1.state.tr.insertText('hello', textPos))

  assertDocJSON(view1.state.doc, bnDoc('hello'), "Client 1 has 'hello'")
  assertDocJSON(view2.state.doc, bnDoc('hello'), "Client 2 synced 'hello'")

  const textPos2 = findFirstTextPosition(view2.state.doc) + 5
  view2.dispatch(view2.state.tr.insertText(' world', textPos2))

  assertDocJSON(view1.state.doc, bnDoc('hello world'), "Client 1 has 'hello world'")
  assertDocJSON(view2.state.doc, bnDoc('hello world'), "Client 2 has 'hello world'")
}

/**
 * Insert a new block in one client, verify it syncs to the other.
 */
export const testBlockNoteInsertBlock = () => {
  const doc1 = new Y.Doc()
  const doc2 = new Y.Doc()
  setupTwoWaySync(doc1, doc2)

  const view1 = createPMView(schema, doc1.get('prosemirror'))
  const view2 = createPMView(schema, doc2.get('prosemirror'))

  const textPos = findFirstTextPosition(view1.state.doc)
  view1.dispatch(view1.state.tr.insertText('first block', textPos))

  const insertPos = findEndOfFirstBlockContainer(view1.state.doc)
  const newBlock = schema.nodes.blockContainer.create(
    null,
    schema.nodes.paragraph.create(null, schema.text('second block'))
  )
  view1.dispatch(view1.state.tr.insert(insertPos, newBlock))

  assertDocJSON(view2.state.doc, view1.state.doc.toJSON(), 'Client 2 synced')
}

/**
 * Concurrent edits: both clients type simultaneously, result converges.
 */
export const testBlockNoteConcurrentEdits = () => {
  const doc1 = new Y.Doc()
  const doc2 = new Y.Doc()

  Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
  Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))

  const view1 = createPMView(schema, doc1.get('prosemirror'))
  const view2 = createPMView(schema, doc2.get('prosemirror'))

  Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
  Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))

  const textPos1 = findFirstTextPosition(view1.state.doc)
  const textPos2 = findFirstTextPosition(view2.state.doc)
  view1.dispatch(view1.state.tr.insertText('AAA', textPos1))
  view2.dispatch(view2.state.tr.insertText('BBB', textPos2))

  Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
  Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))

  assertDocJSON(view1.state.doc, view2.state.doc.toJSON(), 'Both clients converge')
  const mergedText = view1.state.doc.textContent
  t.assert(mergedText.includes('AAA'), "Merged doc contains 'AAA'")
  t.assert(mergedText.includes('BBB'), "Merged doc contains 'BBB'")
}

/**
 * Split "hello world" after "hello" → two blocks, then assign ID to new block.
 * This works in the browser and should pass.
 */
export const testBlockNoteSplitParagraph = () => {
  const doc1 = new Y.Doc()
  const doc2 = new Y.Doc()
  setupTwoWaySync(doc1, doc2)

  const view1 = createPMView(schema, doc1.get('prosemirror'))
  const view2 = createPMView(schema, doc2.get('prosemirror'))

  // Type and assign ID to the initial block (like BlockNote does on creation)
  const textPos = findFirstTextPosition(view1.state.doc)
  view1.dispatch(view1.state.tr.insertText('hello world', textPos))
  assignBlockIds(view1, ['block-1'])

  // Split "hello world" after "hello"
  const splitPos = findFirstTextPosition(view1.state.doc) + 5
  view1.dispatch(view1.state.tr.split(splitPos, 2, splitTypesAfter))

  // Assign ID only to the new block (like BlockNote's UniqueID appendTransaction)
  assignBlockIds(view1, ['block-2'])

  const expected = {
    type: 'doc',
    content: [{
      type: 'blockGroup',
      content: [
        { type: 'blockContainer', attrs: { id: 'block-1' }, content: [{ type: 'paragraph', attrs: { backgroundColor: 'default', textAlignment: 'left', textColor: 'default' }, content: [{ type: 'text', text: 'hello' }] }] },
        { type: 'blockContainer', attrs: { id: 'block-2' }, content: [{ type: 'paragraph', attrs: { backgroundColor: 'default', textAlignment: 'left', textColor: 'default' }, content: [{ type: 'text', text: ' world' }] }] }
      ]
    }]
  }

  assertDocJSON(view1.state.doc, expected, 'Client 1 split with IDs')
  assertDocJSON(view2.state.doc, expected, 'Client 2 synced')
}

/**
 * Split "aaa" after "aa" with two blocks present, assign ID to new block.
 * Uses setupTwoWaySync (immediate per-dispatch sync).
 *
 * NOTE: The exact browser bug ("NodeType.create can't construct text nodes")
 * only reproduces in a real browser where PM's view update cycle produces a
 * single combined Y.js delta. See blocknote-demo/tests/sync.test.js (vitest
 * browser mode) for the real reproduction.
 */
export const testBlockNoteSplitMultiBlock = () => {
  const doc1 = new Y.Doc()
  const doc2 = new Y.Doc()

  setupTwoWaySync(doc1, doc2)

  const view1 = createPMView(schema, doc1.get('prosemirror'))
  const view2 = createPMView(schema, doc2.get('prosemirror'))

  // Build initial state (synced immediately via setupTwoWaySync)
  const textPos = findFirstTextPosition(view1.state.doc)
  view1.dispatch(view1.state.tr.insertText('aaa', textPos))
  assignBlockIds(view1, ['block-1'])

  const insertPos = findEndOfFirstBlockContainer(view1.state.doc)
  const newBlock = schema.nodes.blockContainer.create(
    null,
    schema.nodes.paragraph.create(null, schema.text('a'))
  )
  view1.dispatch(view1.state.tr.insert(insertPos, newBlock))
  assignBlockIds(view1, ['block-2'])

  // Both clients now have: ["aaa" (block-1), "a" (block-2)]

  // Split "aaa" after "aa" (syncs immediately via setupTwoWaySync)
  const splitPos = findFirstTextPosition(view1.state.doc) + 2
  view1.dispatch(view1.state.tr.split(splitPos, 2, splitTypesAfter))

  // Assign ID to the new block (syncs immediately)
  assignBlockIds(view1, ['block-3'])

  const expected = {
    type: 'doc',
    content: [{
      type: 'blockGroup',
      content: [
        { type: 'blockContainer', attrs: { id: 'block-1' }, content: [{ type: 'paragraph', attrs: { backgroundColor: 'default', textAlignment: 'left', textColor: 'default' }, content: [{ type: 'text', text: 'aa' }] }] },
        { type: 'blockContainer', attrs: { id: 'block-3' }, content: [{ type: 'paragraph', attrs: { backgroundColor: 'default', textAlignment: 'left', textColor: 'default' }, content: [{ type: 'text', text: 'a' }] }] },
        { type: 'blockContainer', attrs: { id: 'block-2' }, content: [{ type: 'paragraph', attrs: { backgroundColor: 'default', textAlignment: 'left', textColor: 'default' }, content: [{ type: 'text', text: 'a' }] }] }
      ]
    }]
  }

  assertDocJSON(view1.state.doc, expected, 'Client 1 split with IDs')
  assertDocJSON(view2.state.doc, expected, 'Client 2 synced')
}

/**
 * Update the ID on a single paragraph block via setNodeAttribute.
 */
export const testBlockNoteSetNodeAttribute = () => {
  const doc1 = new Y.Doc()
  const doc2 = new Y.Doc()
  setupTwoWaySync(doc1, doc2)

  const view1 = createPMView(schema, doc1.get('prosemirror'))
  const view2 = createPMView(schema, doc2.get('prosemirror'))

  // Type text and assign initial ID
  const textPos = findFirstTextPosition(view1.state.doc)
  view1.dispatch(view1.state.tr.insertText('hello', textPos))
  assignBlockIds(view1, ['block-1'])

  // Update the ID and append text in the same transaction
  const updatePos = findFirstTextPosition(view1.state.doc) + 5
  const tr = view1.state.tr
    .setNodeAttribute(1, 'id', 'block-new')
    .insertText(' world', updatePos)
  view1.dispatch(tr)

  const expected = {
    type: 'doc',
    content: [{
      type: 'blockGroup',
      content: [
        { type: 'blockContainer', attrs: { id: 'block-new' }, content: [{ type: 'paragraph', attrs: { backgroundColor: 'default', textAlignment: 'left', textColor: 'default' }, content: [{ type: 'text', text: 'hello world' }] }] }
      ]
    }]
  }

  assertDocJSON(view1.state.doc, expected, 'Client 1 updated ID and text')
  assertDocJSON(view2.state.doc, expected, 'Client 2 synced')
}
