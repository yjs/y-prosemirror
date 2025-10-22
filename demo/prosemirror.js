/* eslint-env browser */

import * as Y from 'yjs'
import { YEditorView } from '../src/index.js'
import { EditorState } from 'prosemirror-state'
import { schema } from './schema.js'
import { exampleSetup } from 'prosemirror-example-setup'


/**
 * @param {Y.Doc} ydoc1
 * @param {Y.Doc} ydoc2
 */
const syncYdocs = (ydoc1, ydoc2) => {
  Y.applyUpdate(ydoc1, Y.encodeStateAsUpdate(ydoc2))
  Y.applyUpdate(ydoc2, Y.encodeStateAsUpdate(ydoc1))
  ydoc1.on('update', update => {
    Y.applyUpdate(ydoc2, update)
  })
  ydoc2.on('update', update => {
    Y.applyUpdate(ydoc1, update)
  })
}

let prevYDoc = null

const createEditor = () => {
  const ydoc = new Y.Doc()
  if (prevYDoc) {
    syncYdocs(prevYDoc, ydoc)
  }
  prevYDoc = ydoc
  const yfragment = ydoc.getXmlFragment('prosemirror')
  const editor = document.createElement('div')
  editor.setAttribute('class', 'yeditor')
  const editorContainer = document.createElement('div')
  editorContainer.insertBefore(editor, null)
  const prosemirrorView = new YEditorView(editor, {
    state: EditorState.create({
      schema,
      plugins: [].concat(exampleSetup({ schema, history: false }))
    })
  })
  document.body.insertBefore(editorContainer, null)
  prosemirrorView.bindYType(yfragment)
  // @ts-ignore
  window.example = { ydoc, type: yfragment, prosemirrorView }
}

window.addEventListener('load', () => {
  createEditor()
  createEditor()
})
