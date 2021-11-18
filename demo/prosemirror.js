/* eslint-env browser */

import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { ySyncPlugin, yCursorPlugin, yUndoPlugin, undo, redo } from '../src/y-prosemirror.js'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { schema } from './schema.js'
import { exampleSetup } from 'prosemirror-example-setup'
import { keymap } from 'prosemirror-keymap'

class MyHookView {
  constructor (node, view) {
    this.node = node
    this.view = view
    this.dom = document.createElement('button')
    // This is a YXmlHook type that you can use to store custom information
    /**
     * @type {Y.XmlHook}
     */
    this.yhook = node.attrs.yhook
    this.dom.innerText = this.value
    this.dom.addEventListener('click', () => {
      this.value++
    })
    this.yhook.observe(event => {
      this.dom.innerText = this.value
    })
  }
  get value () {
    return this.yhook.get('value') || 0
  }
  set value (newValue) {
    this.yhook.set('value', newValue)
  }
}

window.addEventListener('load', () => {
  const ydoc = new Y.Doc()
  const provider = new WebrtcProvider('prosemirror-debug-2', ydoc)
  const type = ydoc.getXmlFragment('prosemirror')

  const editor = document.createElement('div')
  editor.setAttribute('id', 'editor')
  const editorContainer = document.createElement('div')
  editorContainer.insertBefore(editor, null)
  const prosemirrorView = new EditorView(editor, {
    state: EditorState.create({
      schema,
      plugins: [
        ySyncPlugin(type),
        yCursorPlugin(provider.awareness),
        yUndoPlugin(),
        keymap({
          'Mod-z': undo,
          'Mod-y': redo,
          'Mod-Shift-z': redo
        })
      ].concat(exampleSetup({ schema }))
    }),
    nodeViews: {
      myhook: (node, view) => new MyHookView(node, view)
    }
  })
  document.body.insertBefore(editorContainer, null)

  const connectBtn = /** @type {HTMLElement} */ (document.getElementById('y-connect-btn'))
  connectBtn.addEventListener('click', () => {
    if (provider.shouldConnect) {
      provider.disconnect()
      connectBtn.textContent = 'Connect'
    } else {
      provider.connect()
      connectBtn.textContent = 'Disconnect'
    }
  })

  // @ts-ignore
  window.example = { provider, ydoc, type, prosemirrorView }
  // @ts-ignore
  window.Y = Y
})
