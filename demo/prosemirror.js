/* eslint-env browser */

import * as Y from '@y/y'
import { syncPlugin } from '../src/index.js'
import { EditorState } from 'prosemirror-state'
import { schema } from './schema.js'
import { exampleSetup } from 'prosemirror-example-setup'
import { WebsocketProvider } from '@y/websocket'
import * as random from 'lib0/random'
import * as error from 'lib0/error'
import { EditorView } from 'prosemirror-view'

const roomName = 'pm-suggestion-demo-2'

/**
 * @type {HTMLInputElement?}
 */
const elemToggleConnect = document.querySelector('#toggle-connect')

/**
 * @type {HTMLInputElement?}
 */
const elemToggleShowSuggestions = document.querySelector('#toggle-show-suggestions')
/**
 * @type {HTMLInputElement?}
 */
const elemToggleSuggestMode = document.querySelector('#toggle-suggest-mode')
if (elemToggleShowSuggestions == null || elemToggleSuggestMode == null || elemToggleConnect == null) error.unexpectedCase()

if (localStorage.getItem('should-connect') != null) {
  elemToggleConnect.checked = localStorage.getItem('should-connect') === 'true'
}

elemToggleShowSuggestions.addEventListener('change', () => initEditor())

// when in suggestion-mode, we should use a different clientId to reduce some overhead. This is not
// strictly necessary.
let otherClientID = random.uint53()
elemToggleSuggestMode.addEventListener('change', () => {
  const enabled = elemToggleSuggestMode.checked
  am.suggestionMode = enabled
  if (enabled) {
    elemToggleShowSuggestions.checked = true
    elemToggleShowSuggestions.disabled = true
  } else {
    elemToggleShowSuggestions.disabled = false
  }
  const nextClientId = otherClientID
  otherClientID = suggestionDoc.clientID
  suggestionDoc.clientID = nextClientId

  // Define user name and user name
  // Check the quill-cursors package on how to change the way cursors are rendered
  providerYdoc.awareness.setLocalStateField('user', {
    name: 'Typing Jimmy',
    color: 'blue'
  })

  initEditor()
})

elemToggleConnect.addEventListener('change', () => {
  if (elemToggleConnect.checked) {
    providerYdoc.connectBc()
    providerYdocSuggestions.connectBc()
  } else {
    providerYdoc.disconnectBc()
    providerYdocSuggestions.disconnectBc()
  }
  localStorage.setItem('should-connect', elemToggleConnect.checked ? 'true' : 'false')
})

/*
 * # Init two Yjs documents.
 *
 * The suggestion document is a fork of the original document. By keeping them separate, we can
 * enforce different permissions on these documents.
 */

const ydoc = new Y.Doc()
const providerYdoc = new WebsocketProvider('wss://demos.yjs.dev/ws', roomName, ydoc, { connect: false })
elemToggleConnect.checked && providerYdoc.connectBc()
const suggestionDoc = new Y.Doc({ isSuggestionDoc: true })
const providerYdocSuggestions = new WebsocketProvider('wss://demos.yjs.dev/ws', roomName + '--suggestions', suggestionDoc, { connect: false })
elemToggleConnect.checked && providerYdocSuggestions.connectBc()
const am = Y.createAttributionManagerFromDiff(ydoc, suggestionDoc)

/**
 * @type {EditorView?}
 */
let currentView = null

const initEditor = () => {
  const withSuggestions = elemToggleShowSuggestions.checked
  const ypm = (withSuggestions ? suggestionDoc : ydoc).getXmlFragment('prosemirror-s')
  currentView?.destroy()
  const ypmContainer = document.querySelector('#ypm-container')
  ypmContainer.innerHTML = ''
  const editor = document.createElement('div')
  editor.setAttribute('class', 'yeditor')
  ypmContainer.insertBefore(editor, null)
  currentView = new EditorView(editor, {
    state: EditorState.create({
      schema,
      plugins: [].concat(exampleSetup({ schema, history: false }), syncPlugin(ypm, { awareness: providerYdoc.awareness, attributionManager: withSuggestions ? am : undefined }))
    })
  })
  // @ts-ignore
  window.example = { suggestionDoc, ydoc, type: ypm, currentView }
}

initEditor()
