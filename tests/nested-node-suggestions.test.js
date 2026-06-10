/**
 * END-TO-END tests for suggestions on NESTED block structure — a `container`
 * node holding block children, and node-type flips of those children
 * (paragraph -> heading) made in suggestion mode.
 *
 * Layer: the same full multi-view stack as suggestions.test.js (base + viewer +
 * editor, two-way sync, decoration plugin), focused on the one thing that
 * suite's flat documents don't exercise — structural / node-type-change
 * suggestions inside a container, and that accepting one merges the new type
 * into the base for every peer.
 *
 * (This file used to test the `--attributed` node-variant rendering feature,
 * which was removed when attribution moved to decorations. The container / flip
 * scenarios are what remained uniquely worth covering.)
 *
 * Deliberately NOT here: flat insert/delete decoration rendering
 * (suggestion-decoration-plugin.test.js), the diff shape itself
 * (y-attribution-to-diffset.test.js), and the accept/reject command API
 * (commands.test.js).
 */
import * as YPM from '@y/prosemirror'
import * as Y from '@y/y'
import * as delta from 'lib0/delta'
import * as t from 'lib0/testing'
import { Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { nodes, marks } from './complexSchema.js'
import { setupTwoWaySync } from './cohort.js'

const schema = new Schema({
  nodes: {
    ...nodes,
    container: {
      content: 'block+',
      group: 'block',
      parseDOM: [{ tag: 'container' }],
      toDOM () {
        return ['container', {}, 0]
      }
    }
  },
  marks
})

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
 * @param {import('prosemirror-model').Node} doc
 * @param {object} expected
 * @param {string} message
 */
const assertDocJSON = (doc, expected, message) => {
  t.compare(JSON.parse(JSON.stringify(doc.toJSON())), expected, message)
}

/**
 * Build the standard 3-doc suggestion setup.
 *
 * @param {string} baseContent
 * @param {import('lib0/delta').Delta} [seedDelta]
 */
const setup = (baseContent, seedDelta = delta.create().insert([delta.create('paragraph', {}, baseContent)]).done()) => {
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
      { state: EditorState.create({ schema, plugins: [YPM.syncPlugin({ decorationMode: true }), YPM.ySuggestionDecorationPlugin()] }) }
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
 * A `container` seed delta holding a single `paragraph` child.
 * @param {string} text
 **/
const containerWithParagraph = (text) =>
  delta.create().insert([
    delta.create('container', {}, [
      delta.create('paragraph', {}, text)
    ])
  ]).done()

/**
 * Sanity baseline: a `container` seeded with a `paragraph` child syncs to all
 * three peers unchanged.
 *
 * @param {t.TestCase} _tc
 */
export const testContainerSeedSyncs = _tc => {
  const { base, viewer, editor } = setup(
    '',
    containerWithParagraph('child')
  )

  const expected = {
    type: 'doc',
    content: [{
      type: 'container',
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
 * @param {t.TestCase} _tc
 */
export const testContainerChildFlipParagraphToHeading = _tc => {
  const { base, viewer, editor } = setup(
    '',
    containerWithParagraph('child')
  )

  t.assert(
    editor.state.doc.child(0).child(0).type.name === 'paragraph',
    'pre-flip: container has a paragraph child'
  )

  editor.dispatch(editor.state.tr.setNodeMarkup(
    1, schema.nodes.heading, { level: 2 }
  ))

  assertDocJSON(base.state.doc, {
    type: 'doc',
    content: [{
      type: 'container',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'child' }] }]
    }]
  }, 'base: child stays canonical paragraph')

  const expected = {
    type: 'doc',
    content: [{
      type: 'container',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'child' }]
        }
      ]
    }]
  }
  assertDocJSON(editor.state.doc, expected, 'editor: child is canonical heading')
  assertDocJSON(viewer.state.doc, expected, 'viewer: child is canonical heading')

  const decosEditor = getDecorations(editor)
  t.assert(decosEditor.length > 0, 'editor: has decorations for type flip')

  const decosViewer = getDecorations(viewer)
  t.assert(decosViewer.length > 0, 'viewer: has decorations for type flip')
}

/**
 * Accepting a container child-flip suggestion should merge it into the base
 * doc: the child becomes a canonical `heading` for all peers.
 *
 * @param {t.TestCase} _tc
 */
export const testContainerChildFlipAccept = _tc => {
  const { base, viewer, editor } = setup(
    '',
    containerWithParagraph('child')
  )

  editor.dispatch(editor.state.tr.setNodeMarkup(
    1, schema.nodes.heading, { level: 2 }
  ))

  YPM.acceptAllChanges()(viewer.state, viewer.dispatch)

  const expected = {
    type: 'doc',
    content: [{
      type: 'container',
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
