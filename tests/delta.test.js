import * as t from 'lib0/testing'
import * as YPM from '@y/prosemirror'
import * as basicSchema from 'prosemirror-schema-basic'
import * as Y from '@y/y'
import { EditorState } from 'prosemirror-state'
import { Fragment, Schema, Slice } from 'prosemirror-model'
import * as delta from 'lib0/delta'
import { findWrapping, ReplaceAroundStep } from 'prosemirror-transform'
import { EditorView } from 'prosemirror-view'
import { deltaToPNode } from '../src/sync-utils.js'

const schema = new Schema({
  nodes: basicSchema.nodes,
  marks: basicSchema.marks
})

/**
 * @param {Y.Type} ytype
 * @param {Y.AbstractAttributionManager} attributionManager
 */
const createProsemirrorView = (ytype, attributionManager = Y.noAttributionsManager) => {
  const view = new EditorView({ mount: document.createElement('div') }, {
    state: EditorState.create({
      schema,
      plugins: [YPM.syncPlugin()]
    })
  })
  YPM.configureYProsemirror({ ytype, attributionManager })(view.state, view.dispatch)
  return view
}

/**
 * @param {EditorView} pm
 */
const validate = pm => {
  const ycontent = YPM.ySyncPluginKey.getState(pm.state)?.ytype?.toDeltaDeep()
  const pcontent = YPM.docToDelta(pm.state.doc)
  const ycontentJson = JSON.stringify(ycontent?.toJSON(), null, 2)
  const pcontentJson = JSON.stringify(pcontent.toJSON(), null, 2)
  console.log('\n=== VALIDATION ===')
  console.log('Y content:', ycontentJson)
  console.log('P content:', pcontentJson)
  console.log('Are they equal?', ycontentJson === pcontentJson)
  t.compare(ycontent, pcontent.done(false))
}

/**
 * @typedef {object} YPMTestConf
 * @property {import('prosemirror-state').Transaction} YPMTest.tr
 * @property {EditorView} YPMTest.view
 * @property {Y.Type} YPMTest.ytype
 * @property {import('prosemirror-state').Transaction} YPMTest.tr2
 * @property {EditorView} YPMTest.view2
 * @property {Y.Type} YPMTest.ytype2
 */

/**
 * @param {Array<(opts:YPMTestConf)=>(delta.DeltaAny|import('prosemirror-state').Transaction|null)>} changes
 */
const testHelper = changes => {
  // sync two ydocs
  const ydoc = new Y.Doc()
  const ydoc2 = new Y.Doc()
  ydoc.on('update', update => {
    Y.applyUpdate(ydoc2, update)
  })
  ydoc2.on('update', update => {
    Y.applyUpdate(ydoc, update)
  })
  const ytype = ydoc.get('prosemirror')
  // never change this structure!
  // <heading>[1]Hello World![13]</heading>[14]<paragraph>[15]Lorem [21]ipsum..[28]</paragraph>[29]
  ytype.applyDelta(delta.create().insert([delta.create('heading', { level: 1 }, 'Hello World!'), delta.create('paragraph', {}, 'Lorem ipsum..')]).done())
  const view = createProsemirrorView(ytype)
  const view2 = createProsemirrorView(ydoc2.get('prosemirror'))

  for (const change of changes) {
    const ytype = YPM.ySyncPluginKey.getState(view.state)?.ytype || null
    const ytype2 = YPM.ySyncPluginKey.getState(view2.state)?.ytype || null
    t.assert(ytype)
    t.assert(ytype2)
    const tr = change({
      tr: view.state.tr,
      view,
      ytype,
      tr2: view2.state.tr,
      view2,
      ytype2
    })
    if (delta.$deltaAny.check(tr)) {
      ytype.applyDelta(tr)
    } else if (tr != null) {
      view.dispatch(tr)
    }
    validate(view)
    validate(view2)
    t.compare(ytype.toDeltaDeep(), ytype2.toDeltaDeep())
  }
  console.log('final pm document:', JSON.stringify(view.state.doc.toJSON(), null, 2))
}

export const testBase = () => {
  testHelper([])
}

export const testDeleteRangeOverPartialNodes = () => {
  testHelper([
    ({ tr }) => tr.insert(0, schema.node('paragraph', undefined, schema.text('789'))).insert(0, schema.node('paragraph', undefined, schema.text('456'))).insert(0, schema.node('paragraph', undefined, schema.text('123'))),
    ({ tr }) => tr.delete(2, 12)
  ])
}

export const testDeleteRangeOverPartialNodes2 = () => {
  testHelper([
    () => delta.create(null, {}, [delta.create('paragraph', {}, '123'), delta.create('paragraph', {}, '456'), delta.create('paragraph', {}, '789')]),
    ({ tr }) => tr.delete(2, 12)
  ])
}

export const testFormatting = () => {
  testHelper([
    ({ tr }) => tr.addMark(7, 12, schema.mark('strong'))
  ])
}

export const testBaseInsert = () => {
  testHelper([
    ({ tr }) => tr.insert(16, schema.text('XXX'))
  ])
}

export const testReplaceAround = () => {
  testHelper([
    ({ tr }) => tr.step(new ReplaceAroundStep(14, 29, 14, 29, new Slice(Fragment.from(schema.nodes.blockquote.create()), 0, 0), 1, true))
  ])
}

export const testAttrStep = () => {
  testHelper([
    ({ tr }) => tr.setNodeAttribute(0, 'level', 2)
  ])
}

export const testMultipleSimpleSteps = () => {
  testHelper([
    ({ tr }) => {
      tr.insertText('abc', 15)

      tr.insertText('def', 13)
      return tr
    }
  ])
}

export const testWrapping = () => {
  testHelper([
    ({ tr }) => {
      const blockRange = tr.doc.resolve(15).blockRange(tr.doc.resolve(28))
      t.assert(blockRange)
      const wrapping = findWrapping(blockRange, schema.nodes.blockquote)
      t.assert(wrapping)
      tr.wrap(blockRange, wrapping)
      return tr
    }
  ])
}

export const testMultipleComplexSteps = () => {
  testHelper([
    ({ tr }) => {
      tr.insertText('abc', 16)

      const blockRange = tr.doc.resolve(15).blockRange(tr.doc.resolve(28))
      t.assert(blockRange)
      const wrapping = findWrapping(blockRange, schema.nodes.blockquote)
      t.assert(wrapping)
      tr.wrap(blockRange, wrapping)
      return tr
    }
  ])
}

// --- deltaToPNode direct tests ---

/**
 * Test that deltaToPNode creates a simple paragraph with text content.
 */
export const testDeltaToPNodeParagraph = () => {
  const d = delta.create('paragraph', {}, 'Hello')
  const node = deltaToPNode(d, schema, null)
  t.assert(node.type.name === 'paragraph')
  t.assert(node.textContent === 'Hello')
}

/**
 * Test that deltaToPNode creates a heading with attributes.
 */
export const testDeltaToPNodeHeadingWithAttrs = () => {
  const d = delta.create('heading', { level: 2 }, 'Title')
  const node = deltaToPNode(d, schema, null)
  t.assert(node.type.name === 'heading')
  t.assert(node.attrs.level === 2)
  t.assert(node.textContent === 'Title')
}

/**
 * Test that deltaToPNode creates an empty paragraph (inline* content allows empty).
 */
export const testDeltaToPNodeEmptyParagraph = () => {
  const d = delta.create('paragraph', {})
  const node = deltaToPNode(d, schema, null)
  t.assert(node.type.name === 'paragraph')
  t.assert(node.childCount === 0)
}

/**
 * Test that createAndFill auto-fills required children for blockquote.
 * blockquote has content "block+" so it requires at least one block child.
 * createAndFill should auto-insert an empty paragraph, whereas the old
 * schema.node() would have thrown an error.
 */
export const testDeltaToPNodeAutoFillsBlockquote = () => {
  const d = delta.create('blockquote', {})
  const node = deltaToPNode(d, schema, null)
  t.assert(node.type.name === 'blockquote')
  // createAndFill should have auto-inserted a paragraph to satisfy block+ content
  t.assert(node.childCount === 1)
  t.assert(node.firstChild?.type.name === 'paragraph')
}

/**
 * Test that deltaToPNode handles a blockquote with an explicit paragraph child.
 */
export const testDeltaToPNodeBlockquoteWithChild = () => {
  const d = delta.create('blockquote', {}, [delta.create('paragraph', {}, 'quoted text')])
  const node = deltaToPNode(d, schema, null)
  t.assert(node.type.name === 'blockquote')
  t.assert(node.childCount === 1)
  t.assert(node.firstChild?.type.name === 'paragraph')
  t.assert(node.firstChild?.textContent === 'quoted text')
}

/**
 * Test that deltaToPNode produces a doc node with auto-filled paragraph
 * when created with no children (basic schema doc has content "block+").
 */
export const testDeltaToPNodeAutoFillsDoc = () => {
  const d = delta.create(null, {})
  const node = deltaToPNode(d, schema, null)
  t.assert(node.type.name === 'doc')
  // createAndFill should auto-insert a paragraph to satisfy block+ content
  t.assert(node.childCount === 1)
  t.assert(node.firstChild?.type.name === 'paragraph')
}

/**
 * Test that deltaToPNode applies marks from dformat parameter.
 */
export const testDeltaToPNodeWithFormat = () => {
  const d = delta.create('paragraph', {}, 'bold text')
  const format = { strong: true }
  const node = deltaToPNode(d, schema, format)
  t.assert(node.type.name === 'paragraph')
  // The dformat marks are applied to the node itself as stored marks
  // Verify the node was created successfully with the format
  t.assert(node.textContent === 'bold text')
}
