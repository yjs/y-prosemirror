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
  yXmlFragmentToProsemirrorJSON
} from '../src/y-prosemirror.js'
import { EditorState, Plugin, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import * as basicSchema from 'prosemirror-schema-basic'
import { findWrapping } from 'prosemirror-transform'
import { schema as complexSchema } from './complexSchema.js'
import * as promise from 'lib0/promise'

const schema = /** @type {any} */ (basicSchema.schema)

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
    '<custom checked="true"></custom><paragraph></paragraph>'
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
  t.assert(view.state.selection.anchor === 0)
  t.assert(view.state.selection.head === 0)
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
  const viewstate1 = JSON.parse(JSON.stringify(view.state.doc.toJSON().content[1].content))
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

  const viewstate2 = JSON.parse(JSON.stringify(view.state.doc.toJSON().content[1].content))
  console.log('calculated diff via updates: ', JSON.stringify(viewstate2))
  t.compare(viewstate2, expectedState)
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

/**
 * @param {t.TestCase} _tc
 */
export const testSimultaneousInsertOnEmptyLineWithSync = (_tc) => {
  const ydoc1 = new Y.Doc()
  const ydoc2 = new Y.Doc()

  // Apply initial state to ydoc1
  const initialContent = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('123')]),
    schema.node('paragraph'),
    schema.node('paragraph', null, [schema.text('456')])
  ])

  const view1 = createNewProsemirrorView(ydoc1)
  view1.dispatch(
    view1.state.tr.replaceWith(0, view1.state.doc.content.size, initialContent)
  )

  // Encode the initial state from ydoc1 and apply it to ydoc2
  const initialUpdate = Y.encodeStateAsUpdate(ydoc1)
  Y.applyUpdate(ydoc2, initialUpdate)

  // Create views for ydoc1 and ydoc2
  const view2 = createNewProsemirrorView(ydoc2)

  // Simulate simultaneous inserts on the empty line
  const insertA = view1.state.tr.insertText('A', 6)
  const insertX = view2.state.tr.insertText('X', 6)

  view1.dispatch(insertA)
  view2.dispatch(insertX)

  // Sync the documents
  const updateFromDoc1 = Y.encodeStateAsUpdate(ydoc1)
  const updateFromDoc2 = Y.encodeStateAsUpdate(ydoc2)

  Y.applyUpdate(ydoc1, updateFromDoc2)
  Y.applyUpdate(ydoc2, updateFromDoc1)

  // Update ProseMirror views with Yjs updates
  view1.updateState(view1.state.apply(view1.state.tr))
  view2.updateState(view2.state.apply(view2.state.tr))

  // Check the results
  const yxml1 = ydoc1.get('prosemirror', Y.XmlFragment)
  const yxml2 = ydoc2.get('prosemirror', Y.XmlFragment)

  t.assert(yxml1.toString() === yxml2.toString(), 'Documents should be in sync after first insert')

  const contentAfterFirstInsert = yxml1.toString()

  t.assert(
    contentAfterFirstInsert === '<paragraph>123</paragraph><paragraph>AX</paragraph><paragraph>456</paragraph>' ||
    contentAfterFirstInsert === '<paragraph>123</paragraph><paragraph>XA</paragraph><paragraph>456</paragraph>'
  )

  // Simulate simultaneous inserts on the previously empty line
  const insertB = view1.state.tr.insertText('B', 7)
  const insertY = view2.state.tr.insertText('Y', 7)

  view1.dispatch(insertB)
  view2.dispatch(insertY)

  // Sync the documents again
  const updateFromDoc1AfterSecondInsert = Y.encodeStateAsUpdate(ydoc1)
  const updateFromDoc2AfterSecondInsert = Y.encodeStateAsUpdate(ydoc2)

  Y.applyUpdate(ydoc1, updateFromDoc2AfterSecondInsert)
  Y.applyUpdate(ydoc2, updateFromDoc1AfterSecondInsert)

  // Update ProseMirror views with Yjs updates
  view1.updateState(view1.state.apply(view1.state.tr))
  view2.updateState(view2.state.apply(view2.state.tr))

  // Check the results
  const yxml1AfterSecondInsert = ydoc1.get('prosemirror', Y.XmlFragment)
  const yxml2AfterSecondInsert = ydoc2.get('prosemirror', Y.XmlFragment)

  t.assert(yxml1AfterSecondInsert.toString() === yxml2AfterSecondInsert.toString(), 'Documents should be in sync after second insert')

  const contentAfterSecondInsert = yxml1AfterSecondInsert.toString()

  // TODO: This is failing.
  // contentAfterSecondInsert == <paragraph>123</paragraph><paragraph>ABXYX</paragraph><paragraph>456</paragraph>
  // Note the duplication of `X`.

  t.assert(
    contentAfterSecondInsert === '<paragraph>123</paragraph><paragraph>ABXY</paragraph><paragraph>456</paragraph>' ||
    contentAfterSecondInsert === '<paragraph>123</paragraph><paragraph>XYAB</paragraph><paragraph>456</paragraph>'
  )
}
