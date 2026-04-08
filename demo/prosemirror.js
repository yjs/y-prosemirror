/* eslint-env browser */

import * as Y from '@y/y'
import { syncPlugin, ySyncPluginKey, configureYProsemirror, defaultMapAttributionToMark, yUndoPlugin, undoCommand, redoCommand } from '../src/index.js'
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
const am = /** @type {any} */ (Y).createAttributionManagerFromDiff(ydoc, suggestionDoc, { attrs: [Y.createContentAttribute('insert', ['nickthesick'])] })

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
      exampleSetup({ schema, history: false }),
      syncPlugin({ mapAttributionToMark: defaultMapAttributionToMark }),
      yCursorPlugin(providerYdoc.awareness),
      yUndoPlugin(),
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
      attributionManager: null
    })(currentView.state, currentView.dispatch)
  } else {
    am.suggestionMode = mode === 'edit'
    configureYProsemirror({
      ytype: suggestionDoc.get(),
      attributionManager: am
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
      attributionManager: null
    })(currentView.state, currentView.dispatch)
  } else { // suggestion mode - render suggestion doc with attributions
    am.suggestionMode = mode === 'edit'
    configureYProsemirror({
      ytype: suggestionDoc.get(),
      attributionManager: am
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
    const pluginState = ySyncPluginKey.getState(currentView.state)
    if (!pluginState) return

    const selection = currentView.state.selection
    const from = selection.from
    const to = selection.to

    try {
      /** @type {any} */ (pluginState).acceptChanges(from, to)
    } catch (/** @type {any} */ error) {
      console.error('Error accepting changes:', error)
      alert('Error accepting changes: ' + error.message)
    }
  })
}

if (btnRejectChanges) {
  btnRejectChanges.addEventListener('click', () => {
    const pluginState = ySyncPluginKey.getState(currentView.state)
    if (!pluginState) return

    const selection = currentView.state.selection
    const from = selection.from
    const to = selection.to

    try {
      /** @type {any} */ (pluginState).rejectChanges(from, to)
    } catch (/** @type {any} */ error) {
      console.error('Error rejecting changes:', error)
      alert('Error rejecting changes: ' + error.message)
    }
  })
}

// Accept/Reject all changes buttons
if (btnAcceptAllChanges) {
  btnAcceptAllChanges.addEventListener('click', () => {
    const pluginState = ySyncPluginKey.getState(currentView.state)
    if (!pluginState) return

    try {
      /** @type {any} */ (pluginState).acceptAllChanges()
    } catch (/** @type {any} */ error) {
      console.error('Error accepting all changes:', error)
      alert('Error accepting all changes: ' + error.message)
    }
  })
}

if (btnRejectAllChanges) {
  btnRejectAllChanges.addEventListener('click', () => {
    const pluginState = ySyncPluginKey.getState(currentView.state)
    if (!pluginState) return

    try {
      /** @type {any} */ (pluginState).rejectAllChanges()
    } catch (/** @type {any} */ error) {
      console.error('Error rejecting all changes:', error)
      alert('Error rejecting all changes: ' + error.message)
    }
  })
}

initLiveEditor()

// @ts-ignore
window.example = { suggestionDoc, ydoc, type: yxmlFragment, currentView }
