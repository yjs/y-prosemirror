/* eslint-env browser */
import { BlockNoteEditor } from '@blocknote/core'
import { Extension } from '@tiptap/core'
import { TextSelection } from 'prosemirror-state'
import { configureYProsemirror, syncPlugin } from '@y/prosemirror'
import { describe, expect, test } from 'vitest'
import * as Y from '@y/y'

// Map Y.js attributions to BlockNote's built-in suggestion marks
const mapAttributionToMark = (format, attribution) => {
  let mergeWith = null
  if (attribution.insert) {
    mergeWith = { insertion: { id: 1 } }
  } else if (attribution.delete) {
    mergeWith = { deletion: { id: 1 } }
  } else if (attribution.format) {
    mergeWith = {
      modification: {
        id: 1,
        type: 'format',
        attrName: null,
        previousValue: null,
        newValue: null
      }
    }
  }
  return Object.assign({}, format, mergeWith)
}

const YSyncExtension = Extension.create({
  name: 'ySync',
  addProseMirrorPlugins () {
    return [syncPlugin({ mapAttributionToMark })]
  }
})

/** Set up two-way sync between two Y.Docs. Returns a disconnect function. */
function setupTwoWaySync (doc1, doc2) {
  Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
  Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))
  const f1 = (update) => Y.applyUpdate(doc2, update)
  const f2 = (update) => Y.applyUpdate(doc1, update)
  doc1.on('update', f1)
  doc2.on('update', f2)
  return () => {
    doc1.off('update', f1)
    doc2.off('update', f2)
  }
}

/** Create a BlockNoteEditor bound to a Y.js fragment. */
function createEditor (fragment) {
  const el = document.createElement('div')
  document.body.appendChild(el)

  const editor = BlockNoteEditor.create({
    _tiptapOptions: {
      extensions: [YSyncExtension]
    }
  })
  editor.mount(el)

  const te = editor._tiptapEditor
  const view = te.view

  configureYProsemirror({ ytype: fragment })(view.state, view.dispatch)
  return { editor, view }
}

/** Find the text position inside the first paragraph (blockContent). */
function findFirstTextPosition (doc) {
  let pos = 0
  doc.descendants((node, nodePos) => {
    if (
      pos === 0 &&
      node.type.spec.group &&
      node.type.spec.group.includes('blockContent')
    ) {
      pos = nodePos + 1
      return false
    }
    return true
  })
  return pos
}

/** Find the position right after the first blockContainer closes. */
function findEndOfFirstBlockContainer (doc) {
  let pos = 0
  doc.descendants((node, nodePos) => {
    if (pos === 0 && node.type.name === 'blockContainer') {
      pos = nodePos + node.nodeSize
      return false
    }
    return true
  })
  return pos
}

/** Get block text contents from a PM doc. */
function getBlocks (doc) {
  const blocks = []
  doc.descendants((node) => {
    if (node.type.name === 'blockContainer') {
      blocks.push(node.textContent)
    }
    return true
  })
  return blocks
}

describe('BlockNote sync', () => {
  /**
   * BUG REPRO: two blocks "aaa" + "a", set cursor after "aa", press Enter.
   * BlockNote's splitBlock + UniqueID appendTransaction produce a single
   * combined Y.js delta that crashes deltaToPSteps on client 2.
   * TODO: FAILING — NodeType.create can't construct text nodes (deltaToPSteps position tracking bug in sync-utils.js:208)
   */
  test('split multi-block via Enter key', () => {
    const doc1 = new Y.Doc()
    const doc2 = new Y.Doc()
    setupTwoWaySync(doc1, doc2)

    const { view: view1 } = createEditor(doc1.get('doc'))
    const { view: view2 } = createEditor(doc2.get('doc'))

    // Type "aaa" in the first block
    const textPos = findFirstTextPosition(view1.state.doc)
    view1.dispatch(view1.state.tr.insertText('aaa', textPos))

    // Insert a second block with "a"
    const insertPos = findEndOfFirstBlockContainer(view1.state.doc)
    const schema = view1.state.schema
    const newBlock = schema.nodes.blockContainer.create(
      null,
      schema.nodes.paragraph.create(null, schema.text('a'))
    )
    view1.dispatch(view1.state.tr.insert(insertPos, newBlock))

    expect(view1.state.doc.textContent).toContain('aaa')
    expect(view2.state.doc.textContent).toContain('aaa')

    // Place cursor after "aa" in the first block
    const cursorPos = findFirstTextPosition(view1.state.doc) + 2
    view1.dispatch(
      view1.state.tr.setSelection(TextSelection.create(view1.state.doc, cursorPos))
    )
    expect(view1.state.selection.from).toBe(cursorPos)

    // Send Enter key — triggers BlockNote's splitBlock + UniqueID appendTransaction
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    })
    view1.dom.dispatchEvent(enterEvent)

    // After Enter: "aa", "a" (from split), "a" (second block), "" (trailing)
    const blocks1 = getBlocks(view1.state.doc)
    expect(blocks1).toHaveLength(4)
    expect(blocks1[0]).toBe('aa')

    const blocks2 = getBlocks(view2.state.doc)
    expect(blocks2).toHaveLength(4)
    expect(blocks2[0]).toBe('aa')
  })
})
