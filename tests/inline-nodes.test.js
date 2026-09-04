import * as YPM from '@y/prosemirror'
import * as Y from '@y/y'
import * as delta from 'lib0/delta'
import * as t from 'lib0/testing'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { schema } from './complexSchema.js'

/**
 * Tests for the built-in `inlineAnonymousNodes` pipeline stage: documents in
 * the OLD y-prosemirror representation (elements containing a nested
 * anonymous text container, `doc > paragraph > <name:null>"text"</>`) must
 * render through the flat binding. Edits inside a flattened container route
 * back INTO the nested node (old representation preserved); new content is
 * written flat. See src/transformers/inline-anonymous-nodes.js.
 */

/**
 * Seed the OLD y-prosemirror representation:
 * `doc > paragraph > <anonymous>"hello " + em("world")</>`
 *
 * @param {Y.Node} ytype
 */
const seedOldRepresentation = (ytype) => {
  const textContainer = delta.create().insert('hello ').insert('world', { em: {} })
  const paragraph = delta.create('paragraph', {}).insert(/** @type {any} */ ([textContainer]))
  ytype.applyDelta(delta.create().insert(/** @type {any} */ ([paragraph])).done())
}

/**
 * @param {Y.Node} ytype
 */
const mkView = (ytype) => {
  const view = new EditorView({ mount: document.createElement('div') }, {
    state: EditorState.create({ schema, plugins: [YPM.syncPlugin({})] })
  })
  YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
  return view
}

/**
 * @param {import('prosemirror-model').Node} doc
 * @param {object} expected
 * @param {string} message
 */
const assertDocJSON = (doc, expected, message) => {
  t.compare(JSON.parse(JSON.stringify(doc.toJSON())), expected, message)
}

/**
 * Inserted child *node* elements of a delta.
 *
 * @param {delta.DeltaAny} d
 * @return {Array<delta.DeltaAny>}
 */
const nodeChildren = (d) => {
  /**
   * @type {Array<delta.DeltaAny>}
   */
  const els = []
  for (const op of d.children) {
    if (delta.$insertOp.check(op)) {
      for (const el of op.insert) {
        if (delta.$deltaAny.check(el)) els.push(el)
      }
    }
  }
  return els
}

/**
 * Concatenated direct text content of a delta.
 *
 * @param {delta.DeltaAny} d
 * @return {string}
 */
const textOf = (d) => {
  let str = ''
  for (const op of d.children) {
    if (delta.$textOp.check(op)) str += op.insert
  }
  return str
}

const expectedFlatDoc = {
  type: 'doc',
  content: [{
    type: 'paragraph',
    content: [
      { type: 'text', text: 'hello ' },
      { type: 'text', marks: [{ type: 'em' }], text: 'world' }
    ]
  }]
}

/**
 * Two live docs with update forwarding + a seeded old-representation ytype.
 */
const twoPeerSetup = () => {
  const ydoc1 = new Y.Doc({ gc: false })
  const ydoc2 = new Y.Doc({ gc: false })
  ydoc1.on('update', (/** @type {Uint8Array} */ u) => Y.applyUpdate(ydoc2, u))
  ydoc2.on('update', (/** @type {Uint8Array} */ u) => Y.applyUpdate(ydoc1, u))
  const ytype1 = ydoc1.get('prosemirror')
  seedOldRepresentation(ytype1)
  return { ydoc1, ydoc2, ytype1, ytype2: ydoc2.get('prosemirror') }
}

/**
 * Fresh doc hydrated from an update — verifies the resulting (possibly mixed)
 * representation decodes and renders from scratch.
 *
 * @param {Y.Doc} src
 */
const freshHydratedView = (src) => {
  const ydoc3 = new Y.Doc({ gc: false })
  Y.applyUpdate(ydoc3, Y.encodeStateAsUpdate(src))
  return mkView(ydoc3.get('prosemirror'))
}

/**
 * @param {t.TestCase} _tc
 */
export const testOldRepresentationRenders = (_tc) => {
  const ydoc = new Y.Doc({ gc: false })
  const ytype = ydoc.get('prosemirror')
  seedOldRepresentation(ytype)
  const view = mkView(ytype)
  assertDocJSON(view.state.doc, expectedFlatDoc, 'old-representation doc renders flat (marks intact)')
  const paragraph = nodeChildren(/** @type {any} */ (ytype.toDeltaDeep()))[0]
  t.assert(paragraph != null && paragraph.name === 'paragraph', 'paragraph preserved in Y')
  const anon = nodeChildren(paragraph)[0]
  t.assert(anon != null && anon.name === null, 'Y keeps the nested anonymous text container')
  t.compare(textOf(anon), 'hello world', 'text still lives inside the anonymous container')
  view.destroy()
}

/**
 * @param {t.TestCase} _tc
 */
export const testEditRoutesIntoNestedContainer = (_tc) => {
  const { ydoc1, ytype1, ytype2 } = twoPeerSetup()
  const view1 = mkView(ytype1)
  const view2 = mkView(ytype2)
  // strict interior of the flattened text: PM pos 6 = text offset 5 ('hello|')
  view1.dispatch(view1.state.tr.insertText('X', 6))
  t.compare(view2.state.doc.toJSON(), view1.state.doc.toJSON(), 'peers converge')
  assertDocJSON(view1.state.doc, {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [
        { type: 'text', text: 'helloX ' },
        { type: 'text', marks: [{ type: 'em' }], text: 'world' }
      ]
    }]
  }, 'edit rendered flat')
  const anon = nodeChildren(nodeChildren(/** @type {any} */ (ytype1.toDeltaDeep()))[0])[0]
  t.assert(anon != null && anon.name === null, 'container still anonymous')
  t.compare(textOf(anon), 'helloX world', 'interior insert routed INTO the nested container')
  const view3 = freshHydratedView(ydoc1)
  t.compare(view3.state.doc.toJSON(), view1.state.doc.toJSON(), 'fresh hydration matches')
  view1.destroy()
  view2.destroy()
  view3.destroy()
}

/**
 * @param {t.TestCase} _tc
 */
export const testNewContentLandsFlat = (_tc) => {
  const { ydoc1, ytype1, ytype2 } = twoPeerSetup()
  const view1 = mkView(ytype1)
  const view2 = mkView(ytype2)
  // the old-representation paragraph spans PM pos 0..13; insert a new paragraph after it
  view1.dispatch(view1.state.tr.insert(13, schema.nodes.paragraph.create(null, schema.text('new'))))
  t.compare(view2.state.doc.toJSON(), view1.state.doc.toJSON(), 'peers converge')
  const pars = nodeChildren(/** @type {any} */ (ytype1.toDeltaDeep()))
  t.assert(pars.length === 2, 'two paragraphs in Y')
  t.assert(nodeChildren(pars[0])[0]?.name === null, 'old paragraph keeps its nested container')
  t.assert(nodeChildren(pars[1]).length === 0, 'new paragraph stored FLAT (no anonymous wrapper)')
  t.compare(textOf(pars[1]), 'new', 'new paragraph text is a direct string insert')
  const view3 = freshHydratedView(ydoc1)
  t.compare(view3.state.doc.toJSON(), view1.state.doc.toJSON(), 'mixed representation hydrates')
  view1.destroy()
  view2.destroy()
  view3.destroy()
}

/**
 * @param {t.TestCase} _tc
 */
export const testSplitOldRepresentationParagraph = (_tc) => {
  const { ydoc1, ytype1, ytype2 } = twoPeerSetup()
  const view1 = mkView(ytype1)
  const view2 = mkView(ytype2)
  view1.dispatch(view1.state.tr.split(6)) // 'hello' | ' world'
  assertDocJSON(view1.state.doc, {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: ' ' },
          { type: 'text', marks: [{ type: 'em' }], text: 'world' }
        ]
      }
    ]
  }, 'split applied locally')
  // which paragraph keeps the nested container after a split is
  // diff-pairing-ambiguous, so assert convergence + hydration only
  t.compare(view2.state.doc.toJSON(), view1.state.doc.toJSON(), 'peers converge after split')
  const view3 = freshHydratedView(ydoc1)
  t.compare(view3.state.doc.toJSON(), view1.state.doc.toJSON(), 'post-split Y state hydrates')
  view1.destroy()
  view2.destroy()
  view3.destroy()
}
