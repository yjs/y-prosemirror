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

/**
 * Create a view with an appendTransaction plugin and two-way Y sync.
 * @param {Y.Type} ytype
 * @param {Y.Type} ytype2
 * @param {Plugin} appendPlugin
 */
const createSyncedViewWithAppend = (ytype, ytype2, appendPlugin) => {
  const view = new EditorView({ mount: document.createElement('div') }, {
    state: EditorState.create({
      schema,
      plugins: [YPM.syncPlugin(), appendPlugin]
    })
  })
  YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
  const view2 = createProsemirrorView(ytype2)
  return { view, view2, ytype, ytype2 }
}

/**
 * Validate that both views and both Y types are in sync.
 * @param {EditorView} view
 * @param {EditorView} view2
 * @param {Y.Type} ytype
 * @param {Y.Type} ytype2
 */
const validateAll = (view, view2, ytype, ytype2) => {
  validate(view)
  validate(view2)
  t.compare(ytype.toDeltaDeep(), ytype2.toDeltaDeep(), 'Y types diverged')
}

export const testAppendTransactionInsertContent = () => {
  const ydoc = new Y.Doc()
  const ydoc2 = new Y.Doc()
  setupTwoWaySync(ydoc, ydoc2)
  const ytype = ydoc.get('prosemirror')
  ytype.applyDelta(delta.create().insert([delta.create('paragraph', {}, 'start')]).done())

  const appendPlugin = new Plugin({
    appendTransaction: (trs, _oldState, newState) => {
      const isUserTr = trs.some(tr =>
        !tr.getMeta('y-sync-transaction') &&
        !tr.getMeta(YPM.ySyncPluginKey) &&
        !tr.getMeta('append-marker') &&
        tr.docChanged
      )
      if (!isUserTr) return null
      if (newState.doc.textContent.includes('APPENDED')) return null
      const tr = newState.tr
      tr.insert(tr.doc.content.size, schema.node('paragraph', undefined, schema.text('APPENDED')))
      tr.setMeta('append-marker', true)
      return tr
    }
  })

  const { view, view2, ytype2 } = createSyncedViewWithAppend(ytype, ydoc2.get('prosemirror'), appendPlugin)

  view.dispatch(view.state.tr.insertText('Hello', 1))
  t.assert(view.state.doc.textContent.includes('Hello'), 'user content present')
  t.assert(view.state.doc.textContent.includes('APPENDED'), 'appended content present')
  validateAll(view, view2, ytype, ytype2)
}

export const testAppendTransactionDeleteContent = () => {
  const ydoc = new Y.Doc()
  const ydoc2 = new Y.Doc()
  setupTwoWaySync(ydoc, ydoc2)
  const ytype = ydoc.get('prosemirror')
  ytype.applyDelta(delta.create().insert([
    delta.create('paragraph', {}, 'keep'),
    delta.create('paragraph', {}, 'REMOVE_ME')
  ]).done())

  const appendPlugin = new Plugin({
    appendTransaction: (trs, _oldState, newState) => {
      const isUserTr = trs.some(tr =>
        !tr.getMeta('y-sync-transaction') &&
        !tr.getMeta(YPM.ySyncPluginKey) &&
        !tr.getMeta('append-marker') &&
        tr.docChanged
      )
      if (!isUserTr) return null
      if (!newState.doc.textContent.includes('REMOVE_ME')) return null
      const tr = newState.tr
      const lastChild = tr.doc.lastChild
      if (lastChild) {
        const start = tr.doc.content.size - lastChild.nodeSize
        tr.delete(start, tr.doc.content.size)
      }
      tr.setMeta('append-marker', true)
      return tr
    }
  })

  const { view, view2, ytype2 } = createSyncedViewWithAppend(ytype, ydoc2.get('prosemirror'), appendPlugin)

  view.dispatch(view.state.tr.insertText('X', 1))
  t.assert(view.state.doc.textContent.includes('Xkeep'), 'user content present')
  t.assert(!view.state.doc.textContent.includes('REMOVE_ME'), 'appended delete removed content')
  validateAll(view, view2, ytype, ytype2)
}

export const testAppendTransactionAddMark = () => {
  const ydoc = new Y.Doc()
  const ydoc2 = new Y.Doc()
  setupTwoWaySync(ydoc, ydoc2)
  const ytype = ydoc.get('prosemirror')
  ytype.applyDelta(delta.create().insert([delta.create('paragraph', {}, 'bold me')]).done())

  const appendPlugin = new Plugin({
    appendTransaction: (trs, _oldState, newState) => {
      const isUserTr = trs.some(tr =>
        !tr.getMeta('y-sync-transaction') &&
        !tr.getMeta(YPM.ySyncPluginKey) &&
        !tr.getMeta('append-marker') &&
        tr.docChanged
      )
      if (!isUserTr) return null
      const tr = newState.tr
      tr.addMark(1, 5, schema.marks.strong.create())
      tr.setMeta('append-marker', true)
      return tr
    }
  })

  const { view, view2, ytype2 } = createSyncedViewWithAppend(ytype, ydoc2.get('prosemirror'), appendPlugin)

  view.dispatch(view.state.tr.insertText('X', 1))
  validateAll(view, view2, ytype, ytype2)
}

export const testAppendTransactionMultipleRounds = () => {
  const ydoc = new Y.Doc()
  const ydoc2 = new Y.Doc()
  setupTwoWaySync(ydoc, ydoc2)
  const ytype = ydoc.get('prosemirror')
  ytype.applyDelta(delta.create().insert([delta.create('paragraph', {}, 'start')]).done())

  let callCount = 0
  const appendPlugin = new Plugin({
    appendTransaction: (trs, _oldState, newState) => {
      const isUserTr = trs.some(tr =>
        !tr.getMeta('y-sync-transaction') &&
        !tr.getMeta(YPM.ySyncPluginKey) &&
        !tr.getMeta('append-marker') &&
        tr.docChanged
      )
      if (!isUserTr) return null
      if (newState.doc.textContent.includes('FOOTER')) return null
      callCount++
      const tr = newState.tr
      tr.insert(tr.doc.content.size, schema.node('paragraph', undefined, schema.text('FOOTER')))
      tr.setMeta('append-marker', true)
      return tr
    }
  })

  const { view, view2, ytype2 } = createSyncedViewWithAppend(ytype, ydoc2.get('prosemirror'), appendPlugin)

  // Multiple edits, each triggers appendTransaction
  view.dispatch(view.state.tr.insertText('A', 1))
  validateAll(view, view2, ytype, ytype2)

  view.dispatch(view.state.tr.insertText('B', 2))
  validateAll(view, view2, ytype, ytype2)

  view.dispatch(view.state.tr.insertText('C', 3))
  validateAll(view, view2, ytype, ytype2)

  t.assert(view.state.doc.textContent.includes('ABC'), 'all user edits present')
}

export const testAppendTransactionChainedAppends = () => {
  const ydoc = new Y.Doc()
  const ydoc2 = new Y.Doc()
  setupTwoWaySync(ydoc, ydoc2)
  const ytype = ydoc.get('prosemirror')
  ytype.applyDelta(delta.create().insert([delta.create('paragraph', {}, 'hello')]).done())

  // Two separate plugins that each append content
  const appendPlugin1 = new Plugin({
    appendTransaction: (trs, _oldState, newState) => {
      const isUserTr = trs.some(tr =>
        !tr.getMeta('y-sync-transaction') &&
        !tr.getMeta(YPM.ySyncPluginKey) &&
        !tr.getMeta('append-1') &&
        !tr.getMeta('append-2') &&
        tr.docChanged
      )
      if (!isUserTr) return null
      if (newState.doc.textContent.includes('TAG1')) return null
      const tr = newState.tr
      tr.insert(tr.doc.content.size, schema.node('paragraph', undefined, schema.text('TAG1')))
      tr.setMeta('append-1', true)
      return tr
    }
  })
  const appendPlugin2 = new Plugin({
    appendTransaction: (trs, _oldState, newState) => {
      const isRelevant = trs.some(tr => tr.getMeta('append-1'))
      if (!isRelevant) return null
      if (newState.doc.textContent.includes('TAG2')) return null
      const tr = newState.tr
      tr.insert(tr.doc.content.size, schema.node('paragraph', undefined, schema.text('TAG2')))
      tr.setMeta('append-2', true)
      return tr
    }
  })

  const view = new EditorView({ mount: document.createElement('div') }, {
    state: EditorState.create({
      schema,
      plugins: [YPM.syncPlugin(), appendPlugin1, appendPlugin2]
    })
  })
  YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
  const view2 = createProsemirrorView(ydoc2.get('prosemirror'))

  view.dispatch(view.state.tr.insertText('!', 6))
  t.assert(view.state.doc.textContent.includes('hello!'), 'user content present')
  t.assert(view.state.doc.textContent.includes('TAG1'), 'first append present')
  t.assert(view.state.doc.textContent.includes('TAG2'), 'second chained append present')
  validateAll(view, view2, ytype, ydoc2.get('prosemirror'))
}
