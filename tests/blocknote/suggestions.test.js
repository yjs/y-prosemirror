import {
  assertDocJSON,
  createSuggestionSetup
} from '../helpers.js'
import { bnDoc, findFirstTextPosition, mapAttributionToMark, schema } from './schema.js'

/** Insertion mark as it appears in PM doc JSON with BlockNote's mark names */
const insertionMark = {
  type: 'insertion',
  attrs: { id: 1 }
}

const deletionMark = {
  type: 'deletion',
  attrs: { id: 1 }
}

const modificationMark = {
  type: 'modification',
  attrs: { id: 1, type: 'format', attrName: null, previousValue: null, newValue: null }
}

/** Default paragraph attrs for BlockNote schema */
const pAttrs = { backgroundColor: 'default', textAlignment: 'left', textColor: 'default' }

/** Build a single-block doc with custom paragraph content */
const bnDocContent = (...content) => ({
  type: 'doc',
  content: [{
    type: 'blockGroup',
    content: [{
      type: 'blockContainer',
      attrs: { id: null },
      content: [{
        type: 'paragraph',
        attrs: pAttrs,
        content
      }]
    }]
  }]
})

// === Tests ===

/**
 * Basic suggestion: typing in suggestion mode should be isolated from
 * the base doc and show insertion marks in both suggestion views.
 */
export const testBlockNoteSuggestionInsert = () => {
  const { viewA, viewSuggestion, viewSuggestionMode } =
    createSuggestionSetup(schema, { mapAttributionToMark })

  // Type "hello" in the base doc via PM transaction (like sync tests do)
  const baseTextPos = findFirstTextPosition(viewA.state.doc)
  viewA.dispatch(viewA.state.tr.insertText('hello', baseTextPos))

  const helloDoc = bnDoc('hello')
  assertDocJSON(viewA.state.doc, helloDoc, "Client A has 'hello'")
  assertDocJSON(viewSuggestion.state.doc, helloDoc, "View Suggestions has 'hello'")
  assertDocJSON(viewSuggestionMode.state.doc, helloDoc, "Suggestion Mode has 'hello'")

  // Type " world" in suggestion mode after "hello"
  const textPos = findFirstTextPosition(viewSuggestionMode.state.doc) + 5
  viewSuggestionMode.dispatch(
    viewSuggestionMode.state.tr.insertText(' world', textPos)
  )

  // Base doc unchanged
  assertDocJSON(viewA.state.doc, helloDoc, 'Client A unchanged after suggestion')

  // Suggestion views show insertion marks on the new text
  const expectedDoc = bnDocContent(
    { type: 'text', text: 'hello' },
    { type: 'text', text: ' world', marks: [insertionMark] }
  )

  assertDocJSON(viewSuggestion.state.doc, expectedDoc, "View Suggestions: ' world' has insertion mark")
  assertDocJSON(viewSuggestionMode.state.doc, expectedDoc, "Suggestion Mode: ' world' has insertion mark")
}

/**
 * Delete base content in suggestion mode: should re-insert with deletion marks,
 * NOT actually delete.
 *
 * BUG: sync-plugin.js line 246 hardcodes startsWith('y-attribution-') to filter
 * attribution marks from triggering recursive format detection. With BlockNote's
 * marks, the deletion mark's AddMarkStep is not filtered, so modification marks
 * are added on top of deletion marks. Result: gets 'modification' mark instead
 * of 'deletion' mark.
 */
// TODO: FAILING - gets modification mark instead of deletion (hardcoded y-attribution- prefix in sync-plugin.js:246)
export const testBlockNoteSuggestionDelete = () => {
  const { viewA, viewSuggestion, viewSuggestionMode } =
    createSuggestionSetup(schema, { mapAttributionToMark })

  // Type "hello world" in base doc
  const baseTextPos = findFirstTextPosition(viewA.state.doc)
  viewA.dispatch(viewA.state.tr.insertText('hello world', baseTextPos))

  // Delete "hello" (5 chars) in suggestion mode
  const delStart = findFirstTextPosition(viewSuggestionMode.state.doc)
  viewSuggestionMode.dispatch(
    viewSuggestionMode.state.tr.delete(delStart, delStart + 5)
  )

  // Base doc unchanged — deletion only exists as a suggestion
  assertDocJSON(viewA.state.doc, bnDoc('hello world'), 'Client A unchanged after delete suggestion')

  // Suggestion views: "hello" should have deletion mark, " world" should be plain
  const expectedDoc = bnDocContent(
    { type: 'text', text: 'hello', marks: [deletionMark] },
    { type: 'text', text: ' world' }
  )

  assertDocJSON(viewSuggestionMode.state.doc, expectedDoc, 'Suggestion Mode: "hello" has deletion mark')
  assertDocJSON(viewSuggestion.state.doc, expectedDoc, 'View Suggestions: "hello" has deletion mark')
}

/**
 * Delete previously suggested insertion: should actually remove the text
 * (revert the suggestion), not re-insert with deletion marks.
 *
 * BUG: sync-plugin.js line 211 hardcodes schema.marks['y-attribution-insertion']
 * which is undefined when using BlockNote's 'insertion' mark. The code never
 * enters the "let it stay deleted" branch, so suggested text is kept with
 * extra marks instead of being truly reverted.
 */
// TODO: FAILING - suggested insertion not reverted (hardcoded y-attribution-insertion in sync-plugin.js:211)
export const testBlockNoteSuggestionDeleteReverts = () => {
  const { viewA, viewSuggestion, viewSuggestionMode } =
    createSuggestionSetup(schema, { mapAttributionToMark })

  // Type "hello" in base doc
  const baseTextPos = findFirstTextPosition(viewA.state.doc)
  viewA.dispatch(viewA.state.tr.insertText('hello', baseTextPos))

  // Type " world" in suggestion mode (this gets insertion mark)
  const insertPos = findFirstTextPosition(viewSuggestionMode.state.doc) + 5
  viewSuggestionMode.dispatch(
    viewSuggestionMode.state.tr.insertText(' world', insertPos)
  )

  // Now delete " world" in suggestion mode — should revert the suggestion (actually delete)
  const delStart = findFirstTextPosition(viewSuggestionMode.state.doc) + 5
  viewSuggestionMode.dispatch(
    viewSuggestionMode.state.tr.delete(delStart, delStart + 6)
  )

  // Base doc unchanged
  assertDocJSON(viewA.state.doc, bnDoc('hello'), 'Client A still has just "hello"')

  // Both suggestion views should show just "hello" — the suggested insertion was reverted
  assertDocJSON(viewSuggestionMode.state.doc, bnDoc('hello'), 'Suggestion Mode: reverted to just "hello"')
  assertDocJSON(viewSuggestion.state.doc, bnDoc('hello'), 'View Suggestions: reverted to just "hello"')
}

/**
 * Format change in suggestion mode: should add modification marks.
 * The line 246 guard (startsWith('y-attribution-')) doesn't match BlockNote's
 * marks, but mark exclusions on 'modification' prevent recursion naturally.
 */
export const testBlockNoteSuggestionFormat = () => {
  const { viewA, viewSuggestion, viewSuggestionMode } =
    createSuggestionSetup(schema, { mapAttributionToMark })

  // Type "hello world" in base doc
  const baseTextPos = findFirstTextPosition(viewA.state.doc)
  viewA.dispatch(viewA.state.tr.insertText('hello world', baseTextPos))

  // Bold "hello" in suggestion mode
  const fmtStart = findFirstTextPosition(viewSuggestionMode.state.doc)
  viewSuggestionMode.dispatch(
    viewSuggestionMode.state.tr.addMark(fmtStart, fmtStart + 5, schema.marks.bold.create())
  )

  // Base doc unchanged
  assertDocJSON(viewA.state.doc, bnDoc('hello world'), 'Client A unchanged after format suggestion')

  // Suggestion views: "hello" should have bold + modification mark
  const expectedDoc = bnDocContent(
    {
      type: 'text',
      text: 'hello',
      marks: [
        { type: 'bold' },
        modificationMark
      ]
    },
    { type: 'text', text: ' world' }
  )

  assertDocJSON(viewSuggestionMode.state.doc, expectedDoc, 'Suggestion Mode: "hello" has bold + modification mark')
  assertDocJSON(viewSuggestion.state.doc, expectedDoc, 'View Suggestions: "hello" has bold + modification mark')
}
