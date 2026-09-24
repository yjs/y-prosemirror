import * as Y from '@y/y'
import * as YPM from '@y/prosemirror'
import * as d from 'lib0/delta'
import * as t from 'lib0/testing'
import { EditorState } from 'prosemirror-state'
import { schema } from 'prosemirror-schema-basic'
import { EditorView } from 'prosemirror-view'

/**
 * @param {EditorState} state
 */
const createView = state => new EditorView({ mount: document.createElement('div') }, { state })

export const testSyncSurvivesViewRemountWithRetainedState = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  ytype.applyDelta(d.create().insert([d.create('paragraph', {}, 'before')]).done())

  const first = createView(EditorState.create({ schema, plugins: [YPM.syncPlugin()] }))
  YPM.configureYProsemirror({ ytype })(first.state, first.dispatch)
  const retainedState = first.state
  first.destroy()

  const second = createView(retainedState)
  try {
    second.dispatch(second.state.tr.insertText('!'))
    t.compare(second.state.doc.textContent, 'before!')
    t.compare(ytype.toDeltaDeep(), YPM.docToDelta(second.state.doc).done(false))

    // No configuration change follows remount. The new view must still
    // receive subsequent Y updates.
    ytype.applyDelta(d.create().delete(1).insert([d.create('paragraph', {}, 'remote')]).done())
    t.compare(second.state.doc.textContent, 'remote')
  } finally {
    second.destroy()
    ydoc.destroy()
  }
}

export const testRemountHydratesMissedYChanges = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  ytype.applyDelta(d.create().insert([d.create('paragraph', {}, 'before')]).done())
  const first = createView(EditorState.create({ schema, plugins: [YPM.syncPlugin()] }))
  YPM.configureYProsemirror({ ytype })(first.state, first.dispatch)
  const retainedState = first.state
  first.destroy()

  ytype.applyDelta(d.create().delete(1).insert([d.create('paragraph', {}, 'after')]).done())
  const second = createView(retainedState)
  try {
    t.compare(second.state.doc.textContent, 'after')
    t.compare(ytype.toDeltaDeep(), YPM.docToDelta(second.state.doc).done(false))
  } finally {
    second.destroy()
    ydoc.destroy()
  }
}

export const testPausedSyncStaysPausedAcrossViewRemount = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  ytype.applyDelta(d.create().insert([d.create('paragraph', {}, 'shared')]).done())
  const first = createView(EditorState.create({ schema, plugins: [YPM.syncPlugin()] }))
  YPM.configureYProsemirror({ ytype })(first.state, first.dispatch)
  YPM.pauseSync(first.state, first.dispatch)
  const retainedState = first.state
  first.destroy()

  ytype.applyDelta(d.create().delete(1).insert([d.create('paragraph', {}, 'remote')]).done())
  const second = createView(retainedState)
  try {
    t.compare(second.state.doc.textContent, 'shared')
    second.dispatch(second.state.tr.insertText('local'))
    t.compare(ytype.toDeltaDeep().toJSON(), d.create().insert([d.create('paragraph', {}, 'remote')]).done().toJSON())

    YPM.configureYProsemirror({ ytype })(second.state, second.dispatch)
    t.compare(second.state.doc.textContent, 'remote')
    second.dispatch(second.state.tr.insertText('!'))
    t.compare(ytype.toDeltaDeep(), YPM.docToDelta(second.state.doc).done(false))
  } finally {
    second.destroy()
    ydoc.destroy()
  }
}
