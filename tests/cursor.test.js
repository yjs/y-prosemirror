// @ts-nocheck
import * as YPM from '@y/prosemirror'
import * as Y from '@y/y'
import * as t from 'lib0/testing'
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
 * @param {object} [cursorOpts] forwarded to `yCursorPlugin`
 */
const createView = (ydoc, awareness, cursorOpts) => {
  const view = new EditorView(
    { mount: document.createElement('div') },
    {
      state: EditorState.create({
        schema,
        plugins: [YPM.syncPlugin(), YPM.yCursorPlugin(awareness, cursorOpts)]
      })
    }
  )
  YPM.configureYProsemirror({ ytype: ydoc.get('prosemirror') })(view.state, view.dispatch)
  return view
}

/**
 * Build a fresh ydoc/awareness/view triple with a single "Hello world" paragraph.
 * @param {object} [cursorOpts] forwarded to `yCursorPlugin`
 */
const createSetup = (cursorOpts) => {
  const ydoc = new Y.Doc()
  const awareness = new Awareness(ydoc)
  const view = createView(ydoc, awareness, cursorOpts)
  view.dispatch(view.state.tr.insert(0, schema.node('paragraph', undefined, schema.text('Hello world'))))
  return { ydoc, awareness, view }
}

/**
 * Make `view.hasFocus()` return true and dispatch the focusin event the
 * cursor plugin listens for. We can't use `view.focus()` because jsdom doesn't
 * route focus correctly through PM's content-editable.
 * @param {EditorView} view
 */
const simulateFocus = (view) => {
  Object.defineProperty(view, 'hasFocus', { value: () => true, writable: true, configurable: true })
  const evt = view.dom.ownerDocument.createEvent('Event')
  evt.initEvent('focusin', true, true)
  view.dom.dispatchEvent(evt)
}

// === Tests ===

/**
 * On focus, the local cursor is published to awareness.
 * @param {t.TestCase} _tc
 */
export const testCursorPublishedOnFocus = (_tc) => {
  const { view, awareness } = createSetup()
  simulateFocus(view)
  t.assert(awareness.getLocalState()?.cursor != null, 'cursor is published after focus')
  view.destroy()
  awareness.destroy()
}

/**
 * An awareness 'change' event for a remote cursor causes the cursor plugin
 * to rebuild its decorations and surface the remote cursor in this view.
 * @param {t.TestCase} _tc
 */
export const testRemoteAwarenessUpdatesRebuildDecorations = (_tc) => {
  const { ydoc, view, awareness } = createSetup()
  const remoteId = 999
  const relPosJSON = Y.relativePositionToJSON(
    Y.createRelativePositionFromTypeIndex(ydoc.get('prosemirror'), 0, 0)
  )
  awareness.states.set(remoteId, {
    cursor: { anchor: relPosJSON, head: relPosJSON },
    user: { name: 'Remote', color: '#ff0000' }
  })
  awareness.meta.set(remoteId, { clock: 1, lastUpdated: Date.now() })
  awareness.emit('change', [{ added: [remoteId], updated: [], removed: [] }, 'remote'])

  const decorations = YPM.yCursorPluginKey.getState(view.state)
    .find(0, view.state.doc.content.size)
  t.assert(decorations.length > 0, 'remote cursor decoration exists in view')

  view.destroy()
  awareness.destroy()
}

/**
 * Selection changes while focused republish the cursor with the new positions.
 * @param {t.TestCase} _tc
 */
export const testCursorUpdatesOnSelectionChange = (_tc) => {
  // jsdom's default getSelection() lacks the methods PM's DOM sync calls.
  const origGetSelection = document.getSelection
  document.getSelection = () => ({ removeAllRanges () {}, addRange () {}, rangeCount: 0 })

  const { view, awareness } = createSetup()
  simulateFocus(view)
  view.dispatch(view.state.tr)
  const cursor1 = awareness.getLocalState()?.cursor

  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3, 6)))
  const cursor2 = awareness.getLocalState()?.cursor

  t.assert(
    JSON.stringify(cursor1) !== JSON.stringify(cursor2),
    'cursor position updated after selection change'
  )

  view.destroy()
  awareness.destroy()
  document.getSelection = origGetSelection
}

/**
 * A custom `resolveLocalCursorState` fully replaces the default focus-gating
 * policy. Verified in both directions: it can publish while the view is
 * unfocused (default would not), and clear while the view is focused
 * (default would not).
 * @param {t.TestCase} _tc
 */
export const testResolveLocalCursorStateOverridesFocusLogic = (_tc) => {
  let isActive = true
  const { view, awareness } = createSetup({
    resolveLocalCursorState: (ctx) => isActive ? ctx.nextState : null
  })

  t.assert(view.hasFocus() === false, 'view starts unfocused')
  t.assert(awareness.getLocalState()?.cursor != null, 'cursor published despite view being unfocused')

  isActive = false
  simulateFocus(view)
  view.dispatch(view.state.tr)
  t.assert(awareness.getLocalState()?.cursor == null, 'cursor cleared despite view being focused')

  view.destroy()
  awareness.destroy()
}
