import * as t from 'lib0/testing'
import * as YPM from '@y/prosemirror'
import * as basicSchema from 'prosemirror-schema-basic'
import * as Y from '@y/y'
import { EditorState, Plugin } from 'prosemirror-state'
import { Fragment, Schema, Slice } from 'prosemirror-model'
import * as delta from 'lib0/delta'
import { findWrapping, ReplaceAroundStep } from 'prosemirror-transform'
import { EditorView } from 'prosemirror-view'
import { setupTwoWaySync } from './cohort.js'

const schema = new Schema({
  nodes: basicSchema.nodes,
  marks: basicSchema.marks
})

/**
 * @param {Y.Type} ytype
 * @param {Y.AbstractAttributionManager} [attributionManager]
 * @param {Array<Plugin>} [extraPlugins]
 */
const createProsemirrorView = (ytype, attributionManager = Y.noAttributionsManager, extraPlugins = []) => {
  const view = new EditorView({ mount: document.createElement('div') }, {
    state: EditorState.create({
      schema,
      plugins: [YPM.syncPlugin(), ...extraPlugins]
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
 * @param {delta.Delta} [initialDelta]
 * @param {Array<Plugin>} [extraPlugins]
 */
const testHelper = (changes,
  // never change this structure!
  // <heading>[1]Hello World![13]</heading>[14]<paragraph>[15]Lorem [21]ipsum..[28]</paragraph>[29]
  initialDelta = (delta.create().insert([delta.create('heading', { level: 1 }, 'Hello World!'), delta.create('paragraph', {}, 'Lorem ipsum..')]).done()),
  extraPlugins = []) => {
  const ydoc = new Y.Doc()
  const ydoc2 = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  ytype.applyDelta(initialDelta)
  setupTwoWaySync(ydoc, ydoc2)
  const view = createProsemirrorView(ytype, undefined, extraPlugins)
  const view2 = createProsemirrorView(ydoc2.get('prosemirror'), undefined, extraPlugins)

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

export const testFilledBlockquote = () => {
  testHelper([
    ({ tr }) => {
      console.log(tr.doc.toString())
      return tr
    }
  ],
  // blockquote needs a paragraph with block+, but we intentionally don't create it here
  delta.create().insert([delta.create('blockquote', {})]).done())
}

export const testFilledBlockquoteInsert = () => {
  testHelper([
    ({ tr }) => tr.insertText('Hello', 2)
  ], delta.create().insert([delta.create('blockquote', {})]).done())
}

// Test: appendTransaction that adds marks syncs to second client
export const testAppendTransactionMarkSync = () => {
  // appendTransaction that bolds any text containing "BOLD"
  const autoBoldPlugin = new Plugin({
    appendTransaction (_trs, _oldState, newState) {
      const { tr } = newState
      let modified = false
      newState.doc.descendants((node, pos) => {
        if (!node.isText || node.text == null) return
        const idx = node.text.indexOf('BOLD')
        if (idx === -1) return
        const from = pos + idx
        const to = from + 4
        const strong = newState.schema.marks.strong.create()
        if (!strong.isInSet(newState.doc.resolve(from + 1).marks())) {
          tr.addMark(from, to, strong)
          modified = true
        }
      })
      return modified ? tr : null
    }
  })
  testHelper([
    ({ tr }) => tr.insertText('say BOLD stuff', 1, 1)
  ], delta.create().insert([delta.create('paragraph', {}, '')]).done(), [autoBoldPlugin])
}

// Test: ephemeral state.apply() should not permanently mutate the Y.Doc
export const testEphemeralStateDoesNotAffectSync = () => {
  const ydoc1 = new Y.Doc()
  const ydoc2 = new Y.Doc()
  ydoc1.get('prosemirror').applyDelta(
    delta.create().insert([delta.create('paragraph', {}, '')]).done()
  )
  setupTwoWaySync(ydoc1, ydoc2)
  const view1 = createProsemirrorView(ydoc1.get('prosemirror'))
  const view2 = createProsemirrorView(ydoc2.get('prosemirror'))

  // Simulate input-rules pattern: speculatively apply a transaction, then discard it
  view1.state.apply(view1.state.tr.insertText('ephemeral'))

  // Now dispatch different text on the real state
  view1.dispatch(view1.state.tr.insertText('Hello'))

  // The view should only contain the dispatched text, not the ephemeral text
  t.assert(view1.state.doc.textContent === 'Hello', 'ephemeral apply should not leak into view1')
  t.assert(view2.state.doc.textContent === 'Hello', 'ephemeral apply should not leak into view2')
}
