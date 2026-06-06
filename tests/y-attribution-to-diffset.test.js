/**
 * UNIT tests for the `ydeltaToDiffSet` transform (src/y-attribution-to-diffset.js).
 *
 * Layer: the pure function that turns a Yjs attributed delta into a DiffSet.
 * These tests call `ydeltaToDiffSet` directly (via `getDiffs`) and assert on the
 * returned `Diff[]` — diff TYPE, from/to POSITIONS, reconstructed deleted
 * CONTENT, and ATTRIBUTION authorship. No EditorView, no decoration plugin.
 *
 * Deliberately NOT here (tested one layer up, in
 * suggestion-decoration-plugin.test.js): whether diffs render as the right kind
 * of decoration, that the live doc stays clean, and accept/reject behavior — the
 * transform has no notion of any of those. Multi-view sync / convergence lives in
 * suggestions.test.js.
 */
import * as t from 'lib0/testing'
import * as prng from 'lib0/prng'
import * as Y from '@y/y'
import * as delta from 'lib0/delta'
import { Schema } from 'prosemirror-model'
import { Transform } from 'prosemirror-transform'
import { ydeltaToDiffSet } from '../src/y-attribution-to-diffset.js'
import { buildDiffDecorationSet } from '../src/diff-decorations.js'
import { setupTwoWaySync, createPMView } from './cohort.js'
import { schema, nodes as complexNodes, marks as complexMarks } from './complexSchema.js'

const PM_KEY = 'prosemirror'

/**
 * Schema with list nodes for testing nested list structures.
 */
const listSchema = new Schema({
  nodes: /** @type {any} */ (Object.assign({}, complexNodes, {
    ordered_list: {
      content: 'list_item+',
      group: 'block',
      attrs: { order: { default: 1 } },
      parseDOM: [{ tag: 'ol' }],
      toDOM () { return ['ol', 0] }
    },
    bullet_list: {
      content: 'list_item+',
      group: 'block',
      parseDOM: [{ tag: 'ul' }],
      toDOM () { return ['ul', 0] }
    },
    list_item: {
      content: 'paragraph block*',
      parseDOM: [{ tag: 'li' }],
      toDOM () { return ['li', 0] },
      defining: true
    }
  })),
  marks: complexMarks
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
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

  const editor = createPMView(suggestionModeDoc.get(PM_KEY), suggestionModeAM)

  const d = delta.create()
  for (const text of paragraphs) {
    d.insert([delta.create('paragraph', {}, text)])
  }
  baseDoc.get(PM_KEY).applyDelta(d.done())

  return { baseDoc, suggestionDoc, suggestionModeDoc, am, suggestionModeAM, editor, attrs }
}

/**
 * @param {delta.DeltaAny} initialDelta
 * @param {{ schema?: Schema }} [opts]
 */
const setupWithDelta = (initialDelta, opts = {}) => {
  const s = opts.schema || schema
  const baseDoc = new Y.Doc({ gc: false, guid: 'base' })
  const suggestionDoc = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'suggestions' })
  const suggestionModeDoc = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'suggestions-edit' })

  const attrs = new Y.Attributions()
  const am = Y.createAttributionManagerFromDiff(baseDoc, suggestionDoc, { attrs })
  am.suggestionMode = false

  const suggestionModeAM = Y.createAttributionManagerFromDiff(baseDoc, suggestionModeDoc, { attrs })
  suggestionModeAM.suggestionMode = true

  setupTwoWaySync(suggestionDoc, suggestionModeDoc)

  const editor = createPMView(suggestionModeDoc.get(PM_KEY), suggestionModeAM, { schema: s })

  baseDoc.get(PM_KEY).applyDelta(initialDelta)

  return { baseDoc, suggestionDoc, suggestionModeDoc, am, suggestionModeAM, editor, attrs, schema: s }
}

/**
 * @param {{ suggestionDoc: Y.Doc, am: import('@y/y').DiffAttributionManager }} ctx
 * @param {{ schema?: Schema }} [opts]
 */
const getDiffs = ({ suggestionDoc, am }, opts = {}) => {
  const s = opts.schema || schema
  const cleanView = createPMView(suggestionDoc.get(PM_KEY), undefined, { schema: s })
  const ytype = suggestionDoc.get(PM_KEY)
  const attributedDelta = ytype.toDeltaDeep(am)
  const diffs = ydeltaToDiffSet(attributedDelta, { displayedDoc: cleanView.state.doc, schema: s })
  cleanView.destroy()
  return diffs
}

/**
 * Assert every diff has valid positions within the clean doc and that
 * decorations can be built from them.
 *
 * @param {{ suggestionDoc: Y.Doc, am: import('@y/y').DiffAttributionManager }} ctx
 * @param {{ schema?: Schema }} [opts]
 */
const assertDiffsValid = (ctx, opts = {}) => {
  const s = opts.schema || schema
  const diffs = getDiffs(ctx, opts)
  const cleanView = createPMView(ctx.suggestionDoc.get(PM_KEY), undefined, { schema: s })
  const size = cleanView.state.doc.content.size
  diffs.forEach(d => {
    t.assert(d.from >= 0, `${d.type} from >= 0 (got ${d.from})`)
    t.assert(d.to <= size, `${d.type} to <= doc size (got ${d.to}, size ${size})`)
    t.assert(d.from <= d.to, `${d.type} from <= to`)
  })
  const decoSet = buildDiffDecorationSet(cleanView.state.doc, diffs, s)
  decoSet.find().forEach(d => {
    t.assert(d.spec?.diff != null, 'decoration spec carries its diff')
    t.assert(d.from >= 0 && d.to <= size, `decoration [${d.from},${d.to}] within bounds`)
  })
  cleanView.destroy()
  return diffs
}

const has = (/** @type {any[]} */ diffs, /** @type {string} */ type) => diffs.some(d => d.type === type)

// ---------------------------------------------------------------------------
// Core diff type tests — one per diff type, canonical assertions
// ---------------------------------------------------------------------------

/**
 * @param {t.TestCase} _tc
 */
export const testInlineInsertAttribution = _tc => {
  const { editor, suggestionDoc, am } = setup('hello')
  editor.dispatch(editor.state.tr.insertText(' world', 6))

  const diffs = getDiffs({ suggestionDoc, am })
  const ins = diffs.find(d => d.type === 'inline-insert')
  t.assert(ins != null, 'inline-insert exists')
  if (ins == null) return
  t.assert(ins.from < ins.to, 'non-zero range')
  t.assert(ins.attribution.type === 'added', 'attribution type is added')
}

/**
 * @param {t.TestCase} _tc
 */
export const testInlineDeleteAttribution = _tc => {
  const { editor, suggestionDoc, am } = setup('hello world')
  editor.dispatch(editor.state.tr.delete(6, 12))

  const diffs = getDiffs({ suggestionDoc, am })
  const del = diffs.find(d => d.type === 'inline-delete')
  t.assert(del != null, 'inline-delete exists')
  t.assert(del?.attribution.type === 'removed', 'attribution type is removed')
  t.assert(del?.content != null, 'deleted content captured for ghost')
  t.compare(del?.content?.textBetween(0, del?.content?.size ?? 0), ' world', 'deleted text matches')
}

/**
 * @param {t.TestCase} _tc
 */
export const testBlockDeleteAttribution = _tc => {
  const { editor, suggestionDoc, am } = setup('keep me', 'delete me')

  const para2Start = editor.state.doc.child(0).nodeSize
  const para2 = editor.state.doc.child(1)
  editor.dispatch(editor.state.tr.delete(para2Start, para2Start + para2.nodeSize))

  const diffs = getDiffs({ suggestionDoc, am })
  const del = diffs.find(d => d.type === 'block-delete')
  t.assert(del != null, 'block-delete exists')
  t.assert(del?.attribution.type === 'removed', 'attribution type is removed')
  t.compare(del?.content?.firstChild?.textContent, 'delete me', 'deleted block content captured')
}

/**
 * Splitting a block in suggestion mode (Enter mid-paragraph, then typing in
 * the new block) must NOT render the moved-out tail as a phantom inline-delete.
 *
 * A CRDT cannot move text, so the split is recorded as "delete the tail of the
 * original block" + "insert a new block whose content is that tail (plus any
 * freshly typed text)". `toDeltaDeep(am)` therefore reports the tail twice. The
 * clean displayed doc only shows it once (in the new block), so the delete half
 * is spurious - rendering it strikes through text the user can still see in the
 * green inserted block right after, and makes "add a line" look like "delete the
 * tail and re-insert it merged with the new text". Regression for that bug.
 *
 * @param {t.TestCase} _tc
 */
export const testSplitBlockDoesNotProduceSpuriousDelete = _tc => {
  const { editor, suggestionDoc, am } = setup('First paragraph.', 'Second paragraph with content to edit later.')

  // Cursor before "later." in the second paragraph; press Enter (split), then
  // type into the new block - the canonical Enter-mid-paragraph-then-type flow.
  const secondStart = editor.state.doc.child(0).nodeSize + 1
  const splitOffset = 'Second paragraph with content to edit later.'.indexOf('later.')
  editor.dispatch(editor.state.tr.split(secondStart + splitOffset))

  const doc = editor.state.doc
  let newBlockTextPos = 0
  for (let i = 0; i < doc.childCount - 1; i++) newBlockTextPos += doc.child(i).nodeSize
  newBlockTextPos += 1
  editor.dispatch(editor.state.tr.insertText('X', newBlockTextPos))

  const diffs = getDiffs({ suggestionDoc, am })

  // The split's moved-out tail ("later.") must NOT surface as an inline-delete.
  const spuriousDelete = diffs.find(d => d.type === 'inline-delete')
  t.assert(spuriousDelete == null, 'no spurious inline-delete for the split tail')

  // Exactly one block-insert, holding the new block's actual content
  // ("X" typed + the moved "later."), not a duplicate ghost.
  const inserts = diffs.filter(d => d.type === 'block-insert')
  t.compare(inserts.length, 1, 'exactly one block-insert for the new block')
  t.compare(inserts[0]?.content?.firstChild?.textContent, 'Xlater.', 'block-insert holds the new block content')

  // And the original paragraph must NOT become a block-delete.
  t.assert(!has(diffs, 'block-delete'), 'original paragraph is not block-deleted')
}

/**
 * @param {t.TestCase} _tc
 */
export const testBoldMarkAttribution = _tc => {
  const { editor, suggestionDoc, am } = setup('hello world')
  editor.dispatch(editor.state.tr.addMark(7, 12, schema.marks.strong.create()))

  const diffs = getDiffs({ suggestionDoc, am })
  const upd = diffs.find(d => d.type === 'inline-update')
  t.assert(upd != null, 'inline-update exists for bold')
  t.assert(upd?.attribution.type === 'added', 'attribution type is added')
  t.assert(upd?.attributes?.format?.strong != null, 'attributes contain strong format')
}

/**
 * Removing a mark from pre-formatted base content requires a unique
 * setup (bold text seeded in base, then removed in suggestion mode).
 *
 * @param {t.TestCase} _tc
 */
export const testRemoveMarkAttribution = _tc => {
  const baseDoc = new Y.Doc({ gc: false, guid: 'base' })
  const suggestionDoc = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'suggestions' })
  const suggestionModeDoc = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'suggestions-edit' })

  const attrs = new Y.Attributions()
  const am = Y.createAttributionManagerFromDiff(baseDoc, suggestionDoc, { attrs })
  am.suggestionMode = false
  const suggestionModeAM = Y.createAttributionManagerFromDiff(baseDoc, suggestionModeDoc, { attrs })
  suggestionModeAM.suggestionMode = true
  setupTwoWaySync(suggestionDoc, suggestionModeDoc)

  const editor = createPMView(suggestionModeDoc.get(PM_KEY), suggestionModeAM)

  const d = delta.create()
  d.insert([delta.create('paragraph', {}).insert('bold text', { strong: {} })])
  baseDoc.get(PM_KEY).applyDelta(d.done())

  editor.dispatch(editor.state.tr.removeMark(1, 10, schema.marks.strong))

  const diffs = getDiffs({ suggestionDoc, am })
  t.assert(has(diffs, 'inline-update'), 'has inline-update diff for mark removal')
}

// ---------------------------------------------------------------------------
// Multi-author
// ---------------------------------------------------------------------------

/**
 * @param {t.TestCase} _tc
 */
export const testMultiAuthorAttribution = _tc => {
  const baseDoc = new Y.Doc({ gc: false, guid: 'base' })
  const suggDocA = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'sugg-a' })
  const suggModeDocA = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'sugg-mode-a' })

  const attrs = new Y.Attributions()
  const amA = Y.createAttributionManagerFromDiff(baseDoc, suggDocA, { attrs })
  amA.suggestionMode = false
  const smAMA = Y.createAttributionManagerFromDiff(baseDoc, suggModeDocA, { attrs })
  smAMA.suggestionMode = true
  setupTwoWaySync(suggDocA, suggModeDocA)

  const editorA = createPMView(suggModeDocA.get(PM_KEY), smAMA)

  baseDoc.get(PM_KEY).applyDelta(
    delta.create().insert([delta.create('paragraph', {}, 'shared text')]).done()
  )

  editorA.dispatch(editorA.state.tr.insertText(' from alice', 12))

  const diffs = getDiffs({ suggestionDoc: suggDocA, am: amA })
  const insertDiffs = diffs.filter(d => d.type === 'inline-insert')
  t.assert(insertDiffs.length >= 1, 'has inline-insert diffs')
  t.assert(insertDiffs.every(d => d.attribution.type === 'added'), 'all inserts are type added')
}

// ---------------------------------------------------------------------------
// Empty / no-op (accept/reject behavior is owned by the plugin suite, see
// suggestion-decoration-plugin.test.js — the transform just sees a delta with
// no attribution and must emit nothing)
// ---------------------------------------------------------------------------

/**
 * @param {t.TestCase} _tc
 */
export const testNoDiffsWhenIdentical = _tc => {
  const { suggestionDoc, am } = setup('hello world')
  t.compare(getDiffs({ suggestionDoc, am }).length, 0, 'no diffs when docs are identical')
}

// ---------------------------------------------------------------------------
// Nested structures — one representative per container type
// ---------------------------------------------------------------------------

/**
 * Position tracking inside a blockquote container.
 *
 * @param {t.TestCase} _tc
 */
export const testInlineInsertInsideBlockquote = _tc => {
  const ctx = setupWithDelta(
    delta.create().insert([
      delta.create('blockquote', {}, [
        delta.create('paragraph', {}, 'quoted text')
      ])
    ]).done()
  )

  ctx.editor.dispatch(ctx.editor.state.tr.insertText(' here', 8))

  const diffs = assertDiffsValid({ suggestionDoc: ctx.suggestionDoc, am: ctx.am })
  const ins = diffs.find(d => d.type === 'inline-insert')
  t.assert(ins != null, 'inline-insert exists inside blockquote')
  t.assert(ins?.attribution.type === 'added', 'attribution type is added')
}

/**
 * Position tracking inside a list container (3 nesting levels:
 * bullet_list > list_item > paragraph).
 *
 * @param {t.TestCase} _tc
 */
export const testInlineInsertInsideListItem = _tc => {
  const ctx = setupWithDelta(
    delta.create().insert([
      delta.create('bullet_list', {}, [
        delta.create('list_item', {}, [
          delta.create('paragraph', {}, 'item one')
        ]),
        delta.create('list_item', {}, [
          delta.create('paragraph', {}, 'item two')
        ])
      ])
    ]).done(),
    { schema: listSchema }
  )

  ctx.editor.dispatch(ctx.editor.state.tr.insertText(' extra', 11))

  const diffs = assertDiffsValid(
    { suggestionDoc: ctx.suggestionDoc, am: ctx.am },
    { schema: listSchema }
  )
  const ins = diffs.find(d => d.type === 'inline-insert')
  t.assert(ins != null, 'inline-insert exists inside list item')
}

// ---------------------------------------------------------------------------
// Reconstruction of deleted structures
// ---------------------------------------------------------------------------

/**
 * @param {t.TestCase} _tc
 */
export const testDeleteEntireBlockquote = _tc => {
  const ctx = setupWithDelta(
    delta.create().insert([
      delta.create('paragraph', {}, 'before'),
      delta.create('blockquote', {}, [
        delta.create('paragraph', {}, 'inside quote')
      ]),
      delta.create('paragraph', {}, 'after')
    ]).done()
  )

  const bqStart = ctx.editor.state.doc.child(0).nodeSize
  const bq = ctx.editor.state.doc.child(1)
  ctx.editor.dispatch(ctx.editor.state.tr.delete(bqStart, bqStart + bq.nodeSize))

  const diffs = getDiffs({ suggestionDoc: ctx.suggestionDoc, am: ctx.am })
  const del = diffs.find(d => d.type === 'block-delete')
  t.assert(del != null, 'block-delete exists')
  t.compare(del?.content?.firstChild?.type.name, 'blockquote', 'reconstructed as blockquote')
  t.compare(del?.content?.firstChild?.textContent, 'inside quote', 'text content correct')
}

/**
 * @param {t.TestCase} _tc
 */
export const testDeleteEntireCodeBlock = _tc => {
  const ctx = setupWithDelta(
    delta.create().insert([
      delta.create('paragraph', {}, 'before'),
      delta.create('code_block', {}, 'let x = 42;'),
      delta.create('paragraph', {}, 'after')
    ]).done()
  )

  const codeStart = ctx.editor.state.doc.child(0).nodeSize
  const codeBlock = ctx.editor.state.doc.child(1)
  ctx.editor.dispatch(ctx.editor.state.tr.delete(codeStart, codeStart + codeBlock.nodeSize))

  const diffs = getDiffs({ suggestionDoc: ctx.suggestionDoc, am: ctx.am })
  const del = diffs.find(d => d.type === 'block-delete')
  t.assert(del != null, 'block-delete exists')
  t.compare(del?.content?.firstChild?.type.name, 'code_block', 'reconstructed as code_block')
  t.compare(del?.content?.firstChild?.textContent, 'let x = 42;', 'code content correct')
}

/**
 * Atom block nodes (no content) must be reconstructed correctly.
 *
 * @param {t.TestCase} _tc
 */
export const testDeleteHorizontalRule = _tc => {
  const ctx = setupWithDelta(
    delta.create().insert([
      delta.create('paragraph', {}, 'above'),
      delta.create('horizontal_rule'),
      delta.create('paragraph', {}, 'below')
    ]).done()
  )

  const hrStart = ctx.editor.state.doc.child(0).nodeSize
  const hr = ctx.editor.state.doc.child(1)
  ctx.editor.dispatch(ctx.editor.state.tr.delete(hrStart, hrStart + hr.nodeSize))

  const diffs = getDiffs({ suggestionDoc: ctx.suggestionDoc, am: ctx.am })
  const del = diffs.find(d => d.type === 'block-delete')
  t.assert(del != null, 'block-delete exists')
  t.compare(del?.content?.firstChild?.type.name, 'horizontal_rule', 'reconstructed as horizontal_rule')
}

// ---------------------------------------------------------------------------
// Fuzz — random documents with random edits
// ---------------------------------------------------------------------------

/**
 * @param {prng.PRNG} gen
 * @returns {delta.DeltaAny}
 */
const genRandomDelta = (gen) => {
  const d = delta.create()
  const blockCount = prng.int32(gen, 2, 6)
  for (let i = 0; i < blockCount; i++) {
    const kind = prng.int32(gen, 0, 4)
    switch (kind) {
      case 0: {
        const text = prng.word(gen, 3, 12)
        if (prng.bool(gen) && text.length > 2) {
          const splitAt = prng.int32(gen, 1, text.length - 1)
          const p = delta.create('paragraph', {})
            .insert(text.slice(0, splitAt))
            .insert(text.slice(splitAt), { strong: {} })
          d.insert([p])
        } else {
          d.insert([delta.create('paragraph', {}, text)])
        }
        break
      }
      case 1:
        d.insert([delta.create('heading', { level: prng.int32(gen, 1, 4) }, prng.word(gen, 2, 8))])
        break
      case 2:
        d.insert([delta.create('code_block', {}, prng.word(gen, 4, 20))])
        break
      case 3: {
        const innerCount = prng.int32(gen, 1, 3)
        /** @type {delta.DeltaAny[]} */
        const innerBlocks = []
        for (let j = 0; j < innerCount; j++) {
          innerBlocks.push(delta.create('paragraph', {}, prng.word(gen, 2, 8)))
        }
        d.insert([delta.create('blockquote', {}, innerBlocks)])
        break
      }
      case 4:
        d.insert([delta.create('horizontal_rule')])
        break
    }
  }
  return d.done()
}

/**
 * @param {prng.PRNG} gen
 * @param {import('prosemirror-model').Node} doc
 * @param {import('prosemirror-model').Schema} s
 */
const randomlyEditDoc = (gen, doc, s) => {
  const trf = new Transform(doc)
  const ops = prng.int32(gen, 1, 5)
  for (let i = 0; i < ops; i++) {
    const size = trf.doc.content.size
    if (size <= 2) break
    const hi = Math.max(1, size - 1)
    try {
      prng.oneOf(gen, [
        () => {
          const pos = prng.int32(gen, 1, hi)
          if (trf.doc.resolve(pos).parent.isTextblock) {
            trf.insert(pos, s.text(prng.word(gen, 1, 6)))
          }
        },
        () => {
          const a = prng.int32(gen, 1, hi)
          const b = prng.int32(gen, a, Math.min(a + 20, hi))
          if (a < b) trf.delete(a, b)
        },
        () => {
          const a = prng.int32(gen, 1, hi)
          const b = prng.int32(gen, a, Math.min(a + 10, hi))
          if (a < b && s.marks.strong) {
            trf.addMark(a, b, s.marks.strong.create())
          }
        }
      ])()
    } catch (_e) { /* skip invalid random ops */ }
  }
  return trf.doc
}

// ---------------------------------------------------------------------------
// Position mapping: insert/delete after prior suggested deletions
// ---------------------------------------------------------------------------

/**
 * Inline: insert after a suggested deletion in the same paragraph.
 *
 * @param {t.TestCase} _tc
 */
export const testInsertAfterInlineDeletion = _tc => {
  const { editor } = setup('ABC123DEF')
  editor.dispatch(editor.state.tr.delete(4, 7))
  t.compare(editor.state.doc.textContent, 'ABCDEF', 'clean after delete')
  editor.dispatch(editor.state.tr.insertText('X', 5))
  t.compare(editor.state.doc.textContent, 'ABCDXEF', 'X lands after D')
}

/**
 * Inline: insert at the exact deletion boundary (right after deleted span).
 * Base "ABCDEF", delete "CD" (positions 3-5), clean = "ABEF",
 * then insert "X" at position 3 (after "B", before "E").
 *
 * @param {t.TestCase} _tc
 */
export const testInsertAtDeletionBoundary = _tc => {
  const { editor } = setup('ABCDEF')
  editor.dispatch(editor.state.tr.delete(3, 5)) // delete "CD"
  t.compare(editor.state.doc.textContent, 'ABEF', 'clean after delete')
  editor.dispatch(editor.state.tr.insertText('X', 3)) // insert after "B"
  t.compare(editor.state.doc.textContent, 'ABXEF', 'X lands after B at deletion boundary')
}

/**
 * Inline: delete after a prior suggested deletion in the same paragraph.
 * Base "ABCDEFGH", delete "DE" (positions 4-6), clean = "ABCFGH",
 * then delete "G" (position 5-6 in clean), clean = "ABCFH".
 *
 * @param {t.TestCase} _tc
 */
export const testDeleteAfterInlineDeletion = _tc => {
  const { editor, suggestionDoc, am } = setup('ABCDEFGH')
  editor.dispatch(editor.state.tr.delete(4, 6)) // delete "DE"
  t.compare(editor.state.doc.textContent, 'ABCFGH', 'clean after first delete')
  editor.dispatch(editor.state.tr.delete(5, 6)) // delete "G" in clean doc
  t.compare(editor.state.doc.textContent, 'ABCFH', 'second delete lands correctly')
  const diffs = getDiffs({ suggestionDoc, am })
  const deletes = diffs.filter(d => d.type === 'inline-delete')
  const allDeleted = deletes.map(d => d.content?.textBetween(0, d.content?.size ?? 0) ?? '').join('')
  t.assert(allDeleted.includes('DE'), 'first deletion present')
  t.assert(allDeleted.includes('G'), 'second deletion present')
}

/**
 * Multi-paragraph: insert into a paragraph that follows a deleted paragraph.
 *
 * @param {t.TestCase} _tc
 */
export const testInsertAfterDeletedParagraph = _tc => {
  const { editor } = setup('first', 'second', 'third')
  // delete the second paragraph
  const p1size = editor.state.doc.child(0).nodeSize
  const p2size = editor.state.doc.child(1).nodeSize
  editor.dispatch(editor.state.tr.delete(p1size, p1size + p2size))
  t.compare(editor.state.doc.textContent, 'firstthird', 'second paragraph deleted')
  // insert text into "third" paragraph — "third" starts at p1size + 1 now
  editor.dispatch(editor.state.tr.insertText('X', p1size + 1))
  t.compare(editor.state.doc.textContent, 'firstXthird', 'X inserted into third paragraph')
}

/**
 * Multi-paragraph: insert a new paragraph after a deleted paragraph.
 *
 * @param {t.TestCase} _tc
 */
export const testInsertParagraphAfterDeletedParagraph = _tc => {
  const { editor } = setup('first', 'second', 'third')
  const p1size = editor.state.doc.child(0).nodeSize
  const p2size = editor.state.doc.child(1).nodeSize
  editor.dispatch(editor.state.tr.delete(p1size, p1size + p2size))
  t.compare(editor.state.doc.textContent, 'firstthird', 'second paragraph deleted')
  // split "third" paragraph to insert a new paragraph between first and third
  editor.dispatch(editor.state.tr.split(p1size + 1))
  t.compare(editor.state.doc.childCount, 3, 'three paragraphs after split')
  t.compare(editor.state.doc.child(0).textContent, 'first', 'first preserved')
  t.compare(editor.state.doc.child(2).textContent, 'third', 'third preserved')
}

/**
 * Two back-to-back single-char deletions in suggestion mode must both
 * appear in the diff set. Regression: the second deletion was silently
 * swallowed, showing only the first deleted character as a ghost.
 *
 * @param {t.TestCase} _tc
 */
export const testBackToBackInlineDeletions = _tc => {
  const { editor, suggestionDoc, am } = setup('hello world')

  // Delete 'd' (last char) — simulates one Backspace
  const endPos = editor.state.doc.content.size - 1
  editor.dispatch(editor.state.tr.delete(endPos - 1, endPos))

  // Delete 'l' — simulates a second Backspace immediately after
  const endPos2 = editor.state.doc.content.size - 1
  editor.dispatch(editor.state.tr.delete(endPos2 - 1, endPos2))

  const diffs = getDiffs({ suggestionDoc, am })
  const deletes = diffs.filter(d => d.type === 'inline-delete')
  t.assert(deletes.length > 0, 'at least one inline-delete diff exists')

  // Collect all deleted text across all inline-delete diffs
  const deletedText = deletes.map(d => d.content?.textBetween(0, d.content?.size ?? 0) ?? '').join('')
  t.assert(deletedText.includes('l'), 'deleted text includes "l" from second deletion')
  t.assert(deletedText.includes('d'), 'deleted text includes "d" from first deletion')
  t.compare(deletedText.length, 2, 'exactly two characters deleted total')
}

/**
 * Invariant: for any random document and random edits, all diffs have
 * valid positions and decorations build without throwing.
 *
 * @param {t.TestCase} tc
 */
export const testRepeatRandomDocumentFuzz = tc => {
  const initialDelta = genRandomDelta(tc.prng)
  const ctx = setupWithDelta(initialDelta)

  const editedDoc = randomlyEditDoc(tc.prng, ctx.editor.state.doc, schema)
  try {
    const tr = ctx.editor.state.tr
    tr.replaceWith(0, ctx.editor.state.doc.content.size, editedDoc.content)
    ctx.editor.dispatch(tr)
  } catch (_e) {
    return
  }

  assertDiffsValid({ suggestionDoc: ctx.suggestionDoc, am: ctx.am })
}
