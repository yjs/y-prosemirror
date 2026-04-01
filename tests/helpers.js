import * as YPM from '@y/prosemirror'
import * as Y from '@y/y'
import * as t from 'lib0/testing'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'

/**
 * Create a ProseMirror EditorView backed by a Y.js type.
 * @param {import('prosemirror-model').Schema} schema
 * @param {Y.Type} ytype
 * @param {Y.AbstractAttributionManager} [attributionManager]
 * @param {object} [opts]
 * @param {Function} [opts.mapAttributionToMark]
 */
export const createPMView = (
  schema,
  ytype,
  attributionManager = Y.noAttributionsManager,
  opts = {}
) => {
  const syncOpts = {}
  if (opts.mapAttributionToMark) {
    syncOpts.mapAttributionToMark = opts.mapAttributionToMark
  }
  const view = new EditorView(
    { mount: document.createElement('div') },
    {
      state: EditorState.create({
        schema,
        plugins: [YPM.syncPlugin(syncOpts)]
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
export const setupTwoWaySync = (doc1, doc2) => {
  Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
  Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))
  doc1.on('update', (update) => {
    Y.applyUpdate(doc2, update)
  })
  doc2.on('update', (update) => {
    Y.applyUpdate(doc1, update)
  })
}

/**
 * Assert that a PM doc's JSON matches the expected structure.
 * JSON round-trips both sides to normalize null-prototype objects from PM.
 * @param {import('prosemirror-model').Node} doc
 * @param {object} expected
 * @param {string} message
 */
export const assertDocJSON = (doc, expected, message) => {
  t.compare(
    JSON.parse(JSON.stringify(doc.toJSON())),
    JSON.parse(JSON.stringify(expected)),
    message
  )
}

/**
 * Set up the suggestion architecture:
 *   doc (base)
 *   suggestionDoc (view suggestions, suggestionMode=false) ↔ suggestionModeDoc (edit suggestions, suggestionMode=true)
 *
 * @param {import('prosemirror-model').Schema} schema
 * @param {object} [opts]
 * @param {() => void} [opts.populateBase] - callback to populate the base doc after views are created
 * @param {Function} [opts.mapAttributionToMark]
 */
export const createSuggestionSetup = (schema, opts = {}) => {
  const { populateBase, mapAttributionToMark } = opts
  const viewOpts = mapAttributionToMark ? { mapAttributionToMark } : {}

  const doc = new Y.Doc({ gc: false })
  const suggestionDoc = new Y.Doc({ isSuggestionDoc: true, gc: false })
  const suggestionModeDoc = new Y.Doc({ isSuggestionDoc: true, gc: false })

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

  setupTwoWaySync(suggestionDoc, suggestionModeDoc)

  const viewA = createPMView(schema, doc.get('prosemirror'), Y.noAttributionsManager, viewOpts)
  const viewSuggestion = createPMView(
    schema,
    suggestionDoc.get('prosemirror'),
    suggestionAM,
    viewOpts
  )
  const viewSuggestionMode = createPMView(
    schema,
    suggestionModeDoc.get('prosemirror'),
    suggestionModeAM,
    viewOpts
  )

  if (populateBase) {
    populateBase(doc)
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
export const insertionMark = {
  type: 'y-attribution-insertion',
  attrs: { userIds: [], timestamp: null }
}

/** Deletion mark as it appears in PM doc JSON */
export const deletionMark = {
  type: 'y-attribution-deletion',
  attrs: { userIds: [], timestamp: null }
}
