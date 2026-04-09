import * as YPM from '@y/prosemirror'
import * as Y from '@y/y'
import * as delta from 'lib0/delta'
import * as t from 'lib0/testing'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { schema, customAttrSchema, customMapAttributionToMark } from './complexSchema.js'

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
  type: 'y-attribution-insertion',
  attrs: { userIds: [], timestamp: null }
}
/** Deletion mark as it appears in PM doc JSON */
const deletionMark = {
  type: 'y-attribution-deletion',
  attrs: { userIds: [], timestamp: null }
}

// === Tests ===

/**
 * Content sync + marks: base doc content flows to suggestion views without marks,
 * suggestion mode edits are isolated from base and show insertion marks in View Suggestions.
 */
export const testSuggestionSyncAndMarks = () => {
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
      }
    ]
  }
  assertDocJSON(
    viewSuggestion.state.doc,
    helloWorldDoc,
    "View Suggestions: ' world' has insertion mark"
  )

  // TODO: "viewSuggestionMode" doc fails
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

  // TODO: RangeError: Maximum call stack size exceeded
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
export const testBlockInsertionMarks = () => {
  const { viewA, viewSuggestion, viewSuggestionMode } = createSuggestionSetup({ baseContent: 'hello' })
  // Insert a new paragraph with text at the end of the document (before trailing empty paragraph)
  const { tr } = viewSuggestionMode.state
  const insertPos = tr.doc.content.size // before the last empty paragraph's close
  viewSuggestionMode.dispatch(
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
        marks: [insertionMark], // TODO: this fails because it's not in output. AddNodeMarkStep never called?
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
export const testImageInsertionMarks = () => {
  const { viewA, viewSuggestion, viewSuggestionMode } = createSuggestionSetup({ baseContent: 'hello' })

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

  // TODO: "viewSuggestionMode" doc fails
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
  const mark = schema.marks['y-attribution-insertion'].create({
    userIds: [],
    timestamp: null
  })
  // pos 0 = the paragraph
  tr.addNodeMark(0, mark)
  t.assert(
    tr.doc.firstChild?.marks.some(
      (m) => m.type.name === 'y-attribution-insertion'
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
  const mark = schema.marks['y-attribution-insertion'].create({
    userIds: [],
    timestamp: null
  })
  // pos 1 = the paragraph inside the blockquote
  tr.addNodeMark(1, mark)
  const bq = tr.doc.firstChild
  t.assert(bq?.type.name === 'blockquote', 'first child is blockquote')
  const para = bq?.firstChild
  t.assert(
    para?.marks.some((m) => m.type.name === 'y-attribution-insertion'),
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
  const mark = schema.marks['y-attribution-insertion'].create({
    userIds: [],
    timestamp: null
  })
  // pos 1 = the image node
  tr.addNodeMark(1, mark)
  const img = tr.doc.firstChild?.firstChild
  t.assert(img?.type.name === 'image', 'first inline child is image')
  t.assert(
    img?.marks.some((m) => m.type.name === 'y-attribution-insertion'),
    'image in paragraph has insertion mark'
  )
}

export const testDeletionOfSuggestedContent = () => {
  const { viewA, viewSuggestion, viewSuggestionMode, suggestionModeDoc, doc, suggestionModeAM } = createSuggestionSetup({ baseContent: 'hello' })

  t.group('insert suggestion', () => {
    // Insert a new paragraph with text at the end of the document (before trailing empty paragraph)
    const { tr } = viewSuggestionMode.state
    const insertPos = tr.doc.content.size // before the last empty paragraph's close
    viewSuggestionMode.dispatch(
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
  t.group('delete suggested content', () => {
    const { tr } = viewSuggestionMode.state
    const deletePos = tr.doc.content.size - 3
    // delete 'c'
    viewSuggestionMode.dispatch(
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

export const testDeleteSuggustion = () => {
  const { viewA, viewSuggestion, viewSuggestionMode } = createSuggestionSetup({ baseContent: 'hello' })
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
// TODO: FAILING - split paragraph insertion mark mismatch (array length mismatch in doc content)
export const testEnterInSuggestionMode = () => {
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
      }
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
 * stays unchanged, and the suggestion views should show the merged paragraph.
 */
// TODO: FAILING - merged paragraph after join mismatch (array length mismatch in doc content)
export const testBackspaceJoinInSuggestionMode = () => {
  const { doc, viewA, viewSuggestion, viewSuggestionMode } =
    createSuggestionSetup()

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
      }
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
 * Delete previously suggested insertion with custom mark names: should actually
 * remove the text (revert the suggestion), not re-insert with deletion marks.
 *
 * BUG: sync-plugin.js:168 hardcodes schema.marks['y-attribution-insertion'].
 * With custom mark names (e.g. 'insertion'), the lookup returns undefined, so
 * the "let it stay deleted" branch is never taken. Instead, suggested text is
 * re-inserted with deletion marks instead of being truly reverted.
 */
// TODO: FAILING - hardcoded 'y-attribution-insertion' lookup in sync-plugin.js:168
export const testCustomAttrSuggestionDeleteReverts = () => {
  const { viewA, viewSuggestion, viewSuggestionMode } = createSuggestionSetup({
    baseContent: 'hello',
    schema: customAttrSchema,
    mapAttributionToMark: customMapAttributionToMark
  })

  const customInsertionMark = {
    type: 'insertion',
    attrs: { userIds: [], timestamp: null }
  }

  // Type " world" in suggestion mode (this gets insertion mark)
  viewSuggestionMode.dispatch(
    viewSuggestionMode.state.tr.insertText(' world', 6)
  )

  // Verify the insertion mark was applied
  const afterInsertDoc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'hello' },
          { type: 'text', text: ' world', marks: [customInsertionMark] }
        ]
      }
    ]
  }
  assertDocJSON(
    viewSuggestionMode.state.doc,
    afterInsertDoc,
    'Suggestion Mode: " world" has insertion mark before delete'
  )

  // Now delete " world" in suggestion mode — should revert the suggestion (actually delete)
  viewSuggestionMode.dispatch(
    viewSuggestionMode.state.tr.delete(6, 12)
  )

  const helloDoc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }
    ]
  }

  // Base doc unchanged
  assertDocJSON(viewA.state.doc, helloDoc, 'Client A still has just "hello"')

  // Both suggestion views should show just "hello" — the suggested insertion was reverted
  assertDocJSON(
    viewSuggestionMode.state.doc,
    helloDoc,
    'Suggestion Mode: reverted to just "hello"'
  )
  assertDocJSON(
    viewSuggestion.state.doc,
    helloDoc,
    'View Suggestions: reverted to just "hello"'
  )
}

/**
 * Delete base content with custom mark names: deleting base content in suggestion
 * mode should show only a deletion mark, NOT a spurious modification mark.
 *
 * BUG: sync-plugin.js:203 uses startsWith('y-attribution-') to filter attribution
 * marks from triggering recursive format detection. With custom mark names (e.g.
 * 'deletion'), the AddMarkStep for the deletion mark is NOT filtered, so a
 * modification mark is incorrectly applied on top of the deletion mark.
 */
// TODO: FAILING - hardcoded startsWith('y-attribution-') in sync-plugin.js:203
export const testCustomAttrSuggestionDeleteNoSpuriousFormat = () => {
  const { viewA, viewSuggestion, viewSuggestionMode } = createSuggestionSetup({
    baseContent: 'hello world',
    schema: customAttrSchema,
    mapAttributionToMark: customMapAttributionToMark
  })

  const customDeletionMark = {
    type: 'deletion',
    attrs: { userIds: [], timestamp: null }
  }

  // Delete "hello" in suggestion mode
  viewSuggestionMode.dispatch(
    viewSuggestionMode.state.tr.delete(1, 6)
  )

  const baseDoc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] }
    ]
  }

  // Base doc unchanged
  assertDocJSON(viewA.state.doc, baseDoc, 'Client A unchanged after delete suggestion')

  // "hello" should have ONLY deletion mark, no spurious modification mark
  const expectedDoc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'hello', marks: [customDeletionMark] },
          { type: 'text', text: ' world' }
        ]
      }
    ]
  }

  assertDocJSON(
    viewSuggestionMode.state.doc,
    expectedDoc,
    'Suggestion Mode: "hello" has only deletion mark, no modification'
  )
  assertDocJSON(
    viewSuggestion.state.doc,
    expectedDoc,
    'View Suggestions: "hello" has only deletion mark, no modification'
  )
}

export const testReconfigureAfterDeletion = () => {
  const { viewA, viewSuggestion, viewSuggestionMode, doc } = createSuggestionSetup({ baseContent: 'hello' })
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
      { type: 'paragraph', content: [{ type: 'text', text: 'he' }, { type: 'text', text: 'llo', marks: [deletionMark] }, { type: 'text', text: ' world' }, { type: 'text', text: '!', marks: [insertionMark] }] }
    ]
  }
  t.group('suggest delete', () => {
    // Insert a new paragraph with text at the end of the document (before trailing empty paragraph)
    const tr = viewSuggestionMode.state.tr
    // delete 'hello', append '!'
    viewSuggestionMode.dispatch(tr.delete(3, 6).insert(9, schema.text('!')))
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

export const testReconfigureAfterDeletion2 = () => {
  const { viewA, viewSuggestionMode, suggestionModeDoc, doc, suggestionModeAM, suggestionDoc, suggestionAM } = createSuggestionSetup({ baseContent: 'hello' })
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
    viewSuggestionMode.dispatch(tr.insert(8, schema.text('!')).delete(6, 8).insert(4, schema.text('!')).delete(2, 4))
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
