/**
 * INTEGRATION tests for `ySuggestionDecorationPlugin` (src/suggestion-decoration-plugin.js).
 *
 * Layer: a live EditorView running syncPlugin + the decoration plugin. These
 * tests assert on the rendered DecorationSet and the live document — that diffs
 * become the right KIND of decoration (inline highlight vs. ghost widget), that
 * the doc stays CLEAN (no attribution marks, deleted text never inline), that
 * accept/reject clears decorations and updates content, and that positions stay
 * in bounds through real transactions.
 *
 * Deliberately NOT here: the exact diff shape/positions for each attribution
 * kind (that's the transform's job — y-attribution-to-diffset.test.js), and
 * multi-view sync / convergence (suggestions.test.js). We assert decoration
 * KINDS exist, not re-derive every diff the transform already covers.
 */
import * as t from 'lib0/testing'
import * as Y from '@y/y'
import * as YPM from '@y/prosemirror'
import * as delta from 'lib0/delta'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { schema } from './complexSchema.js'
import { setupTwoWaySync } from './cohort.js'

const PM_KEY = 'prosemirror'

/**
 * Create a PM view with the sync plugin in decoration mode + the decoration plugin.
 *
 * @param {Y.Type} ytype
 * @param {Y.AbstractAttributionManager} [attributionManager]
 * @returns {EditorView}
 */
const createDecorationView = (ytype, attributionManager = Y.noAttributionsManager) => {
  const view = new EditorView(
    { mount: document.createElement('div') },
    {
      state: EditorState.create({
        schema,
        plugins: [
          YPM.syncPlugin(),
          YPM.ySuggestionDecorationPlugin()
        ]
      })
    }
  )
  YPM.configureYProsemirror({ ytype, attributionManager })(view.state, view.dispatch)
  return view
}

/**
 * Standard two-doc suggestion setup with decoration mode.
 *
 * @param {string[]} paragraphs
 */
const setup = (...paragraphs) => {
  const baseDoc = new Y.Doc({ gc: false, guid: 'base' })
  const suggestionDoc = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'suggestions' })
  const suggestionModeDoc = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'suggestions-edit' })

  const attrs = new Y.Attributions()
  const am = Y.createAttributionManagerFromDiff(baseDoc, suggestionDoc, { attrs })
  am.suggestionMode = false

  const suggestionModeAM = Y.createAttributionManagerFromDiff(baseDoc, suggestionModeDoc, { attrs })
  suggestionModeAM.suggestionMode = true

  setupTwoWaySync(suggestionDoc, suggestionModeDoc)

  const editor = createDecorationView(suggestionModeDoc.get(PM_KEY), suggestionModeAM)

  const d = delta.create()
  for (const text of paragraphs) {
    d.insert([delta.create('paragraph', {}, text)])
  }
  baseDoc.get(PM_KEY).applyDelta(d.done())

  return { baseDoc, suggestionDoc, suggestionModeDoc, am, suggestionModeAM, editor, attrs }
}

/**
 * Get the decoration plugin's DecorationSet from the view.
 */
const getDecorations = (/** @type {EditorView} */ view) => {
  const decoSet = YPM.ySuggestionDecorationPluginKey.getState(view.state)
  return decoSet ? decoSet.find() : []
}

/**
 * Assert no attribution marks exist on any node in the document.
 */
const assertNoAttributionMarks = (/** @type {import('prosemirror-model').Node} */ doc, /** @type {string} */ msg) => {
  const markNames = ['y-attributed-insert', 'y-attributed-delete', 'y-attributed-format']
  doc.descendants((node) => {
    for (const mark of node.marks) {
      t.assert(!markNames.includes(mark.type.name), `${msg}: found ${mark.type.name} mark on "${node.textContent}"`)
    }
  })
}

/**
 * PM doc in decoration mode should have NO attribution marks and NO deleted text inline.
 *
 * @param {t.TestCase} _tc
 */
export const testDecorationModeCleanDoc = _tc => {
  const { editor } = setup('hello world')

  editor.dispatch(editor.state.tr.insertText(' nice', 6))

  assertNoAttributionMarks(editor.state.doc, 'after insert')
  t.assert(editor.state.doc.textContent.includes('nice'), 'inserted text present in doc')
}

/**
 * Inserted text should produce inline decorations.
 *
 * @param {t.TestCase} _tc
 */
export const testDecorationModeInsertHighlighted = _tc => {
  const { editor } = setup('hello world')

  editor.dispatch(editor.state.tr.insertText(' beautiful', 6))

  const decos = getDecorations(editor)
  t.assert(decos.length > 0, 'has decorations after insert')
  const insertDeco = decos.find(d => d.spec?.diff?.type === 'inline-insert')
  t.assert(insertDeco != null, 'found inline-insert decoration')
}

/**
 * Deleted text should appear as widget decorations (ghosts), not inline content.
 *
 * @param {t.TestCase} _tc
 */
export const testDecorationModeDeleteGhosts = _tc => {
  const { editor } = setup('keep me', 'delete me')

  assertNoAttributionMarks(editor.state.doc, 'before delete')
  t.assert(editor.state.doc.textContent.includes('delete me'), 'paragraph present before delete')

  const para2 = editor.state.doc.child(1)
  const para2Start = editor.state.doc.child(0).nodeSize
  editor.dispatch(editor.state.tr.delete(para2Start, para2Start + para2.nodeSize))

  t.assert(!editor.state.doc.textContent.includes('delete me'), 'deleted text NOT in doc (decoration-only)')
  assertNoAttributionMarks(editor.state.doc, 'after delete')

  const decos = getDecorations(editor)
  const deleteDeco = decos.find(d => d.spec?.diff?.type === 'block-delete')
  t.assert(deleteDeco != null, 'found block-delete widget decoration')
  t.assert(deleteDeco?.spec?.diff?.content?.firstChild?.textContent === 'delete me', 'ghost carries deleted content')
}

/**
 * Accept-all via the AM should clear all decorations.
 *
 * @param {t.TestCase} _tc
 */
export const testDecorationModeAcceptAll = _tc => {
  const { editor, am } = setup('hello')

  editor.dispatch(editor.state.tr.insertText(' world', 6))
  t.assert(getDecorations(editor).length > 0, 'decorations before accept')

  am.acceptAllChanges()

  t.assert(getDecorations(editor).length === 0, 'no decorations after accept-all')
  t.assert(editor.state.doc.textContent === 'hello world', 'accepted content preserved')
}

/**
 * Reject-all via the AM should restore base content and clear decorations.
 *
 * @param {t.TestCase} _tc
 */
export const testDecorationModeRejectAll = _tc => {
  const { editor, am } = setup('hello')

  editor.dispatch(editor.state.tr.insertText(' world', 6))
  t.assert(getDecorations(editor).length > 0, 'decorations before reject')

  am.rejectAllChanges()

  t.assert(getDecorations(editor).length === 0, 'no decorations after reject-all')
  t.assert(editor.state.doc.textContent === 'hello', 'content restored to base after reject')
}

/**
 * Two back-to-back single-char deletions must both produce delete-ghost
 * decorations. Regression: the second deletion was silently swallowed —
 * the character disappeared from the doc without a ghost widget.
 *
 * @param {t.TestCase} _tc
 */
export const testDecorationModeBackToBackInlineDeletions = _tc => {
  const { editor } = setup('hello world')

  // First backspace: delete 'd' (last char of "world")
  const end1 = editor.state.doc.content.size - 1
  editor.dispatch(editor.state.tr.delete(end1 - 1, end1))

  // Second backspace: delete 'l'
  const end2 = editor.state.doc.content.size - 1
  editor.dispatch(editor.state.tr.delete(end2 - 1, end2))

  // The clean doc should have "hello wor" (both chars removed)
  t.assert(!editor.state.doc.textContent.includes('d'), '"d" not in doc text')
  t.assert(editor.state.doc.textContent === 'hello wor', 'clean doc is "hello wor"')

  const decos = getDecorations(editor)
  const deleteDecos = decos.filter(d => d.spec?.diff?.type === 'inline-delete')
  t.assert(deleteDecos.length > 0, 'has inline-delete decoration(s)')

  // Collect all deleted text from ghost widgets
  const deletedText = deleteDecos
    .map(d => d.spec?.diff?.content?.textBetween(0, d.spec?.diff?.content?.size ?? 0) ?? '')
    .join('')
  t.assert(deletedText.includes('l'), 'ghost includes "l" from second deletion')
  t.assert(deletedText.includes('d'), 'ghost includes "d" from first deletion')
}

/**
 * Positions stay within bounds after mixed inserts and deletes.
 *
 * @param {t.TestCase} _tc
 */
export const testDecorationModePositionsWithinBounds = _tc => {
  const { editor } = setup('hello world')

  editor.dispatch(editor.state.tr.insertText('!', 6))
  editor.dispatch(editor.state.tr.delete(1, 4))

  const decos = getDecorations(editor)
  const size = editor.state.doc.content.size
  t.assert(decos.length > 0, 'has decorations')
  decos.forEach(d => {
    t.assert(d.from >= 0 && d.to <= size, `decoration [${d.from},${d.to}] within bounds (size=${size})`)
  })
}
