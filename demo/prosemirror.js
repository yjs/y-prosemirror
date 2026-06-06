/* eslint-env browser */

import * as Y from '@y/y'
import { syncPlugin, configureYProsemirror, undoCommand, redoCommand, ySuggestionDecorationPlugin, ySuggestionDecorationPluginKey, acceptChanges, rejectChanges } from '../src/index.js'
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

const ydoc = new Y.Doc({ gc: false })
const providerYdoc = new WebsocketProvider('wss://demos.yjs.dev/ws', roomName, ydoc, { connect: false })
elemToggleConnect.checked && providerYdoc.connectBc()
const suggestionDoc = new Y.Doc({ gc: false, isSuggestionDoc: true })
const providerYdocSuggestions = new WebsocketProvider('wss://demos.yjs.dev/ws', roomName + '--suggestions', suggestionDoc, { connect: false })
elemToggleConnect.checked && providerYdocSuggestions.connectBc()
const am = /** @type {any} */ (Y).createAttributionManagerFromDiff(ydoc, suggestionDoc, { attrs: [Y.createContentAttribute('insert', ['nickthesick'])] })

const yxmlFragment = ydoc.get()

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
      syncPlugin(),
      ySuggestionDecorationPlugin(),
      yCursorPlugin(providerYdoc.awareness),
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

  if (mode === 'edit' && previousMode !== 'edit') {
    const nextClientId = otherClientID
    otherClientID = suggestionDoc.clientID
    suggestionDoc.clientID = nextClientId

    providerYdoc.awareness.setLocalStateField('user', {
      name: 'Typing Jimmy',
      color: 'blue'
    })
  }

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

/**
 * Find the diff decoration covering the current selection head (or the
 * narrowest one if multiple overlap). Returns the diff's from/to or null.
 *
 * @returns {{ from: number, to: number } | null}
 */
const getSelectedDiffRange = () => {
  const { state } = currentView
  const decoSet = ySuggestionDecorationPluginKey.getState(state)
  if (!decoSet) return null
  const { from, to } = state.selection
  const decos = decoSet.find(from, to)
  if (!decos.length) return null
  const diff = decos[0].spec?.diff
  if (!diff) return null
  return { from: diff.from, to: diff.to }
}

if (btnAcceptChanges) {
  btnAcceptChanges.addEventListener('click', () => {
    const range = getSelectedDiffRange()
    if (range) {
      acceptChanges(range.from, range.to)(currentView.state, currentView.dispatch)
    }
  })
}

if (btnRejectChanges) {
  btnRejectChanges.addEventListener('click', () => {
    const range = getSelectedDiffRange()
    if (range) {
      rejectChanges(range.from, range.to)(currentView.state, currentView.dispatch)
    }
  })
}

if (btnAcceptAllChanges) {
  btnAcceptAllChanges.addEventListener('click', () => {
    am.acceptAllChanges()
  })
}

if (btnRejectAllChanges) {
  btnRejectAllChanges.addEventListener('click', () => {
    am.rejectAllChanges()
  })
}

initLiveEditor()

// @ts-ignore
window.example = { suggestionDoc, ydoc, type: yxmlFragment, currentView, am }
