import * as Y from '@y/y'
import * as delta from 'lib0/delta'
import {
  createPMView as _createPMView,
  setupTwoWaySync
} from '../helpers.js'
import { schema } from './schema.js'


/**
 * Create a ProseMirror EditorView backed by a Y.js type.
 * @param {Y.Type} ytype
 * @param {Y.AbstractAttributionManager} [attributionManager]
 */
export const createPMView = (ytype, attributionManager) =>
  _createPMView(schema, ytype, attributionManager)

/**
 * Set up the suggestion architecture:
 *   doc (base)
 *   suggestionDoc (view suggestions, suggestionMode=false) ↔ suggestionModeDoc (edit suggestions, suggestionMode=true)
 *
 * @param {object} [opts]
 * @param {string} [opts.baseContent] - initial paragraph text content
 */
export const createSuggestionSetup = (opts = {}) => {
  const { baseContent } = opts

  const doc = new Y.Doc({ gc: false })

  // "suggestion" = show suggestions, but edit "main document" (if possible)
  // "suggestionMode" = show suggestions and behave like suggesting user (edits always go to sugestion doc)
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

  // Sync suggestion docs
  setupTwoWaySync(suggestionDoc, suggestionModeDoc)

  const viewA = createPMView(doc.get('prosemirror'))
  const viewSuggestion = createPMView(
    suggestionDoc.get('prosemirror'),
    suggestionAM
  )
  const viewSuggestionMode = createPMView(
    suggestionModeDoc.get('prosemirror'),
    suggestionModeAM
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
