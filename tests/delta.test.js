import * as t from 'lib0/testing'
import * as ypm from '../src/index.js'
import * as basicSchema from 'prosemirror-schema-basic'
import * as Y from '@y/y'
import { EditorState } from 'prosemirror-state'
import { Fragment, Schema, Slice } from 'prosemirror-model'
import * as delta from 'lib0/delta'
import { ReplaceAroundStep } from 'prosemirror-transform'

const schema = new Schema({
  nodes: basicSchema.nodes,
  marks: basicSchema.marks
})

const createProsemirrorView = () => {
  const view = new ypm.YEditorView(null, {
    state: EditorState.create({
      schema
    })
  })
  return view
}

/**
 * @param {ypm.YEditorView} pm
 */
const validate = pm => {
  const ycontent = pm.y.ytype.getContentDeep()
  ycontent.name = 'doc'
  const pcontent = ypm.nodeToDelta(pm.state.doc)
  t.compare(ycontent, pcontent.done(false))
}

/**
 * @typedef {object} YPMTestConf
 * @property {import('prosemirror-state').Transaction} YPMTest.tr
 * @property {ypm.YEditorView} YPMTest.view
 * @property {Y.XmlFragment} YPMTest.ytype
 * @property {import('prosemirror-state').Transaction} YPMTest.tr2
 * @property {ypm.YEditorView} YPMTest.view2
 * @property {Y.XmlFragment} YPMTest.ytype2
 */

/**
 * @param {Array<(opts:YPMTestConf)=>(delta.DeltaAny|import('prosemirror-state').Transaction|null)>} changes
 */
const testHelper = (changes) => {
  /**
   * @param {t.TestCase} _tc
   */
  return _tc => {
    // sync two ydocs
    const ydoc = new Y.Doc()
    const ydoc2 = new Y.Doc()
    ydoc.on('update', update => {
      Y.applyUpdate(ydoc2, update)
    })
    ydoc2.on('update', update => {
      Y.applyUpdate(ydoc, update)
    })
    const view = createProsemirrorView()
    const ytype = ydoc.getXmlFragment('prosemirror')
    // never change this structure!
    // <heading>[1]Hello World![13]</heading>[14]<paragraph>[15]Lorem [21]ipsum..[28]</paragraph>[29]
    ytype.applyDelta(delta.create().insert([delta.create('heading',{level:1},'Hello World!'), delta.create('paragraph', {}, 'Lorem ipsum..')]))
    view.bindYType(ytype)
    const view2 = createProsemirrorView()
    view2.bindYType(ydoc2.getXmlFragment('prosemirror'))
    changes.forEach(change => {
      const ytype = view.y.ytype
      const tr = change({
        tr: view.state.tr,
        view,
        ytype,
        tr2: view2.state.tr,
        view2,
        ytype2: view2.y.ytype
      })
      if (delta.$deltaAny.check(tr)) {
        ytype.applyDelta(tr)
      } else if (tr != null) {
        view.dispatch(tr)
      }
      validate(view)
      validate(view2)
      t.compare(ytype.getContentDeep(), view2.y.ytype.getContentDeep())
    })
    console.log('final pm document:', view.state.doc.toJSON())
  }
}

export const testBase = testHelper([])

export const testDeleteRangeOverPartialNodes = testHelper([
  ({tr}) => tr.insert(0, schema.node('paragraph',undefined,schema.text('789'))).insert(0, schema.node('paragraph',undefined,schema.text('456'))).insert(0, schema.node('paragraph',undefined,schema.text('123'))),
  ({tr}) => tr.delete(2, 12)
])

export const testDeleteRangeOverPartialNodes2 = testHelper([
  () => delta.create(null, {}, [delta.create('paragraph',{},'123'), delta.create('paragraph',{},'456'), delta.create('paragraph', {}, '789')]),
  ({tr}) => tr.delete(2, 12)
])

export const testFormatting = testHelper([
  ({tr}) => tr.addMark(7, 12, schema.mark('strong'))
])

export const testBaseInsert = testHelper([
  ({tr}) => tr.insert(16, schema.text('XXX'))
])

export const testReplaceAround = testHelper([
  ({tr}) => tr.step(new ReplaceAroundStep(14, 29, 14, 29, new Slice(Fragment.from(schema.nodes.blockquote.create()), 0, 0), 1, true))
])

export const testAttrStep = testHelper([
  ({tr}) => tr.setNodeAttribute(0, 'level', 2)
])
