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
      group: 'block attributed',
      parseDOM: [{ tag: 'p[data-attributed]' }],
      toDOM () {
        return ['p', { 'data-attributed': 'true' }, 0]
      }
    },
    'heading--attributed': {
      attrs: { level: { default: 1 } },
      content: 'inline*',
      group: 'block attributed',
      defining: true,
      toDOM (node) {
        return ['h' + node.attrs.level, { 'data-attributed': 'true' }, 0]
      }
    },
    container: {
      attrs: { 'yjs-suggestion-node': { } },
      content: 'attributed* block attributed*',
      group: 'block',
      parseDOM: [{ tag: 'container' }],
      toDOM () {
        return ['container', {}, 0]
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
 * @param {import('lib0/delta').Delta} [seedDelta]
 */
const setup = (attributedNodes, baseContent, seedDelta = delta.create().insert([delta.create('paragraph', {}, baseContent)]).done()) => {
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
    seedDelta
  )

  return { doc, suggestionModeDoc, base, viewer, editor }
}

/**
 * Strip the reserved `--attributed` render suffix so a variant node name maps
 * back to its canonical type. Mirrors `canonicalNodeName` in `sync-utils`.
 *
 * @param {string} name
 * @return {string}
 */
const canonical = (name) =>
  name.endsWith('--attributed') ? name.slice(0, -'--attributed'.length) : name

/**
 * A `container` seed delta holding a single `paragraph` child.
 * @param {string} text
 **/
const containerWithParagraph = (text) =>
  delta.create().insert([
    delta.create('container', { 'yjs-suggestion-node': true }, [
      delta.create('paragraph', {}, text)
    ])
  ]).done()

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

/* -------------------------------------------------------------------------- *
 *  Container nesting: flipping a *child* node type as a suggestion.
 *
 *  The `container` node declares `content: 'attributed* block attributed*'` and
 *  carries the `yjs-suggestion-node` attr. The scenarios below nest a child
 *  block inside a container and then change that child's type (paragraph <->
 *  heading) in suggestion mode. The goal is to be able to flip the suggested
 *  child change back and forth and have every peer (base / viewer / editor)
 *  stay consistent.
 *
 *  NOTE: these cases are expected to surface sync/schema issues today - a
 *  child-type flip in suggestion mode renders the original child as a deleted
 *  `*--attributed` variant alongside the inserted new type, which can violate
 *  the container's content expression and/or fail to round-trip to the viewer.
 *  They are written against the *intended* converged state so they pin down the
 *  target behaviour while the fix is developed.
 * -------------------------------------------------------------------------- */

/**
 * Sanity baseline: a `container` seeded with a `paragraph` child syncs to all
 * three peers unchanged (no attribution yet, so no variant rendering).
 *
 * @param {t.TestCase} _tc
 */
export const testContainerSeedSyncs = _tc => {
  const { base, viewer, editor } = setup(
    (_name, kinds) => kinds.insert === true || kinds.delete === true || kinds.format === true,
    '',
    containerWithParagraph('child')
  )

  const expected = {
    type: 'doc',
    content: [{
      type: 'container',
      attrs: { 'yjs-suggestion-node': true },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'child' }] }]
    }]
  }
  assertDocJSON(base.state.doc, expected, 'base: container + child seeded')
  assertDocJSON(viewer.state.doc, expected, 'viewer: container + child seeded')
  assertDocJSON(editor.state.doc, expected, 'editor: container + child seeded')
}

/**
 * Flip a container's child `paragraph` -> `heading` in suggestion mode.
 *
 * Intended converged state: every peer keeps a single child whose canonical
 * type is now `heading`, rendered under its `heading--attributed` variant with
 * a `y-attributed-format` mark, while the Y document still stores `heading`.
 *
 * @param {t.TestCase} _tc
 */
export const testContainerChildFlipParagraphToHeading = _tc => {
  const { base, viewer, editor } = setup(
    (_name, kinds) => kinds.insert === true || kinds.delete === true || kinds.format === true,
    '',
    containerWithParagraph('child')
  )

  t.assert(
    editor.state.doc.child(0).child(0).type.name === 'paragraph',
    'pre-flip: container has a paragraph child'
  )

  // Change the child block type in place (paragraph -> heading) as a suggestion.
  // The container opens at pos 0, so its child block is at pos 1.
  editor.dispatch(editor.state.tr.setNodeMarkup(
    1, schema.nodes.heading, { level: 2 }
  ))

  // Base (no attribution) is untouched: still a canonical paragraph child.
  assertDocJSON(base.state.doc, {
    type: 'doc',
    content: [{
      type: 'container',
      attrs: { 'yjs-suggestion-node': true },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'child' }] }]
    }]
  }, 'base: child stays canonical paragraph')

  // Editor & viewer both render the suggested heading variant, canonical type
  // `heading` stored in Y. The child carries the format-change attribution.
  const expected = {
    type: 'doc',
    content: [{
      type: 'container',
      attrs: { 'yjs-suggestion-node': true },
      content: [{
        type: 'heading--attributed',
        attrs: { level: 2 },
        marks: [{ type: 'y-attributed-format', attrs: { userIds: [], timestamp: null } }],
        content: [{ type: 'text', text: 'child' }]
      }]
    }]
  }
  assertDocJSON(editor.state.doc, expected, 'editor: child flipped to heading variant')
  assertDocJSON(viewer.state.doc, expected, 'viewer: child flip synced as heading variant')
}

/**
 * Flip back and forth: paragraph -> heading -> paragraph within a container,
 * all as suggestions. After flipping back the suggested child change should be
 * gone and every peer should converge on the original canonical paragraph.
 *
 * @param {t.TestCase} _tc
 */
export const testContainerChildFlipBackAndForth = _tc => {
  const { base, viewer, editor } = setup(
    (_name, kinds) => kinds.insert === true || kinds.delete === true || kinds.format === true,
    '',
    containerWithParagraph('child')
  )

  // paragraph -> heading (child block is at pos 1, inside the container).
  t.assert(
    editor.state.doc.child(0).child(0).type.name === 'paragraph',
    'pre-flip: container has a paragraph child'
  )
  editor.dispatch(editor.state.tr.setNodeMarkup(
    1, schema.nodes.heading, { level: 2 }
  ))

  t.assert(
    canonical(viewer.state.doc.child(0).child(0).type.name) === 'heading',
    'after first flip: viewer child is a heading'
  )

  // heading -> paragraph (flip back)
  t.assert(
    canonical(editor.state.doc.child(0).child(0).type.name) === 'heading',
    'mid-flip: container child is now a heading'
  )
  editor.dispatch(editor.state.tr.setNodeMarkup(
    1, schema.nodes.paragraph, {}
  ))

  // Back to the original canonical paragraph everywhere - no residual variant
  // or attribution mark on the child.
  const original = {
    type: 'doc',
    content: [{
      type: 'container',
      attrs: { 'yjs-suggestion-node': true },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'child' }] }]
    }]
  }
  assertDocJSON(base.state.doc, original, 'base: unchanged after round-trip flip')
  assertDocJSON(editor.state.doc, original, 'editor: child flipped back to paragraph')
  assertDocJSON(viewer.state.doc, original, 'viewer: child flipped back to paragraph')
}

/**
 * Accepting a container child-flip suggestion should merge it into the base
 * doc: the child becomes a canonical `heading` (no variant, no marks) for all
 * peers, including base.
 *
 * @param {t.TestCase} _tc
 */
export const testContainerChildFlipAccept = _tc => {
  const { base, viewer, editor } = setup(
    (_name, kinds) => kinds.insert === true || kinds.delete === true || kinds.format === true,
    '',
    containerWithParagraph('child')
  )

  // Child block is at pos 1, inside the container.
  editor.dispatch(editor.state.tr.setNodeMarkup(
    1, schema.nodes.heading, { level: 2 }
  ))

  YPM.acceptAllChanges()(viewer.state, viewer.dispatch)

  const expected = {
    type: 'doc',
    content: [{
      type: 'container',
      attrs: { 'yjs-suggestion-node': true },
      content: [{
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'child' }]
      }]
    }]
  }
  assertDocJSON(base.state.doc, expected, 'base: child flip accepted into canonical heading')
  assertDocJSON(viewer.state.doc, expected, 'viewer: child is canonical heading')
  assertDocJSON(editor.state.doc, expected, 'editor: child is canonical heading')
}

/**
 * Rejecting a container child-flip suggestion should discard it: every peer
 * returns to the original canonical `paragraph` child.
 *
 * @param {t.TestCase} _tc
 */
export const testContainerChildFlipReject = _tc => {
  const { base, viewer, editor } = setup(
    (_name, kinds) => kinds.insert === true || kinds.delete === true || kinds.format === true,
    '',
    containerWithParagraph('child')
  )

  // Child block is at pos 1, inside the container.
  editor.dispatch(editor.state.tr.setNodeMarkup(
    1, schema.nodes.heading, { level: 2 }
  ))

  YPM.rejectAllChanges()(viewer.state, viewer.dispatch)

  const original = {
    type: 'doc',
    content: [{
      type: 'container',
      attrs: { 'yjs-suggestion-node': true },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'child' }] }]
    }]
  }
  assertDocJSON(base.state.doc, original, 'base: unchanged after reject')
  assertDocJSON(viewer.state.doc, original, 'viewer: child flip rejected')
  assertDocJSON(editor.state.doc, original, 'editor: child flip rejected')
}
