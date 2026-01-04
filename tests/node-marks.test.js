// @ts-nocheck
import * as t from 'lib0/testing'
import * as Y from '@y/y'
import { updateYFragment } from '../src/y-prosemirror.js'
import { createNodeFromYElement, createEmptyMeta } from '../src/plugins/sync-plugin.js'
import { Schema } from 'prosemirror-model'

// Create a schema with an inline node and a mark
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
    mention: {
      inline: true,
      atom: true,
      group: 'inline',
      attrs: {
        id: { default: null }
      },
      toDOM: () => ['span', 0]
    }
  },
  marks: {
    highlight: {
      attrs: {
        color: { default: 'yellow' }
      },
      toDOM: () => ['mark', 0]
    }
  }
})

/**
 * Test that inline node marks are preserved during sync
 * @param {t.TestCase} _tc
 */
export function testInlineNodeMarks (_tc) {
  // Create a mention node with a highlight mark
  const mention = schema.node('mention', { id: '123' }, [], [
    schema.mark('highlight', { color: 'yellow' })
  ])

  // Verify the mention has the mark
  t.assert(mention.marks.length === 1, 'Mention should have one mark')
  t.assert(mention.marks[0].type.name === 'highlight', 'Mention should have highlight mark')

  // Test 1: Create Yjs element manually and store marks
  const meta = createEmptyMeta()
  const ydoc = new Y.Doc()
  const yFragment = ydoc.getXmlFragment('test')
  const yElement = new Y.XmlElement('mention')
  yFragment.insert(0, [yElement])
  
  // Set attributes in a transaction
  ydoc.transact(() => {
    yElement.setAttribute('id', '123')
    // Manually set the mark attribute (simulating what createTypeFromElementNode does)
    // Yjs attributes can store objects, but we need to check if it's supported
    // For now, let's just test with a simple value
    mention.marks.forEach((mark) => {
      if (mark.type.name !== 'ychange') {
        // Store mark attrs as JSON string or directly if supported
        // Based on our implementation, we store the attrs object directly
        try {
          yElement.setAttribute(mark.type.name, mark.attrs)
        } catch (e) {
          // If object not supported, store as JSON string
          yElement.setAttribute(mark.type.name, JSON.stringify(mark.attrs))
        }
      }
    })
  })
  
  const attrs = yElement.getAttributes()
  // Check that the mark is stored as an attribute
  const hasHighlightMark = 'highlight' in attrs
  t.assert(hasHighlightMark, 'Yjs element should have highlight mark attribute')
  t.assert('id' in attrs && attrs.id === '123', 'Yjs element should have id attribute')

  // Test 2: createNodeFromYElement should restore marks
  const restoredMention = createNodeFromYElement(yElement, schema, meta)
  
  t.assert(restoredMention !== null, 'Should restore mention node')
  t.assert(restoredMention.type.name === 'mention', 'Restored node should be mention')
  t.assert(restoredMention.attrs.id === '123', 'Restored node should have id')
  t.assert(restoredMention.marks.length === 1, 'Restored mention should have one mark')
  t.assert(restoredMention.marks[0].type.name === 'highlight', 'Restored mention should have highlight mark')
  t.assert(restoredMention.marks[0].attrs.color === 'yellow', 'Restored mark should have correct color')

  // Test 3: updateYFragment should sync marks
  // Create a new mention with different mark
  const mention2 = schema.node('mention', { id: '456' }, [], [
    schema.mark('highlight', { color: 'red' })
  ])
  
  updateYFragment(ydoc, yElement, mention2, meta)
  
  const attrs2 = yElement.getAttributes()
  t.assert(attrs2.id === '456', 'Yjs element should have updated id')
  
  // Check that mark is updated
  const hasHighlightMark2 = 'highlight' in attrs2
  t.assert(hasHighlightMark2, 'Yjs element should have highlight mark attribute after update')
  
  // Restore and verify
  const restoredMention2 = createNodeFromYElement(yElement, schema, meta)
  t.assert(restoredMention2.marks.length === 1, 'Updated mention should have one mark')
  t.assert(restoredMention2.marks[0].attrs.color === 'red', 'Updated mark should have correct color')
}
