import * as YPM from '@y/prosemirror'
import * as Y from '@y/y'
import * as delta from 'lib0/delta'
import * as t from 'lib0/testing'
import { createPMView, setupTwoWaySync } from './cohort.js'

// === Helpers ===

/**
 * Get suggestion decorations from a PM view's state.
 * @param {import('prosemirror-view').EditorView} view
 * @returns {Array<import('prosemirror-view').Decoration>}
 */
const getDecorations = (view) => {
  const decoSet = YPM.ySuggestionDecorationPluginKey.getState(view.state)
  return decoSet ? decoSet.find() : []
}

/**
 * Assert that a PM doc's JSON matches the expected structure.
 * @param {import('prosemirror-model').Node} doc
 * @param {object} expected
 * @param {string} message
 */
const assertDocJSON = (doc, expected, message) => {
  t.compare(JSON.parse(JSON.stringify(doc.toJSON())), expected, message)
}

/**
 * Build the standard 3-doc suggestion setup used by every command test.
 *
 *   baseDoc  <-- committedAM (view-suggestions) -->  suggestionDoc
 *   baseDoc  <-- suggestionModeAM (suggestion-mode) -->  suggestionModeDoc
 *   suggestionDoc  <->  suggestionModeDoc  (two-way sync)
 *
 * @param {string} baseContent — initial paragraph text
 */
const setup = (baseContent) => {
  const doc = new Y.Doc({ gc: false, guid: 'base' })
  const suggestionDoc = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'suggestions' })
  const suggestionModeDoc = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'suggestions-edit' })

  const attrs = new Y.Attributions()
  const suggestionAM = Y.createAttributionManagerFromDiff(doc, suggestionDoc, { attrs })
  suggestionAM.suggestionMode = false

  const suggestionModeAM = Y.createAttributionManagerFromDiff(doc, suggestionModeDoc, { attrs })
  suggestionModeAM.suggestionMode = true

  setupTwoWaySync(suggestionDoc, suggestionModeDoc)

  const base = createPMView(doc.get('prosemirror'))
  const viewer = createPMView(suggestionDoc.get('prosemirror'), suggestionAM)
  const editor = createPMView(suggestionModeDoc.get('prosemirror'), suggestionModeAM)

  doc.get('prosemirror').applyDelta(
    delta.create().insert([delta.create('paragraph', {}, baseContent)]).done()
  )

  return { base, viewer, editor }
}

// === Tests ===

/**
 * Guard: all four commands return false when no DiffAttributionManager is present.
 */
export const testCommandsReturnFalseWithoutDiffAM = () => {
  const doc = new Y.Doc({ gc: false, guid: 'plain' })
  doc.get('prosemirror').applyDelta(
    delta.create().insert([delta.create('paragraph', {}, 'hello')]).done()
  )
  const view = createPMView(doc.get('prosemirror'))

  t.assert(YPM.acceptChanges(1, 5)(view.state, undefined) === false, 'acceptChanges')
  t.assert(YPM.rejectChanges(1, 5)(view.state, undefined) === false, 'rejectChanges')
  t.assert(YPM.acceptAllChanges()(view.state, undefined) === false, 'acceptAllChanges')
  t.assert(YPM.rejectAllChanges()(view.state, undefined) === false, 'rejectAllChanges')
}

/**
 * acceptAllChanges merges a suggested insertion into the base doc.
 */
export const testAcceptAllChanges = () => {
  const { base, viewer, editor } = setup('hello')

  editor.dispatch(editor.state.tr.insertText(' world', 6))

  // Suggestion view shows the insertion as a decoration (not a mark)
  assertDocJSON(viewer.state.doc, {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [
        { type: 'text', text: 'hello world' }
      ]
    }]
  }, 'clean doc with inserted text before accept')

  const preDecos = getDecorations(viewer)
  const insertDecos = preDecos.filter(d => d.spec?.diff?.type === 'inline-insert')
  t.assert(insertDecos.length > 0, 'inline-insert decoration visible before accept')

  YPM.acceptAllChanges()(viewer.state, viewer.dispatch)

  const expected = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] }]
  }
  assertDocJSON(base.state.doc, expected, 'base doc merged')
  assertDocJSON(viewer.state.doc, expected, 'viewer: no marks')
  assertDocJSON(editor.state.doc, expected, 'editor: no marks')

  // After accept, no decorations should remain
  const postDecos = getDecorations(viewer)
  t.assert(postDecos.length === 0, 'no decorations after accept')
}

/**
 * rejectAllChanges discards a suggested insertion; all views return to original.
 */
export const testRejectAllChanges = () => {
  const { base, viewer, editor } = setup('hello')

  editor.dispatch(editor.state.tr.insertText(' world', 6))
  YPM.rejectAllChanges()(viewer.state, viewer.dispatch)

  const original = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }]
  }
  assertDocJSON(base.state.doc, original, 'base unchanged')
  assertDocJSON(viewer.state.doc, original, 'viewer restored')
  assertDocJSON(editor.state.doc, original, 'editor restored')
}

/**
 * acceptChanges(from, to) accepts a specific range without touching other
 * suggestions.
 */
export const testAcceptChangesRange = () => {
  const { base, viewer, editor } = setup('hello world')

  // Delete 'hello' as a suggestion (positions 1..6)
  editor.dispatch(editor.state.tr.delete(1, 6))

  // Accept the deletion range
  YPM.acceptChanges(1, 6)(viewer.state, viewer.dispatch)

  const expected = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: ' world' }] }]
  }
  assertDocJSON(base.state.doc, expected, 'base reflects accepted deletion')
  assertDocJSON(viewer.state.doc, expected, 'viewer: no marks')
  assertDocJSON(editor.state.doc, expected, 'editor: no marks')
}

/**
 * rejectChanges(from, to) discards a specific suggestion range.
 */
export const testRejectChangesRange = () => {
  const { base, viewer, editor } = setup('hello')

  editor.dispatch(editor.state.tr.insertText(' world', 6))
  YPM.rejectChanges(6, 12)(viewer.state, viewer.dispatch)

  const original = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }]
  }
  assertDocJSON(base.state.doc, original, 'base unchanged')
  assertDocJSON(viewer.state.doc, original, 'viewer restored')
  assertDocJSON(editor.state.doc, original, 'editor restored')
}

/**
 * Mixed workflow: accept one suggestion, make another, reject it.
 * The first accept is permanent; the second reject leaves the doc in the
 * post-accept state.
 */
export const testMixedAcceptAndReject = () => {
  const { base, viewer, editor } = setup('hello world')

  // Suggestion 1: delete 'hello'
  editor.dispatch(editor.state.tr.delete(1, 6))
  YPM.acceptAllChanges()(viewer.state, viewer.dispatch)

  const postAccept = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: ' world' }] }]
  }
  assertDocJSON(base.state.doc, postAccept, 'deletion accepted')

  // Suggestion 2: insert 'hi' — then reject
  editor.dispatch(editor.state.tr.insertText('hi', 1))
  YPM.rejectAllChanges()(viewer.state, viewer.dispatch)

  // First accept persists, second suggestion gone
  assertDocJSON(base.state.doc, postAccept, 'base: first accept persists')
  assertDocJSON(viewer.state.doc, postAccept, 'viewer: second suggestion rejected')
  assertDocJSON(editor.state.doc, postAccept, 'editor: second suggestion rejected')
}
