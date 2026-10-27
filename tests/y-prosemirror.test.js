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
import { EditorState, Plugin, TextSelection, NodeSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import * as basicSchema from 'prosemirror-schema-basic'
import { Fragment, Schema, Slice } from 'prosemirror-model'
import { findWrapping, Transform } from 'prosemirror-transform'
import { schema as complexSchema } from './complexSchema.js'
import { diffDocs } from '../src/plugins/sync-plugin.js'

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

/**
 * @param {t.TestCase} tc
 */
export const testRestoreRelativePositionRetainsNodeSelection = tc => {
  const ydoc = new Y.Doc()
  const view = createNewProsemirrorView(ydoc)
  view.dispatch(view.state.tr.insert(0, /** @type {any} */ (schema.node('image', { src: '/cool-img' }))))
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 1)))
  t.assert(view.state.selection instanceof NodeSelection, 'node selection exists')

  view.dispatch(view.state.tr.insert(0, /** @type {any} */ (schema.node('paragraph', undefined, schema.text('123')))))
  const yxml = ydoc.get('prosemirror')
  t.assert(yxml.length === 3 && yxml.get(0).length === 1, 'contains one paragraph and one image')
  t.assert(view.state.selection instanceof NodeSelection, 'node selection is retained')
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
 * ---------------------------------------------------------------------------
 * diffDocs
 *
 * The sync plugin rebuilds the document from Yjs and then uses `diffDocs` to
 * turn that into a set of small steps instead of one whole-document replace, so
 * that plugins can keep mapping positions through a remote transaction. When
 * `diffDocs` fails it is not only slower, the whole document is reported as
 * deleted.
 * ---------------------------------------------------------------------------
 */

/**
 * Build a document from children.
 *
 * @param {...any} children
 */
const docOf = (...children) => schema.topNodeType.create(null, Fragment.from(children))
const paraOf = (...content) => schema.node('paragraph', undefined, Fragment.from(content))
const headingOf = (level, ...content) => schema.node('heading', { level }, Fragment.from(content))
const blockquoteOf = (...content) => schema.node('blockquote', undefined, Fragment.from(content))
const codeBlockOf = (...content) => schema.node('code_block', undefined, Fragment.from(content))
const hrOf = () => schema.node('horizontal_rule')
const brOf = () => schema.node('hard_break')
const imageOf = (src) => schema.node('image', { src })
const textOf = (text, ...marks) =>
  schema.text(text, marks.length > 0 ? marks.map((m) => schema.mark(m)) : undefined)

/**
 * Run diffDocs the way the sync plugin does it.
 *
 * @param {any} source
 * @param {any} target
 */
const diffedTo = (source, target) => {
  const tr = new Transform(source)
  const reached = diffDocs(target, tr)
  return { tr, reached }
}

/**
 * `Node.toJSON` hands back attribute objects without a prototype, which
 * `t.compare` cannot look into.
 *
 * @param {any} node
 */
const json = (node) => JSON.parse(JSON.stringify(node))

/**
 * @param {any} source
 * @param {any} target
 * @param {string} what
 */
const assertDiffReaches = (source, target, what) => {
  const { tr, reached } = diffedTo(source, target)
  t.assert(reached, `${what}: diffDocs gave up and the plugin would replace the whole document`)
  t.compare(json(tr.doc), json(target), what)
}

/**
 * The case this regression suite exists for: the level of a heading changes at
 * the same time as its content, which adds a run after a run that was just
 * replaced. Positions have to be read from the live document here - mapping the
 * position of the new run through the step that replaced the old one reports it
 * as deleted, and the whole diff used to be thrown away.
 *
 * @param {t.TestCase} _tc
 */
export const testDiffDocsReplacesRunAddedAfterReplacedRun = (_tc) => {
  assertDiffReaches(
    docOf(headingOf(1, brOf())),
    docOf(headingOf(2, textOf('b', 'code'), textOf('a'))),
    'heading content gains a run behind a replaced run'
  )
  assertDiffReaches(
    docOf(paraOf(brOf())),
    docOf(paraOf(textOf('b'), textOf('a'))),
    'paragraph content gains a run behind a replaced run'
  )
  assertDiffReaches(
    docOf(blockquoteOf(paraOf(brOf()))),
    docOf(blockquoteOf(paraOf(textOf('b'), textOf('a')))),
    'same, one level down'
  )
}

/**
 * @param {t.TestCase} _tc
 */
export const testDiffDocsTextEdits = (_tc) => {
  assertDiffReaches(docOf(paraOf(textOf('hello'))), docOf(paraOf(textOf('hello world'))), 'append text')
  assertDiffReaches(docOf(paraOf(textOf('world'))), docOf(paraOf(textOf('hello world'))), 'prepend text')
  assertDiffReaches(docOf(paraOf(textOf('hello world'))), docOf(paraOf(textOf('hello'))), 'trim the end')
  assertDiffReaches(docOf(paraOf(textOf('hello world'))), docOf(paraOf(textOf('world'))), 'trim the start')
  assertDiffReaches(docOf(paraOf(textOf('hello world'))), docOf(paraOf(textOf('hell world'))), 'replace inside')
  assertDiffReaches(docOf(paraOf(textOf('aa'))), docOf(paraOf(textOf('a'))), 'shrink a repeated character')
  assertDiffReaches(docOf(paraOf(textOf('a'))), docOf(paraOf()), 'empty a paragraph')
  assertDiffReaches(docOf(paraOf()), docOf(paraOf(textOf('a'))), 'fill an empty paragraph')
  assertDiffReaches(docOf(paraOf(textOf('ab'))), docOf(paraOf(textOf('a', 'em'), textOf('b'))), 'split a run and mark the head')
  assertDiffReaches(docOf(paraOf(textOf('a'), textOf('b', 'em'))), docOf(paraOf(textOf('ab', 'em'))), 'merge two runs')
  assertDiffReaches(docOf(paraOf(textOf('ab'))), docOf(paraOf(textOf('ab', 'em'))), 'mark a whole run')
  assertDiffReaches(docOf(codeBlockOf(textOf('abc'))), docOf(codeBlockOf(textOf('abbc'))), 'code block text')
}

/**
 * @param {t.TestCase} _tc
 */
export const testDiffDocsStructureEdits = (_tc) => {
  assertDiffReaches(docOf(paraOf(textOf('a'))), docOf(headingOf(2, textOf('a'))), 'paragraph becomes a heading')
  assertDiffReaches(docOf(paraOf(brOf()), paraOf(textOf('z'))), docOf(hrOf(), paraOf(textOf('z'))), 'paragraph becomes a rule')
  assertDiffReaches(docOf(hrOf()), docOf(paraOf(textOf('a'))), 'rule becomes a paragraph')
  assertDiffReaches(docOf(paraOf(textOf('a'))), docOf(paraOf(textOf('a')), paraOf(textOf('b'))), 'append a block')
  assertDiffReaches(docOf(paraOf(textOf('a')), paraOf(textOf('b'))), docOf(paraOf(textOf('a'))), 'drop the last block')
  assertDiffReaches(docOf(paraOf(textOf('a')), paraOf(textOf('b'))), docOf(paraOf(textOf('b'))), 'drop the first block')
  assertDiffReaches(
    docOf(paraOf(textOf('a')), paraOf(textOf('b')), paraOf(textOf('c'))),
    docOf(paraOf(textOf('a')), paraOf(textOf('c'))),
    'drop the middle block'
  )
  assertDiffReaches(
    docOf(paraOf(textOf('a')), paraOf(textOf('c'))),
    docOf(paraOf(textOf('a')), paraOf(textOf('b')), paraOf(textOf('c'))),
    'insert a block in the middle'
  )
  assertDiffReaches(docOf(blockquoteOf(paraOf(textOf('a')))), docOf(blockquoteOf(paraOf(textOf('a')), paraOf(textOf('b')))), 'append a nested block')
  assertDiffReaches(docOf(blockquoteOf(paraOf(textOf('a')), paraOf(textOf('b')))), docOf(blockquoteOf(paraOf(textOf('a')))), 'drop a nested block')
  assertDiffReaches(docOf(paraOf(imageOf('a'))), docOf(paraOf(imageOf('b'))), 'change an inline image')
  assertDiffReaches(docOf(paraOf(textOf('a'))), docOf(paraOf(imageOf('b'))), 'text becomes an image')
  assertDiffReaches(docOf(headingOf(1, textOf('a'))), docOf(headingOf(3, textOf('a'))), 'heading level only')
  assertDiffReaches(docOf(paraOf(textOf('a'))), docOf(codeBlockOf(textOf('a'))), 'paragraph becomes a code block')
}

/**
 * The whole point of this fork: a change in one block must not be reported as
 * deleting the positions of every other block.
 *
 * @param {t.TestCase} _tc
 */
export const testDiffDocsKeepsPositionsOutsideTheEdit = (_tc) => {
  const blocks = []
  for (let i = 0; i < 20; i++) {
    blocks.push(paraOf(textOf(`paragraph number ${i} with some words in it`)))
  }
  const source = docOf(...blocks)
  blocks[10] = paraOf(textOf('paragraph number 10 with some X words in it'))
  const target = docOf(...blocks)

  const { tr, reached } = diffedTo(source, target)
  t.assert(reached, 'diffDocs reaches the target')
  t.compare(json(tr.doc), json(target), 'document matches the target')
  t.assert(tr.steps.length === 1, `a single step is enough, got ${tr.steps.length}`)

  const cursor = source.content.size - 4
  const mapped = tr.mapping.mapResult(cursor, 1)
  t.assert(!mapped.deleted, 'a cursor in a later paragraph is not reported as deleted')
  t.assert(mapped.pos === cursor + 2, 'the cursor only shifts by the inserted text')
}

/**
 * A content model that refuses some of the replacements the diff would want to
 * make, so that the "give up" path is covered as well.
 */
const restrictiveSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    heading: { content: 'inline*', group: 'block' },
    // The first child has to stay a paragraph.
    wrapper: { content: 'paragraph block?', group: 'block' },
    text: { group: 'inline' }
  },
  marks: {}
})

/**
 * When the schema forbids the replacement there is no way to reach the target,
 * and diffDocs has to say so instead of applying a partial diff: the caller
 * throws the transaction away and replaces the whole document.
 *
 * @param {t.TestCase} _tc
 */
export const testDiffDocsReportsWhenItCannotReachTheTarget = (_tc) => {
  const s = restrictiveSchema
  const wrapper = (...children) => s.nodes.wrapper.create(null, Fragment.from(children))
  const paragraph = (text) => s.nodes.paragraph.create(null, [s.text(text)])
  const heading = (text) => s.nodes.heading.create(null, [s.text(text)])

  const source = s.topNodeType.create(null, Fragment.from([wrapper(paragraph('a'), paragraph('b'))]))
  const target = s.topNodeType.create(null, Fragment.from([wrapper(heading('x'), paragraph('b'))]))

  const tr = new Transform(source)
  t.assert(diffDocs(target, tr) === false, 'diffDocs reports that it cannot reach the target')
}

/**
 * @param {prng.PRNG} gen
 * @param {boolean} textOnly
 */
const randomInline = (gen, textOnly) => {
  const marks = []
  // A code block accepts neither marks nor non-text children.
  if (!textOnly && prng.bool(gen)) marks.push(prng.oneOf(gen, [schema.mark('em'), schema.mark('strong'), schema.mark('code')]))
  const text = prng.word(gen, 1 + prng.int32(gen, 0, 5))
  if (textOnly || prng.bool(gen)) return schema.text(text, marks)
  return prng.int32(gen, 0, 1) === 0
    ? schema.node('hard_break', undefined, undefined, marks)
    : schema.node('image', { src: `s${prng.int32(gen, 0, 2)}` }, undefined, marks)
}

/**
 * @param {prng.PRNG} gen
 * @param {number} depth
 */
const randomBlock = (gen, depth) => {
  const kind = prng.int32(gen, 0, depth < 2 ? 5 : 4)
  const inline = (n, textOnly) => {
    const out = []
    for (let i = 0; i < n; i++) out.push(randomInline(gen, textOnly))
    return out
  }
  if (kind === 0 || kind === 1) return paraOf(...inline(prng.int32(gen, 0, 3), false))
  if (kind === 2) return headingOf(1 + prng.int32(gen, 0, 2), ...inline(prng.int32(gen, 0, 3), false))
  if (kind === 3) return codeBlockOf(...inline(prng.int32(gen, 0, 2), true))
  if (kind === 4) return hrOf()
  const kids = []
  const n = 1 + prng.int32(gen, 0, 1)
  for (let i = 0; i < n; i++) kids.push(randomBlock(gen, depth + 1))
  return blockquoteOf(...kids)
}

/**
 * @param {prng.PRNG} gen
 */
const randomDoc = (gen) => {
  const kids = []
  const n = 1 + prng.int32(gen, 0, 4)
  for (let i = 0; i < n; i++) kids.push(randomBlock(gen, 0))
  return docOf(...kids)
}

/**
 * Random pairs of documents. This is what found the original bug: positions were
 * mapped through the steps the diff had just added, so a step taken for one
 * child could report the position of the next child as deleted.
 *
 * @param {t.TestCase} _tc
 */
export const testDiffDocsRandomDocuments = (_tc) => {
  const gen = prng.create(20260922)
  for (let i = 0; i < 2000; i++) {
    const source = randomDoc(gen)
    const target = randomDoc(gen)
    const { tr, reached } = diffedTo(source, target)
    t.assert(reached, `case ${i}: diffDocs gave up\n${JSON.stringify(source.toJSON())}\n${JSON.stringify(target.toJSON())}`)
    t.compare(json(tr.doc), json(target), `case ${i}: diffDocs did not reach the target`)
  }
}

/**
 * The symptom as it was reported: while syncing a remote change the plugin
 * logged that diffDocs produced an incorrect document and fell back to replacing
 * the whole document, which reports every position as deleted.
 *
 * @param {t.TestCase} _tc
 */
export const testSyncPluginNeverReplacesTheWholeDocument = (_tc) => {
  const errors = []
  const originalConsoleError = console.error
  console.error = (...args) => {
    if (String(args[0]).indexOf('diffDocs produced an incorrect document') >= 0) errors.push(args)
  }
  try {
    const ydoc = new Y.Doc()
    const view = createNewProsemirrorView(ydoc)
    const other = createNewProsemirrorView(ydoc)

    view.dispatch(
      view.state.tr.insert(0, schema.node('heading', { level: 1 }, Fragment.from([schema.node('hard_break')])))
    )
    const tr = view.state.tr
    tr.replace(1, 2, new Slice(Fragment.from([schema.text('b', [schema.mark('code')])]), 0, 0))
    tr.insert(2, schema.text('a'))
    tr.setNodeMarkup(0, undefined, { level: 2 })
    view.dispatch(tr)

    t.compare(json(view.state.doc), json(other.state.doc), 'both views hold the remote change')
  } finally {
    console.error = originalConsoleError
  }
  t.compare(errors, [], 'the sync plugin never produced an incorrect document')
}
