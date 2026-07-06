/* eslint-env browser */

import * as Y from '@y/y'
import { syncPlugin, configureYProsemirror, defaultMapAttributionToMark, undoCommand, redoCommand, acceptChanges, rejectChanges, acceptAllChanges, rejectAllChanges } from '../src/index.js'
import { yCursorPlugin } from '../src/cursor-plugin.js'
import { EditorState } from 'prosemirror-state'
import { schema } from './schema.js'
import { exampleSetup } from 'prosemirror-example-setup'
import { keymap } from 'prosemirror-keymap'
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
 * @type {HTMLSelectElement?}
 */
const elemSelectSuggestionMode = document.querySelector('#select-suggestion-mode')
if (elemSelectSuggestionMode == null || elemToggleConnect == null) error.unexpectedCase()

if (localStorage.getItem('should-connect') != null) {
  elemToggleConnect.checked = localStorage.getItem('should-connect') === 'true'
}

/*
 * # Init two Yjs documents.
 *
 * The suggestion document is a fork of the original document. By keeping them separate, we can
 * enforce different permissions on these documents.
 */

const ydoc = new Y.Doc({ gc: false })
const providerYdoc = new WebsocketProvider('wss://demos.yjs.dev/ws', roomName, ydoc, { connect: false })
elemToggleConnect.checked && providerYdoc.connectBc()
const suggestionDoc = new Y.Doc({ gc: false, isSuggestionDoc: true })
const providerYdocSuggestions = new WebsocketProvider('wss://demos.yjs.dev/ws', roomName + '--suggestions', suggestionDoc, { connect: false })
elemToggleConnect.checked && providerYdocSuggestions.connectBc()
const renderer = Y.createDiffRenderer(ydoc, suggestionDoc, { attrs: new Y.Attributions() })

const yxmlFragment = ydoc.get()

// when in suggestion-mode, we should use a different clientId to reduce some overhead. This is not
// strictly necessary.
let otherClientID = random.uint53()
let previousMode = 'off'

/**
 * @type {HTMLElement | null}
 */
const elemSuggestionActions = document.querySelector('#suggestion-actions')
const btnAcceptChanges = document.querySelector('#btn-accept-changes')
const btnRejectChanges = document.querySelector('#btn-reject-changes')
const btnAcceptAllChanges = document.querySelector('#btn-accept-all-changes')
const btnRejectAllChanges = document.querySelector('#btn-reject-all-changes')

const updateSuggestionButtons = () => {
  const mode = elemSelectSuggestionMode.value
  const showButtons = mode === 'view' || mode === 'edit'
  if (elemSuggestionActions) {
    elemSuggestionActions.style.display = showButtons ? 'block' : 'none'
  }
}

// ── Editor Init ──

const editorContainer = /** @type {HTMLElement} */ (document.querySelector('#ypm-container'))
const editor = document.createElement('div')
editor.setAttribute('class', 'yeditor')
editorContainer.insertBefore(editor, null)

/**
 * @type {EditorView}
 */
const currentView = new EditorView(editor, {
  state: EditorState.create({
    schema,
    plugins: /** @type {any[]} */ ([]).concat(
      exampleSetup({ schema }),
      syncPlugin({ mapAttributionToMark: defaultMapAttributionToMark }),
      yCursorPlugin(providerYdoc.awareness),
      // yUndoPlugin(),
      keymap({
        'Mod-z': undoCommand,
        'Mod-y': redoCommand,
        'Mod-Shift-z': redoCommand
      })
    )
  })
})

const initLiveEditor = () => {
  const mode = elemSelectSuggestionMode.value
  if (mode === 'off') {
    configureYProsemirror({
      ytype: yxmlFragment,
      renderer: null
    })(currentView.state, currentView.dispatch)
  } else {
    renderer.suggestionMode = mode === 'edit'
    configureYProsemirror({
      ytype: suggestionDoc.get(),
      renderer
    })(currentView.state, currentView.dispatch)
  }
  updateSuggestionButtons()
}

elemSelectSuggestionMode.addEventListener('change', () => {
  const mode = elemSelectSuggestionMode.value

  // When entering edit mode, switch clientId and set user awareness
  if (mode === 'edit' && previousMode !== 'edit') {
    const nextClientId = otherClientID
    otherClientID = suggestionDoc.clientID
    suggestionDoc.clientID = nextClientId

    // Define user name and user name
    // Check the quill-cursors package on how to change the way cursors are rendered
    providerYdoc.awareness.setLocalStateField('user', {
      name: 'Typing Jimmy',
      color: 'blue'
    })
  }

  if (mode === 'off') { // normal mode
    configureYProsemirror({
      ytype: yxmlFragment,
      renderer: null
    })(currentView.state, currentView.dispatch)
  } else { // suggestion mode - render suggestion doc with attributions
    renderer.suggestionMode = mode === 'edit'
    configureYProsemirror({
      ytype: suggestionDoc.get(),
      renderer
    })(currentView.state, currentView.dispatch)
  }
  previousMode = mode
  updateSuggestionButtons()
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

// Accept/Reject changes buttons
if (btnAcceptChanges) {
  btnAcceptChanges.addEventListener('click', () => {
    const { from, to } = currentView.state.selection
    acceptChanges(from, to)(currentView.state, currentView.dispatch)
  })
}

if (btnRejectChanges) {
  btnRejectChanges.addEventListener('click', () => {
    const { from, to } = currentView.state.selection
    rejectChanges(from, to)(currentView.state, currentView.dispatch)
  })
}

// Accept/Reject all changes buttons
if (btnAcceptAllChanges) {
  btnAcceptAllChanges.addEventListener('click', () => {
    acceptAllChanges()(currentView.state, currentView.dispatch)
  })
}

if (btnRejectAllChanges) {
  btnRejectAllChanges.addEventListener('click', () => {
    rejectAllChanges()(currentView.state, currentView.dispatch)
  })
}

initLiveEditor()

// @ts-ignore
window.example = { suggestionDoc, ydoc, type: yxmlFragment, currentView }
