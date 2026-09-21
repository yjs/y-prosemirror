import * as t from 'lib0/testing'
import * as YPM from '@y/prosemirror'
import * as basicSchema from 'prosemirror-schema-basic'
import * as Y from '@y/y'
import { EditorState } from 'prosemirror-state'
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
 * @param {Y.Node} ytype
 * @param {Y.AbstractRenderer?} renderer
 */
const createProsemirrorView = (ytype, renderer = null) => {
  const view = new EditorView({ mount: document.createElement('div') }, {
    state: EditorState.create({
      schema,
      plugins: [YPM.syncPlugin()]
    })
  })
  YPM.configureYProsemirror({ ytype, renderer })(view.state, view.dispatch)
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
 * @property {Y.Node} YPMTest.ytype
 * @property {import('prosemirror-state').Transaction} YPMTest.tr2
 * @property {EditorView} YPMTest.view2
 * @property {Y.Node} YPMTest.ytype2
 */

/**
 * @param {Array<(opts:YPMTestConf)=>(delta.DeltaAny|import('prosemirror-state').Transaction|null)>} changes
 * @param {delta.Delta} [initialDelta]
 */
const testHelper = (changes,
  // never change this structure!
  // <heading>[1]Hello World![13]</heading>[14]<paragraph>[15]Lorem [21]ipsum..[28]</paragraph>[29]
  initialDelta = (delta.create().insert([delta.create('heading', { level: 1 }, 'Hello World!'), delta.create('paragraph', {}, 'Lorem ipsum..')]).done())) => {
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

  ytype.applyDelta(initialDelta)
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
    () => /** @type {any} */ (delta.create(null, {}, [delta.create('paragraph', {}, '123'), delta.create('paragraph', {}, '456'), delta.create('paragraph', {}, '789')])),
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

/**
 * An empty blockquote in the initial Y content is invalid (`block+`), so the
 * binding drops it instead of filling it (yjs/y-prosemirror#258). With
 * prosemirror-schema-basic's `doc: block+` the document itself is then
 * refilled with one paragraph, and the filler reaches Y through the fix.
 * `testHelper` validates that Y and both views agree.
 */
export const testEmptyBlockquoteDroppedAtBind = () => {
  testHelper([
    ({ tr }) => {
      t.compare(tr.doc.toJSON(), { type: 'doc', content: [{ type: 'paragraph' }] }, 'the blockquote was dropped and the document refilled')
      return null
    }
  ],
  // blockquote needs a paragraph with block+, and we intentionally leave it empty
  delta.create().insert([delta.create('blockquote', {})]).done())
}

/**
 * Editing continues normally after the drop: the text lands in the filler
 * paragraph (position 1 is inside it, position 2 would be the end of the doc).
 */
export const testEmptyBlockquoteDroppedThenEdit = () => {
  testHelper([
    ({ tr }) => tr.insertText('Hello', 1),
    ({ tr }) => {
      t.assert(tr.doc.textContent === 'Hello' && tr.doc.childCount === 1 && tr.doc.firstChild?.type.name === 'paragraph', 'the edit landed in the single paragraph')
      return null
    }
  ], delta.create().insert([delta.create('blockquote', {})]).done())
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

const docAttrsSchema = new Schema({
  nodes: basicSchema.schema.spec.nodes.update('doc', { ...basicSchema.nodes.doc, attrs: { title: { default: '' } } }),
  marks: basicSchema.marks
})

/**
 * @param {Y.Node} ytype
 */
const createDocAttrsView = ytype => {
  const view = new EditorView({ mount: document.createElement('div') }, {
    state: EditorState.create({ schema: docAttrsSchema, plugins: [YPM.syncPlugin()] })
  })
  YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
  return view
}

/**
 * @param {Y.Node} ytype
 */
const yTitle = ytype => /** @type {any} */ (ytype.toDeltaDeep().toJSON()).attrs?.title?.value

/**
 * Stops a runaway fix loop: throws once the docs exchanged more updates than
 * any settled change needs, which ends the loop (the Y side reports and
 * swallows the throw).
 *
 * @param {Array<Y.Doc>} docs
 */
const countUpdates = docs => {
  const counter = { n: 0 }
  docs.forEach(doc => doc.on('update', () => {
    if (++counter.n > 40) throw new Error('runaway update loop')
  }))
  return counter
}

/**
 * Attributes of the root node (ProseMirror doc attributes) render into the
 * view on bind. Setting one used to throw in `deltaToPSteps` (a node-attribute
 * step at position -1); the whole-document fallback then left the view's
 * default in place, and the fix wrote that default back into Y.
 */
export const testDocAttrsSyncedAtBind = () => {
  const ytype = new Y.Doc().get('prosemirror')
  ytype.applyDelta(delta.create().setAttr('title', 'my title').insert([delta.create('paragraph', {}, 'text')]).done())
  const view = createDocAttrsView(ytype)
  t.compare(view.state.doc.attrs.title, 'my title', 'the view renders the doc attribute')
  t.compare(yTitle(ytype), 'my title', 'Y keeps the doc attribute')
  view.destroy()
}

/**
 * A doc attribute set on one peer reaches the other. This used to loop
 * forever: each peer failed to apply the other's value and wrote its own
 * back.
 */
export const testDocAttrChangeSyncsBetweenPeers = () => {
  const ydoc1 = new Y.Doc()
  const ydoc2 = new Y.Doc()
  setupTwoWaySync(ydoc1, ydoc2)
  ydoc1.get('prosemirror').applyDelta(delta.create().insert([delta.create('paragraph', {}, 'text')]).done())
  const view1 = createDocAttrsView(ydoc1.get('prosemirror'))
  const view2 = createDocAttrsView(ydoc2.get('prosemirror'))
  const counter = countUpdates([ydoc1, ydoc2])
  view1.dispatch(view1.state.tr.setDocAttribute('title', 'from peer 1'))
  t.assert(counter.n < 10, `settled (${counter.n} updates)`)
  t.compare(view2.state.doc.attrs.title, 'from peer 1')
  view2.dispatch(view2.state.tr.setDocAttribute('title', 'from peer 2'))
  t.compare(view1.state.doc.attrs.title, 'from peer 2')
  t.compare(yTitle(ydoc1.get('prosemirror')), 'from peer 2')
  t.compare(yTitle(ydoc2.get('prosemirror')), 'from peer 2')
  view1.destroy()
  view2.destroy()
}

/**
 * A remote change that raw steps cannot express (emptying a `block+`
 * blockquote) is applied by replacing the whole document - which must carry
 * a doc-attribute change of the same transaction.
 */
export const testDocAttrSurvivesWholeDocumentFallback = () => {
  const ytype = new Y.Doc().get('prosemirror')
  ytype.applyDelta(delta.create().insert([
    delta.create('blockquote', {}, [delta.create('paragraph', {}, 'quoted')]),
    delta.create('paragraph', {}, 'text')
  ]).done())
  const view = createDocAttrsView(ytype)
  ytype.applyDelta(delta.create().setAttr('title', 'remote').modify(delta.create().delete(1)).done())
  t.compare(view.state.doc.attrs.title, 'remote', 'the view renders the doc attribute')
  t.compare(yTitle(ytype), 'remote', 'Y keeps the doc attribute')
  t.compare(view.state.doc.textContent, 'text', 'the emptied blockquote was dropped')
  view.destroy()
}

/**
 * The first render into an editor bound to an empty ytype replaces the
 * schema-default document wholesale (the initial-content gate) - doc
 * attributes included.
 */
export const testDocAttrOnEmptyYtype = () => {
  const ytype = new Y.Doc().get('prosemirror')
  ytype.applyDelta(delta.create().setAttr('title', 'only a title').done())
  const view = createDocAttrsView(ytype)
  t.compare(view.state.doc.attrs.title, 'only a title', 'the view renders the doc attribute')
  t.compare(yTitle(ytype), 'only a title', 'Y keeps the doc attribute')
  view.destroy()
}

/**
 * `deltaToPSteps` maps a root attribute to a single doc-attribute step
 * instead of throwing (which forced a whole-document replace).
 */
export const testDocAttrIsASingleStep = () => {
  const state = EditorState.create({ schema: docAttrsSchema })
  const tr = YPM.deltaToPSteps(state.tr, /** @type {any} */ (delta.create().setAttr('title', 'x').done()))
  t.compare(tr.doc.attrs.title, 'x')
  t.compare(tr.steps.map(step => step.toJSON().stepType), ['docAttr'])
}

/**
 * Run `f` with `console.warn` captured.
 *
 * @param {() => void} f
 * @return {Array<string>}
 */
const captureWarnings = f => {
  /** @type {Array<string>} */
  const lines = []
  const original = console.warn
  console.warn = (/** @type {any} */ ...args) => { lines.push(args.join(' ')) }
  try {
    f()
  } finally {
    console.warn = original
  }
  return lines
}

/**
 * @param {Schema} s
 * @param {Y.Node} ytype
 */
const createViewWithSchema = (s, ytype) => {
  const view = new EditorView({ mount: document.createElement('div') }, {
    state: EditorState.create({ schema: s, plugins: [YPM.syncPlugin()] })
  })
  YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
  return view
}

/**
 * A mark the schema declares but the parent does not allow (`strong` in a
 * basic-schema `code_block`, `marks: ''`) is dropped with a single warning.
 * Before, a pre-built node slipped it past ProseMirror's validation and the
 * view held a schema-invalid document; `ynodeToPmnode` renders the same
 * valid document.
 */
export const testDisallowedMarkIsDropped = () => {
  const s = new Schema({ nodes: basicSchema.nodes, marks: basicSchema.marks })
  const ytype = new Y.Doc().get('prosemirror')
  ytype.applyDelta(delta.create().insert([delta.create('code_block').insert('code', { strong: true }).done()]).done())
  /** @type {any} */
  let view = null
  const warnings = captureWarnings(() => {
    view = createViewWithSchema(s, ytype)
    createViewWithSchema(s, ytype).destroy()
  })
  view.state.doc.check()
  t.compare(view.state.doc.textContent, 'code')
  t.assert(YPM.ynodeToPmnode(ytype, s).eq(view.state.doc), 'ynodeToPmnode renders what the view shows')
  t.compare(warnings.filter(l => l.includes('"code_block" does not allow the "strong" mark')).length, 1, 'warned once per schema')
  view.destroy()
}

/**
 * A format the schema declares no mark for is dropped with a warning. Before,
 * `schema.mark` threw and the editor never bound.
 */
export const testUndeclaredMarkIsDropped = () => {
  const s = new Schema({ nodes: basicSchema.nodes, marks: basicSchema.marks })
  const ytype = new Y.Doc().get('prosemirror')
  ytype.applyDelta(delta.create().insert([delta.create('paragraph').insert('text', { foo: true, strong: true }).done()]).done())
  /** @type {any} */
  let view = null
  const warnings = captureWarnings(() => { view = createViewWithSchema(s, ytype) })
  view.state.doc.check()
  t.compare(view.state.doc.toJSON().content[0].content, [{ type: 'text', marks: [{ type: 'strong' }], text: 'text' }])
  t.assert(YPM.ynodeToPmnode(ytype, s).eq(view.state.doc), 'ynodeToPmnode renders what the view shows')
  t.compare(warnings.filter(l => l.includes('declares no mark "foo"')).length, 1)
  view.destroy()
}

/**
 * Adding and then clearing a format the schema does not declare leaves the
 * other marks alone. The clear used to reach `tr.removeMark` without a mark,
 * which removes every mark in the range - and the fix then deleted them from
 * Y. The addition used to throw out of `ytype.applyDelta`.
 */
export const testRemoteUndeclaredMarkKeepsOtherMarks = () => {
  const s = new Schema({ nodes: basicSchema.nodes, marks: basicSchema.marks })
  const ytype = new Y.Doc().get('prosemirror')
  ytype.applyDelta(delta.create().insert([delta.create('paragraph').insert('bold', { strong: true }).done()]).done())
  const view = createViewWithSchema(s, ytype)
  captureWarnings(() => {
    ytype.applyDelta(delta.create().modify(delta.create().retain(4, { foo: true }).done()).done())
    ytype.applyDelta(delta.create().modify(delta.create().retain(4, { foo: null }).done()).done())
  })
  t.compare(view.state.doc.toJSON().content[0].content, [{ type: 'text', marks: [{ type: 'strong' }], text: 'bold' }], 'the view keeps strong')
  t.compare(JSON.parse(JSON.stringify(ytype.toDeltaDeep().toJSON())).children[0].insert[0].children[0].format, { strong: {} }, 'Y keeps strong')
  view.destroy()
}
