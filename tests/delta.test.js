import * as t from 'lib0/testing'
import * as ypm from '../src/index.js'
import * as basicSchema from 'prosemirror-schema-basic'
import * as Y from 'yjs'
import { Node, Schema } from 'prosemirror-model'

const schema = new Schema({
  nodes: basicSchema.nodes,
  marks: basicSchema.marks
})

const createProsemirrorView = () => {
  const view = new ypm.YEditorView(null, {
    // @ts-ignore
    state: EditorState.create({
      schema
    })
  })
  return view
}

/**
 * @param {t.TestCase} _tc
 */
export const testEmptyParagraph = (_tc) => {
  const ydoc = new Y.Doc()
  const view = createProsemirrorView()
  view.dispatch(
    view.state.tr.insert(
      0,
      /** @type {any} */ (schema.node(
        'paragraph',
        undefined,
        schema.text('123')
      ))
    ).insert(0, /** @type {any} */ (schema.node(
      'paragraph',
      undefined,
      schema.text('456')
    ))).insert(1, schema.text('xyz')).delete(2, 3)
  )

  const yxml = ydoc.get('prosemirror')
}

