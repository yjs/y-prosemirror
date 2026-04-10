import * as t from 'lib0/testing'
import * as YPM from '@y/prosemirror'
import * as basicSchema from 'prosemirror-schema-basic'
import * as Y from '@y/y'
import { EditorState, Plugin, TextSelection } from 'prosemirror-state'
import { Schema } from 'prosemirror-model'
import { EditorView } from 'prosemirror-view'

/**
 * @param {import('prosemirror-state').EditorState} state
 * @returns {import('@y/y').UndoManager}
 */
const getUndoManager = (state) => {
  const um = YPM.yUndoPluginKey.getState(state)?.undoManager
  if (um == null) throw new Error('undoManager not found in plugin state')
  return um
}

const schema = new Schema({
  nodes: { ...basicSchema.nodes, doc: { ...basicSchema.nodes.doc, content: 'block*' } },
  marks: basicSchema.marks
})

/**
 * @param {Y.Type} ytype
 */
const createProsemirrorView = (ytype) => {
  const undoManager = new Y.UndoManager(ytype)
  const view = new EditorView({ mount: document.createElement('div') }, {
    state: EditorState.create({
      schema,
      plugins: [YPM.syncPlugin(), YPM.yUndoPlugin(undoManager)]
    })
  })
  YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
  return view
}

/**
 * @param {Y.Type} ytype
 * @param {import('@y/y').UndoManager} undoManager
 */
const createProsemirrorViewWithUm = (ytype, undoManager) => {
  const view = new EditorView({ mount: document.createElement('div') }, {
    state: EditorState.create({
      schema,
      plugins: [YPM.syncPlugin(), YPM.yUndoPlugin(undoManager)]
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
  t.assert(ytype.length === 1, 'contains inserted paragraph')

  YPM.undo(view.state)
  t.assert(view.state.doc.textContent === '', 'insertion was undone')

  YPM.redo(view.state)
  t.assert(ytype.length === 1, 'insertion was redone')

  YPM.undo(view.state)
  t.assert(view.state.doc.textContent === '', 'insertion was undone again')
}

export const testAddToHistory = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const view = createProsemirrorView(ytype)

  insertParagraph(view, '123')
  t.assert(ytype.length === 1, 'contains inserted content')

  YPM.undo(view.state)
  t.assert(view.state.doc.textContent === '', 'insertion was undone')

  YPM.redo(view.state)
  t.assert(ytype.length === 1, 'insertion was redone')

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
  t.assert(ytype.length === 1, 'contains inserted content')

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

  t.assert(ytype.length === 3, '3 inserted paragraphs')

  YPM.undo(view.state)
  t.assert(ytype.length === 2, 'third was undone')

  YPM.undo(view.state)
  t.assert(ytype.length === 1, 'second was undone')

  YPM.redo(view.state)
  t.assert(ytype.length === 2, 'second was redone')

  YPM.redo(view.state)
  t.assert(ytype.length === 3, 'third was redone')
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
  t.assert(ytype.length === 2, 'contains two inserted paragraphs')

  // One non-tracked change
  insertParagraph(view, 'abc', 0, { addToHistory: false })
  t.assert(ytype.length === 3, 'contains three paragraphs')

  // One more tracked change
  insertParagraph(view, 'xyz')
  t.assert(ytype.length === 4, 'contains four paragraphs')

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

  // Insert a paragraph with "hello"
  insertParagraph(view, 'hello')
  t.assert(view.state.doc.textContent === 'hello', 'typed hello')

  const um = /** @type {import('@y/y').UndoManager} */ (YPM.yUndoPluginKey.getState(view.state)?.undoManager)
  um.stopCapturing()

  // Move cursor to end of "hello" and press Enter (split the paragraph)
  const pos = 6 // end of "hello" inside the paragraph
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)))
  view.dispatch(view.state.tr.split(view.state.selection.from))
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

/**
 * Destroy the view and recreate it with the same state — simulates React
 * StrictMode or plugin reconfiguration. The UndoManager should survive
 * and undo history should be preserved.
 */
/**
 * Since the caller owns the UndoManager, passing the same one to a new view
 * after destroy preserves undo history (simulates React StrictMode remount).
 */
export const testUndoSurvivesViewRecreation = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const undoManager = new Y.UndoManager(ytype)
  const view = createProsemirrorViewWithUm(ytype, undoManager)

  insertParagraph(view, 'hello')
  t.assert(view.state.doc.textContent === 'hello', 'contains hello')
  t.assert(undoManager.undoStack.length > 0, 'has undo history')

  view.destroy()
  t.assert(undoManager.undoStack.length > 0, 'undo history preserved after view destroy')

  // Recreate with the same UndoManager
  const view2 = createProsemirrorViewWithUm(ytype, undoManager)
  t.assert(getUndoManager(view2.state) === undoManager, 'same UndoManager reused')
  t.assert(YPM.undo(view2.state), 'undo succeeded on recreated view')
  t.assert(view2.state.doc.textContent === '', 'insertion was undone after view recreation')

  view2.destroy()
}

/**
 * UndoManager survives view destroy — caller controls its lifecycle.
 */
export const testUndoManagerSurvivesViewDestroy = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const undoManager = new Y.UndoManager(ytype)
  const view = createProsemirrorViewWithUm(ytype, undoManager)

  insertParagraph(view, 'hello')
  const stackSize = undoManager.undoStack.length
  t.assert(stackSize > 0, 'has undo history')

  view.destroy()
  t.assert(undoManager.undoStack.length === stackSize, 'undo history preserved after view destroy')

  // New view with the same UndoManager gets the history
  const view2 = createProsemirrorViewWithUm(ytype, undoManager)
  t.assert(getUndoManager(view2.state) === undoManager, 'new view reuses same UndoManager')
  t.assert(YPM.undo(view2.state), 'new view can undo old edits')

  view2.destroy()
}

/**
 * Multiple rapid destroy/recreate cycles — UndoManager stays functional
 * since the caller passes the same instance each time.
 */
export const testMultipleDestroyRecreateCycles = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const undoManager = new Y.UndoManager(ytype)
  const view1 = createProsemirrorViewWithUm(ytype, undoManager)

  insertParagraph(view1, 'persistent content')
  t.assert(undoManager.undoStack.length > 0, 'has undo history after insert')

  view1.destroy()

  // Simulate 5 rapid destroy/recreate cycles
  for (let i = 0; i < 5; i++) {
    const currentView = createProsemirrorViewWithUm(ytype, undoManager)
    t.assert(getUndoManager(currentView.state) === undoManager, `cycle ${i}: same UndoManager`)
    t.assert(undoManager.undoStack.length > 0, `cycle ${i}: undo history preserved`)
    currentView.destroy()
  }

  // Final recreation — undo should still work
  const finalView = createProsemirrorViewWithUm(ytype, undoManager)
  t.assert(YPM.undo(finalView.state), 'undo still works after 5 destroy/recreate cycles')
  t.assert(finalView.state.doc.textContent === '', 'content was undone after cycles')

  finalView.destroy()
}

/**
 * Two editors sharing the same UndoManager — destroying one doesn't affect the other.
 */
export const testMultipleEditorsOnSameYType = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const undoManager = new Y.UndoManager(ytype)
  const view1 = createProsemirrorViewWithUm(ytype, undoManager)
  const view2 = createProsemirrorViewWithUm(ytype, undoManager)

  t.assert(getUndoManager(view1.state) === getUndoManager(view2.state), 'editors share one UndoManager')

  insertParagraph(view1, 'from editor 1')
  t.assert(undoManager.undoStack.length > 0, 'shared UndoManager has undo history')

  view1.destroy()
  t.assert(!view2.isDestroyed, 'editor 2 is still alive')

  insertParagraph(view2, 'from editor 2')
  t.assert(YPM.undo(view2.state), 'editor 2 can still undo after editor 1 destroyed')

  view2.destroy()
}

/**
 * Destroy editor then recreate on same ytype with the same UndoManager.
 */
export const testDestroyThenRecreateReusesUndoManager = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const undoManager = new Y.UndoManager(ytype)
  const view1 = createProsemirrorViewWithUm(ytype, undoManager)

  insertParagraph(view1, 'original')
  t.assert(undoManager.undoStack.length > 0, 'editor 1 has undo history')

  view1.destroy()

  const view2 = createProsemirrorViewWithUm(ytype, undoManager)
  t.assert(getUndoManager(view2.state) === undoManager, 'new editor reuses same UndoManager')
  t.assert(undoManager.undoStack.length > 0, 'undo history preserved')
  t.assert(YPM.undo(view2.state), 'new editor can undo previous edit')

  view2.destroy()
}

/**
 * Destroy and immediately recreate WITHOUT any Y.Doc transaction in between —
 * the cleanup handler should be cancelled and the UndoManager reused.
 * This is the critical React StrictMode path.
 */
export const testDestroyAndImmediateRecreateNoTransaction = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const undoManager = new Y.UndoManager(ytype)
  const view1 = createProsemirrorViewWithUm(ytype, undoManager)

  insertParagraph(view1, 'hello')
  undoManager.stopCapturing()
  insertParagraph(view1, 'world')
  t.assert(undoManager.undoStack.length === 2, 'two undo groups')

  view1.destroy()

  // NO Y.Doc transaction happens here — immediate recreate with same UndoManager
  const view2 = createProsemirrorViewWithUm(ytype, undoManager)
  t.assert(getUndoManager(view2.state) === undoManager, 'same UndoManager')
  t.assert(undoManager.undoStack.length === 2, 'both undo groups preserved')

  t.assert(YPM.undo(view2.state), 'first undo succeeded')
  t.assert(view2.state.doc.textContent.includes('hello'), 'first undo removed world but kept hello')
  t.assert(!view2.state.doc.textContent.includes('world'), 'world was removed')
  t.assert(YPM.undo(view2.state), 'second undo succeeded')
  t.assert(view2.state.doc.textContent === '', 'both groups undone')

  view2.destroy()
}

/**
 * User-provided UndoManager should never be destroyed by the plugin.
 * This tests dmonad's suggestion that externally-provided UndoManagers
 * should have their lifecycle controlled by the user.
 */
/**
 * The plugin never destroys the UndoManager — the caller owns it.
 */
export const testUndoManagerNotDestroyedOnViewDestroy = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const userUm = new Y.UndoManager(ytype)

  const view = createProsemirrorViewWithUm(ytype, userUm)

  t.assert(getUndoManager(view.state) === userUm, 'plugin uses the provided UndoManager')

  insertParagraph(view, 'test')
  t.assert(userUm.undoStack.length > 0, 'UndoManager captured edits')

  view.destroy()
  t.assert(userUm.undoStack.length > 0, 'UndoManager still has history after view destroy')
}

/**
 * Rapidly create and destroy multiple editors on the same ytype —
 * they should all share one UndoManager (no handler accumulation).
 * The UndoManager preserves history across all cycles.
 */
/**
 * Rapidly create and destroy editors with the same UndoManager —
 * no handler leaks since unbind runs on destroy.
 */
export const testNoHandlerLeakOnRepeatedCreateDestroy = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const undoManager = new Y.UndoManager(ytype)

  // Create and destroy 10 editors with the same UndoManager
  for (let i = 0; i < 10; i++) {
    const view = createProsemirrorViewWithUm(ytype, undoManager)
    t.assert(getUndoManager(view.state) === undoManager, `cycle ${i}: same UndoManager`)
    insertParagraph(view, `edit ${i}`)
    view.destroy()
  }

  // Create a final editor — undo should still work
  const finalView = createProsemirrorViewWithUm(ytype, undoManager)
  t.assert(undoManager.undoStack.length > 0, 'UndoManager has accumulated history')
  t.assert(YPM.undo(finalView.state), 'final editor can undo')

  finalView.destroy()
}

/**
 * Destroy editor during an active undo group (before stopCapturing) —
 * the UndoManager should preserve the partial group.
 */
export const testDestroyDuringActiveUndoGroup = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const undoManager = new Y.UndoManager(ytype)
  const view1 = createProsemirrorViewWithUm(ytype, undoManager)

  insertParagraph(view1, 'partial')
  t.assert(undoManager.undoStack.length > 0, 'has active undo group')

  view1.destroy()

  // Recreate with same UndoManager — active group should still be there
  const view2 = createProsemirrorViewWithUm(ytype, undoManager)
  t.assert(getUndoManager(view2.state) === undoManager, 'same UndoManager')
  t.assert(undoManager.undoStack.length > 0, 'active undo group preserved')
  t.assert(YPM.undo(view2.state), 'can undo the partial group')
  t.assert(view2.state.doc.textContent === '', 'partial group was undone')

  view2.destroy()
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

// --- appendTransaction + addToHistory tests (issue #141) ---

/**
 * Create a view with an extra plugin whose appendTransaction returns an empty
 * transaction (no addToHistory meta). This is the scenario from yjs/y-prosemirror#141.
 */
/**
 * @param {Y.Type} ytype
 */
const createViewWithAppendTransactionPlugin = (ytype) => {
  const undoManager = new Y.UndoManager(ytype)
  const noopAppendPlugin = new Plugin({
    appendTransaction: (_trs, _oldState, newState) => {
      return newState.tr
    }
  })
  const view = new EditorView({ mount: document.createElement('div') }, {
    state: EditorState.create({
      schema,
      plugins: [YPM.syncPlugin(), YPM.yUndoPlugin(undoManager), noopAppendPlugin]
    })
  })
  YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
  return view
}

/**
 * yjs/y-prosemirror#141 — When a plugin's appendTransaction returns an empty
 * transaction (without addToHistory meta), a root transaction dispatched with
 * addToHistory: false should still be excluded from the undo stack.
 */
export const testAddToHistoryFalseWithAppendTransactionPlugin = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const view = createViewWithAppendTransactionPlugin(ytype)

  // Dispatch with addToHistory: false — the noop appendTransaction plugin will
  // append an empty transaction WITHOUT the meta, potentially overriding it.
  insertParagraph(view, '123', 0, { addToHistory: false })
  t.assert(view.state.doc.textContent.includes('123'), 'contains inserted content')

  // Undo should be a no-op — the insertion should NOT be on the undo stack
  YPM.undo(view.state)
  t.assert(view.state.doc.textContent.includes('123'), 'addToHistory:false insertion was NOT undone despite appendTransaction plugin')
}

/**
 * Sanity check: with the same appendTransaction plugin, a normal transaction
 * (addToHistory: true, the default) should still be undoable.
 */
export const testAddToHistoryTrueWithAppendTransactionPlugin = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const view = createViewWithAppendTransactionPlugin(ytype)

  insertParagraph(view, 'abc')
  t.assert(view.state.doc.textContent.includes('abc'), 'contains inserted content')

  YPM.undo(view.state)
  t.assert(!view.state.doc.textContent.includes('abc'), 'normal insertion was undone even with appendTransaction plugin')
}

/**
 * Mixed scenario: a tracked insertion followed by an untracked one, with the
 * appendTransaction plugin active. Only the tracked insertion should be undoable.
 */
/**
 * A plugin that appends real content (e.g. a timestamp paragraph) on every user
 * edit should have its appended content tracked and undone together with the
 * user's edit as a single undo group.
 */
export const testAppendTransactionWithContentIsUndoneTogetherWithUserEdit = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const undoManager = new Y.UndoManager(ytype)

  // Plugin that appends a "-- marker --" paragraph after every non-sync user edit
  const appendContentPlugin = new Plugin({
    appendTransaction: (trs, _oldState, newState) => {
      // Only append for user-initiated transactions (not sync or undo plugin)
      const isUserTr = trs.some(tr =>
        !tr.getMeta('y-sync-transaction') &&
        !tr.getMeta(YPM.ySyncPluginKey) &&
        !tr.getMeta(YPM.yUndoPluginKey) &&
        !tr.getMeta('y-sync-append') &&
        tr.docChanged
      )
      if (!isUserTr) return null
      // Don't append if marker already exists
      if (newState.doc.textContent.includes('marker')) return null
      const tr = newState.tr
      tr.insert(tr.doc.content.size, schema.node('paragraph', undefined, schema.text('marker')))
      return tr
    }
  })

  const view = new EditorView({ mount: document.createElement('div') }, {
    state: EditorState.create({
      schema,
      plugins: [YPM.syncPlugin(), YPM.yUndoPlugin(undoManager), appendContentPlugin]
    })
  })
  YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)

  // User inserts a paragraph — the plugin should also append "marker"
  insertParagraph(view, 'user content')
  t.assert(view.state.doc.textContent.includes('user content'), 'has user content')
  t.assert(view.state.doc.textContent.includes('marker'), 'plugin appended marker paragraph')

  // Undo should revert BOTH the user's insert AND the appended marker
  YPM.undo(view.state)
  t.assert(!view.state.doc.textContent.includes('user content'), 'user content was undone')
  t.assert(!view.state.doc.textContent.includes('marker'), 'appended marker was also undone')

  // Redo should restore both
  YPM.redo(view.state)
  t.assert(view.state.doc.textContent.includes('user content'), 'user content was redone')
  t.assert(view.state.doc.textContent.includes('marker'), 'appended marker was also redone')

  view.destroy()
}

// --- Remote change interaction tests ---

/**
 * Changes that existed before the UndoManager was created should NOT be undoable.
 * This simulates the case where remote content was already present when the
 * local editor joined.
 */
export const testRemoteChangesNotUndoable = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')

  // Simulate pre-existing content (e.g., loaded from a remote peer before the editor started).
  // Use a separate doc to create content via Y.js update, avoiding the sync plugin origin.
  const seedDoc = new Y.Doc()
  const seedView = createProsemirrorView(seedDoc.get('prosemirror'))
  insertParagraph(seedView, 'remote content')
  seedView.destroy()
  Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(seedDoc))

  // Now create the local editor — the content is already there
  const view = createProsemirrorView(ytype)
  t.assert(view.state.doc.textContent.includes('remote content'), 'editor has pre-existing content')

  // Undo should have nothing to undo — the pre-existing content predates our UndoManager
  const result = YPM.undo(view.state)
  t.assert(!result, 'undo returned false — nothing to undo locally')
  t.assert(view.state.doc.textContent.includes('remote content'), 'pre-existing content was NOT undone')

  view.destroy()
}

/**
 * Undo a local change while remote content was inserted concurrently.
 * The local undo should only revert the local change, preserving remote content.
 */
export const testUndoLocalWithConcurrentRemoteInsert = () => {
  const ydoc1 = new Y.Doc()
  const ydoc2 = new Y.Doc()
  const ytype1 = ydoc1.get('prosemirror')
  const ytype2 = ydoc2.get('prosemirror')

  const sync = () => {
    const sv1 = Y.encodeStateVector(ydoc1)
    const sv2 = Y.encodeStateVector(ydoc2)
    Y.applyUpdate(ydoc1, Y.encodeStateAsUpdate(ydoc2, sv1))
    Y.applyUpdate(ydoc2, Y.encodeStateAsUpdate(ydoc1, sv2))
  }

  // Editor 2 inserts "remote" first (before editor 1 exists, so it's not tracked)
  const view2 = createProsemirrorView(ytype2)
  insertParagraph(view2, 'remote')
  sync()

  // Editor 1 starts with "remote" already present, then makes a local change
  const view1 = createProsemirrorView(ytype1)
  t.assert(view1.state.doc.textContent.includes('remote'), 'editor 1 has remote content')

  insertParagraph(view1, 'local')
  t.assert(view1.state.doc.textContent.includes('local'), 'has local content')

  // Undo only the local change
  YPM.undo(view1.state)
  t.assert(!view1.state.doc.textContent.includes('local'), 'local content was undone')
  t.assert(view1.state.doc.textContent.includes('remote'), 'remote content preserved after local undo')

  view1.destroy()
  view2.destroy()
}

/**
 * Redo still works when no remote edits interfere between undo and redo.
 */
export const testRedoAfterUndo = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const view = createProsemirrorView(ytype)

  insertParagraph(view, 'first')
  const um = getUndoManager(view.state)
  um.stopCapturing()
  insertParagraph(view, 'second')

  // Undo second insert
  YPM.undo(view.state)
  t.assert(!view.state.doc.textContent.includes('second'), 'second was undone')
  t.assert(view.state.doc.textContent.includes('first'), 'first still present')

  // Redo should restore it
  YPM.redo(view.state)
  t.assert(view.state.doc.textContent.includes('second'), 'second was redone')
  t.assert(view.state.doc.textContent.includes('first'), 'first still present after redo')
}

/**
 * By default, Y.js UndoManager tracks `null` as an origin, which means remote
 * changes arriving via Y.applyUpdate (origin: null) clear the redo stack.
 * This test documents that behavior — it's Y.js's design, not a plugin bug.
 */
export const testRedoClearedByRemoteChanges = () => {
  const ydoc1 = new Y.Doc()
  const ydoc2 = new Y.Doc()
  const ytype1 = ydoc1.get('prosemirror')
  const view = createProsemirrorView(ytype1)

  insertParagraph(view, 'local')
  const um = getUndoManager(view.state)

  YPM.undo(view.state)
  t.assert(um.redoStack.length > 0, 'redo stack has entries after undo')

  // Remote change arrives — UndoManager default tracks null origin,
  // so this clears the redo stack
  const seedView = createProsemirrorView(ydoc2.get('prosemirror'))
  insertParagraph(seedView, 'remote')
  seedView.destroy()
  Y.applyUpdate(ydoc1, Y.encodeStateAsUpdate(ydoc2))

  t.assert(um.redoStack.length === 0, 'redo stack cleared by remote change (default UndoManager behavior)')

  view.destroy()
}

/**
 * Undo/redo of mark (formatting) changes — bold, italic, etc.
 */
export const testUndoRedoMarkChanges = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const view = createProsemirrorView(ytype)

  // Insert a paragraph
  insertParagraph(view, 'hello world')
  const um = getUndoManager(view.state)
  um.stopCapturing()

  // Apply bold to "hello" (positions 1-6 inside the paragraph)
  const boldMark = schema.marks.strong.create()
  view.dispatch(view.state.tr.addMark(1, 6, boldMark))
  um.stopCapturing()

  // Verify bold was applied
  const boldNode = view.state.doc.nodeAt(1)
  t.assert(boldNode && boldNode.marks.some(m => m.type.name === 'strong'), 'hello is bold')

  // Undo the bold
  YPM.undo(view.state)
  const afterUndo = view.state.doc.nodeAt(1)
  t.assert(afterUndo && !afterUndo.marks.some(m => m.type.name === 'strong'), 'bold was undone')
  t.assert(view.state.doc.textContent === 'hello world', 'text content preserved')

  // Redo the bold
  YPM.redo(view.state)
  const afterRedo = view.state.doc.nodeAt(1)
  t.assert(afterRedo && afterRedo.marks.some(m => m.type.name === 'strong'), 'bold was redone')
}

/**
 * Undo/redo of replaceWith operations — replacing content with different content.
 */
export const testUndoRedoReplaceWith = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const view = createProsemirrorView(ytype)

  insertParagraph(view, 'original')
  const um = getUndoManager(view.state)
  um.stopCapturing()

  // Replace the entire paragraph content with new content
  view.dispatch(view.state.tr.replaceWith(1, 9, schema.text('replaced')))
  t.assert(view.state.doc.textContent === 'replaced', 'content was replaced')

  YPM.undo(view.state)
  t.assert(view.state.doc.textContent === 'original', 'replacement was undone')

  YPM.redo(view.state)
  t.assert(view.state.doc.textContent === 'replaced', 'replacement was redone')
}

/**
 * User pre-configures UndoManager with custom captureTimeout.
 * Edits within the timeout window should merge into one undo group.
 */
export const testUndoManagerWithCustomCaptureTimeout = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  // captureTimeout: 0 means every edit is its own group (no merging)
  const undoManager = new Y.UndoManager(ytype, { captureTimeout: 0 })
  const view = createProsemirrorViewWithUm(ytype, undoManager)

  // Insert three separate paragraphs — with captureTimeout: 0, each should be separate
  insertParagraph(view, 'first')
  insertParagraph(view, 'second')
  insertParagraph(view, 'third')

  t.assert(undoManager.undoStack.length === 3, 'three separate undo groups with captureTimeout: 0')

  YPM.undo(view.state)
  t.assert(!view.state.doc.textContent.includes('third'), 'only last insert undone')
  t.assert(view.state.doc.textContent.includes('first'), 'first still present')
  t.assert(view.state.doc.textContent.includes('second'), 'second still present')

  view.destroy()
}

export const testMixedHistoryWithAppendTransactionPlugin = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const view = createViewWithAppendTransactionPlugin(ytype)

  // Tracked insertion
  insertParagraph(view, 'AAA')
  const um = /** @type {import('@y/y').UndoManager} */ (YPM.yUndoPluginKey.getState(view.state)?.undoManager)
  um.stopCapturing()

  // Untracked insertion
  insertParagraph(view, 'BBB', 0, { addToHistory: false })
  t.assert(view.state.doc.textContent.includes('AAA'), 'contains tracked content')
  t.assert(view.state.doc.textContent.includes('BBB'), 'contains untracked content')

  // Undo should only remove the tracked insertion
  YPM.undo(view.state)
  t.assert(view.state.doc.textContent.includes('BBB'), 'untracked content preserved after undo')
  t.assert(!view.state.doc.textContent.includes('AAA'), 'tracked content was undone')
}
