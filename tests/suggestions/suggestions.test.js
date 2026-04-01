import * as YPM from '@y/prosemirror'
import * as Y from '@y/y'
import * as delta from 'lib0/delta'
import * as t from 'lib0/testing'

import {
  assertDocJSON,
  deletionMark,
  insertionMark
} from '../helpers.js'

import { schema } from './schema.js'
import { createSuggestionSetup } from './helpers.js'

// === Tests ===

/**
 * Content sync + marks: base doc content flows to suggestion views without marks,
 * suggestion mode edits are isolated from base and show insertion marks in View Suggestions.
 */
export const testSuggestionSyncAndMarks = () => {
  const { viewA, viewSuggestion, viewSuggestionMode } = createSuggestionSetup({
    baseContent: 'hello'
  })
  const helloDoc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
      { type: 'paragraph' }
    ]
  }

  // Base content appears everywhere without marks
  assertDocJSON(viewA.state.doc, helloDoc, 'Client A has hello')
  assertDocJSON(
    viewSuggestion.state.doc,
    helloDoc,
    'View Suggestions has hello, no marks'
  )
  assertDocJSON(
    viewSuggestionMode.state.doc,
    helloDoc,
    'Suggestion Mode has hello, no marks'
  )

  // Type in Suggestion Mode → isolated from base, marks in View Suggestions
  viewSuggestionMode.dispatch(
    viewSuggestionMode.state.tr.insertText(' world', 6)
  )
  assertDocJSON(viewA.state.doc, helloDoc, 'Client A unchanged')

  const helloWorldDoc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'hello' },
          { type: 'text', text: ' world', marks: [insertionMark] }
        ]
      },
      { type: 'paragraph' }
    ]
  }
  assertDocJSON(
    viewSuggestion.state.doc,
    helloWorldDoc,
    "View Suggestions: ' world' has insertion mark"
  )

  assertDocJSON(
    viewSuggestionMode.state.doc,
    helloWorldDoc,
    "Suggestion Mode: ' world' has insertion mark"
  )
}

/**
 * Sequential typing: both characters should have marks in View Suggestions.
 * Reproduces: "when adding 2 characters in right editor, left editor only shows marks on the second char"
 */
export const testSequentialTypingMarks = () => {
  const { viewSuggestion, viewSuggestionMode } = createSuggestionSetup({
    baseContent: 'hello'
  })

  // Type 'a' then 'b' as separate dispatches (like real typing)
  viewSuggestionMode.dispatch(viewSuggestionMode.state.tr.insertText('a', 6))

  viewSuggestionMode.dispatch(viewSuggestionMode.state.tr.insertText('b', 7))

  const abDoc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'hello' },
          { type: 'text', text: 'ab', marks: [insertionMark] }
        ]
      },
      { type: 'paragraph' }
    ]
  }

  // BOTH 'a' and 'b' should have insertion marks
  assertDocJSON(
    viewSuggestion.state.doc,
    abDoc,
    "View Suggestions: both 'a' and 'b' have insertion marks"
  )

  assertDocJSON(
    viewSuggestionMode.state.doc,
    abDoc,
    "Suggestion Mode: both 'a' and 'b' have insertion marks"
  )
}

/**
 * Block-level insertion: inserting a new paragraph in suggestion mode
 * should show insertion marks on the new block's text content.
 * (Paragraph nodes themselves don't support marks in prosemirror-schema-basic.)
 */
export const testBlockInsertionMarks = () => {
  const { viewA, viewSuggestion, viewSuggestionMode } = createSuggestionSetup({
    baseContent: 'hello'
  })
  // Insert a new paragraph with text at the end of the document (before trailing empty paragraph)
  const { tr } = viewSuggestionMode.state
  const insertPos = tr.doc.content.size - 2 // before the last empty paragraph's close
  viewSuggestionMode.dispatch(
    tr.insert(
      insertPos,
      schema.nodes.paragraph.create(null, schema.text('new block'))
    )
  )
  const helloDoc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
      { type: 'paragraph' }
    ]
  }

  // Base doc unchanged
  assertDocJSON(
    viewA.state.doc,
    helloDoc,
    'Client A unchanged after block insert'
  )

  const expectedDoc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
      {
        type: 'paragraph',
        marks: [insertionMark], // TODO: this fails because it's not in output. AddNodeMarkStep never called?
        content: [{ type: 'text', text: 'new block', marks: [insertionMark] }]
      },
      { type: 'paragraph' }
    ]
  }

  assertDocJSON(
    viewSuggestion.state.doc,
    expectedDoc,
    'View Suggestions: new paragraph node and text have insertion marks'
  )

  assertDocJSON(
    viewSuggestionMode.state.doc,
    expectedDoc,
    'Suggestion Mode: new paragraph node and text have insertion marks'
  )
}

/**
 * Enter key (split block): pressing Enter in the middle of a paragraph in
 * suggestion mode should split the paragraph into two. The base doc stays
 * unchanged, and the suggestion views should show the new paragraph with
 * insertion marks.
 */
// TODO: FAILING - split paragraph insertion mark mismatch (array length mismatch in doc content)
export const testEnterInSuggestionMode = () => {
  const { viewA, viewSuggestion, viewSuggestionMode } = createSuggestionSetup({
    baseContent: 'hello'
  })

  const helloDoc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
      { type: 'paragraph' }
    ]
  }

  // Press Enter after "hel" (position 4 = after 'l' in "hel|lo")
  const { tr } = viewSuggestionMode.state
  viewSuggestionMode.dispatch(tr.split(4))

  // Base doc should stay unchanged
  assertDocJSON(viewA.state.doc, helloDoc, 'Client A unchanged after Enter')

  const expectedDoc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'hel' }] },
      {
        type: 'paragraph',
        marks: [insertionMark],
        content: [{ type: 'text', text: 'lo' }]
      },
      { type: 'paragraph' }
    ]
  }

  assertDocJSON(
    viewSuggestion.state.doc,
    expectedDoc,
    'View Suggestions: split paragraph shows insertion mark on new block'
  )

  assertDocJSON(
    viewSuggestionMode.state.doc,
    expectedDoc,
    'Suggestion Mode: split paragraph shows insertion mark on new block'
  )
}

/**
 * Backspace merge (join blocks): pressing Backspace at the start of a paragraph
 * in suggestion mode should merge it with the previous paragraph. The base doc
 * stays unchanged, and the suggestion views should show a deletion mark on the
 * joined boundary.
 */
// TODO: FAILING - merged paragraph after join mismatch (array length mismatch in doc content)
export const testBackspaceJoinInSuggestionMode = () => {
  const { doc, viewA, viewSuggestion, viewSuggestionMode } =
    createSuggestionSetup()

  // Set up two paragraphs in the base doc: "hel" and "lo"
  doc.get('prosemirror').applyDelta(
    delta
      .create()
      .insert([
        delta.create('paragraph', {}, 'hel'),
        delta.create('paragraph', {}, 'lo')
      ])
      .done()
  )

  const twoParaDoc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'hel' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'lo' }] },
      { type: 'paragraph' }
    ]
  }

  assertDocJSON(viewA.state.doc, twoParaDoc, 'Base doc has two paragraphs')
  assertDocJSON(
    viewSuggestionMode.state.doc,
    twoParaDoc,
    'Suggestion mode starts with two paragraphs'
  )

  // Backspace at start of second paragraph → join at the boundary (pos 5)
  // doc structure: <doc><p>hel</p><p>lo</p><p></p></doc>
  //                0    1  4  5   6 8  9  10
  // join depth 1 at pos 5 (between </p> and <p>)
  const { tr } = viewSuggestionMode.state
  viewSuggestionMode.dispatch(tr.join(5))

  // Base doc should stay unchanged
  assertDocJSON(
    viewA.state.doc,
    twoParaDoc,
    'Client A unchanged after Backspace join'
  )

  const expectedDoc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'hello' }]
      },
      { type: 'paragraph' }
    ]
  }

  assertDocJSON(
    viewSuggestion.state.doc,
    expectedDoc,
    'View Suggestions: merged paragraph after join'
  )

  assertDocJSON(
    viewSuggestionMode.state.doc,
    expectedDoc,
    'Suggestion Mode: merged paragraph after join'
  )
}

/**
 * Inline image insertion: inserting an image node in suggestion mode
 * should show insertion marks on the image.
 */
export const testImageInsertionMarks = () => {
  const { viewA, viewSuggestion, viewSuggestionMode } = createSuggestionSetup({
    baseContent: 'hello'
  })

  // Insert an image after "hello"
  viewSuggestionMode.dispatch(
    viewSuggestionMode.state.tr.insert(
      6,
      schema.nodes.image.create({ src: 'test.png', alt: 'test' })
    )
  )
  const helloDoc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
      { type: 'paragraph' }
    ]
  }

  // Base doc unchanged
  assertDocJSON(
    viewA.state.doc,
    helloDoc,
    'Client A unchanged after image insert'
  )

  const expectedDoc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'hello' },
          {
            type: 'image',
            attrs: { src: 'test.png', alt: 'test', title: null },
            marks: [insertionMark]
          }
        ]
      },
      { type: 'paragraph' }
    ]
  }

  assertDocJSON(
    viewSuggestion.state.doc,
    expectedDoc,
    'View Suggestions: image has insertion mark'
  )

  // TODO: "viewSuggestionMode" doc fails
  assertDocJSON(
    viewSuggestionMode.state.doc,
    expectedDoc,
    'Suggestion Mode: image has insertion mark'
  )
}

export const testDeletionOfSuggestedContent = () => {
  const {
    viewA,
    viewSuggestion,
    viewSuggestionMode,
    suggestionModeDoc,
    doc,
    suggestionModeAM
  } = createSuggestionSetup({ baseContent: 'hello' })

  t.group('insert suggestion', () => {
    // Insert a new paragraph with text at the end of the document (before trailing empty paragraph)
    const { tr } = viewSuggestionMode.state
    const insertPos = tr.doc.content.size - 2 // before the last empty paragraph's close
    viewSuggestionMode.dispatch(
      tr.insert(
        insertPos,
        schema.nodes.paragraph.create(null, schema.text('new block'))
      )
    )
    const helloDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
        { type: 'paragraph' }
      ]
    }

    // Base doc unchanged
    assertDocJSON(
      viewA.state.doc,
      helloDoc,
      'Client A unchanged after block insert'
    )

    const expectedDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
        {
          type: 'paragraph',
          marks: [insertionMark],
          content: [
            { type: 'text', text: 'new block', marks: [insertionMark] }
          ]
        },
        { type: 'paragraph' }
      ]
    }

    assertDocJSON(
      viewSuggestion.state.doc,
      expectedDoc,
      'View Suggestions: new paragraph node and text have insertion marks'
    )

    assertDocJSON(
      viewSuggestionMode.state.doc,
      expectedDoc,
      'Suggestion Mode: new paragraph node and text have insertion marks'
    )
  })
  t.group('delete suggested content', () => {
    const { tr } = viewSuggestionMode.state
    const deletePos = tr.doc.content.size - 5
    // delete 'c'
    viewSuggestionMode.dispatch(tr.delete(deletePos, deletePos + 1))
    const expectedDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
        {
          type: 'paragraph',
          marks: [insertionMark],
          content: [{ type: 'text', text: 'new blok', marks: [insertionMark] }]
        },
        { type: 'paragraph' }
      ]
    }
    console.log({
      ydocSuggestionState: suggestionModeDoc
        .get('prosemirror')
        .toDeltaDeep(suggestionModeAM)
        .toJSON()
    })
    assertDocJSON(
      viewSuggestion.state.doc,
      expectedDoc,
      'View Suggestions: expect that the deleted suggestion is actually deleted'
    )
    assertDocJSON(
      viewSuggestionMode.state.doc,
      expectedDoc,
      'Suggestion Mode: expect that the deleted suggestion is actually deleted'
    )
  })
  console.log({ doc, suggestionModeDoc, suggestionModeAM })
}

export const testDeleteSuggustion = () => {
  const {
    viewA,
    viewSuggestion,
    viewSuggestionMode
  } = createSuggestionSetup({ baseContent: 'hello' })
  t.group('populate content', () => {
    const tr = viewA.state.tr
    // Replace doc content with blockquote > paragraph
    tr.replaceWith(
      0,
      tr.doc.content.size,
      schema.nodes.paragraph.create(null, schema.text('hello world'))
    )
    viewA.dispatch(tr)
  })
  t.group('suggest delete', () => {
    // Insert a new paragraph with text at the end of the document (before trailing empty paragraph)
    const tr = viewSuggestionMode.state.tr
    // delete 'hello'
    viewSuggestionMode.dispatch(tr.delete(1, 6))
    const baseDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] }
      ]
    }
    assertDocJSON(viewA.state.doc, baseDoc, 'Client A unchanged')
    const expectedDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'hello', marks: [deletionMark] },
            { type: 'text', text: ' world' }
          ]
        }
      ]
    }
    assertDocJSON(
      viewSuggestionMode.state.doc,
      expectedDoc,
      'Suggestion Mode: new paragraph node and text have insertion marks'
    )
    assertDocJSON(
      viewSuggestion.state.doc,
      expectedDoc,
      'View Suggestions: new paragraph node and text have insertion marks'
    )
  })
}

export const testReconfigureAfterDeletion = () => {
  const {
    viewA,
    viewSuggestion,
    viewSuggestionMode,
    doc
  } = createSuggestionSetup({ baseContent: 'hello' })
  t.group('populate content', () => {
    const tr = viewA.state.tr
    // Replace doc content with blockquote > paragraph
    tr.replaceWith(
      0,
      tr.doc.content.size,
      schema.nodes.paragraph.create(null, schema.text('hello world'))
    )
    viewA.dispatch(tr)
  })
  const baseDoc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] }
    ]
  }
  const expectedSuggestionDoc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'he' },
          { type: 'text', text: 'llo', marks: [deletionMark] },
          { type: 'text', text: ' world' },
          { type: 'text', text: '!', marks: [insertionMark] }
        ]
      }
    ]
  }
  t.group('suggest delete', () => {
    // Insert a new paragraph with text at the end of the document (before trailing empty paragraph)
    const tr = viewSuggestionMode.state.tr
    // delete 'hello', append '!'
    viewSuggestionMode.dispatch(tr.delete(3, 6).insert(9, schema.text('!')))
    assertDocJSON(viewA.state.doc, baseDoc, 'Client A unchanged')
    assertDocJSON(
      viewSuggestionMode.state.doc,
      expectedSuggestionDoc,
      'Suggestion Mode: new paragraph node and text have insertion marks'
    )
    assertDocJSON(
      viewSuggestion.state.doc,
      expectedSuggestionDoc,
      'View Suggestions: new paragraph node and text have insertion marks'
    )
  })
  t.group('reconfigure', () => {
    YPM.configureYProsemirror({
      ytype: doc.get('prosemirror'),
      attributionManager: Y.noAttributionsManager
    })(viewSuggestionMode.state, viewSuggestionMode.dispatch)
    assertDocJSON(
      viewSuggestionMode.state.doc,
      baseDoc,
      'suggestion mode doc reconfigured after deletion'
    )
    assertDocJSON(
      viewSuggestion.state.doc,
      expectedSuggestionDoc,
      "suggestion doc didn't change after reconf of other editor"
    )
  })
}

// TODO: FAILING — suggestion mode doc reconfigured after deletion (array length mismatch in blockGroup content)
export const testReconfigureAfterDeletion2 = () => {
  const {
    viewA,
    viewSuggestion,
    viewSuggestionMode,
    suggestionModeDoc,
    doc,
    suggestionModeAM,
    suggestionDoc,
    suggestionAM
  } = createSuggestionSetup({ baseContent: 'hello' })
  t.group('populate content', () => {
    const tr = viewA.state.tr
    // Replace doc content with blockquote > paragraph
    tr.replaceWith(
      0,
      tr.doc.content.size,
      schema.nodes.paragraph.create(null, schema.text('abc abc abc'))
    )
    viewA.dispatch(tr)
  })
  const baseDoc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'abc abc abc' }] }
    ]
  }
  const expectedSuggestionDoc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'a' },
          { type: 'text', text: 'bc', marks: [deletionMark] },
          { type: 'text', text: '!', marks: [insertionMark] },
          { type: 'text', text: ' a' },
          { type: 'text', text: 'bc', marks: [deletionMark] },
          { type: 'text', text: '!', marks: [insertionMark] },
          { type: 'text', text: ' abc' }
        ]
      }
    ]
  }
  t.group('suggest delete', () => {
    const tr = viewSuggestionMode.state.tr
    viewSuggestionMode.dispatch(
      tr
        .insert(8, schema.text('!'))
        .delete(6, 8)
        .insert(4, schema.text('!'))
        .delete(2, 4)
    )
    assertDocJSON(viewA.state.doc, baseDoc, 'Client A unchanged')
    assertDocJSON(
      viewSuggestionMode.state.doc,
      expectedSuggestionDoc,
      'Suggestion Mode: new paragraph node and text have insertion marks'
    )
    console.log(
      'suggestionDocContent',
      suggestionDoc.get('prosemirror').toDeltaDeep(suggestionAM).toJSON()
    )
    console.log(
      'suggestionModeDocContent',
      suggestionModeDoc
        .get('prosemirror')
        .toDeltaDeep(suggestionModeAM)
        .toJSON()
    )
    // assertDocJSON(
    //   viewSuggestion.state.doc,
    //   expectedSuggestionDoc,
    //   'View Suggestions: new paragraph node and text have insertion marks'
    // )
  })
  t.group('reconfigure', () => {
    YPM.configureYProsemirror({
      ytype: doc.get('prosemirror'),
      attributionManager: Y.noAttributionsManager
    })(viewSuggestionMode.state, viewSuggestionMode.dispatch)
    assertDocJSON(
      viewSuggestionMode.state.doc,
      baseDoc,
      'suggestion mode doc reconfigured after deletion'
    )
    console.log(
      'suggestionDocContent',
      suggestionDoc.get('prosemirror').toDeltaDeep(suggestionAM).toJSON()
    )
    assertDocJSON(
      viewSuggestion.state.doc,
      expectedSuggestionDoc,
      "suggestion doc didn't change after reconf of other editor"
    )
  })
}
