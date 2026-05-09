import * as YPM from '@y/prosemirror'
import * as Y from '@y/y'
import * as delta from 'lib0/delta'
import * as t from 'lib0/testing'
import * as promise from 'lib0/promise'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { schema } from './complexSchema.js'

// === Helpers ===

/**
 * Create a ProseMirror EditorView backed by a Y.js type.
 * @param {Y.Type} ytype
 * @param {Y.AbstractAttributionManager} [attributionManager]
 * @param {object} [opts]
 * @param {import('prosemirror-model').Schema} [opts.schema]
 * @param {AttributionMapper} [opts.mapAttributionToMark]
 */
const createPMView = (ytype, attributionManager = Y.noAttributionsManager, opts = {}) => {
  const s = opts.schema || schema
  const view = new EditorView(
    { mount: document.createElement('div') },
    {
      state: EditorState.create({
        schema: s,
        plugins: [YPM.syncPlugin(opts.mapAttributionToMark ? { mapAttributionToMark: opts.mapAttributionToMark } : {})]
      })
    }
  )
  YPM.configureYProsemirror({ ytype, attributionManager })(
    view.state,
    view.dispatch
  )
  return view
}

/**
 * Set up two-way sync between two Y.Docs.
 * @param {Y.Doc} doc1
 * @param {Y.Doc} doc2
 */
const setupTwoWaySync = (doc1, doc2) => {
  // Initial state sync
  Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
  Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))
  // Live sync
  doc1.on('update', (update) => {
    Y.applyUpdate(doc2, update)
  })
  doc2.on('update', (update) => {
    Y.applyUpdate(doc1, update)
  })
}

/**
 * Dispatch a transaction to a ProseMirror view and wait a tick so that any
 * deferred sync-plugin follow-up work (e.g. adjustments scheduled via
 * `setTimeout(..., 0)`) has a chance to run before the test proceeds.
 * @param {EditorView} view
 * @param {import('prosemirror-state').Transaction} tr
 */
const safeDispatch = async (view, tr) => {
  view.dispatch(tr)
  await promise.wait(1)
}

/**
 * Assert that a PM doc's JSON matches the expected structure.
 * @param {import('prosemirror-model').Node} doc
 * @param {object} expected
 * @param {string} message
 */
const assertDocJSON = (doc, expected, message) => {
  // PM creates mark attrs with Object.create(null) (null prototype), but t.compare
  // checks constructors and fails when comparing null-prototype vs regular objects.
  // JSON round-trip normalizes all objects to have Object prototype.
  t.compare(JSON.parse(JSON.stringify(doc.toJSON())), expected, message)
}

/**
 * Set up the suggestion architecture:
 *   doc (base)
 *   suggestionDoc (view suggestions, suggestionMode=false) ↔ suggestionModeDoc (edit suggestions, suggestionMode=true)
 *
 * @param {object} [opts]
 * @param {string} [opts.baseContent] - initial paragraph text content
 * @param {import('prosemirror-model').Schema} [opts.schema] - custom schema (defaults to complexSchema)
 * @param {AttributionMapper} [opts.mapAttributionToMark] - custom attribution mapper
 */
const createSuggestionSetup = (opts = {}) => {
  const { baseContent } = opts
  const viewOpts = opts.schema ? { schema: opts.schema, mapAttributionToMark: opts.mapAttributionToMark } : {}

  const doc = new Y.Doc({ gc: false, guid: 'base' })

  // "suggestion" = show suggestions, but edit "main document" (if possible)
  // "suggestionMode" = show suggestions and behave like suggesting user (edits always go to sugestion doc)
  const suggestionDoc = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'suggestions' })
  const suggestionModeDoc = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'suggestions-edit' })

  const attrs = new Y.Attributions()
  const suggestionAM = Y.createAttributionManagerFromDiff(doc, suggestionDoc, {
    attrs
  })
  suggestionAM.suggestionMode = false

  const suggestionModeAM = Y.createAttributionManagerFromDiff(
    doc,
    suggestionModeDoc,
    { attrs }
  )
  suggestionModeAM.suggestionMode = true

  // Sync suggestion docs
  setupTwoWaySync(suggestionDoc, suggestionModeDoc)

  const viewA = createPMView(doc.get('prosemirror'), undefined, viewOpts)
  const viewSuggestion = createPMView(
    suggestionDoc.get('prosemirror'),
    suggestionAM,
    viewOpts
  )
  const viewSuggestionMode = createPMView(
    suggestionModeDoc.get('prosemirror'),
    suggestionModeAM,
    viewOpts
  )

  if (baseContent) {
    doc.get('prosemirror').applyDelta(
      delta
        .create()
        .insert([delta.create('paragraph', {}, baseContent)])
        .done()
    )
  }

  return {
    doc,
    suggestionDoc,
    suggestionModeDoc,
    attrs,
    suggestionAM,
    suggestionModeAM,
    viewA,
    viewSuggestion,
    viewSuggestionMode
  }
}

/** Insertion mark as it appears in PM doc JSON */
const insertionMark = {
  type: 'y-attributed-insert',
  attrs: { userIds: [], timestamp: null }
}
/** Deletion mark as it appears in PM doc JSON */
const deletionMark = {
  type: 'y-attributed-delete',
  attrs: { userIds: [], timestamp: null }
}

// === Tests ===

/**
 * Content sync + marks: base doc content flows to suggestion views without marks,
 * suggestion mode edits are isolated from base and show insertion marks in View Suggestions.
 */
export const testSuggestionSyncAndMarks = async () => {
  const { viewA, viewSuggestion, viewSuggestionMode } = createSuggestionSetup({ baseContent: 'hello' })
  const helloDoc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }
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
  await safeDispatch(
    viewSuggestionMode,
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
      }
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
export const testSequentialTypingMarks = async () => {
  const { viewSuggestion, viewSuggestionMode } = createSuggestionSetup({
    baseContent: 'hello'
  })
  // Type 'a' then 'b' as separate dispatches (like real typing)
  await safeDispatch(viewSuggestionMode, viewSuggestionMode.state.tr.insertText('a', 6))
  await safeDispatch(viewSuggestionMode, viewSuggestionMode.state.tr.insertText('b', 7))
  const abDoc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'hello' },
          { type: 'text', text: 'ab', marks: [insertionMark] }
        ]
      }
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
export const testBlockInsertionMarks = async () => {
  const { viewA, viewSuggestion, viewSuggestionMode } = createSuggestionSetup({ baseContent: 'hello' })
  // Insert a new paragraph with text at the end of the document (before trailing empty paragraph)
  const { tr } = viewSuggestionMode.state
  const insertPos = tr.doc.content.size // before the last empty paragraph's close
  await safeDispatch(
    viewSuggestionMode,
    tr.insert(
      insertPos,
      schema.nodes.paragraph.create(null, schema.text('new block'))
    )
  )
  const helloDoc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }
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
        content: [{ type: 'text', text: 'new block', marks: [insertionMark] }]
      }
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
 * Inline image insertion: inserting an image node in suggestion mode
 * should show insertion marks on the image.
 */
export const testImageInsertionMarks = async () => {
  const { viewA, viewSuggestion, viewSuggestionMode } = createSuggestionSetup({ baseContent: 'hello' })
  // Insert an image after "hello"
  await safeDispatch(
    viewSuggestionMode,
    viewSuggestionMode.state.tr.insert(
      6,
      schema.nodes.image.create({ src: 'test.png', alt: 'test' })
    )
  )
  const helloDoc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }
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
      }
    ]
  }
  assertDocJSON(
    viewSuggestion.state.doc,
    expectedDoc,
    'View Suggestions: image has insertion mark'
  )
  assertDocJSON(
    viewSuggestionMode.state.doc,
    expectedDoc,
    'Suggestion Mode: image has insertion mark'
  )
}

// === PM Schema validation tests ===
// Verify that addNodeMark works for the node types we care about.

/**
 * Schema: paragraph in doc can have an insertion node mark (doc allows attribution marks).
 */
export const testSchemaParaInDocNodeMark = () => {
  const state = EditorState.create({
    schema,
    doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('test')])])
  })
  const tr = state.tr
  const mark = schema.marks['y-attributed-insert'].create({
    userIds: [],
    timestamp: null
  })
  // pos 0 = the paragraph
  tr.addNodeMark(0, mark)
  t.assert(
    tr.doc.firstChild?.marks.some(
      (m) => m.type.name === 'y-attributed-insert'
    ),
    'paragraph in doc has insertion mark'
  )
}

/**
 * Schema: paragraph in blockquote can have an insertion node mark.
 */
export const testSchemaParaInBlockquoteNodeMark = () => {
  const state = EditorState.create({
    schema,
    doc: schema.node('doc', null, [
      schema.node('blockquote', null, [
        schema.node('paragraph', null, [schema.text('quoted')])
      ])
    ])
  })
  const tr = state.tr
  const mark = schema.marks['y-attributed-insert'].create({
    userIds: [],
    timestamp: null
  })
  // pos 1 = the paragraph inside the blockquote
  tr.addNodeMark(1, mark)
  const bq = tr.doc.firstChild
  t.assert(bq?.type.name === 'blockquote', 'first child is blockquote')
  const para = bq?.firstChild
  t.assert(
    para?.marks.some((m) => m.type.name === 'y-attributed-insert'),
    'paragraph in blockquote has insertion mark'
  )
}

/**
 * Schema: image in paragraph can have an insertion node mark.
 */
export const testSchemaImageInParaNodeMark = () => {
  const state = EditorState.create({
    schema,
    doc: schema.node('doc', null, [schema.node('paragraph')])
  })
  const tr = state.tr
  // Insert image into the paragraph
  tr.insert(1, schema.nodes.image.create({ src: 'test.png' }))
  const mark = schema.marks['y-attributed-insert'].create({
    userIds: [],
    timestamp: null
  })
  // pos 1 = the image node
  tr.addNodeMark(1, mark)
  const img = tr.doc.firstChild?.firstChild
  t.assert(img?.type.name === 'image', 'first inline child is image')
  t.assert(
    img?.marks.some((m) => m.type.name === 'y-attributed-insert'),
    'image in paragraph has insertion mark'
  )
}

export const testDeletionOfSuggestedContent = async () => {
  const { viewA, viewSuggestion, viewSuggestionMode, suggestionModeDoc, doc, suggestionModeAM } = createSuggestionSetup({ baseContent: 'hello' })

  await t.groupAsync('insert suggestion', async () => {
    // Insert a new paragraph with text at the end of the document (before trailing empty paragraph)
    const { tr } = viewSuggestionMode.state
    const insertPos = tr.doc.content.size // before the last empty paragraph's close
    await safeDispatch(
      viewSuggestionMode,
      tr.insert(
        insertPos,
        schema.nodes.paragraph.create(null, schema.text('new block'))
      )
    )
    const helloDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }
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
          content: [{ type: 'text', text: 'new block', marks: [insertionMark] }]
        }
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
  await t.groupAsync('delete suggested content', async () => {
    const { tr } = viewSuggestionMode.state
    const deletePos = tr.doc.content.size - 3
    // delete 'c'
    await safeDispatch(
      viewSuggestionMode,
      tr.delete(deletePos, deletePos + 1)
    )
    const expectedDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
        {
          type: 'paragraph',
          marks: [insertionMark],
          content: [{ type: 'text', text: 'new blok', marks: [insertionMark] }]
        }
      ]
    }
    console.log({
      ydocSuggestionState: suggestionModeDoc.get('prosemirror').toDeltaDeep(suggestionModeAM).toJSON()
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

export const testDeleteSuggustion = async () => {
  const { viewA, viewSuggestion, viewSuggestionMode } = createSuggestionSetup({ baseContent: 'hello' })
  await t.groupAsync('populate content', async () => {
    const tr = viewA.state.tr
    // Replace doc content with blockquote > paragraph
    tr.replaceWith(
      0,
      tr.doc.content.size,
      schema.nodes.paragraph.create(null, schema.text('hello world'))
    )
    await safeDispatch(viewA, tr)
  })
  await t.groupAsync('suggest delete', async () => {
    // Insert a new paragraph with text at the end of the document (before trailing empty paragraph)
    const tr = viewSuggestionMode.state.tr
    // delete 'hello'
    await safeDispatch(viewSuggestionMode, tr.delete(1, 6))
    const baseDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] }
      ]
    }
    assertDocJSON(
      viewA.state.doc,
      baseDoc,
      'Client A unchanged'
    )
    const expectedDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hello', marks: [deletionMark] }, { type: 'text', text: ' world' }] }
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

/**
 * Enter key (split block): pressing Enter in the middle of a paragraph in
 * suggestion mode should split the paragraph into two. The base doc stays
 * unchanged, and the suggestion views should show the new paragraph with
 * insertion marks.
 */
export const testEnterInSuggestionMode = async () => {
  const { viewA, viewSuggestion, viewSuggestionMode } = createSuggestionSetup({
    baseContent: 'hello'
  })
  const helloDoc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }
    ]
  }
  // Press Enter after "hel" (position 4 = after 'l' in "hel|lo")
  const { tr } = viewSuggestionMode.state
  await safeDispatch(viewSuggestionMode, tr.split(4))
  // Base doc should stay unchanged
  assertDocJSON(viewA.state.doc, helloDoc, 'Client A unchanged after Enter')
  const expectedSuggestionDoc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'hel' },
          { type: 'text', text: 'lo', marks: [deletionMark] }
        ]
      },
      {
        type: 'paragraph',
        marks: [insertionMark],
        content: [{ type: 'text', text: 'lo', marks: [insertionMark] }]
      }
    ]
  }
  assertDocJSON(
    viewSuggestion.state.doc,
    expectedSuggestionDoc,
    'View Suggestions: split paragraph shows insertion mark on new block'
  )
  assertDocJSON(
    viewSuggestionMode.state.doc,
    expectedSuggestionDoc,
    'Suggestion Mode: split paragraph shows insertion mark on new block'
  )
}

/**
 * Backspace merge (join blocks): pressing Backspace at the start of a paragraph
 * in suggestion mode should merge it with the previous paragraph. The base doc
 * stays unchanged, and the suggestion views should show the merged paragraph.
 */
export const testBackspaceJoinInSuggestionMode = async () => {
  const { doc, suggestionDoc, viewA, viewSuggestion, viewSuggestionMode } = createSuggestionSetup()
  // Set up two paragraphs in the base doc: "hel" and "lo"
  doc.get('prosemirror').applyDelta(
    delta.create()
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
      { type: 'paragraph', content: [{ type: 'text', text: 'lo' }] }
    ]
  }
  assertDocJSON(viewA.state.doc, twoParaDoc, 'Base doc has two paragraphs')
  assertDocJSON(
    viewSuggestionMode.state.doc,
    twoParaDoc,
    'Suggestion mode starts with two paragraphs'
  )
  // Backspace at start of second paragraph → join at the boundary (pos 5)
  // doc structure: <doc><p>hel</p><p>lo</p></doc>
  //                0    1  4  5   6 8  9
  // join depth 1 at pos 5 (between </p> and <p>)
  const { tr } = viewSuggestionMode.state
  await safeDispatch(viewSuggestionMode, tr.join(5))
  // Base doc should stay unchanged
  assertDocJSON(
    viewA.state.doc,
    twoParaDoc,
    'Client A unchanged after Backspace join'
  )
  const expectedSuggestionDoc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'hel'
          },
          {
            type: 'text',
            marks: [insertionMark],
            text: 'lo'
          }
        ]
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'lo',
            marks: [deletionMark]
          }
        ],
        marks: [deletionMark]
      }
    ]
  }
  assertDocJSON(
    viewSuggestionMode.state.doc,
    expectedSuggestionDoc,
    'Suggestion Mode: merged paragraph after join'
  )
  console.log(suggestionDoc.get('prosemirror').toJSON())
  assertDocJSON(
    viewSuggestion.state.doc,
    expectedSuggestionDoc,
    'View Suggestions: merged paragraph after join'
  )
}

export const testReconfigureAfterDeletion = async () => {
  const { viewA, viewSuggestion, viewSuggestionMode, doc } = createSuggestionSetup({ baseContent: 'hello' })
  await t.groupAsync('populate content', async () => {
    const tr = viewA.state.tr
    // Replace doc content with blockquote > paragraph
    tr.replaceWith(
      0,
      tr.doc.content.size,
      schema.nodes.paragraph.create(null, schema.text('hello world'))
    )
    await safeDispatch(viewA, tr)
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
      { type: 'paragraph', content: [{ type: 'text', text: 'he' }, { type: 'text', text: 'llo', marks: [deletionMark] }, { type: 'text', text: ' world' }, { type: 'text', text: '!', marks: [insertionMark] }] }
    ]
  }
  await t.groupAsync('suggest delete', async () => {
    // Insert a new paragraph with text at the end of the document (before trailing empty paragraph)
    const tr = viewSuggestionMode.state.tr
    // delete 'hello', append '!'
    await safeDispatch(viewSuggestionMode, tr.delete(3, 6).insert(9, schema.text('!')))
    assertDocJSON(
      viewA.state.doc,
      baseDoc,
      'Client A unchanged'
    )
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
    YPM.configureYProsemirror({ ytype: doc.get('prosemirror'), attributionManager: Y.noAttributionsManager })(viewSuggestionMode.state, viewSuggestionMode.dispatch)
    assertDocJSON(
      viewSuggestionMode.state.doc,
      baseDoc,
      'suggestion mode doc reconfigured after deletion'
    )
    assertDocJSON(
      viewSuggestion.state.doc,
      expectedSuggestionDoc,
      'suggestion doc didn\'t change after reconf of other editor'
    )
  })
}

export const testReconfigureAfterDeletion2 = async () => {
  const { viewA, viewSuggestionMode, suggestionModeDoc, doc, suggestionModeAM, suggestionDoc, suggestionAM } = createSuggestionSetup({ baseContent: 'hello' })
  await t.groupAsync('populate content', async () => {
    const tr = viewA.state.tr
    // Replace doc content with blockquote > paragraph
    tr.replaceWith(
      0,
      tr.doc.content.size,
      schema.nodes.paragraph.create(null, schema.text('abc abc abc'))
    )
    await safeDispatch(viewA, tr)
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
  await t.groupAsync('suggest delete', async () => {
    const tr = viewSuggestionMode.state.tr
    await safeDispatch(viewSuggestionMode, tr.insert(8, schema.text('!')).delete(6, 8).insert(4, schema.text('!')).delete(2, 4))
    assertDocJSON(
      viewA.state.doc,
      baseDoc,
      'Client A unchanged'
    )
    assertDocJSON(
      viewSuggestionMode.state.doc,
      expectedSuggestionDoc,
      'Suggestion Mode: new paragraph node and text have insertion marks'
    )
    // // there's an issue with diffAttributionManager - it renders the deleted paragraph as a
    // // suggested delete
    // assertDocJSON(
    //   viewSuggestion.state.doc,
    //   expectedSuggestionDoc,
    //   'Suggestion doc: new paragraph node and text have insertion marks'
    // )
    console.log('suggestionDocContent', suggestionDoc.get('prosemirror').toDeltaDeep(suggestionAM).toJSON())
    console.log('suggestionModeDocContent', suggestionModeDoc.get('prosemirror').toDeltaDeep(suggestionModeAM).toJSON())
    // assertDocJSON(
    //   viewSuggestion.state.doc,
    //   expectedSuggestionDoc,
    //   'View Suggestions: new paragraph node and text have insertion marks'
    // )
  })
  t.group('reconfigure', () => {
    YPM.configureYProsemirror({ ytype: doc.get('prosemirror'), attributionManager: Y.noAttributionsManager })(viewSuggestionMode.state, viewSuggestionMode.dispatch)
    assertDocJSON(
      viewSuggestionMode.state.doc,
      baseDoc,
      'suggestion mode doc reconfigured after deletion'
    )
    // console.log('suggestionDocContent', suggestionDoc.get('prosemirror').toDeltaDeep(suggestionAM).toJSON())
    // assertDocJSON(
    //   viewSuggestion.state.doc,
    //   expectedSuggestionDoc,
    //   'suggestion doc didn\'t change after reconf of other editor'
    // )
  })
}

/**
 * Two users collaborating in suggestion mode:
 *   1. Both start with shared base content "12345".
 *   2. user1 deletes "234" in the suggestion doc; both users see "1" + strike("234") + "5".
 *   3. user1 inserts "xyz" between "2" and "3" (i.e. between the deletion-marked "2" and "3");
 *      both users see "1" + strike("2") + insert("xyz") + strike("34") + "5".
 *   4. The base doc is never modified (we are in suggestion mode the whole time).
 */
export const testSuggestInsertIntoDeletion = async () => {
  // user1 brings the full setup (base doc + suggestion view + suggestion-mode editor).
  const setup1 = createSuggestionSetup({ baseContent: '12345' })
  // user2 has their own suggestion-mode doc that syncs with user1's via two-way sync.
  // The base doc is shared via the AttributionManager's internal prevDoc->nextDoc flow.
  const suggestionModeDoc2 = new Y.Doc({
    isSuggestionDoc: true,
    gc: false,
    guid: 'suggestions-edit'
  })
  setupTwoWaySync(setup1.suggestionModeDoc, suggestionModeDoc2)

  // user2's own AttributionManager - prevDoc is the same shared base doc.
  // Fresh Attributions: each AM tracks its own attribution metadata from the diff.
  const suggestionModeAM2 = Y.createAttributionManagerFromDiff(
    setup1.doc,
    suggestionModeDoc2,
    { attrs: new Y.Attributions() }
  )
  suggestionModeAM2.suggestionMode = true

  const viewSuggestionMode2 = createPMView(
    suggestionModeDoc2.get('prosemirror'),
    suggestionModeAM2
  )

  const initDoc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: '12345' }] }
    ]
  }
  // Allow init sync to settle for both users.
  await promise.wait(1)

  await t.groupAsync('initial sync', async () => {
    assertDocJSON(setup1.viewA.state.doc, initDoc, 'Base doc has 12345')
    assertDocJSON(
      setup1.viewSuggestionMode.state.doc,
      initDoc,
      'user1 suggestion-mode view has 12345 (no marks)'
    )
    assertDocJSON(
      viewSuggestionMode2.state.doc,
      initDoc,
      'user2 suggestion-mode view has 12345 (no marks)'
    )
    assertDocJSON(
      setup1.viewSuggestion.state.doc,
      initDoc,
      'View Suggestions has 12345 (no marks)'
    )
  })

  // Expected after deleting "234": rendered view re-injects the deleted run with deletion marks.
  const afterDeleteDoc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '1' },
          { type: 'text', text: '234', marks: [deletionMark] },
          { type: 'text', text: '5' }
        ]
      }
    ]
  }

  await t.groupAsync('user1 suggests deleting "234"', async () => {
    // <p>12345</p>: pos 1=before "1", 2=between "1"&"2", 3=between "2"&"3",
    // 4=between "3"&"4", 5=between "4"&"5", 6=after "5". delete("234") = (2, 5).
    await safeDispatch(
      setup1.viewSuggestionMode,
      setup1.viewSuggestionMode.state.tr.delete(2, 5)
    )
    // Wait for setupTwoWaySync to propagate the update to user2.
    await promise.wait(1)

    assertDocJSON(
      setup1.viewA.state.doc,
      initDoc,
      'Base doc untouched - we are in suggestion mode'
    )
    assertDocJSON(
      setup1.viewSuggestionMode.state.doc,
      afterDeleteDoc,
      'user1 sees "234" struck through'
    )
    assertDocJSON(
      viewSuggestionMode2.state.doc,
      afterDeleteDoc,
      'user2 sees "234" struck through after sync'
    )
    assertDocJSON(
      setup1.viewSuggestion.state.doc,
      afterDeleteDoc,
      'View Suggestions sees "234" struck through'
    )
  })

  // Expected after inserting "xyz" between the deletion-marked "2" and "3":
  //   "1" + strike("2") + insert("xyz") + strike("34") + "5"
  const afterInsertDoc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '1' },
          { type: 'text', text: '2', marks: [deletionMark] },
          { type: 'text', text: 'xyz', marks: [insertionMark] },
          { type: 'text', text: '34', marks: [deletionMark] },
          { type: 'text', text: '5' }
        ]
      }
    ]
  }

  await t.groupAsync('user1 suggests inserting "xyz" between "2" and "3"', async () => {
    // In the rendered suggestion view ('1'+strike('234')+'5'), pos 3 sits
    // between the deletion-marked "2" and "3".
    await safeDispatch(
      setup1.viewSuggestionMode,
      setup1.viewSuggestionMode.state.tr.insertText('xyz', 3)
    )
    // Wait for sync to propagate to user2.
    await promise.wait(1)

    assertDocJSON(
      setup1.viewA.state.doc,
      initDoc,
      'Base doc still untouched after insert'
    )
    assertDocJSON(
      setup1.viewSuggestionMode.state.doc,
      afterInsertDoc,
      'user1 sees inserted "xyz" between deletion-marked "2" and "3"'
    )
    assertDocJSON(
      viewSuggestionMode2.state.doc,
      afterInsertDoc,
      'user2 sees the same after sync'
    )
    assertDocJSON(
      setup1.viewSuggestion.state.doc,
      afterInsertDoc,
      'View Suggestions sees the same'
    )
  })
}

/**
 * Regression: deleting a multi-character text run in "view suggestions" mode
 * (suggestionMode = false) throws `[y/prosemirror]: delete operation is out
 * of bounds` from `deltaToPSteps` in sync-utils.js, leaving the originating
 * editor in a state inconsistent with peers.
 *
 * Discovered by the suggestion-simulation fuzz harness with seed=2772033825
 * on op #0:
 *   `{ user: viewSuggestion, name: 'opDeleteRange', from: 3, to: 23 }`
 *
 * Repro flow (single op, no concurrent edits):
 *   1. Base doc seeded with `<p>lorem ipsum dolor sit amet</p>` (size 28).
 *   2. The view-suggestions user dispatches `tr.delete(3, 23)`, deleting the
 *      run `rem ipsum dolor sit ` (20 inline chars).
 *   3. PM applies the delete locally, but the sync-plugin's PM->Y diff/apply
 *      step (sync-utils.js:302) walks past the end of the textblock children
 *      and throws "delete operation is out of bounds".
 *   4. Because the throw happens *after* PM updated its own state, the
 *      view-suggestions editor's PM view shows the bare deleted text
 *      ("loamet", no marks) while the suggestion-mode peer still sees the
 *      run as a suggested deletion. All three views (base, view-suggestions,
 *      suggestion-mode) end up in mutually inconsistent states.
 *
 * Expected behavior: a view-suggestions delete should propagate to the base
 * doc (since `suggestionMode = false`); all three views should converge to
 * `<p>loamet</p>` with no attribution marks. The base doc, suggestionDoc,
 * and suggestionModeDoc should all agree.
 */
/**
 * Minimal reduction of seed=2562536263 from
 * `testRepeatGeneratingSuggestionEdits` in suggestion-simulation.test.js.
 *
 * Two view-suggestions users share synced suggestion docs over the same
 * base doc, mirroring the simulation cohort's two-of-each-mode layout
 * (each user gets their own suggestionDoc; the docs sync peer-to-peer).
 * One user dispatches a single `tr.split` at position 21 of
 * "lorem ipsum dolor sit amet" - one PM transaction, no other ops.
 *
 * Expected: both view-suggestions users converge on the same document.
 * Observed: the user who initiated the split has their own view reverted
 * to the pre-split content, while their peer correctly shows the split.
 *
 * Found by greedy delta-debug reduction (originally 26 ops -> 1 op).
 */
export const testTwoViewSuggestionsUsersDivergeOnSplit = async () => {
  const baseDoc = new Y.Doc({ gc: false, guid: 'base' })
  const suggDocA = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'sugg-a' })
  const suggDocB = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'sugg-b' })
  setupTwoWaySync(suggDocA, suggDocB)

  const attrs = new Y.Attributions()
  const amA = Y.createAttributionManagerFromDiff(baseDoc, suggDocA, { attrs })
  amA.suggestionMode = false
  const amB = Y.createAttributionManagerFromDiff(baseDoc, suggDocB, { attrs })
  amB.suggestionMode = false

  const viewA = createPMView(suggDocA.get('prosemirror'), amA)
  const viewB = createPMView(suggDocB.get('prosemirror'), amB)

  // Seed base doc with the simulation's starter content.
  baseDoc.get('prosemirror').applyDelta(
    delta.create()
      .insert([delta.create('paragraph', {}, 'lorem ipsum dolor sit amet')])
      .done()
  )
  for (let i = 0; i < 10; i++) await promise.wait(1)

  // Sanity: both views see the seed.
  const seedDoc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'lorem ipsum dolor sit amet' }] }
    ]
  }
  assertDocJSON(viewA.state.doc, seedDoc, 'viewA sees seeded content')
  assertDocJSON(viewB.state.doc, seedDoc, 'viewB sees seeded content')

  // The AttributionManager 'change' listener can throw inside
  // `view.dispatch` (separate bug downstream of `deltaToPSteps`).
  // Swallow it - the divergence we care about manifests regardless.
  try {
    // viewB splits the paragraph at position 21 (between 'i' and 't' of "sit").
    await safeDispatch(viewB, viewB.state.tr.split(21))
  } catch (_) { /* swallow downstream throw */ }
  for (let i = 0; i < 20; i++) {
    try { await promise.wait(1) } catch (_) { /* swallow */ }
  }

  // Both view-suggestions users must converge.
  assertDocJSON(
    viewA.state.doc,
    JSON.parse(JSON.stringify(viewB.state.doc.toJSON())),
    'view-suggestions peers agree on doc state after one of them splits a block'
  )
}

/**
 * Two view-suggestions peers and one suggestion-mode peer share a base doc
 * and a chain of synced suggestion docs. After a four-op interleave - a
 * suggestion-mode insert/format around a view-suggestions insert/delete -
 * the two view-suggestions peers must render the same document.
 *
 * Observed: viewS1 (the user who issued the inserts) sees "qw" with only
 * `[strong, y-attributed-insert]`, while its peer viewS2 sees "qw" with
 * `[strong, y-attributed-insert, y-attributed-format(strong)]` - the format
 * attribution leaks onto the base-doc text on viewS2 only.
 *
 * Found by greedy delta-debug reduction of seed=2941783507 from
 * `testSimLongRunningFuzz` (originally 100 ops -> 4 ops, cohort 6 -> 3).
 */
export const testTwoViewSuggestionsUsersDivergeOnFormatAcrossInsert = async () => {
  const baseDoc = new Y.Doc({ gc: false, guid: 'base' })
  const suggDocS1 = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'sugg-s1' })
  const suggDocS2 = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'sugg-s2' })
  const suggDocM = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'sugg-m' })
  // Linear chain - applyUpdate is idempotent under state-vector, so this
  // propagates transitively.
  setupTwoWaySync(suggDocS1, suggDocS2)
  setupTwoWaySync(suggDocS2, suggDocM)

  const attrs = new Y.Attributions()
  const amS1 = Y.createAttributionManagerFromDiff(baseDoc, suggDocS1, { attrs })
  amS1.suggestionMode = false
  const amS2 = Y.createAttributionManagerFromDiff(baseDoc, suggDocS2, { attrs })
  amS2.suggestionMode = false
  const amM = Y.createAttributionManagerFromDiff(baseDoc, suggDocM, { attrs })
  amM.suggestionMode = true

  const viewS1 = createPMView(suggDocS1.get('prosemirror'), amS1)
  const viewS2 = createPMView(suggDocS2.get('prosemirror'), amS2)
  const viewM = createPMView(suggDocM.get('prosemirror'), amM)

  baseDoc.get('prosemirror').applyDelta(
    delta.create()
      .insert([delta.create('paragraph', {}, 'lorem ipsum dolor sit amet')])
      .done()
  )
  for (let i = 0; i < 10; i++) await promise.wait(1)

  // Helpers that swallow any downstream throw from in-flight reconciliation.
  const dispatch = async (/** @type {EditorView} */ view, /** @type {import('prosemirror-state').Transaction} */ tr) => {
    try { await safeDispatch(view, tr) } catch (_) { /* swallow */ }
  }

  // 1. suggestion-mode user inserts a new top paragraph (suggested insertion).
  await dispatch(viewM, viewM.state.tr.insert(0, schema.nodes.paragraph.create(null, schema.text('kjqj'))))
  // 2. view-suggestions user S1 inserts plain text inside the second paragraph
  //    (this commits to the base doc since viewS1.suggestionMode = false).
  await dispatch(viewS1, viewS1.state.tr.insertText('qwlff', 6))
  // 3. suggestion-mode user adds `strong` across the boundary - covering its
  //    own suggested "kjqj" plus the start of viewS1's freshly inserted "qw"
  //    in the base paragraph (positions 1..9 in viewM's doc).
  await dispatch(viewM, viewM.state.tr.addMark(1, 9, schema.marks.strong.create()))
  // 4. viewS1 deletes a range that straddles its own insertion and the
  //    seeded base text.
  await dispatch(viewS1, viewS1.state.tr.delete(9, 14))

  // Drain in-flight reconciliation passes.
  for (let i = 0; i < 20; i++) {
    try { await promise.wait(1) } catch (_) { /* swallow */ }
  }

  // The two view-suggestions peers must agree.
  assertDocJSON(
    viewS1.state.doc,
    JSON.parse(JSON.stringify(viewS2.state.doc.toJSON())),
    'view-suggestions peers agree after suggestion-mode format spans the insert'
  )
}

/**
 * Cohort-replay regression test for a residual sync-pipeline bug.
 *
 * Replays a captured 30-op trace from `testRepeatGeneratingSuggestionEdits`
 * (seed=1493604710) against the standard 6-user cohort (2 each of
 * no-suggestions / view-suggestions / suggestion-mode), then asserts that
 * peers in each mode converge to the same PM doc.
 *
 * Symptom: the underlying Y state and `ytype.toDeltaDeep(am)` outputs are
 * bit-identical across all peers, but the PM views have stale paragraph
 * splits and stray `y-attributed-*` marks left over from intermediate
 * states. The bug is in the y-prosemirror reconcile pipeline (lib0/delta
 * `diff` + `deltaToPSteps` round-trip) failing to drive each peer's PM
 * doc to the canonical AM render.
 *
 * Important: ops are dispatched **fully synchronously**, with no
 * `await promise.wait(1)` between them. Everything in y-prosemirror,
 * `@y/y`, and lib0 is sync; the only async sources are
 * prosemirror-view's DOM-observer / selection-sync setTimeout(20)s
 * driven by jsdom's MutationObserver. Yielding to the event loop
 * between ops lets those timers fire interleaved with the trace and
 * was the entire source of the test's earlier flakiness (~70% / ~30%).
 * With no awaits the divergence reproduces deterministically.
 */
export const testCohortReplayConvergesAcrossModes = () => {
  /** @typedef {{ user: number, op: string, args: any }} TracedOp */
  const TRACE = /** @type {Array<TracedOp>} */ ([
    { user: 0, op: 'insertPlainText', args: { pos: 25, text: 'ows' } },
    { user: 1, op: 'insertPlainText', args: { pos: 5, text: 'thmb' } },
    { user: 2, op: 'addMark', args: { from: 17, to: 26, markName: 'em' } },
    { user: 2, op: 'splitBlock', args: { pos: 24 } },
    { user: 5, op: 'splitBlock', args: { pos: 20 } },
    { user: 2, op: 'removeMark', args: { from: 14, to: 20, markName: 'em' } },
    { user: 3, op: 'splitBlock', args: { pos: 42 } },
    { user: 1, op: 'addMark', args: { from: 2, to: 30, markName: 'em' } },
    { user: 3, op: 'insertText', args: { pos: 40, text: 'ygi' } },
    { user: 1, op: 'removeMark', args: { from: 19, to: 33, markName: 'strong' } },
    { user: 0, op: 'insertParagraph', args: { pos: 40, text: 'xm' } },
    { user: 1, op: 'insertPlainText', args: { pos: 31, text: 'worjt' } },
    { user: 1, op: 'addMark', args: { from: 4, to: 43, markName: 'code' } },
    { user: 5, op: 'insertParagraph', args: { pos: 51, text: 'j' } },
    { user: 3, op: 'insertPlainText', args: { pos: 43, text: 'yx' } },
    { user: 0, op: 'insertPlainText', args: { pos: 47, text: 'kb' } },
    { user: 3, op: 'insertPlainText', args: { pos: 9, text: 'm' } },
    { user: 5, op: 'insertParagraph', args: { pos: 71, text: 'xlon' } },
    { user: 0, op: 'addMark', args: { from: 11, to: 43, markName: 'strong' } },
    { user: 2, op: 'insertPlainText', args: { pos: 52, text: 'wmdx' } },
    { user: 2, op: 'removeMark', args: { from: 15, to: 56, markName: 'em' } },
    { user: 4, op: 'insertPlainText', args: { pos: 70, text: 'r' } },
    { user: 5, op: 'addMark', args: { from: 23, to: 27, markName: 'em' } },
    { user: 1, op: 'addMark', args: { from: 16, to: 19, markName: 'code' } },
    { user: 5, op: 'removeMark', args: { from: 37, to: 46, markName: 'strong' } },
    { user: 4, op: 'insertText', args: { pos: 83, text: 'cog' } },
    { user: 0, op: 'insertText', args: { pos: 6, text: 'dwox' } },
    { user: 3, op: 'insertText', args: { pos: 23, text: 'beos' } },
    { user: 2, op: 'insertPlainText', args: { pos: 43, text: 'xn' } },
    { user: 4, op: 'removeMark', args: { from: 11, to: 106, markName: 'strong' } }
  ])

  /** @typedef {'no-suggestions' | 'view-suggestions' | 'suggestion-mode'} Mode */
  const COHORT = /** @type {Array<Mode>} */ ([
    'no-suggestions', 'no-suggestions',
    'view-suggestions', 'view-suggestions',
    'suggestion-mode', 'suggestion-mode'
  ])

  const baseDoc = new Y.Doc({ gc: false, guid: 'base' })
  const attrs = new Y.Attributions()
  const docs = COHORT.map((mode, i) => mode === 'no-suggestions'
    ? null
    : new Y.Doc({ isSuggestionDoc: true, gc: false, guid: `sugg-${i}` }))
  // Chain-sync suggestion docs.
  const suggDocs = docs.filter(d => d !== null)
  for (let i = 0; i + 1 < suggDocs.length; i++) {
    setupTwoWaySync(/** @type {Y.Doc} */ (suggDocs[i]), /** @type {Y.Doc} */ (suggDocs[i + 1]))
  }
  /** @type {Array<{mode: Mode, view: EditorView, am: any}>} */
  const users = COHORT.map((mode, i) => {
    if (mode === 'no-suggestions') {
      return {
        mode,
        view: createPMView(baseDoc.get('prosemirror'), Y.noAttributionsManager),
        am: Y.noAttributionsManager
      }
    }
    const am = Y.createAttributionManagerFromDiff(
      baseDoc, /** @type {Y.Doc} */ (docs[i]), { attrs })
    am.suggestionMode = mode === 'suggestion-mode'
    return {
      mode,
      view: createPMView(/** @type {Y.Doc} */ (docs[i]).get('prosemirror'), am),
      am
    }
  })

  baseDoc.get('prosemirror').applyDelta(
    delta.create()
      .insert([delta.create('paragraph', {}, 'lorem ipsum dolor sit amet')])
      .done()
  )

  const apply = (/** @type {{view: EditorView}} */ user, /** @type {TracedOp} */ t) => {
    const { state } = user.view
    const dispatch = (/** @type {import('prosemirror-state').Transaction} */ tr) => {
      try { user.view.dispatch(tr) } catch (_) { /* swallow */ }
    }
    try {
      if (t.op === 'insertText') {
        dispatch(state.tr.insertText(t.args.text, t.args.pos))
      } else if (t.op === 'insertPlainText') {
        const $pos = state.doc.resolve(t.args.pos)
        if (!$pos.parent.isTextblock) return
        dispatch(state.tr.insert(t.args.pos, schema.text(t.args.text)))
      } else if (t.op === 'deleteRange') {
        dispatch(state.tr.delete(t.args.from, t.args.to))
      } else if (t.op === 'addMark') {
        dispatch(state.tr.addMark(t.args.from, t.args.to, schema.marks[t.args.markName].create()))
      } else if (t.op === 'removeMark') {
        dispatch(state.tr.removeMark(t.args.from, t.args.to, schema.marks[t.args.markName]))
      } else if (t.op === 'splitBlock') {
        const $pos = state.doc.resolve(t.args.pos)
        if (!$pos.parent.isTextblock) return
        dispatch(state.tr.split(t.args.pos))
      } else if (t.op === 'insertParagraph') {
        dispatch(state.tr.insert(t.args.pos, schema.nodes.paragraph.create(null, schema.text(t.args.text))))
      }
    } catch (_) { /* schema-invalid edits skip */ }
  }

  // Dispatch every op synchronously - no awaits, no settle. The whole
  // y-prosemirror / @y/y / lib0 stack is fully sync; the moment the
  // last dispatch returns, every cascading observeDeep / AM-change /
  // appendTransaction has finished too.
  for (const op of TRACE) {
    apply(users[op.user], op)
  }

  /** @type {Array<{mode: Mode, idxA: number, idxB: number, jsonA: any, jsonB: any}>} */
  const divergences = []
  /** @type {Map<Mode, Array<{idx: number, view: EditorView}>>} */
  const groups = new Map()
  users.forEach((u, idx) => {
    const arr = groups.get(u.mode) || []
    arr.push({ idx, view: u.view })
    groups.set(u.mode, arr)
  })
  for (const [mode, group] of groups) {
    if (group.length < 2) continue
    const jsonA = JSON.parse(JSON.stringify(group[0].view.state.doc.toJSON()))
    const baseStr = JSON.stringify(jsonA)
    for (let i = 1; i < group.length; i++) {
      const jsonB = JSON.parse(JSON.stringify(group[i].view.state.doc.toJSON()))
      if (JSON.stringify(jsonB) !== baseStr) {
        divergences.push({ mode, idxA: group[0].idx, idxB: group[i].idx, jsonA, jsonB })
      }
    }
  }
  users.forEach(u => u.view.destroy())

  if (divergences.length > 0) {
    const d = divergences[0]
    t.compare(
      d.jsonB,
      d.jsonA,
      `mode=${d.mode} u${d.idxA} vs u${d.idxB} (${divergences.length} divergence(s) total)`
    )
  }
}

export const testViewSuggestionsDeleteOutOfBounds = async () => {
  const { viewA, viewSuggestion, viewSuggestionMode } = createSuggestionSetup({
    baseContent: 'lorem ipsum dolor sit amet'
  })

  // <p>lorem ipsum dolor sit amet</p> ; doc.content.size = 28
  // tr.delete(3, 23) removes 20 inline chars: "rem ipsum dolor sit "
  await safeDispatch(
    viewSuggestion,
    viewSuggestion.state.tr.delete(3, 23)
  )

  const expected = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'loamet' }] }
    ]
  }

  // view-suggestions edits commit to the base doc, so the base view should
  // also see the deletion (no marks).
  assertDocJSON(
    viewA.state.doc,
    expected,
    'Base doc reflects the view-suggestions delete'
  )
  assertDocJSON(
    viewSuggestion.state.doc,
    expected,
    'View Suggestions: post-delete content with no attribution marks'
  )
  assertDocJSON(
    viewSuggestionMode.state.doc,
    expected,
    'Suggestion Mode peer agrees after sync'
  )
}
