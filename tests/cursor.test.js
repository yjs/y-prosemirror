// @ts-nocheck
import * as YPM from '@y/prosemirror'
import * as Y from '@y/y'
import * as t from 'lib0/testing'
import * as promise from 'lib0/promise'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { Schema } from 'prosemirror-model'
import * as basicSchema from 'prosemirror-schema-basic'
import { Awareness } from '@y/protocols/awareness'

const schema = new Schema({
  nodes: { ...basicSchema.nodes, doc: { ...basicSchema.nodes.doc, content: 'block*' } },
  marks: basicSchema.marks
})

// === Helpers ===

/**
 * @param {Y.Doc} ydoc
 * @param {Awareness} awareness
 * @param {object} [opts]
 * @param {number | null} [opts.cursorTimeout]
 */
const createView = (ydoc, awareness, opts = {}) => {
  const ytype = ydoc.get('prosemirror')
  const view = new EditorView(
    { mount: document.createElement('div') },
    {
      state: EditorState.create({
        schema,
        plugins: [
          YPM.syncPlugin(),
          YPM.yCursorPlugin(awareness, { cursorTimeout: opts.cursorTimeout ?? 10000 })
        ]
      })
    }
  )
  YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
  return view
}

/**
 * Insert a paragraph with text into the view.
 * @param {EditorView} view
 * @param {string} text
 */
const insertParagraph = (view, text) => {
  view.dispatch(
    view.state.tr.insert(0, schema.node('paragraph', undefined, schema.text(text)))
  )
}

/**
 * Simulate focus: override hasFocus to return true and trigger the focusin listener.
 * @param {EditorView} view
 */
const simulateFocus = (view) => {
  Object.defineProperty(view, 'hasFocus', { value: () => true, writable: true, configurable: true })
  // Create a proper DOM Event for jsdom compatibility
  const evt = view.dom.ownerDocument.createEvent('Event')
  evt.initEvent('focusin', true, true)
  view.dom.dispatchEvent(evt)
}

/**
 * Simulate blur: make hasFocus return false
 * @param {EditorView} view
 */
const simulateBlur = (view) => {
  Object.defineProperty(view, 'hasFocus', { value: () => false, writable: true, configurable: true })
}

// === Tests ===

/**
 * When editor is focused and selection changes, cursor should be published to awareness.
 * @param {t.TestCase} _tc
 */
export const testCursorPublishedOnFocus = (_tc) => {
  const ydoc = new Y.Doc()
  const awareness = new Awareness(ydoc)
  const view = createView(ydoc, awareness)

  // Insert content
  insertParagraph(view, 'Hello world')

  // Initially no cursor in awareness
  const stateBefore = awareness.getLocalState()
  t.assert(stateBefore?.cursor == null, 'no cursor before focus')

  // Simulate focus
  simulateFocus(view)

  // Trigger an update (which calls updateCursorInfo)
  view.dispatch(view.state.tr)

  const stateAfter = awareness.getLocalState()
  t.assert(stateAfter?.cursor != null, 'cursor is published after focus')
  t.assert(stateAfter.cursor.anchor != null, 'cursor has anchor')
  t.assert(stateAfter.cursor.head != null, 'cursor has head')

  view.destroy()
  awareness.destroy()
}

/**
 * Cursor should NOT be immediately cleared when editor loses focus (no focusout behavior).
 * @param {t.TestCase} _tc
 */
export const testCursorNotClearedImmediatelyOnBlur = (_tc) => {
  const ydoc = new Y.Doc()
  const awareness = new Awareness(ydoc)
  const view = createView(ydoc, awareness)

  insertParagraph(view, 'Hello world')

  // Focus and publish cursor
  simulateFocus(view)
  view.dispatch(view.state.tr)
  t.assert(awareness.getLocalState()?.cursor != null, 'cursor published')

  // Blur the editor
  simulateBlur(view)

  // Dispatch a transaction while blurred (simulates any subsequent transaction)
  view.dispatch(view.state.tr)

  // Cursor should still be present -- not immediately cleared
  t.assert(awareness.getLocalState()?.cursor != null, 'cursor NOT cleared immediately on blur')

  view.destroy()
  awareness.destroy()
}

/**
 * Stale timer should clear the cursor after cursorTimeout ms when blurred.
 * @param {t.TestCase} _tc
 */
export const testStaleTimerClearsCursorAfterTimeout = async (_tc) => {
  const ydoc = new Y.Doc()
  const awareness = new Awareness(ydoc)
  // Use a very short timeout for testing
  const view = createView(ydoc, awareness, { cursorTimeout: 50 })

  insertParagraph(view, 'Hello world')

  // Focus and publish cursor
  simulateFocus(view)
  view.dispatch(view.state.tr)
  t.assert(awareness.getLocalState()?.cursor != null, 'cursor published')

  // Blur the editor
  simulateBlur(view)

  // Wait less than the timeout
  await promise.wait(20)
  t.assert(awareness.getLocalState()?.cursor != null, 'cursor still present before timeout')

  // Wait for the timeout to expire
  await promise.wait(50)
  t.assert(awareness.getLocalState()?.cursor == null, 'cursor cleared after stale timeout')

  view.destroy()
  awareness.destroy()
}

/**
 * When cursorTimeout is null, cursor should never be auto-cleared.
 * @param {t.TestCase} _tc
 */
export const testCursorTimeoutNullDisablesStaleClearing = async (_tc) => {
  const ydoc = new Y.Doc()
  const awareness = new Awareness(ydoc)
  const view = createView(ydoc, awareness, { cursorTimeout: null })

  insertParagraph(view, 'Hello world')

  // Focus and publish cursor
  simulateFocus(view)
  view.dispatch(view.state.tr)
  t.assert(awareness.getLocalState()?.cursor != null, 'cursor published')

  // Blur
  simulateBlur(view)

  // Wait a reasonable amount of time
  await promise.wait(100)
  t.assert(awareness.getLocalState()?.cursor != null, 'cursor still present with cursorTimeout=null')

  view.destroy()
  awareness.destroy()
}

/**
 * When cursorTimeout is 0, cursor should never be auto-cleared.
 * @param {t.TestCase} _tc
 */
export const testCursorTimeoutZeroDisablesStaleClearing = async (_tc) => {
  const ydoc = new Y.Doc()
  const awareness = new Awareness(ydoc)
  const view = createView(ydoc, awareness, { cursorTimeout: 0 })

  insertParagraph(view, 'Hello world')

  // Focus and publish cursor
  simulateFocus(view)
  view.dispatch(view.state.tr)
  t.assert(awareness.getLocalState()?.cursor != null, 'cursor published')

  // Blur
  simulateBlur(view)

  // Wait a reasonable amount of time
  await promise.wait(100)
  t.assert(awareness.getLocalState()?.cursor != null, 'cursor still present with cursorTimeout=0')

  view.destroy()
  awareness.destroy()
}

/**
 * Re-focusing before timeout should reset the stale timer and keep cursor alive.
 * @param {t.TestCase} _tc
 */
export const testRefocusResetsStaleTimer = async (_tc) => {
  const ydoc = new Y.Doc()
  const awareness = new Awareness(ydoc)
  const view = createView(ydoc, awareness, { cursorTimeout: 60 })

  insertParagraph(view, 'Hello world')

  // Focus and publish cursor
  simulateFocus(view)
  view.dispatch(view.state.tr)
  t.assert(awareness.getLocalState()?.cursor != null, 'cursor published')

  // Blur
  simulateBlur(view)

  // Wait less than timeout, then refocus
  await promise.wait(40)
  simulateFocus(view)
  view.dispatch(view.state.tr) // triggers updateCursorInfo which resets stale timer

  // Blur again
  simulateBlur(view)

  // Wait for original timeout window -- cursor should still be alive because timer was reset
  await promise.wait(40)
  t.assert(awareness.getLocalState()?.cursor != null, 'cursor still present because timer was reset')

  // Wait for the full new timeout
  await promise.wait(40)
  t.assert(awareness.getLocalState()?.cursor == null, 'cursor cleared after reset timer expired')

  view.destroy()
  awareness.destroy()
}

/**
 * Destroying the plugin should NOT clear cursor from awareness.
 * @param {t.TestCase} _tc
 */
export const testDestroyDoesNotClearCursor = (_tc) => {
  const ydoc = new Y.Doc()
  const awareness = new Awareness(ydoc)
  const view = createView(ydoc, awareness)

  insertParagraph(view, 'Hello world')

  // Focus and publish cursor
  simulateFocus(view)
  view.dispatch(view.state.tr)
  t.assert(awareness.getLocalState()?.cursor != null, 'cursor published')

  // Destroy the view
  view.destroy()

  // Cursor should still be in awareness
  t.assert(awareness.getLocalState()?.cursor != null, 'cursor NOT cleared on destroy')

  awareness.destroy()
}

/**
 * Destroying the plugin should clear the stale timer (no delayed effects).
 * @param {t.TestCase} _tc
 */
export const testDestroyCleanupStaleTimer = async (_tc) => {
  const ydoc = new Y.Doc()
  const awareness = new Awareness(ydoc)
  const view = createView(ydoc, awareness, { cursorTimeout: 30 })

  insertParagraph(view, 'Hello world')

  // Focus and publish cursor
  simulateFocus(view)
  view.dispatch(view.state.tr)
  t.assert(awareness.getLocalState()?.cursor != null, 'cursor published')

  // Blur
  simulateBlur(view)

  // Destroy immediately -- timer should be cancelled
  view.destroy()

  // Wait for what would have been the timeout
  await promise.wait(50)

  // Cursor should still be present because timer was cleared on destroy
  t.assert(awareness.getLocalState()?.cursor != null, 'stale timer was cancelled on destroy')

  awareness.destroy()
}

/**
 * Remote awareness updates should rebuild decorations.
 * @param {t.TestCase} _tc
 */
export const testRemoteAwarenessUpdatesRebuildDecorations = (_tc) => {
  const ydoc1 = new Y.Doc()
  const ydoc2 = new Y.Doc()
  const awareness1 = new Awareness(ydoc1)
  const awareness2 = new Awareness(ydoc2)

  // Sync the docs
  Y.applyUpdate(ydoc2, Y.encodeStateAsUpdate(ydoc1))
  Y.applyUpdate(ydoc1, Y.encodeStateAsUpdate(ydoc2))
  ydoc1.on('update', (update) => Y.applyUpdate(ydoc2, update))
  ydoc2.on('update', (update) => Y.applyUpdate(ydoc1, update))

  const view1 = createView(ydoc1, awareness1)
  const view2 = createView(ydoc2, awareness2)

  // Insert content in view1
  insertParagraph(view1, 'Hello world')

  // Focus view2 and set cursor
  simulateFocus(view2)
  view2.dispatch(view2.state.tr)

  // Now simulate awareness sync: copy awareness2's state to awareness1
  const state2 = awareness2.getLocalState()
  awareness1.states.set(awareness2.clientID, state2)
  awareness1.meta.set(awareness2.clientID, { clock: 1, lastUpdated: Date.now() })
  // Emit change so the cursor plugin picks it up
  awareness1.emit('change', [{ added: [awareness2.clientID], updated: [], removed: [] }, 'remote'])

  // Check that view1 now has decorations for the remote cursor
  const decorations = YPM.yCursorPluginKey.getState(view1.state)
  t.assert(decorations != null, 'decorations exist')
  // DecorationSet should have at least one decoration (the remote cursor)
  const found = decorations.find(0, view1.state.doc.content.size)
  t.assert(found.length > 0, 'remote cursor decoration exists in view1')

  view1.destroy()
  view2.destroy()
  awareness1.destroy()
  awareness2.destroy()
}

/**
 * y-sync-transaction meta should trigger full decoration rebuild.
 * @param {t.TestCase} _tc
 */
export const testYSyncTransactionTriggersDecorationRebuild = (_tc) => {
  const ydoc = new Y.Doc()
  const awareness = new Awareness(ydoc)
  const view = createView(ydoc, awareness)

  insertParagraph(view, 'Hello world')

  // Set up a remote cursor in awareness
  const remoteClientId = 999
  const ytype = ydoc.get('prosemirror')
  // Create a relative position for position 0
  const relPos = Y.createRelativePositionFromTypeIndex(ytype, 0, 0)
  const relPosJSON = Y.relativePositionToJSON(relPos)
  awareness.states.set(remoteClientId, {
    cursor: { anchor: relPosJSON, head: relPosJSON },
    user: { name: 'Remote', color: '#ff0000' }
  })
  awareness.meta.set(remoteClientId, { clock: 1, lastUpdated: Date.now() })

  // Dispatch a transaction with y-sync-transaction meta (simulating a remote doc change)
  const tr = view.state.tr.setMeta('y-sync-transaction', { change: null })
  view.dispatch(tr)

  // The decorations should have been rebuilt (checking they exist)
  const decorations = YPM.yCursorPluginKey.getState(view.state)
  t.assert(decorations != null, 'decorations exist after y-sync-transaction')

  view.destroy()
  awareness.destroy()
}

/**
 * Cursor selection should update in awareness when selection changes while focused.
 * We patch document.getSelection to provide the methods ProseMirror needs for DOM
 * selection manipulation in jsdom.
 * @param {t.TestCase} _tc
 */
export const testCursorUpdatesOnSelectionChange = (_tc) => {
  // Patch getSelection for this test since ProseMirror needs removeAllRanges/addRange
  const origGetSelection = document.getSelection
  document.getSelection = () => ({
    removeAllRanges () {},
    addRange () {},
    rangeCount: 0,
    anchorNode: null,
    anchorOffset: 0,
    focusNode: null,
    focusOffset: 0
  })

  const ydoc = new Y.Doc()
  const awareness = new Awareness(ydoc)
  const view = createView(ydoc, awareness)

  insertParagraph(view, 'Hello world')
  simulateFocus(view)
  view.dispatch(view.state.tr)

  const cursor1 = awareness.getLocalState()?.cursor
  t.assert(cursor1 != null, 'initial cursor published')

  // Change the selection
  const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, 3, 6))
  view.dispatch(tr)

  const cursor2 = awareness.getLocalState()?.cursor
  t.assert(cursor2 != null, 'cursor still published after selection change')
  // The cursor should be different from before (different positions)
  t.assert(
    JSON.stringify(cursor1) !== JSON.stringify(cursor2),
    'cursor position updated after selection change'
  )

  view.destroy()
  awareness.destroy()
  document.getSelection = origGetSelection
}
