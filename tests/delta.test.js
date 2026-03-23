import * as t from 'lib0/testing'
import * as YPM from '@y/prosemirror'
import * as basicSchema from 'prosemirror-schema-basic'
import * as Y from '@y/y'
import { EditorState } from 'prosemirror-state'
import { Fragment, Schema, Slice } from 'prosemirror-model'
import * as delta from 'lib0/delta'
import { findWrapping, ReplaceAroundStep } from 'prosemirror-transform'
import { EditorView } from 'prosemirror-view'
import * as promise from 'lib0/promise'

const schema = new Schema({
  nodes: basicSchema.nodes,
  marks: basicSchema.marks
})

/**
 * @param {Y.Type} ytype
 * @param {Y.AbstractAttributionManager} attributionManager
 */
const createProsemirrorView = async (ytype, attributionManager = Y.noAttributionsManager) => {
  const view = new EditorView({ mount: document.createElement('div') }, {
    state: EditorState.create({
      schema,
      plugins: [YPM.syncPlugin()]
    })
  })
  YPM.configure(view.state, view.dispatch, { ytype, attributionManager })
  await promise.wait(1)
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
const testHelper = async changes => {
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
  const view = await createProsemirrorView(ytype)
  const view2 = await createProsemirrorView(ydoc2.get('prosemirror'))

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
    await promise.wait(1)
    validate(view)
    validate(view2)
    t.compare(ytype.toDeltaDeep(), ytype2.toDeltaDeep())
  }
  console.log('final pm document:', JSON.stringify(view.state.doc.toJSON(), null, 2))
}

export const testBase = async () => {
  await testHelper([])
}

export const testDeleteRangeOverPartialNodes = async () => {
  await testHelper([
    ({ tr }) => tr.insert(0, schema.node('paragraph', undefined, schema.text('789'))).insert(0, schema.node('paragraph', undefined, schema.text('456'))).insert(0, schema.node('paragraph', undefined, schema.text('123'))),
    ({ tr }) => tr.delete(2, 12)
  ])
}

export const testDeleteRangeOverPartialNodes2 = async () => {
  await testHelper([
    () => delta.create(null, {}, [delta.create('paragraph', {}, '123'), delta.create('paragraph', {}, '456'), delta.create('paragraph', {}, '789')]),
    ({ tr }) => tr.delete(2, 12)
  ])
}

export const testFormatting = async () => {
  await testHelper([
    ({ tr }) => tr.addMark(7, 12, schema.mark('strong'))
  ])
}

export const testBaseInsert = async () => {
  await testHelper([
    ({ tr }) => tr.insert(16, schema.text('XXX'))
  ])
}

export const testReplaceAround = async () => {
  await testHelper([
    ({ tr }) => tr.step(new ReplaceAroundStep(14, 29, 14, 29, new Slice(Fragment.from(schema.nodes.blockquote.create()), 0, 0), 1, true))
  ])
}

export const testAttrStep = async () => {
  await testHelper([
    ({ tr }) => tr.setNodeAttribute(0, 'level', 2)
  ])
}

export const testMultipleSimpleSteps = async () => {
  await testHelper([
    ({ tr }) => {
      tr.insertText('abc', 15)

      tr.insertText('def', 13)
      return tr
    }
  ])
}

export const testWrapping = async () => {
  await testHelper([
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

export const testMultipleComplexSteps = async () => {
  await testHelper([
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
