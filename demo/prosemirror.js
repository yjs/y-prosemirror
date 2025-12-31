/* eslint-env browser */

import * as Y from '@y/y'
import { syncPlugin, ySyncPluginKey } from '../src/y-prosemirror.js'
import { EditorState } from 'prosemirror-state'
import { schema } from './schema.js'
import { exampleSetup } from 'prosemirror-example-setup'
import { WebsocketProvider } from '@y/websocket'
import * as random from 'lib0/random'
import * as error from 'lib0/error'
import { EditorView } from 'prosemirror-view'
import * as object from 'lib0/object'

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

// when in suggestion-mode, we should use a different clientId to reduce some overhead. This is not
// strictly necessary.
let otherClientID = random.uint53()
let previousMode = 'off'

const elemSuggestionActions = document.querySelector('#suggestion-actions')
const btnAcceptChanges = document.querySelector('#btn-accept-changes')
const btnRejectChanges = document.querySelector('#btn-reject-changes')

const updateSuggestionButtons = () => {
  if (!currentView) {
    if (elemSuggestionActions) elemSuggestionActions.style.display = 'none'
    return
  }
  const mode = elemSelectSuggestionMode.value
  const showButtons = mode === 'view' || mode === 'edit'
  if (elemSuggestionActions) {
    elemSuggestionActions.style.display = showButtons ? 'block' : 'none'
  }
}

elemSelectSuggestionMode.addEventListener('change', () => {
  const mode = elemSelectSuggestionMode.value
  if (!currentView) return
  const pluginState = ySyncPluginKey.getState(currentView.state)
  if (!pluginState) return

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

  pluginState.setSuggestionMode(mode)
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

const elemTogglePauseSync = document.querySelector('#toggle-pause-sync')

elemTogglePauseSync.addEventListener('change', () => {
  if (!currentView) return
  const pluginState = ySyncPluginKey.getState(currentView.state)
  if (!pluginState) return

  if (elemTogglePauseSync.checked) {
    pluginState.pauseSync()
  } else {
    // When resuming from the toggle, use the keepChanges checkbox value
    const keepChanges = elemToggleKeepChanges?.checked || false
    pluginState.resumeSync({ keepChanges })
  }
  // Update UI immediately to reflect the checkbox state
  updateSnapshotUI()
})

/**
 * Snapshot management
 */
const snapshots = []
const btnTakeSnapshot = document.querySelector('#btn-take-snapshot')
const btnResumeSync = document.querySelector('#btn-resume-sync')
const btnRenderSnapshot = document.querySelector('#btn-render-snapshot')
const selectPrevSnapshot = document.querySelector('#select-prev-snapshot')
const selectSnapshot = document.querySelector('#select-snapshot')
const snapshotInfo = document.querySelector('#snapshot-info')
const elemToggleKeepChanges = document.querySelector('#toggle-keep-changes')

let lastSnapshotCount = 0

const updateSnapshotDropdowns = () => {
  // Only update dropdowns if snapshot count changed
  if (snapshots.length === lastSnapshotCount) {
    return
  }
  lastSnapshotCount = snapshots.length

  // Preserve current selections
  const prevSelectedValue = selectPrevSnapshot.value
  const selectedValue = selectSnapshot.value

  // Update dropdowns
  const updateSelect = (select, includeNone = false) => {
    select.innerHTML = includeNone ? '<option value="">-- None (single snapshot view) --</option>' : '<option value="">-- Select a snapshot --</option>'
    snapshots.forEach((snapshot, index) => {
      const option = document.createElement('option')
      option.value = index.toString()
      option.textContent = `Snapshot ${index + 1} (${new Date(snapshot.timestamp).toLocaleTimeString()})`
      select.appendChild(option)
    })
  }

  updateSelect(selectPrevSnapshot, true)
  updateSelect(selectSnapshot, false)

  // Restore selections if they're still valid
  if (prevSelectedValue !== '' && parseInt(prevSelectedValue, 10) < snapshots.length) {
    selectPrevSnapshot.value = prevSelectedValue
  }
  if (selectedValue !== '' && parseInt(selectedValue, 10) < snapshots.length) {
    selectSnapshot.value = selectedValue
  }
}

const updateSnapshotUI = () => {
  // Update dropdowns only if snapshot count changed
  updateSnapshotDropdowns()

  // Update render button state
  const hasSnapshot = selectSnapshot.value !== ''
  btnRenderSnapshot.disabled = !hasSnapshot

  // Update resume button state
  if (currentView) {
    const pluginState = ySyncPluginKey.getState(currentView.state)
    const isInSnapshotMode = pluginState && pluginState.mode === 'snapshot'
    const isPaused = pluginState && pluginState.mode === 'paused'
    const canResume = isInSnapshotMode || isPaused
    btnResumeSync.disabled = !canResume

    if (elemToggleKeepChanges) {
      elemToggleKeepChanges.disabled = !isPaused
    }

    if (isInSnapshotMode) {
      snapshotInfo.textContent = '⚠️ In snapshot preview mode - document is read-only. Click "Resume Sync" to return to live editing.'
      snapshotInfo.className = 'info-text warning'
    } else if (isPaused) {
      snapshotInfo.textContent = '⏸️ Sync is paused. Make changes and use "Resume Sync" to continue. Check "Keep Changes" to preserve edits made while paused.'
      snapshotInfo.className = 'info-text warning'
    } else {
      snapshotInfo.textContent = snapshots.length > 0
        ? `✓ ${snapshots.length} snapshot(s) available. Select "From" and "To" snapshots to compare, or just "To" for single snapshot view.`
        : 'Take a snapshot to preview the document at a specific point in time.'
      snapshotInfo.className = snapshots.length > 0 ? 'info-text success' : 'info-text info'
    }
  }
}

btnTakeSnapshot.addEventListener('click', () => {
  if (!currentView) return
  const pluginState = ySyncPluginKey.getState(currentView.state)
  if (!pluginState) return

  // Take a snapshot of the current document state
  const snapshot = Y.snapshot(ydoc)
  snapshots.push({
    snapshot,
    timestamp: Date.now()
  })
  console.log('Snapshot taken:', snapshot, 'Total snapshots:', snapshots.length)
  updateSnapshotUI()
})

btnRenderSnapshot.addEventListener('click', () => {
  if (!currentView) return
  const pluginState = ySyncPluginKey.getState(currentView.state)
  if (!pluginState) return

  const snapshotIndex = parseInt(selectSnapshot.value, 10)
  if (isNaN(snapshotIndex) || snapshotIndex < 0 || snapshotIndex >= snapshots.length) {
    return
  }

  const snapshotItem = snapshots[snapshotIndex]
  const prevSnapshotIndex = selectPrevSnapshot.value !== '' ? parseInt(selectPrevSnapshot.value, 10) : null

  // Use current ytype for rendering (it's the same fragment, just at different points in time)
  const currentYtype = pluginState.ytype

  if (prevSnapshotIndex !== null && !isNaN(prevSnapshotIndex) && prevSnapshotIndex >= 0 && prevSnapshotIndex < snapshots.length) {
    // Compare two snapshots
    const prevSnapshotItem = snapshots[prevSnapshotIndex]
    pluginState.renderSnapshot(
      { fragment: currentYtype, snapshot: snapshotItem.snapshot },
      { fragment: currentYtype, snapshot: prevSnapshotItem.snapshot }
    )
  } else {
    // Single snapshot view
    pluginState.renderSnapshot(
      { fragment: currentYtype, snapshot: snapshotItem.snapshot }
    )
  }

  updateSnapshotUI()
})

btnResumeSync.addEventListener('click', () => {
  if (!currentView) return
  const pluginState = ySyncPluginKey.getState(currentView.state)
  if (!pluginState) return

  const keepChanges = elemToggleKeepChanges?.checked || false
  pluginState.resumeSync({ keepChanges })
  updateSnapshotUI()
})

// Update button state when dropdowns change
selectPrevSnapshot.addEventListener('change', updateSnapshotUI)
selectSnapshot.addEventListener('change', updateSnapshotUI)

// Accept/Reject changes buttons
if (btnAcceptChanges) {
  btnAcceptChanges.addEventListener('click', () => {
    if (!currentView) return
    const pluginState = ySyncPluginKey.getState(currentView.state)
    if (!pluginState) return

    const selection = currentView.state.selection
    const from = selection.from
    const to = selection.to

    try {
      pluginState.acceptChanges(from, to)
    } catch (error) {
      console.error('Error accepting changes:', error)
      alert('Error accepting changes: ' + error.message)
    }
  })
}

if (btnRejectChanges) {
  btnRejectChanges.addEventListener('click', () => {
    if (!currentView) return
    const pluginState = ySyncPluginKey.getState(currentView.state)
    if (!pluginState) return

    const selection = currentView.state.selection
    const from = selection.from
    const to = selection.to

    try {
      pluginState.rejectChanges(from, to)
    } catch (error) {
      console.error('Error rejecting changes:', error)
      alert('Error rejecting changes: ' + error.message)
    }
  })
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
const am = Y.createAttributionManagerFromDiff(ydoc, suggestionDoc, { attrs: [Y.createAttributionItem('insert', ['nickthesick'])] })

suggestionDoc.on('update', () => {
  console.log('suggestionDoc update')
})
ydoc.on('update', () => {
  console.log('ydoc updated')
})
/**
 * @type {EditorView?}
 */
let currentView = null

const initEditor = () => {
  const ypm = ydoc.getXmlFragment('prosemirror-s')
  currentView?.destroy()
  snapshots.length = 0 // Clear snapshots when reinitializing
  const ypmContainer = document.querySelector('#ypm-container')
  ypmContainer.innerHTML = ''
  const editor = document.createElement('div')
  editor.setAttribute('class', 'yeditor')
  ypmContainer.insertBefore(editor, null)

  const state = EditorState.create({
    schema,
    plugins: [].concat(exampleSetup({ schema, history: false }), syncPlugin(ypm, {
      awareness: providerYdoc.awareness,
      suggestionDoc,
      attributionManager: am,
      mapAttributionToMark: (format, attribution) => {
        console.log('format', format, attribution)
        return object.assign({}, format, {
          ychange: attribution.delete
            ? { type: 'removed', user: attribution.delete?.[0] }
            : { type: 'added', user: attribution.insert?.[0] }
        })
      }
    }))
  })

  // Track last mode to detect changes
  let lastMode = null
  const initialPluginState = ySyncPluginKey.getState(state)
  if (initialPluginState) {
    lastMode = initialPluginState.mode
  }

  currentView = new EditorView(editor, {
    state,
    dispatchTransaction: (tr) => {
      if (!currentView) return
      const newState = currentView.state.apply(tr)
      currentView.updateState(newState)

      // Check if mode changed and update UI
      const pluginState = ySyncPluginKey.getState(newState)
      if (pluginState) {
        const currentMode = pluginState.mode
        if (currentMode !== lastMode) {
          lastMode = currentMode
          updateSnapshotUI()
          updateSuggestionButtons()
        }
      }
    }
  })

  // Update snapshot UI
  updateSnapshotUI()

  // Update suggestion buttons visibility
  updateSuggestionButtons()

  // @ts-ignore
  window.example = { suggestionDoc, ydoc, type: ypm, currentView, snapshots }
}

initEditor()
