import * as YPM from '@y/prosemirror'
import * as Y from '@y/y'
import * as delta from 'lib0/delta'
import * as t from 'lib0/testing'
import { Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { marks } from './complexSchema.js'
import { setupTwoWaySync } from './cohort.js'

/* -------------------------------------------------------------------------- *
 *  Strict, BlockNote-like schema (emulated - we do NOT import BlockNote).
 *
 *  The structural shape that matters:
 *
 *     doc            -> blockGroup
 *     blockGroup     -> blockContainer+              (siblings ARE allowed here)
 *     blockContainer -> blockContent blockGroup?     (STRICT: exactly one block
 *                                                      content, optional nested
 *                                                      group)
 *     blockContent   = paragraph | heading
 *
 *  This is the constraint that breaks suggestion-mode child-type flips: a
 *  blockContainer may hold *only one* blockContent. The current leaf-level diff
 *  boundary wants to place the deleted old child next to the inserted new child
 *  *inside the same blockContainer* - which is two blockContent nodes, rejected
 *  by `blockContent blockGroup?`.
 *
 *  We deliberately do NOT relax `blockContainer`'s content (unlike the
 *  `container` node in attributed-nodes.test.js, which uses the relaxed
 *  `attributed* (block|attributed) attributed*`). The whole point is that the
 *  boundary must be raised to the blockContainer level instead, where
 *  `blockContainer+` already allows siblings.
 * -------------------------------------------------------------------------- */

const attributionMarks = 'y-attributed-insert y-attributed-delete y-attributed-format'

const schema = new Schema({
  nodes: {
    doc: { content: 'blockGroup' },
    blockGroup: {
      content: 'blockContainer+',
      // `marks` whitelist: when the boundary is raised to the blockContainer
      // level, the whole container carries a `y-attributed-*` node mark, and
      // ProseMirror's `checkContent` requires the *parent* to allow the marks its
      // children carry. Without this, blockGroup rejects an attributed
      // blockContainer child with `Invalid content for node blockGroup`. (Same as
      // BlockNote's real schema, which whitelists these marks on blockGroup.)
      marks: attributionMarks,
      toDOM () { return ['div', { class: 'bg' }, 0] }
    },
    blockContainer: {
      content: 'blockContent blockGroup?',
      // The whole container carries the insert/delete node mark when the boundary
      // is raised, so attribution marks must be allowed on it. No `--attributed`
      // variant is needed: the canonical container renders the attribution as a
      // node mark (exactly as BlockNote's `blockContainer` does).
      marks: attributionMarks,
      toDOM () { return ['div', { class: 'bc' }, 0] }
    },
    paragraph: {
      content: 'inline*',
      group: 'blockContent',
      marks: attributionMarks,
      toDOM () { return ['p', 0] }
    },
    heading: {
      content: 'inline*',
      group: 'blockContent',
      marks: attributionMarks,
      attrs: { level: { default: 1 } },
      toDOM (node) { return ['h' + node.attrs.level, 0] }
    },
    text: { group: 'inline' }
  },
  marks
})

const insertionMark = { type: 'y-attributed-insert', attrs: { userIds: [], timestamp: null } }
const deletionMark = { type: 'y-attributed-delete', attrs: { userIds: [], timestamp: null } }

/**
 * The *integrator's* node-pairing policy (this is the BlockNote-specific bit
 * that deliberately lives in userland, not in the binding): a `blockContainer`
 * is identified by its first block-content child, so when that child changes
 * type the two containers are reported as *different* and the PM->Y diff
 * replaces the whole container instead of descending - raising the boundary to
 * the `blockGroup` level. Everything else uses plain name-equality.
 *
 * @param {import('lib0/delta').DeltaAny} d
 */
const firstChildName = d => {
  for (const op of d.children) {
    if (delta.$insertOp.check(op)) for (const it of op.insert) if (delta.$deltaAny.check(it)) return it.name
  }
  return null
}
/** @type {YpmMatchNodes} */
const matchNodes = (a, b) =>
  a.name === b.name && (a.name !== 'blockContainer' || firstChildName(a) === firstChildName(b))

/**
 * @param {import('prosemirror-model').Node} doc
 * @param {object} expected
 * @param {string} message
 */
const assertDocJSON = (doc, expected, message) => {
  t.compare(JSON.parse(JSON.stringify(doc.toJSON())), expected, message)
}

/**
 * Build the standard 3-doc (base / viewer / editor) suggestion setup wired to
 * the strict schema above.
 *
 * @param {import('lib0/delta').Delta} seedDelta
 */
const setup = (seedDelta) => {
  const doc = new Y.Doc({ gc: false, guid: 'base' })
  const suggestionDoc = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'suggestions' })
  const suggestionModeDoc = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'suggestions-edit' })

  const attrs = new Y.Attributions()
  const suggestionAM = Y.createAttributionManagerFromDiff(doc, suggestionDoc, { attrs })
  suggestionAM.suggestionMode = false
  const suggestionModeAM = Y.createAttributionManagerFromDiff(doc, suggestionModeDoc, { attrs })
  suggestionModeAM.suggestionMode = true

  setupTwoWaySync(suggestionDoc, suggestionModeDoc)

  // Seed the base Y doc *before* attaching the views. With this strict, deeply
  // required schema (doc -> blockGroup -> blockContainer+ -> blockContent) the
  // auto-filled empty editor doc would otherwise have to diff its way up from
  // `doc(blockGroup(blockContainer(paragraph)))` to the seeded content, which
  // surfaces an unrelated empty-init reconcile churn. Seeding first makes each
  // view initialize straight to the seeded state.
  doc.get('prosemirror').applyDelta(seedDelta)

  /**
   * @param {Y.Type} ytype
   * @param {Y.AbstractAttributionManager} [am]
   */
  const mkView = (ytype, am = Y.noAttributionsManager) => {
    const view = new EditorView(
      { mount: document.createElement('div') },
      { state: EditorState.create({ schema, plugins: [YPM.syncPlugin({ matchNodes })] }) }
    )
    YPM.configureYProsemirror({ ytype, attributionManager: am })(view.state, view.dispatch)
    return view
  }

  const base = mkView(doc.get('prosemirror'))
  const viewer = mkView(suggestionDoc.get('prosemirror'), suggestionAM)
  const editor = mkView(suggestionModeDoc.get('prosemirror'), suggestionModeAM)

  return { doc, suggestionModeDoc, base, viewer, editor }
}

/**
 * A doc holding one blockGroup > one blockContainer > one paragraph(text).
 * @param {string} text
 */
const blockGroupSeed = (text) =>
  delta.create().insert([
    delta.create('blockGroup', {}, [
      delta.create('blockContainer', {}, [
        delta.create('paragraph', {}, text)
      ])
    ])
  ]).done()

/**
 * Sanity baseline: the strict blockGroup > blockContainer > paragraph seed syncs
 * to every peer unchanged.
 *
 * @param {t.TestCase} _tc
 */
export const testStrictSeedSyncs = _tc => {
  const { base, viewer, editor } = setup(blockGroupSeed('child'))

  const expected = {
    type: 'doc',
    content: [{
      type: 'blockGroup',
      content: [{
        type: 'blockContainer',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'child' }] }]
      }]
    }]
  }
  assertDocJSON(base.state.doc, expected, 'base: strict seed')
  assertDocJSON(viewer.state.doc, expected, 'viewer: strict seed')
  assertDocJSON(editor.state.doc, expected, 'editor: strict seed')
}

/**
 * THE BOUNDARY-RAISE CASE.
 *
 * Flip the blockContainer's child `paragraph` -> `heading` in suggestion mode.
 *
 * A leaf-level diff boundary would render the deleted old paragraph next to the
 * inserted new heading *inside the same blockContainer*, which violates
 * `blockContent blockGroup?` (two blockContent). Declaring `blockContainer` as a
 * `suggestionBoundaryNodes` entry raises the boundary: because the container's
 * identifying block-content child changed type, the PM->Y diff replaces the
 * whole container, so the old blockContainer is rendered as deleted and a whole
 * new blockContainer as inserted, as siblings inside the blockGroup - which
 * `blockContainer+` allows. This test pins that converged state.
 *
 * @param {t.TestCase} _tc
 */
export const testStrictContainerChildFlipRaisesBoundary = _tc => {
  const { base, viewer, editor } = setup(blockGroupSeed('child'))

  // Positions: doc[0] blockGroup[1] blockContainer[2] paragraph -> the paragraph
  // node sits at pos 2 (blockGroup opens at 0, blockContainer at 1, paragraph at 2).
  t.assert(
    editor.state.doc.child(0).child(0).child(0).type.name === 'paragraph',
    'pre-flip: blockContainer has a paragraph child'
  )

  editor.dispatch(editor.state.tr.setNodeMarkup(2, schema.nodes.heading, { level: 2 }))

  // Base (no attribution) stays canonical.
  assertDocJSON(base.state.doc, {
    type: 'doc',
    content: [{
      type: 'blockGroup',
      content: [{
        type: 'blockContainer',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'child' }] }]
      }]
    }]
  }, 'base: child stays canonical paragraph')

  // Intended converged state: boundary raised to the blockContainer level. The
  // old container is deleted, a new container is inserted, side by side in the
  // blockGroup. Each container's blockContent stays a single, schema-valid child.
  // The whole deleted/inserted subtree carries the attribution node mark (on the
  // canonical container, on its blockContent, and on the text) - no `--attributed`
  // variant, exactly as BlockNote renders it.
  const expected = {
    type: 'doc',
    content: [{
      type: 'blockGroup',
      content: [
        {
          type: 'blockContainer',
          marks: [deletionMark],
          content: [{
            type: 'paragraph',
            marks: [deletionMark],
            content: [{ type: 'text', text: 'child', marks: [deletionMark] }]
          }]
        },
        {
          type: 'blockContainer',
          marks: [insertionMark],
          content: [{
            type: 'heading',
            attrs: { level: 2 },
            marks: [insertionMark],
            content: [{ type: 'text', text: 'child', marks: [insertionMark] }]
          }]
        }
      ]
    }]
  }
  assertDocJSON(editor.state.doc, expected, 'editor: boundary raised to blockContainer')
  assertDocJSON(viewer.state.doc, expected, 'viewer: boundary raised to blockContainer')
}

/**
 * Accepting a boundary-raised child flip collapses the two suggestion
 * containers into the single new canonical `blockContainer > heading` on every
 * peer (including base): the deleted container drops out, the inserted one loses
 * its attribution marks.
 *
 * @param {t.TestCase} _tc
 */
export const testStrictContainerChildFlipAccept = _tc => {
  const { base, viewer, editor } = setup(blockGroupSeed('child'))

  editor.dispatch(editor.state.tr.setNodeMarkup(2, schema.nodes.heading, { level: 2 }))

  YPM.acceptAllChanges()(viewer.state, viewer.dispatch)

  const expected = {
    type: 'doc',
    content: [{
      type: 'blockGroup',
      content: [{
        type: 'blockContainer',
        content: [{
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'child' }]
        }]
      }]
    }]
  }
  assertDocJSON(base.state.doc, expected, 'base: child flip accepted into canonical heading')
  assertDocJSON(viewer.state.doc, expected, 'viewer: canonical heading after accept')
  assertDocJSON(editor.state.doc, expected, 'editor: canonical heading after accept')
}

/**
 * Rejecting a boundary-raised child flip restores the original single
 * `blockContainer > paragraph` on every peer: the inserted container drops out,
 * the deleted one comes back canonical.
 *
 * @param {t.TestCase} _tc
 */
export const testStrictContainerChildFlipReject = _tc => {
  const { base, viewer, editor } = setup(blockGroupSeed('child'))

  editor.dispatch(editor.state.tr.setNodeMarkup(2, schema.nodes.heading, { level: 2 }))

  YPM.rejectAllChanges()(viewer.state, viewer.dispatch)

  const expected = {
    type: 'doc',
    content: [{
      type: 'blockGroup',
      content: [{
        type: 'blockContainer',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'child' }] }]
      }]
    }]
  }
  assertDocJSON(base.state.doc, expected, 'base: untouched original paragraph')
  assertDocJSON(viewer.state.doc, expected, 'viewer: original paragraph after reject')
  assertDocJSON(editor.state.doc, expected, 'editor: original paragraph after reject')
}
