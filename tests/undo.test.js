import * as t from 'lib0/testing'
import * as YPM from '@y/prosemirror'
import * as basicSchema from 'prosemirror-schema-basic'
import * as Y from '@y/y'
import { EditorState, TextSelection } from 'prosemirror-state'
import { Schema } from 'prosemirror-model'
import { EditorView } from 'prosemirror-view'

const schema = new Schema({
  nodes: basicSchema.nodes,
  marks: basicSchema.marks
})

/**
 * @param {Y.Type} ytype
 */
const createProsemirrorView = (ytype) => {
  const view = new EditorView({ mount: document.createElement('div') }, {
    state: EditorState.create({
      schema,
      plugins: [YPM.syncPlugin(), YPM.yUndoPlugin()]
    })
  })
  YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
  return view
}

/**
 * @param {EditorView} view
 * @param {string} text
 * @param {number} [pos]
 * @param {{ addToHistory?: boolean }} [opts]
 */
const insertParagraph = (view, text, pos = 0, opts = {}) => {
  const tr = view.state.tr.insert(pos, schema.node('paragraph', undefined, schema.text(text)))
  if (opts.addToHistory === false) {
    tr.setMeta('addToHistory', false)
  }
  view.dispatch(tr)
}

// --- Tests ---

export const testBasicUndoRedo = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const view = createProsemirrorView(ytype)

  insertParagraph(view, '123')
  t.assert(ytype.length === 2, 'contains inserted paragraph + empty paragraph')

  YPM.undo(view.state)
  t.assert(view.state.doc.textContent === '', 'insertion was undone')

  YPM.redo(view.state)
  t.assert(ytype.length === 2, 'insertion was redone')

  YPM.undo(view.state)
  t.assert(view.state.doc.textContent === '', 'insertion was undone again')
}

export const testAddToHistory = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const view = createProsemirrorView(ytype)

  insertParagraph(view, '123')
  t.assert(ytype.length === 2, 'contains inserted content')

  YPM.undo(view.state)
  t.assert(view.state.doc.textContent === '', 'insertion was undone')

  YPM.redo(view.state)
  t.assert(ytype.length === 2, 'insertion was redone')

  YPM.undo(view.state)
  t.assert(view.state.doc.textContent === '', 'insertion was undone')

  // Insert with addToHistory: false
  insertParagraph(view, '123', 0, { addToHistory: false })
  t.assert(view.state.doc.textContent.includes('123'), 'contains non-history content')

  YPM.undo(view.state)
  t.assert(view.state.doc.textContent.includes('123'), 'non-history insertion was NOT undone')
}

export const testCursorPositionAfterUndo = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const view = createProsemirrorView(ytype)

  insertParagraph(view, '123')
  t.assert(ytype.length === 2, 'contains inserted content')

  // Set cursor to end of "123" (position 4)
  view.dispatch(view.state.tr.setSelection(
    TextSelection.between(view.state.doc.resolve(4), view.state.doc.resolve(4))
  ))
  t.assert(view.state.selection.anchor === 4, 'cursor is at position 4')

  const um = /** @type {import('@y/y').UndoManager} */ (YPM.yUndoPluginKey.getState(view.state)?.undoManager)
  um.stopCapturing()

  // Delete last char "3"
  view.dispatch(view.state.tr.delete(3, 4))
  t.assert(view.state.selection.anchor === 3, 'cursor moved to 3 after delete')

  YPM.undo(view.state)

  t.assert(view.state.doc.textContent.includes('123'), 'content was restored to 123')
  t.assert(view.state.selection.anchor === 4, 'cursor restored to position 4 after undo')
}

export const testMultipleUndoRedo = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const view = createProsemirrorView(ytype)
  const um = /** @type {import('@y/y').UndoManager} */ (YPM.yUndoPluginKey.getState(view.state)?.undoManager)

  insertParagraph(view, 'first')
  um.stopCapturing()
  insertParagraph(view, 'second')
  um.stopCapturing()
  insertParagraph(view, 'third')

  t.assert(ytype.length === 4, '3 inserted paragraphs + empty paragraph')

  YPM.undo(view.state)
  t.assert(ytype.length === 3, 'third was undone')

  YPM.undo(view.state)
  t.assert(ytype.length === 2, 'second was undone')

  YPM.redo(view.state)
  t.assert(ytype.length === 3, 'second was redone')

  YPM.redo(view.state)
  t.assert(ytype.length === 4, 'third was redone')
}

export const testUndoDeleteRestoresContent = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const view = createProsemirrorView(ytype)

  insertParagraph(view, 'hello world')
  const um = /** @type {import('@y/y').UndoManager} */ (YPM.yUndoPluginKey.getState(view.state)?.undoManager)
  um.stopCapturing()

  // Delete "world" (positions 7-12 inside the paragraph)
  view.dispatch(view.state.tr.delete(7, 12))
  t.assert(view.state.doc.textContent === 'hello ', 'world was deleted')

  YPM.undo(view.state)
  t.assert(view.state.doc.textContent === 'hello world', 'content was restored after undo')

  YPM.redo(view.state)
  t.assert(view.state.doc.textContent === 'hello ', 'content was re-deleted after redo')
}

export const testAddToHistoryIgnore = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const view = createProsemirrorView(ytype)

  // Two tracked changes — should merge into single undo item
  insertParagraph(view, '123')
  insertParagraph(view, '456')
  t.assert(ytype.length === 3, 'contains two inserted paragraphs + empty')

  // One non-tracked change
  insertParagraph(view, 'abc', 0, { addToHistory: false })
  t.assert(ytype.length === 4, 'contains three paragraphs + empty')

  // One more tracked change
  insertParagraph(view, 'xyz')
  t.assert(ytype.length === 5, 'contains four paragraphs + empty')

  YPM.undo(view.state)
  t.assert(!view.state.doc.textContent.includes('xyz'), 'xyz was undone')

  YPM.undo(view.state)
  // After undoing the first batch (123 + 456), only the non-tracked 'abc' should remain
  t.assert(view.state.doc.textContent === 'abc', 'first batch (123+456) was undone, only abc remains')
}

export const testUndoCommand = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const view = createProsemirrorView(ytype)

  // undoCommand with dispatch=undefined should return canUndo
  t.assert(YPM.undoCommand(view.state, undefined) === false, 'cannot undo with empty history')
  t.assert(YPM.redoCommand(view.state, undefined) === false, 'cannot redo with empty history')

  insertParagraph(view, 'test')
  t.assert(YPM.undoCommand(view.state, undefined) === true, 'can undo after insert')
  t.assert(YPM.redoCommand(view.state, undefined) === false, 'cannot redo without undo')

  YPM.undo(view.state)
  t.assert(YPM.undoCommand(view.state, undefined) === false, 'cannot undo after undoing all')
  t.assert(YPM.redoCommand(view.state, undefined) === true, 'can redo after undo')
}
