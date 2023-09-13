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
    stateUpdateEvents: 1
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

export const testAddToHistoryIgnoreWithAppendTransactionPlugin = (_tc) => {
  const ydoc = new Y.Doc()
  const view = createNewProsemirrorViewWithUndoManagerAndAppendTransactionPlugin(ydoc)
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
  const yxml = ydoc.get('prosemirror')
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

const appendTransactionPlugin = () => new Plugin({
  appendTransaction: (_, __, state) => {
    // intentionally returns empty transaction
    const tr = state.tr
    return tr
  }
})

const createNewProsemirrorViewWithSchema = (y, schema, undoManager = false, appendTransaction = false) => {
  const view = new EditorView(null, {
    // @ts-ignore
    state: EditorState.create({
      schema,
      plugins: [ySyncPlugin(y.get('prosemirror', Y.XmlFragment))].concat(
        undoManager ? [yUndoPlugin()] : [],
        appendTransaction ? [appendTransactionPlugin()] : []
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

const createNewProsemirrorViewWithUndoManagerAndAppendTransactionPlugin = (y) =>
  createNewProsemirrorViewWithSchema(y, schema, true, true)

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
