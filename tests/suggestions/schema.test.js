import * as t from 'lib0/testing'
import { EditorState } from 'prosemirror-state'

import { schema } from './schema.js'

// === PM Schema validation tests ===
// Verify that addNodeMark works for the node types we care about.

/**
 * Schema: paragraph in doc can have an insertion node mark (doc allows attribution marks).
 */
export const testSchemaParaInDocNodeMark = () => {
  const state = EditorState.create({ schema })
  const tr = state.tr
  const mark = schema.marks['y-attribution-insertion'].create({
    userIds: [],
    timestamp: null
  })
  // pos 0 = the default paragraph
  tr.addNodeMark(0, mark)
  t.assert(
    tr.doc.firstChild?.marks.some(
      (m) => m.type.name === 'y-attribution-insertion'
    ),
    'paragraph in doc has insertion mark'
  )
}

/**
 * Schema: paragraph in blockquote can have an insertion node mark.
 */
export const testSchemaParaInBlockquoteNodeMark = () => {
  const state = EditorState.create({ schema })
  const tr = state.tr
  // Replace doc content with blockquote > paragraph
  tr.replaceWith(
    0,
    tr.doc.content.size,
    schema.nodes.blockquote.create(
      null,
      schema.nodes.paragraph.create(null, schema.text('quoted'))
    )
  )
  const mark = schema.marks['y-attribution-insertion'].create({
    userIds: [],
    timestamp: null
  })
  // pos 1 = the paragraph inside the blockquote
  tr.addNodeMark(1, mark)
  const bq = tr.doc.firstChild
  t.assert(bq?.type.name === 'blockquote', 'first child is blockquote')
  const para = bq?.firstChild
  t.assert(
    para?.marks.some((m) => m.type.name === 'y-attribution-insertion'),
    'paragraph in blockquote has insertion mark'
  )
}

/**
 * Schema: image in paragraph can have an insertion node mark.
 */
export const testSchemaImageInParaNodeMark = () => {
  const state = EditorState.create({ schema })
  const tr = state.tr
  // Insert image into the default paragraph
  tr.insert(1, schema.nodes.image.create({ src: 'test.png' }))
  const mark = schema.marks['y-attribution-insertion'].create({
    userIds: [],
    timestamp: null
  })
  // pos 1 = the image node
  tr.addNodeMark(1, mark)
  const img = tr.doc.firstChild?.firstChild
  t.assert(img?.type.name === 'image', 'first inline child is image')
  t.assert(
    img?.marks.some((m) => m.type.name === 'y-attribution-insertion'),
    'image in paragraph has insertion mark'
  )
}
