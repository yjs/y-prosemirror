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

/**
 * Type text, move cursor elsewhere (simulating a click), then undo →
 * cursor should jump to where the text was typed, not stay at click position.
 */
export const testCursorAfterTypeThenMoveThenUndo = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const view = createProsemirrorView(ytype)

  // Set up a document with two paragraphs to have a place to click away to
  insertParagraph(view, 'existing content')
  const um = /** @type {import('@y/y').UndoManager} */ (YPM.yUndoPluginKey.getState(view.state)?.undoManager)
  um.stopCapturing()

  // Move cursor to start of "existing content", then type "NEW" (like real typing at cursor)
  view.dispatch(view.state.tr.setSelection(
    TextSelection.near(view.state.doc.resolve(1))
  ))
  view.dispatch(view.state.tr.insertText('NEW'))
  t.assert(view.state.doc.textContent.includes('NEW'), 'NEW was typed')
  const cursorAfterTyping = view.state.selection.anchor
  t.assert(cursorAfterTyping === 4, 'cursor is right after NEW')
  um.stopCapturing()

  // Simulate clicking away — move cursor to the empty paragraph at the end
  const emptyParaPos = view.state.doc.content.size - 2
  view.dispatch(view.state.tr.setSelection(
    TextSelection.near(view.state.doc.resolve(emptyParaPos))
  ))
  const cursorAfterClick = view.state.selection.anchor
  t.assert(cursorAfterClick !== cursorAfterTyping, 'cursor moved away from typing position')

  // Undo the "NEW" insertion
  YPM.undo(view.state)
  t.assert(!view.state.doc.textContent.includes('NEW'), 'NEW was undone')
  // Cursor should NOT stay at the click position — it should jump to where "NEW" was removed
  t.assert(view.state.selection.anchor !== cursorAfterClick, 'cursor moved from click position to undone change location')
}

/**
 * Type multiple characters that merge into one undo group, move cursor, undo →
 * cursor should go to where the FIRST character was typed, not the last.
 * Reproduces the merge bug where UndoManager creates fresh StackItems on merge.
 */
export const testCursorAfterMergedTypesThenMoveThenUndo = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const view = createProsemirrorView(ytype)

  // Set up initial content
  insertParagraph(view, 'existing content')
  const um = /** @type {import('@y/y').UndoManager} */ (YPM.yUndoPluginKey.getState(view.state)?.undoManager)
  um.stopCapturing()

  // Move cursor to start, then type 3 characters one by one (will merge in UndoManager)
  view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(1))))
  const cursorBeforeTyping = view.state.selection.anchor
  view.dispatch(view.state.tr.insertText('a'))
  view.dispatch(view.state.tr.insertText('b'))
  view.dispatch(view.state.tr.insertText('c'))
  t.assert(view.state.doc.textContent.startsWith('abc'), 'abc was typed')
  um.stopCapturing()

  // Click away to the empty paragraph
  const emptyParaPos = view.state.doc.content.size - 2
  view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(emptyParaPos))))
  const cursorAfterClick = view.state.selection.anchor

  // Undo — should undo all of "abc" and cursor should go to position before typing
  YPM.undo(view.state)
  t.assert(!view.state.doc.textContent.includes('abc'), 'abc was undone')
  t.assert(view.state.selection.anchor !== cursorAfterClick, 'cursor moved from click position')
  t.assert(view.state.selection.anchor === cursorBeforeTyping, 'cursor restored to position before first character was typed')
}

/**
 * Multiple undo groups with cursor moves in between — each undo should restore
 * to the correct position for that group.
 */
export const testCursorRestorationAcrossMultipleUndoGroups = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const view = createProsemirrorView(ytype)

  // Set up a paragraph with some text
  insertParagraph(view, 'hello world')
  const um = /** @type {import('@y/y').UndoManager} */ (YPM.yUndoPluginKey.getState(view.state)?.undoManager)
  um.stopCapturing()

  // Group 1: type at position 1
  view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(1))))
  const pos1 = view.state.selection.anchor
  view.dispatch(view.state.tr.insertText('AAA'))
  um.stopCapturing()

  // Group 2: type at position 8 (after "AAA" shifted things)
  view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(8))))
  const pos2 = view.state.selection.anchor
  view.dispatch(view.state.tr.insertText('BBB'))
  um.stopCapturing()

  // Move cursor somewhere else entirely
  const endPos = view.state.doc.content.size - 2
  view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(endPos))))

  // Undo group 2 — cursor should go to pos2
  YPM.undo(view.state)
  t.assert(!view.state.doc.textContent.includes('BBB'), 'BBB was undone')
  t.assert(view.state.selection.anchor === pos2, 'cursor restored to group 2 typing position')

  // Undo group 1 — cursor should go to pos1
  YPM.undo(view.state)
  t.assert(!view.state.doc.textContent.includes('AAA'), 'AAA was undone')
  t.assert(view.state.selection.anchor === pos1, 'cursor restored to group 1 typing position')
}

/**
 * Same as testCursorAfterTypeThenMoveThenUndo but with two synced editors —
 * remote changes should not interfere with cursor restoration after undo.
 */
export const testCursorAfterTypeThenMoveThenUndoWithSync = () => {
  const ydoc1 = new Y.Doc()
  const ydoc2 = new Y.Doc()
  const ytype1 = ydoc1.get('prosemirror')
  const ytype2 = ydoc2.get('prosemirror')
  const view1 = createProsemirrorView(ytype1)
  const view2 = createProsemirrorView(ytype2)

  // Sync docs bidirectionally
  const sync = () => {
    const sv1 = Y.encodeStateVector(ydoc1)
    const sv2 = Y.encodeStateVector(ydoc2)
    const update1 = Y.encodeStateAsUpdate(ydoc1, sv2)
    const update2 = Y.encodeStateAsUpdate(ydoc2, sv1)
    Y.applyUpdate(ydoc1, update2)
    Y.applyUpdate(ydoc2, update1)
  }

  // Editor 1: set up initial content
  insertParagraph(view1, 'existing content')
  sync()
  const um = /** @type {import('@y/y').UndoManager} */ (YPM.yUndoPluginKey.getState(view1.state)?.undoManager)
  um.stopCapturing()

  // Editor 1: move cursor to start, then type "NEW" (like real typing)
  view1.dispatch(view1.state.tr.setSelection(
    TextSelection.near(view1.state.doc.resolve(1))
  ))
  view1.dispatch(view1.state.tr.insertText('NEW'))
  t.assert(view1.state.doc.textContent.includes('NEW'), 'NEW was typed in editor 1')
  um.stopCapturing()
  sync()

  // Editor 1: move cursor to the empty paragraph at the end
  const emptyParaPos = view1.state.doc.content.size - 2
  view1.dispatch(view1.state.tr.setSelection(
    TextSelection.near(view1.state.doc.resolve(emptyParaPos))
  ))
  const cursorAfterClick = view1.state.selection.anchor

  // Editor 1: undo
  YPM.undo(view1.state)
  t.assert(!view1.state.doc.textContent.includes('NEW'), 'NEW was undone')
  t.assert(view1.state.selection.anchor !== cursorAfterClick, 'cursor moved from click position to undone change location (with sync)')

  view2.destroy()
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

/**
 * Reproduces https://github.com/yjs/y-prosemirror/issues/38
 * Type in a paragraph, press Enter (new paragraph, cursor on line 2), undo →
 * cursor should return to line 1, not stay on line 2.
 */
export const testCursorPositionAfterUndoNewline = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const view = createProsemirrorView(ytype)

  // Type "hello" into the empty paragraph
  view.dispatch(view.state.tr.insertText('hello', 1))
  t.assert(view.state.doc.textContent === 'hello', 'typed hello')

  const um = /** @type {import('@y/y').UndoManager} */ (YPM.yUndoPluginKey.getState(view.state)?.undoManager)
  um.stopCapturing()

  // Press Enter — split the paragraph, cursor moves to the new (second) paragraph
  const pos = view.state.selection.from
  view.dispatch(view.state.tr.split(pos))
  const cursorAfterEnter = view.state.selection.anchor
  t.assert(cursorAfterEnter > pos, 'cursor moved to second paragraph after Enter')

  // Undo the Enter — cursor should return to end of "hello" (line 1)
  YPM.undo(view.state)
  t.assert(view.state.selection.anchor <= pos, 'cursor returned to first paragraph after undo (issue #38)')
}

/**
 * Type at position A, move cursor to position B, undo →
 * cursor should jump to position A (where the undone change was), not stay at B.
 */
export const testCursorJumpsToUndoneChangeLocation = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const view = createProsemirrorView(ytype)

  // Insert two paragraphs so we have room to move the cursor
  insertParagraph(view, 'first')
  const um = /** @type {import('@y/y').UndoManager} */ (YPM.yUndoPluginKey.getState(view.state)?.undoManager)
  um.stopCapturing()

  insertParagraph(view, 'second')
  um.stopCapturing()

  // Move cursor to the end of "first" paragraph (far from where "second" was inserted)
  const firstParaEnd = view.state.doc.resolve(6) // inside "first"
  view.dispatch(view.state.tr.setSelection(TextSelection.near(firstParaEnd)))
  const cursorBeforeUndo = view.state.selection.anchor
  t.assert(cursorBeforeUndo > 1, 'cursor is inside first paragraph')

  // Undo the "second" insertion — cursor should jump to where "second" was, not stay in "first"
  YPM.undo(view.state)
  t.assert(!view.state.doc.textContent.includes('second'), 'second was undone')
  // After undoing "second", cursor should NOT remain at its pre-undo position inside "first"
  // It should move to where the undone content was (position 0 area, since "second" was inserted at pos 0)
  t.assert(view.state.selection.anchor !== cursorBeforeUndo, 'cursor moved away from pre-undo position to the undone change location')
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
