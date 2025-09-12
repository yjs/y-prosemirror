import * as t from 'lib0/testing'
import * as prng from 'lib0/prng'
import * as math from 'lib0/math'
import * as Y from 'yjs'
// @ts-ignore
import { applyRandomTests } from 'yjs/testHelper'

import {
  prosemirrorJSONToYDoc,
  prosemirrorJSONToYXmlFragment,
  redo,
  undo,
  yDocToProsemirrorJSON,
  ySyncPlugin,
  ySyncPluginKey,
  yUndoPlugin,
  yUndoPluginKey,
  yXmlFragmentToProsemirrorJSON
} from '../src/y-prosemirror.js'
import { EditorState, Plugin, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { Schema } from 'prosemirror-model'
import * as basicSchema from 'prosemirror-schema-basic'
import { findWrapping } from 'prosemirror-transform'
import { schema as complexSchema } from './complexSchema.js'
import * as promise from 'lib0/promise'

const schema = new Schema({
  nodes: basicSchema.nodes,
  marks: Object.assign({}, basicSchema.marks, {
    comment: {
      attrs: {
        id: { default: null }
      },
      excludes: '',
      parseDOM: [{ tag: 'comment' }],
      toDOM (node) {
        return ['comment', { comment_id: node.attrs.id }]
      }
    }
  })
})

/**
 * Verify that update events in plugins are only fired once.
 *
 * Initially reported in https://github.com/yjs/y-prosemirror/issues/121
 *
 * @param {t.TestCase} _tc
 */
export const testPluginIntegrity = (_tc) => {
  const ydoc = new Y.Doc()
  let viewUpdateEvents = 0
  let stateUpdateEvents = 0
  const customPlugin = new Plugin({
    state: {
      init: () => {
        return {}
      },
      apply: () => {
        stateUpdateEvents++
      }
    },
    view: () => {
      return {
        update () {
          viewUpdateEvents++
        }
      }
    }
  })
  const view = new EditorView(null, {
    // @ts-ignore
    state: EditorState.create({
      schema,
      plugins: [
        ySyncPlugin(ydoc.get('prosemirror', Y.XmlFragment)),
        yUndoPlugin(),
        customPlugin
      ]
    })
  })
  view.dispatch(
    view.state.tr.insert(
      0,
      /** @type {any} */ (schema.node(
        'paragraph',
        undefined,
        schema.text('hello world')
      ))
    )
  )
  t.compare({ viewUpdateEvents, stateUpdateEvents }, {
    viewUpdateEvents: 1,
    stateUpdateEvents: 2 // fired twice, because the ySyncPlugin adds additional fields to state after the initial render
  }, 'events are fired only once')
}

/**
 * @param {t.TestCase} tc
 */
export const testOverlappingMarks = (_tc) => {
  const view = new EditorView(null, {
    state: EditorState.create({
      schema,
      plugins: []
    })
  })
  view.dispatch(
    view.state.tr.insert(
      0,
      schema.node(
        'paragraph',
        undefined,
        schema.text('hello world')
      )
    )
  )

  view.dispatch(
    view.state.tr.addMark(1, 3, schema.mark('comment', { id: 4 }))
  )
  view.dispatch(
    view.state.tr.addMark(2, 4, schema.mark('comment', { id: 5 }))
  )
  const stateJSON = JSON.parse(JSON.stringify(view.state.doc.toJSON()))
  // attrs.ychange is only available with a schema
  delete stateJSON.content[0].attrs
  const back = prosemirrorJSONToYDoc(/** @type {any} */ (schema), stateJSON)
  // test if transforming back and forth from Yjs doc works
  const backandforth = JSON.parse(JSON.stringify(yDocToProsemirrorJSON(back)))
  t.compare(stateJSON, backandforth)

  // re-assure that we have overlapping comments
  const expected = '[{"type":"text","marks":[{"type":"comment","attrs":{"id":4}}],"text":"h"},{"type":"text","marks":[{"type":"comment","attrs":{"id":4}},{"type":"comment","attrs":{"id":5}}],"text":"e"},{"type":"text","marks":[{"type":"comment","attrs":{"id":5}}],"text":"l"},{"type":"text","text":"lo world"}]'
  t.compare(backandforth.content[0].content, JSON.parse(expected))
}

/**
 * @param {t.TestCase} tc
 */
export const testDocTransformation = (_tc) => {
  const view = createNewProsemirrorView(new Y.Doc())
  view.dispatch(
    view.state.tr.insert(
      0,
      /** @type {any} */ (schema.node(
        'paragraph',
        undefined,
        schema.text('hello world')
      ))
    )
  )
  const stateJSON = view.state.doc.toJSON()
  // test if transforming back and forth from Yjs doc works
  const backandforth = yDocToProsemirrorJSON(
    prosemirrorJSONToYDoc(/** @type {any} */ (schema), stateJSON)
  )
  t.compare(stateJSON, backandforth)
}

export const testXmlFragmentTransformation = (_tc) => {
  const view = createNewProsemirrorView(new Y.Doc())
  view.dispatch(
    view.state.tr.insert(
      0,
      /** @type {any} */ (schema.node(
        'paragraph',
        undefined,
        schema.text('hello world')
      ))
    )
  )
  const stateJSON = view.state.doc.toJSON()
  console.log(JSON.stringify(stateJSON))
  // test if transforming back and forth from yXmlFragment works
  const xml = new Y.XmlFragment()
  prosemirrorJSONToYXmlFragment(/** @type {any} */ (schema), stateJSON, xml)
  const doc = new Y.Doc()
  doc.getMap('root').set('firstDoc', xml)
  const backandforth = yXmlFragmentToProsemirrorJSON(xml)
  console.log(JSON.stringify(backandforth))
  t.compare(stateJSON, backandforth)
}

export const testChangeOrigin = (_tc) => {
  const ydoc = new Y.Doc()
  const yXmlFragment = ydoc.get('prosemirror', Y.XmlFragment)
  const yundoManager = new Y.UndoManager(yXmlFragment, { trackedOrigins: new Set(['trackme']) })
  const view = createNewProsemirrorView(ydoc)
  view.dispatch(
    view.state.tr.insert(
      0,
      /** @type {any} */ (schema.node(
        'paragraph',
        undefined,
        schema.text('world')
      ))
    )
  )
  const ysyncState1 = ySyncPluginKey.getState(view.state)
  t.assert(ysyncState1.isChangeOrigin === false)
  t.assert(ysyncState1.isUndoRedoOperation === false)
  ydoc.transact(() => {
    yXmlFragment.get(0).get(0).insert(0, 'hello')
  }, 'trackme')
  const ysyncState2 = ySyncPluginKey.getState(view.state)
  t.assert(ysyncState2.isChangeOrigin === true)
  t.assert(ysyncState2.isUndoRedoOperation === false)
  yundoManager.undo()
  const ysyncState3 = ySyncPluginKey.getState(view.state)
  t.assert(ysyncState3.isChangeOrigin === true)
  t.assert(ysyncState3.isUndoRedoOperation === true)
}

/**
 * @param {t.TestCase} tc
 */
export const testEmptyNotSync = (_tc) => {
  const ydoc = new Y.Doc()
  const type = ydoc.getXmlFragment('prosemirror')
  const view = createNewComplexProsemirrorView(ydoc)
  t.assert(type.toString() === '', 'should only sync after first change')

  view.dispatch(
    view.state.tr.setNodeMarkup(0, undefined, {
      checked: true
    })
  )
  t.compareStrings(
    type.toString(),
    '<custom checked="true"></custom>'
  )
}

/**
 * @param {t.TestCase} tc
 */
export const testEmptyParagraph = (_tc) => {
  const ydoc = new Y.Doc()
  const view = createNewProsemirrorView(ydoc)
  view.dispatch(
    view.state.tr.insert(
      0,
      /** @type {any} */ (schema.node(
        'paragraph',
        undefined,
        schema.text('123')
      ))
    )
  )
  const yxml = ydoc.get('prosemirror')
  t.assert(
    yxml.length === 2 && yxml.get(0).length === 1,
    'contains one paragraph containing a ytext'
  )
  view.dispatch(view.state.tr.delete(1, 4)) // delete characters 123
  t.assert(
    yxml.length === 2 && yxml.get(0).length === 1,
    "doesn't delete the ytext"
  )
}

/**
 * Test duplication issue https://github.com/yjs/y-prosemirror/issues/161
 *
 * @param {t.TestCase} tc
 */
export const testInsertDuplication = (_tc) => {
  const ydoc1 = new Y.Doc()
  ydoc1.clientID = 1
  const ydoc2 = new Y.Doc()
  ydoc2.clientID = 2
  const view1 = createNewProsemirrorView(ydoc1)
  const view2 = createNewProsemirrorView(ydoc2)
  const yxml1 = ydoc1.getXmlFragment('prosemirror')
  const yxml2 = ydoc2.getXmlFragment('prosemirror')
  yxml1.observeDeep(events => {
    events.forEach(event => {
      console.log('yxml1: ', JSON.stringify(event.changes.delta))
    })
  })
  yxml2.observeDeep(events => {
    events.forEach(event => {
      console.log('yxml2: ', JSON.stringify(event.changes.delta))
    })
  })
  view1.dispatch(
    view1.state.tr.insert(
      0,
      /** @type {any} */ (schema.node(
        'paragraph'
      ))
    )
  )
  const sync = () => {
    Y.applyUpdate(ydoc2, Y.encodeStateAsUpdate(ydoc1))
    Y.applyUpdate(ydoc1, Y.encodeStateAsUpdate(ydoc2))
    Y.applyUpdate(ydoc2, Y.encodeStateAsUpdate(ydoc1))
    Y.applyUpdate(ydoc1, Y.encodeStateAsUpdate(ydoc2))
  }
  sync()
  view1.dispatch(view1.state.tr.insertText('1', 1, 1))
  view2.dispatch(view2.state.tr.insertText('2', 1, 1))
  sync()
  view1.dispatch(view1.state.tr.insertText('1', 2, 2))
  view2.dispatch(view2.state.tr.insertText('2', 3, 3))
  sync()
  checkResult({ testObjects: [view1, view2] })
  t.assert(yxml1.toString() === '<paragraph>1122</paragraph><paragraph></paragraph>')
}

export const testInsertRightMatch = (_tc) => {
  const ydoc = new Y.Doc()
  const yXmlFragment = ydoc.get('prosemirror', Y.XmlFragment)
  const view = createNewProsemirrorView(ydoc)
  view.dispatch(
    view.state.tr.insert(
      0,
      [
        schema.node(
          'heading',
          { level: 1 },
          schema.text('Heading 1')
        ),
        schema.node(
          'paragraph',
          undefined,
          schema.text('Paragraph 1')
        )
      ]
    )
  )
  prosemirrorJSONToYXmlFragment(/** @type {any} */ (schema), view.state.doc.toJSON(), yXmlFragment)
  const lastP = yXmlFragment.get(yXmlFragment.length - 1)
  const tr = view.state.tr
  view.dispatch(
    tr.insert(
      tr.doc.child(0).nodeSize + tr.doc.child(1).nodeSize,
      schema.node(
        'paragraph',
        undefined,
        schema.text('Paragraph 2')
      )
    )
  )
  const newLastP = yXmlFragment.get(yXmlFragment.length - 1)
  const new2ndLastP = yXmlFragment.get(yXmlFragment.length - 2)
  t.assert(lastP === newLastP, 'last paragraph is the same as before')
  t.assert(new2ndLastP.toString() === '<paragraph>Paragraph 2</paragraph>', '2nd last paragraph is the inserted paragraph')
  t.assert(lastP.toString() === '<paragraph></paragraph>', 'last paragraph remains empty and is placed at the end')
}

export const testAddToHistory = (_tc) => {
  const ydoc = new Y.Doc()
  const view = createNewProsemirrorViewWithUndoManager(ydoc)
  view.dispatch(
    view.state.tr.insert(
      0,
      /** @type {any} */ (schema.node(
        'paragraph',
        undefined,
        schema.text('123')
      ))
    )
  )
  const yxml = ydoc.get('prosemirror')
  t.assert(
    yxml.length === 2 && yxml.get(0).length === 1,
    'contains inserted content'
  )
  undo(view.state)
  t.assert(yxml.length === 0, 'insertion was undone')
  redo(view.state)
  t.assert(
    yxml.length === 2 && yxml.get(0).length === 1,
    'contains inserted content'
  )
  undo(view.state)
  t.assert(yxml.length === 0, 'insertion was undone')
  // now insert content again, but with `'addToHistory': false`
  view.dispatch(
    view.state.tr.insert(
      0,
      /** @type {any} */ (schema.node(
        'paragraph',
        undefined,
        schema.text('123')
      ))
    ).setMeta('addToHistory', false)
  )
  t.assert(
    yxml.length === 2 && yxml.get(0).length === 1,
    'contains inserted content'
  )
  undo(view.state)
  t.assert(
    yxml.length === 2 && yxml.get(0).length === 1,
    'insertion was *not* undone'
  )
}

/**
 * Reproducing #190
 *
 * @param {t.TestCase} _tc
 */
export const testCursorPositionAfterUndoOnEndText = (_tc) => {
  const ydoc = new Y.Doc()
  const view = createNewProsemirrorViewWithUndoManager(ydoc)
  view.dispatch(
    view.state.tr.insert(
      0,
      /** @type {any} */ (schema.node(
        'paragraph',
        undefined,
        schema.text('123')
      ))
    )
  )
  const yxml = ydoc.get('prosemirror')
  t.assert(
    yxml.length === 2 && yxml.get(0).length === 1,
    'contains inserted content'
  )
  view.dispatch(view.state.tr.setSelection(TextSelection.between(view.state.doc.resolve(4), view.state.doc.resolve(4))))
  const undoManager = yUndoPluginKey.getState(view.state)?.undoManager
  undoManager.stopCapturing()
  // clear undo manager
  view.dispatch(
    view.state.tr.delete(3, 4)
  )
  undo(view.state)
  t.assert(view.state.selection.anchor === 4)
}

/**
 * Tests for #126 - initial cursor position should be retained, not jump to the end.
 *
 * @param {t.TestCase} _tc
 */
export const testInitialCursorPosition = async (_tc) => {
  const ydoc = new Y.Doc()
  const yxml = ydoc.get('prosemirror', Y.XmlFragment)
  const p = new Y.XmlElement('paragraph')
  p.insert(0, [new Y.XmlText('hello world!')])
  yxml.insert(0, [p])
  console.log('yxml', yxml.toString())
  const view = createNewProsemirrorView(ydoc)
  view.focus()
  await promise.wait(10)
  console.log('anchor', view.state.selection.anchor)
  t.assert(view.state.selection.anchor === 1)
  t.assert(view.state.selection.head === 1)
}

export const testInitialCursorPosition2 = async (_tc) => {
  const ydoc = new Y.Doc()
  const yxml = ydoc.get('prosemirror', Y.XmlFragment)
  console.log('yxml', yxml.toString())
  const view = createNewProsemirrorView(ydoc)
  view.focus()
  await promise.wait(10)
  const p = new Y.XmlElement('paragraph')
  p.insert(0, [new Y.XmlText('hello world!')])
  yxml.insert(0, [p])
  console.log('anchor', view.state.selection.anchor)
  t.assert(view.state.selection.anchor === 1)
  t.assert(view.state.selection.head === 1)
}

export const testVersioning = async (_tc) => {
  const ydoc = new Y.Doc({ gc: false })
  const yxml = ydoc.get('prosemirror', Y.XmlFragment)
  const permanentUserData = new Y.PermanentUserData(ydoc)
  permanentUserData.setUserMapping(ydoc, ydoc.clientID, 'me')
  ydoc.gc = false
  console.log('yxml', yxml.toString())
  const view = createNewComplexProsemirrorView(ydoc)
  const p = new Y.XmlElement('paragraph')
  const ytext = new Y.XmlText('hello world!')
  p.insert(0, [ytext])
  yxml.insert(0, [p])
  const snapshot1 = Y.snapshot(ydoc)
  const snapshotDoc1 = Y.encodeStateAsUpdateV2(ydoc)
  ytext.delete(0, 6)
  const snapshot2 = Y.snapshot(ydoc)
  const snapshotDoc2 = Y.encodeStateAsUpdateV2(ydoc)
  view.dispatch(
    view.state.tr.setMeta(ySyncPluginKey, { snapshot: snapshot2, prevSnapshot: snapshot1, permanentUserData })
  )
  await promise.wait(50)
  console.log('calculated diff via snapshots: ', view.state.doc.toJSON())
  // recreate the JSON, because ProseMirror messes with the constructors
  const viewstate1 = JSON.parse(JSON.stringify(view.state.doc.toJSON().content[0].content))
  const expectedState = [{
    type: 'text',
    marks: [{ type: 'ychange', attrs: { user: 'me', type: 'removed' } }],
    text: 'hello '
  }, {
    type: 'text',
    text: 'world!'
  }]
  console.log('calculated diff via snapshots: ', JSON.stringify(viewstate1))
  t.compare(viewstate1, expectedState)

  t.info('now check whether we get the same result when rendering the updates')
  view.dispatch(
    view.state.tr.setMeta(ySyncPluginKey, { snapshot: snapshotDoc2, prevSnapshot: snapshotDoc1, permanentUserData })
  )
  await promise.wait(50)

  const viewstate2 = JSON.parse(JSON.stringify(view.state.doc.toJSON().content[0].content))
  console.log('calculated diff via updates: ', JSON.stringify(viewstate2))
  t.compare(viewstate2, expectedState)
}

export const testVersioningWithGarbageCollection = async (_tc) => {
  const ydoc = new Y.Doc()
  const yxml = ydoc.get('prosemirror', Y.XmlFragment)
  const permanentUserData = new Y.PermanentUserData(ydoc)
  permanentUserData.setUserMapping(ydoc, ydoc.clientID, 'me')
  console.log('yxml', yxml.toString())
  const view = createNewComplexProsemirrorView(ydoc)
  const p = new Y.XmlElement('paragraph')
  const ytext = new Y.XmlText('hello world!')
  p.insert(0, [ytext])
  yxml.insert(0, [p])
  const snapshotDoc1 = Y.encodeStateAsUpdateV2(ydoc)
  ytext.delete(0, 6)
  const snapshotDoc2 = Y.encodeStateAsUpdateV2(ydoc)
  view.dispatch(
    view.state.tr.setMeta(ySyncPluginKey, { snapshot: snapshotDoc2, prevSnapshot: snapshotDoc1, permanentUserData })
  )
  await promise.wait(50)
  console.log('calculated diff via snapshots: ', view.state.doc.toJSON())
  // recreate the JSON, because ProseMirror messes with the constructors
  const viewstate1 = JSON.parse(JSON.stringify(view.state.doc.toJSON().content[0].content))
  const expectedState = [{
    type: 'text',
    marks: [{ type: 'ychange', attrs: { user: 'me', type: 'removed' } }],
    text: 'hello '
  }, {
    type: 'text',
    text: 'world!'
  }]
  console.log('calculated diff via snapshots: ', JSON.stringify(viewstate1))
  t.compare(viewstate1, expectedState)
}

export const testAddToHistoryIgnore = (_tc) => {
  const ydoc = new Y.Doc()
  const view = createNewProsemirrorViewWithUndoManager(ydoc)
  // perform two changes that are tracked by um - supposed to be merged into a single undo-manager item
  view.dispatch(
    view.state.tr.insert(
      0,
      /** @type {any} */ (schema.node(
        'paragraph',
        undefined,
        schema.text('123')
      ))
    )
  )
  view.dispatch(
    view.state.tr.insert(
      0,
      /** @type {any} */ (schema.node(
        'paragraph',
        undefined,
        schema.text('456')
      ))
    )
  )
  const yxml = ydoc.get('prosemirror')
  t.assert(
    yxml.length === 3 && yxml.get(0).length === 1,
    'contains inserted content (1)'
  )
  view.dispatch(
    view.state.tr.insert(
      0,
      /** @type {any} */ (schema.node(
        'paragraph',
        undefined,
        schema.text('abc')
      ))
    ).setMeta('addToHistory', false)
  )
  t.assert(
    yxml.length === 4 && yxml.get(0).length === 1,
    'contains inserted content (2)'
  )
  view.dispatch(
    view.state.tr.insert(
      0,
      /** @type {any} */ (schema.node(
        'paragraph',
        undefined,
        schema.text('xyz')
      ))
    )
  )
  t.assert(
    yxml.length === 5 && yxml.get(0).length === 1,
    'contains inserted content (3)'
  )
  undo(view.state)
  t.assert(yxml.length === 4, 'insertion (3) was undone')
  undo(view.state)
  console.log(yxml.toString())
  t.assert(
    yxml.length === 1 &&
      yxml.get(0).toString() === '<paragraph>abc</paragraph>',
    'insertion (1) was undone'
  )
}

const createNewProsemirrorViewWithSchema = (y, schema, undoManager = false) => {
  const view = new EditorView(null, {
    // @ts-ignore
    state: EditorState.create({
      schema,
      plugins: [ySyncPlugin(y.get('prosemirror', Y.XmlFragment))].concat(
        undoManager ? [yUndoPlugin()] : []
      )
    })
  })
  return view
}

const createNewComplexProsemirrorView = (y, undoManager = false) =>
  createNewProsemirrorViewWithSchema(y, complexSchema, undoManager)

const createNewProsemirrorView = (y) =>
  createNewProsemirrorViewWithSchema(y, schema, false)

const createNewProsemirrorViewWithUndoManager = (y) =>
  createNewProsemirrorViewWithSchema(y, schema, true)

let charCounter = 0

const marksChoices = [
  [schema.mark('strong')],
  [schema.mark('comment', { id: 1 })],
  [schema.mark('comment', { id: 2 })],
  [schema.mark('em')],
  [schema.mark('em'), schema.mark('strong')],
  [],
  []
]

const pmChanges = [
  /**
   * @param {Y.Doc} y
   * @param {prng.PRNG} gen
   * @param {EditorView} p
   */
  (_y, gen, p) => { // insert text
    const insertPos = prng.int32(gen, 0, p.state.doc.content.size)
    const marks = prng.oneOf(gen, marksChoices)
    const tr = p.state.tr
    const text = charCounter++ + prng.word(gen)
    p.dispatch(tr.insert(insertPos, schema.text(text, marks)))
  },
  /**
   * @param {Y.Doc} y
   * @param {prng.PRNG} gen
   * @param {EditorView} p
   */
  (_y, gen, p) => { // delete text
    const insertPos = prng.int32(gen, 0, p.state.doc.content.size)
    const overwrite = math.min(
      prng.int32(gen, 0, p.state.doc.content.size - insertPos),
      2
    )
    p.dispatch(p.state.tr.insertText('', insertPos, insertPos + overwrite))
  },
  /**
   * @param {Y.Doc} y
   * @param {prng.PRNG} gen
   * @param {EditorView} p
   */
  (_y, gen, p) => { // format text
    const insertPos = prng.int32(gen, 0, p.state.doc.content.size)
    const formatLen = math.min(
      prng.int32(gen, 0, p.state.doc.content.size - insertPos),
      2
    )
    const mark = prng.oneOf(gen, marksChoices.filter(choice => choice.length > 0))[0]
    p.dispatch(p.state.tr.addMark(insertPos, insertPos + formatLen, mark))
  },
  /**
   * @param {Y.Doc} y
   * @param {prng.PRNG} gen
   * @param {EditorView} p
   */
  (_y, gen, p) => { // replace text
    const insertPos = prng.int32(gen, 0, p.state.doc.content.size)
    const overwrite = math.min(
      prng.int32(gen, 0, p.state.doc.content.size - insertPos),
      2
    )
    const text = charCounter++ + prng.word(gen)
    p.dispatch(p.state.tr.insertText(text, insertPos, insertPos + overwrite))
  },
  /**
   * @param {Y.Doc} y
   * @param {prng.PRNG} gen
   * @param {EditorView} p
   */
  (_y, gen, p) => { // insert paragraph
    const insertPos = prng.int32(gen, 0, p.state.doc.content.size)
    const marks = prng.oneOf(gen, marksChoices)
    const tr = p.state.tr
    const text = charCounter++ + prng.word(gen)
    p.dispatch(
      tr.insert(
        insertPos,
        schema.node('paragraph', undefined, schema.text(text, marks))
      )
    )
  },
  /**
   * @param {Y.Doc} y
   * @param {prng.PRNG} gen
   * @param {EditorView} p
   */
  (_y, gen, p) => { // insert codeblock
    const insertPos = prng.int32(gen, 0, p.state.doc.content.size)
    const tr = p.state.tr
    const text = charCounter++ + prng.word(gen)
    p.dispatch(
      tr.insert(
        insertPos,
        schema.node('code_block', undefined, schema.text(text))
      )
    )
  },
  /**
   * @param {Y.Doc} y
   * @param {prng.PRNG} gen
   * @param {EditorView} p
   */
  (_y, gen, p) => { // wrap in blockquote
    const insertPos = prng.int32(gen, 0, p.state.doc.content.size)
    const overwrite = prng.int32(gen, 0, p.state.doc.content.size - insertPos)
    const tr = p.state.tr
    tr.setSelection(
      TextSelection.create(tr.doc, insertPos, insertPos + overwrite)
    )
    const $from = tr.selection.$from
    const $to = tr.selection.$to
    const range = $from.blockRange($to)
    const wrapping = range && findWrapping(range, schema.nodes.blockquote)
    if (wrapping) {
      p.dispatch(tr.wrap(range, wrapping))
    }
  }
]

/**
 * @param {any} result
 */
const checkResult = (result) => {
  for (let i = 1; i < result.testObjects.length; i++) {
    const p1 = result.testObjects[i - 1].state.doc.toJSON()
    const p2 = result.testObjects[i].state.doc.toJSON()
    t.compare(p1, p2)
  }
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatGenerateProsemirrorChanges2 = (tc) => {
  checkResult(applyRandomTests(tc, pmChanges, 2, createNewProsemirrorView))
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatGenerateProsemirrorChanges3 = (tc) => {
  checkResult(applyRandomTests(tc, pmChanges, 3, createNewProsemirrorView))
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatGenerateProsemirrorChanges30 = (tc) => {
  checkResult(applyRandomTests(tc, pmChanges, 30, createNewProsemirrorView))
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatGenerateProsemirrorChanges40 = (tc) => {
  checkResult(applyRandomTests(tc, pmChanges, 40, createNewProsemirrorView))
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatGenerateProsemirrorChanges70 = (tc) => {
  checkResult(applyRandomTests(tc, pmChanges, 70, createNewProsemirrorView))
}

/**
 * @param {t.TestCase} tc
 *
export const testRepeatGenerateProsemirrorChanges100 = tc => {
  checkResult(applyRandomTests(tc, pmChanges, 100, createNewProsemirrorView))
}

/**
 * @param {t.TestCase} tc
 *
export const testRepeatGenerateProsemirrorChanges300 = tc => {
  checkResult(applyRandomTests(tc, pmChanges, 300, createNewProsemirrorView))
}
*/
