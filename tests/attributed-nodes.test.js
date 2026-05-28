import * as YPM from '@y/prosemirror'
import * as Y from '@y/y'
import * as delta from 'lib0/delta'
import * as t from 'lib0/testing'
import { Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { nodes, marks } from './complexSchema.js'
import { setupTwoWaySync } from './cohort.js'

// Schema that mirrors complexSchema but adds attributed sibling node types. The
// variants must accept the same content/marks as the canonical node so that an
// in-place `setNodeMarkup` flip is valid.
const schema = new Schema({
  nodes: {
    ...nodes,
    'paragraph--attributed': {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p[data-attributed]' }],
      toDOM () {
        return ['p', { 'data-attributed': 'true' }, 0]
      }
    },
    'heading--attributed': {
      attrs: { level: { default: 1 } },
      content: 'inline*',
      group: 'block',
      defining: true,
      toDOM (node) {
        return ['h' + node.attrs.level, { 'data-attributed': 'true' }, 0]
      }
    }
  },
  marks
})

/** Insertion mark as it appears in PM doc JSON */
const insertionMark = {
  type: 'y-attributed-insert',
  attrs: { userIds: [], timestamp: null }
}

/**
 * @param {import('prosemirror-model').Node} doc
 * @param {object} expected
 * @param {string} message
 */
const assertDocJSON = (doc, expected, message) => {
  t.compare(JSON.parse(JSON.stringify(doc.toJSON())), expected, message)
}

/**
 * Build the standard 3-doc suggestion setup, with every view wired through a
 * sync plugin configured with the given `attributedNodes` predicate.
 *
 * @param {AttributedNodesPredicate} attributedNodes
 * @param {string} baseContent
 */
const setup = (attributedNodes, baseContent) => {
  const doc = new Y.Doc({ gc: false, guid: 'base' })
  const suggestionDoc = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'suggestions' })
  const suggestionModeDoc = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'suggestions-edit' })

  const attrs = new Y.Attributions()
  const suggestionAM = Y.createAttributionManagerFromDiff(doc, suggestionDoc, { attrs })
  suggestionAM.suggestionMode = false
  const suggestionModeAM = Y.createAttributionManagerFromDiff(doc, suggestionModeDoc, { attrs })
  suggestionModeAM.suggestionMode = true

  setupTwoWaySync(suggestionDoc, suggestionModeDoc)

  /**
   * @param {Y.Type} ytype
   * @param {Y.AbstractAttributionManager} [am]
   */
  const mkView = (ytype, am = Y.noAttributionsManager) => {
    const view = new EditorView(
      { mount: document.createElement('div') },
      { state: EditorState.create({ schema, plugins: [YPM.syncPlugin({ attributedNodes })] }) }
    )
    YPM.configureYProsemirror({ ytype, attributionManager: am })(view.state, view.dispatch)
    return view
  }

  const base = mkView(doc.get('prosemirror'))
  const viewer = mkView(suggestionDoc.get('prosemirror'), suggestionAM)
  const editor = mkView(suggestionModeDoc.get('prosemirror'), suggestionModeAM)

  doc.get('prosemirror').applyDelta(
    delta.create().insert([delta.create('paragraph', {}, baseContent)]).done()
  )

  return { doc, suggestionModeDoc, base, viewer, editor }
}

/**
 * A block inserted in suggestion mode renders under its `--attributed` variant
 * when the predicate opts in - and keeps the `y-attributed-insert` node mark.
 *
 * @param {t.TestCase} _tc
 */
export const testInsertRendersVariant = _tc => {
  const { base, viewer, editor } = setup((_name, kinds) => kinds.insert === true, 'hello')

  editor.dispatch(editor.state.tr.insert(
    editor.state.doc.content.size,
    schema.nodes.paragraph.create(null, schema.text('new block'))
  ))

  // Base doc (no attribution) is untouched and stays canonical.
  assertDocJSON(base.state.doc, {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }]
  }, 'base unchanged and canonical')

  const expected = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
      {
        type: 'paragraph--attributed',
        marks: [insertionMark],
        content: [{ type: 'text', text: 'new block', marks: [insertionMark] }]
      }
    ]
  }
  assertDocJSON(viewer.state.doc, expected, 'viewer: inserted block is the attributed variant')
  assertDocJSON(editor.state.doc, expected, 'editor: inserted block is the attributed variant')
}

/**
 * The predicate is per-kind: with `kinds.delete` only, an *inserted* block is
 * NOT renamed - but the `y-attributed-insert` mark is still applied.
 *
 * @param {t.TestCase} _tc
 */
export const testKindSelectivity = _tc => {
  const { viewer, editor } = setup((_name, kinds) => kinds.delete === true, 'hello')

  editor.dispatch(editor.state.tr.insert(
    editor.state.doc.content.size,
    schema.nodes.paragraph.create(null, schema.text('new block'))
  ))

  const expected = {
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
  assertDocJSON(viewer.state.doc, expected, 'viewer: insert kept canonical, mark still applied')
  assertDocJSON(editor.state.doc, expected, 'editor: insert kept canonical, mark still applied')
}

/**
 * A node type without a `--attributed` sibling in the schema falls back to the
 * canonical name even when the predicate returns `true`.
 *
 * @param {t.TestCase} _tc
 */
export const testSchemaFallback = _tc => {
  const { viewer, editor } = setup(() => true, 'hello')

  // `image` has no `image--attributed` variant in the schema.
  editor.dispatch(editor.state.tr.insert(
    6,
    schema.nodes.image.create({ src: 'test.png', alt: 'test' })
  ))

  const expected = {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [
        { type: 'text', text: 'hello' },
        {
          type: 'image',
          attrs: { src: 'test.png', alt: 'test', title: null },
          marks: [insertionMark]
        }
      ]
    }]
  }
  assertDocJSON(viewer.state.doc, expected, 'viewer: image falls back to canonical')
  assertDocJSON(editor.state.doc, expected, 'editor: image falls back to canonical')
}

/**
 * The variant is a PM-render concern only: the Y document stores the canonical
 * node name, never the `--attributed` suffix.
 *
 * @param {t.TestCase} _tc
 */
export const testYStoresCanonicalName = _tc => {
  const { suggestionModeDoc, editor } = setup((_name, kinds) => kinds.insert === true, 'hello')

  editor.dispatch(editor.state.tr.insert(
    editor.state.doc.content.size,
    schema.nodes.paragraph.create(null, schema.text('new block'))
  ))

  const yjson = JSON.stringify(
    suggestionModeDoc.get('prosemirror').toDelta(Y.noAttributionsManager, { deep: true }).toJSON()
  )
  t.assert(yjson.includes('paragraph'), 'sanity: Y delta mentions the paragraph node')
  t.assert(!yjson.includes('--attributed'), 'Y never stores the attributed-variant name')
}

/**
 * Accepting the suggestion clears the attribution: the variant node flips back
 * to its canonical type in place (no `--attributed`, no marks).
 *
 * @param {t.TestCase} _tc
 */
export const testAcceptFlipsBackToCanonical = _tc => {
  const { base, viewer, editor } = setup((_name, kinds) => kinds.insert === true, 'hello')

  editor.dispatch(editor.state.tr.insert(
    editor.state.doc.content.size,
    schema.nodes.paragraph.create(null, schema.text('new block'))
  ))

  // Pre-condition: the inserted block is the attributed variant.
  t.assert(
    viewer.state.doc.child(1).type.name === 'paragraph--attributed',
    'pre-accept: inserted block is the variant'
  )

  YPM.acceptAllChanges()(viewer.state, viewer.dispatch)

  const expected = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'new block' }] }
    ]
  }
  assertDocJSON(base.state.doc, expected, 'base: suggestion merged')
  assertDocJSON(viewer.state.doc, expected, 'viewer: variant flipped back to canonical')
  assertDocJSON(editor.state.doc, expected, 'editor: variant flipped back to canonical')
}
