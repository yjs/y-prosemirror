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
  assertDocJSON(
    viewSuggestion.state.doc,
    helloDoc,
    "View Suggestions has 'hello'"
  )
  assertDocJSON(
    viewSuggestionMode.state.doc,
    helloDoc,
    "Suggestion Mode has 'hello'"
  )

  // Type " world" in suggestion mode after "hello"
  const textPos = findFirstTextPosition(viewSuggestionMode.state.doc) + 5
  viewSuggestionMode.dispatch(
    viewSuggestionMode.state.tr.insertText(' world', textPos)
  )

  // Base doc unchanged
  assertDocJSON(
    viewA.state.doc,
    helloDoc,
    'Client A unchanged after suggestion'
  )

  // Suggestion views show insertion marks on the new text
  const expectedDoc = {
    type: 'doc',
    content: [
      {
        type: 'blockGroup',
        content: [
          {
            type: 'blockContainer',
            attrs: { id: null },
            content: [
              {
                type: 'paragraph',
                attrs: {
                  backgroundColor: 'default',
                  textAlignment: 'left',
                  textColor: 'default'
                },
                content: [
                  { type: 'text', text: 'hello' },
                  { type: 'text', text: ' world', marks: [insertionMark] }
                ]
              }
            ]
          }
        ]
      }
    ]
  }

  assertDocJSON(
    viewSuggestion.state.doc,
    expectedDoc,
    "View Suggestions: ' world' has insertion mark"
  )

  assertDocJSON(
    viewSuggestionMode.state.doc,
    expectedDoc,
    "Suggestion Mode: ' world' has insertion mark"
  )
}
