
import * as t from 'lib0/testing.js'
import * as prng from 'lib0/prng.js'
import * as math from 'lib0/math.js'
import * as Y from 'yjs'

import { prosemirrorPlugin } from '../src/y-prosemirror.js'
import { Slice, Fragment } from 'prosemirror-model'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { schema } from 'prosemirror-schema-basic'
import { exampleSetup } from 'prosemirror-example-setup'

const createNewProsemirrorView = y => {
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({
      schema,
      plugins: exampleSetup({ schema }).concat([prosemirrorPlugin(y.get('prosemirror', Y.XmlFragment))])
    })
  })
  return view
}

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
   * @param {EditorView} p
   * @param {prng.PRNG} gen
   */
  (p, gen) => { // insert text
    const insertPos = prng.int32(gen, 0, p.state.doc.content.size)
    const marks = prng.oneOf(gen, marksChoices)
    const tr = p.state.tr
    const text = charCounter++ + prng.word(gen)
    p.dispatch(tr.insert(insertPos, schema.text(text, marks)))
  },
  /**
   * @param {EditorView} p
   * @param {prng.PRNG} gen
   */
  (p, gen) => { // delete text
    const insertPos = prng.int32(gen, 0, p.state.doc.content.size)
    const overwrite = math.min(prng.int32(gen, 0, p.state.doc.content.size - insertPos), 2)
    p.dispatch(p.state.tr.insertText('', insertPos, insertPos + overwrite))
  },
  /**
   * @param {EditorView} p
   * @param {prng.PRNG} gen
   */
  (p, gen) => { // replace text
    const insertPos = prng.int32(gen, 0, p.state.doc.content.size)
    const overwrite = math.min(prng.int32(gen, 0, p.state.doc.content.size - insertPos), 2)
    const text = charCounter++ + prng.word(gen)
    p.dispatch(p.state.tr.insertText(text, insertPos, insertPos + overwrite))
  }
]

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomProsemirrorInsertions = tc => {
  const gen = tc.prng
  const y = new Y.Y()
  const p1 = createNewProsemirrorView(y)
  const p2 = createNewProsemirrorView(y)
  for (let i = 0; i < 2; i++) {
    const p = prng.oneOf(gen, [p1, p2])
    prng.oneOf(gen, pmChanges)(p, gen)
  }
  t.compare(
    p1.state.doc.toJSON(),
    p2.state.doc.toJSON(),
    'compare prosemirror models'
  )
}
