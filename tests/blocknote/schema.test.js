import * as t from 'lib0/testing'
import { EditorState } from 'prosemirror-state'

import { schema } from './schema.js'

// === BlockNote PM Schema validation tests ===
// Verify that nodes can hold attribution marks at different levels.

const deletionMark = schema.marks.deletion.create({ id: 1 })
const insertionMark = schema.marks.insertion.create({ id: 1 })

/**
 * Schema: blockContainer nodes can hold attribution marks.
 * blockContainer+heading (marked as deleted) and blockContainer+paragraph (marked as inserted)
 * at the blockContainer level.
 */
export const testSchemaBlockContainerNodeMarks = () => {
  const state = EditorState.create({ schema })
  const tr = state.tr

  tr.replaceWith(
    0,
    tr.doc.content.size,
    schema.nodes.blockGroup.create(null, [
      schema.nodes.blockContainer.create(null,
        schema.nodes.heading.create(null, schema.text('title'))
      ).mark([deletionMark]),
      schema.nodes.blockContainer.create(null,
        schema.nodes.paragraph.create(null, schema.text('body'))
      ).mark([insertionMark])
    ])
  )

  tr.doc.check()

  const firstBC = tr.doc.firstChild?.firstChild
  t.assert(firstBC?.type.name === 'blockContainer', 'first child is blockContainer')
  t.assert(
    firstBC?.marks.some((m) => m.type.name === 'deletion'),
    'blockContainer with heading has deletion mark'
  )

  const secondBC = tr.doc.firstChild?.child(1)
  t.assert(secondBC?.type.name === 'blockContainer', 'second child is blockContainer')
  t.assert(
    secondBC?.marks.some((m) => m.type.name === 'insertion'),
    'blockContainer with paragraph has insertion mark'
  )
}

/**
 * Schema: blockContent nodes inside a single blockContainer can hold attribution marks.
 * One blockContainer holding heading (marked as deleted) and paragraph (marked as inserted).
 * This violates the blocknote schema (which is why we catch the exception which is expected)
 * 
 * NOTE: this schema might cause issues when changing node type
 */
export const testSchemaBlockContentNodeMarks = () => {
  const state = EditorState.create({ schema })
  const tr = state.tr

  tr.replaceWith(
    0,
    tr.doc.content.size,
    schema.nodes.blockGroup.create(null,
      schema.nodes.blockContainer.create(null, [
        schema.nodes.heading.create(null, schema.text('title')).mark([deletionMark]),
        schema.nodes.paragraph.create(null, schema.text('body')).mark([insertionMark])
      ])
    )
  )

  const bc = tr.doc.firstChild?.firstChild
  t.assert(bc?.type.name === 'blockContainer', 'child is blockContainer')

  const heading = bc?.firstChild
  t.assert(heading?.type.name === 'heading', 'first child is heading')
  t.assert(
    heading?.marks.some((m) => m.type.name === 'deletion'),
    'heading has deletion mark'
  )

  const para = bc?.child(1)
  t.assert(para?.type.name === 'paragraph', 'second child is paragraph')
  t.assert(
    para?.marks.some((m) => m.type.name === 'insertion'),
    'paragraph has insertion mark'
  )

  let threw = false
  try {
    tr.doc.check()
  } catch (e) {
    threw = true
  }
  t.assert(threw, 'doc.check() rejects two blockContent nodes in one blockContainer')
}
