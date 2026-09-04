// @ts-nocheck
import * as YPM from '@y/prosemirror'
import * as Y from '@y/y'
import * as delta from 'lib0/delta'
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

/**
 * Seed the OLD y-prosemirror representation:
 * `doc > paragraph > <anonymous>"hello " + em("world")</>` - it renders
 * flattened through the `inlineAnonymousNodes` pipeline stage, so Y positions
 * and PM positions live in different structures.
 *
 * @param {Y.Node} ytype
 */
const seedOldRepresentation = (ytype) => {
  const textContainer = delta.create().insert('hello ').insert('world', { em: {} })
  const paragraph = delta.create('paragraph', {}).insert([textContainer])
  ytype.applyDelta(delta.create().insert([paragraph]).done())
}

/**
 * The sync plugin exposes its live binding on the plugin state (for
 * transformer-aware position mapping) and clears it while paused.
 *
 * @param {t.TestCase} _tc
 */
export const testBindingExposedInSyncPluginState = (_tc) => {
  const { ydoc, view, awareness } = createSetup()
  const binding1 = YPM.ySyncPluginKey.getState(view.state).binding
  t.assert(binding1 != null && binding1.t != null, 'live binding with transformer exposed after setup')

  YPM.pauseSync(view.state, view.dispatch)
  t.assert(YPM.ySyncPluginKey.getState(view.state).binding === null, 'binding cleared while paused')

  YPM.configureYProsemirror({ ytype: ydoc.get('prosemirror') })(view.state, view.dispatch)
  const binding2 = YPM.ySyncPluginKey.getState(view.state).binding
  t.assert(binding2 != null && binding2 !== binding1, 'fresh binding exposed after reconfiguring')

  view.destroy()
  awareness.destroy()
}

/**
 * A remote cursor anchored INSIDE an old-representation anonymous text
 * container must render at the correct position of the flattened PM doc -
 * this only works because awareness positions are mapped through the binding
 * transformer before they are applied to the prosemirror state.
 *
 * @param {t.TestCase} _tc
 */
export const testRemoteCursorOldRepresentationDoc = (_tc) => {
  const ydoc = new Y.Doc({ gc: false })
  seedOldRepresentation(ydoc.get('prosemirror'))
  const awareness = new Awareness(ydoc)
  const view = createView(ydoc, awareness)
  t.assert(view.state.doc.textContent === 'hello world', 'old representation renders flattened')

  // anchor..head = offsets 0..5 inside the anonymous container ("hello")
  const anon = ydoc.get('prosemirror').get(0).get(0)
  t.assert(anon.name === null, 'anonymous container found')
  const remoteId = 999
  awareness.states.set(remoteId, {
    cursor: {
      anchor: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(anon, 0, 0)),
      head: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(anon, 5, 0))
    },
    user: { name: 'Remote', color: '#ff0000' }
  })
  awareness.meta.set(remoteId, { clock: 1, lastUpdated: Date.now() })
  awareness.emit('change', [{ added: [remoteId], updated: [], removed: [] }, 'remote'])

  const decorations = YPM.yCursorPluginKey.getState(view.state)
    .find(0, view.state.doc.content.size)
  // flattened PM positions: anchor 1, head 6
  t.assert(decorations.some(d => d.from === 6 && d.to === 6), 'cursor widget lands at flattened PM pos 6')
  t.assert(decorations.some(d => d.from === 1 && d.to === 6), 'selection spans the flattened text')

  view.destroy()
  awareness.destroy()
}

/**
 * End-to-end publish/decode round trip between two editors bound to an
 * old-representation doc: the local selection is mapped view→data on publish
 * and data→view on the remote decode.
 *
 * @param {t.TestCase} _tc
 */
export const testLocalCursorPublishRoundTrip = (_tc) => {
  // jsdom's default getSelection() lacks the methods PM's DOM sync calls.
  const origGetSelection = document.getSelection
  document.getSelection = () => ({ removeAllRanges () {}, addRange () {}, rangeCount: 0 })

  const ydoc1 = new Y.Doc({ gc: false })
  const ydoc2 = new Y.Doc({ gc: false })
  ydoc1.on('update', (u) => Y.applyUpdate(ydoc2, u))
  ydoc2.on('update', (u) => Y.applyUpdate(ydoc1, u))
  seedOldRepresentation(ydoc1.get('prosemirror'))
  const awareness1 = new Awareness(ydoc1)
  const awareness2 = new Awareness(ydoc2)
  const view1 = createView(ydoc1, awareness1)
  const view2 = createView(ydoc2, awareness2)

  simulateFocus(view1)
  view1.dispatch(view1.state.tr.setSelection(TextSelection.create(view1.state.doc, 2, 6)))
  const published = awareness1.getLocalState()?.cursor
  t.assert(published != null, 'cursor published')
  // the published positions must anchor inside the anonymous container
  const decodedHead = Y.createAbsolutePositionFromRelativePosition(
    Y.createRelativePositionFromJSON(published.head), ydoc1)
  t.assert(decodedHead != null && decodedHead.type.name === null && decodedHead.index === 5,
    'published head anchors inside the anonymous container')

  const remoteId = awareness1.clientID
  awareness2.states.set(remoteId, awareness1.getLocalState())
  awareness2.meta.set(remoteId, { clock: 1, lastUpdated: Date.now() })
  awareness2.emit('change', [{ added: [remoteId], updated: [], removed: [] }, 'remote'])

  const decorations = YPM.yCursorPluginKey.getState(view2.state)
    .find(0, view2.state.doc.content.size)
  t.assert(decorations.some(d => d.from === 6 && d.to === 6), 'remote cursor widget at PM pos 6')
  t.assert(decorations.some(d => d.from === 2 && d.to === 6), 'remote selection spans 2..6')

  view1.destroy()
  view2.destroy()
  awareness1.destroy()
  awareness2.destroy()
  document.getSelection = origGetSelection
}

/**
 * An unanchorable selection publishes no cursor. With a `block+` doc, the init-gated
 * empty editor holds a schema-minimum paragraph the (empty) ytype does not have - the
 * selection inside it is genuinely unresolvable, so nothing is published (previously a
 * fabricated start-of-type position was). Note: with this file's `block*` schema the
 * empty editor's selection sits at doc level and resolves (position-0 retention) -
 * that case keeps publishing.
 *
 * @param {t.TestCase} _tc
 */
export const testEmptyEditorPublishesNoCursor = (_tc) => {
  const ydoc = new Y.Doc()
  const awareness = new Awareness(ydoc)
  const blockPlusSchema = new Schema({ nodes: basicSchema.nodes, marks: basicSchema.marks })
  const view = new EditorView(
    { mount: document.createElement('div') },
    {
      state: EditorState.create({
        schema: blockPlusSchema,
        plugins: [YPM.syncPlugin(), YPM.yCursorPlugin(awareness)]
      })
    }
  )
  YPM.configureYProsemirror({ ytype: ydoc.get('prosemirror') })(view.state, view.dispatch)
  t.assert(ydoc.get('prosemirror').length === 0, 'ytype gated empty')
  simulateFocus(view)
  t.assert(awareness.getLocalState()?.cursor == null, 'no cursor published for an unanchorable selection')
  view.destroy()
  awareness.destroy()
}
