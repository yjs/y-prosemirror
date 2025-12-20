import * as t from 'lib0/testing'
import * as ypm from '../src/index.js'
import * as basicSchema from 'prosemirror-schema-basic'
import * as Y from '@y/y'
import { EditorState } from 'prosemirror-state'
import { Fragment, Schema, Slice } from 'prosemirror-model'
import * as delta from 'lib0/delta'
import { findWrapping, ReplaceAroundStep } from 'prosemirror-transform'
import { EditorView } from 'prosemirror-view'
import { ySyncPluginKey } from '../src/plugins/keys.js'
import { promise } from 'lib0'

const schema = new Schema({
  nodes: basicSchema.nodes,
  marks: basicSchema.marks
})

/**
 * @param {Y.XmlFragment} ytype
 * @param {Y.AbstractAttributionManager} [attributionManager]
 */
const createProsemirrorView = async (ytype, attributionManager) => {
  const view = new EditorView({ mount: document.createElement('div') }, {
    state: EditorState.create({
      schema,
      plugins: [ypm.syncPlugin(ytype, { attributionManager })]
    })
  })
  await promise.wait(1)
  return view
}

/**
 * @param {EditorView} pm
 */
const validate = pm => {
  const ycontent = ySyncPluginKey.getState(pm.state).ytype.getContentDeep()
  ycontent.name = 'doc'
  const pcontent = ypm.nodeToDelta(pm.state.doc)
  const ycontentJson = JSON.stringify(ycontent.toJSON ? ycontent.toJSON() : ycontent, null, 2)
  const pcontentJson = JSON.stringify(pcontent.done(false).toJSON ? pcontent.done(false).toJSON() : pcontent.done(false), null, 2)
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
 * @property {Y.XmlFragment} YPMTest.ytype
 * @property {import('prosemirror-state').Transaction} YPMTest.tr2
 * @property {EditorView} YPMTest.view2
 * @property {Y.XmlFragment} YPMTest.ytype2
 */

/**
 * @param {Array<(opts:YPMTestConf)=>(delta.DeltaAny|import('prosemirror-state').Transaction|null)>} changes
 */
const testHelper = (changes) => {
  /**
   * @param {t.TestCase} _tc
   */
  return async _tc => {
    // sync two ydocs
    const ydoc = new Y.Doc()
    const ydoc2 = new Y.Doc()
    ydoc.on('update', update => {
      Y.applyUpdate(ydoc2, update)
    })
    ydoc2.on('update', update => {
      Y.applyUpdate(ydoc, update)
    })
    const ytype = ydoc.getXmlFragment('prosemirror')
    // never change this structure!
    // <heading>[1]Hello World![13]</heading>[14]<paragraph>[15]Lorem [21]ipsum..[28]</paragraph>[29]
    ytype.applyDelta(delta.create().insert([delta.create('heading', { level: 1 }, 'Hello World!'), delta.create('paragraph', {}, 'Lorem ipsum..')]))
    const view = await createProsemirrorView(ytype)
    const view2 = await createProsemirrorView(ydoc2.getXmlFragment('prosemirror'))

    for (const change of changes) {
      const ytype = ySyncPluginKey.getState(view.state).ytype
      const ytype2 = ySyncPluginKey.getState(view2.state).ytype
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
      t.compare(ytype.getContentDeep(), ytype2.getContentDeep())
    }
    console.log('final pm document:', JSON.stringify(view.state.doc.toJSON(), null, 2))
  }
}

export const testBase = testHelper([])

export const testDeleteRangeOverPartialNodes = testHelper([
  ({ tr }) => tr.insert(0, schema.node('paragraph', undefined, schema.text('789'))).insert(0, schema.node('paragraph', undefined, schema.text('456'))).insert(0, schema.node('paragraph', undefined, schema.text('123'))),
  ({ tr }) => tr.delete(2, 12)
])

export const testDeleteRangeOverPartialNodes2 = testHelper([
  () => delta.create(null, {}, [delta.create('paragraph', {}, '123'), delta.create('paragraph', {}, '456'), delta.create('paragraph', {}, '789')]),
  ({ tr }) => tr.delete(2, 12)
])

export const testFormatting = testHelper([
  ({ tr }) => tr.addMark(7, 12, schema.mark('strong'))
])

export const testBaseInsert = testHelper([
  ({ tr }) => tr.insert(16, schema.text('XXX'))
])

export const testReplaceAround = testHelper([
  ({ tr }) => tr.step(new ReplaceAroundStep(14, 29, 14, 29, new Slice(Fragment.from(schema.nodes.blockquote.create()), 0, 0), 1, true))
])

export const testAttrStep = testHelper([
  ({ tr }) => tr.setNodeAttribute(0, 'level', 2)
])

export const testMultipleSimpleSteps = testHelper([
  ({ tr }) => {
    tr.insertText('abc', 15)

    tr.insertText('def', 13)
    return tr
  }
])

export const testWrapping = testHelper([
  ({ tr }) => {
    const blockRange = tr.doc.resolve(15).blockRange(tr.doc.resolve(28))

    const wrapping = findWrapping(blockRange, schema.nodes.blockquote)
    tr.wrap(blockRange, wrapping)
    return tr
  }
])

export const testMultipleComplexSteps = testHelper([
  ({ tr }) => {
    tr.insertText('abc', 16)

    const blockRange = tr.doc.resolve(15).blockRange(tr.doc.resolve(28))

    const wrapping = findWrapping(blockRange, schema.nodes.blockquote)
    tr.wrap(blockRange, wrapping)
    return tr
  }
])
