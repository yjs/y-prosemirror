/**
 * ProseMirror plugin that renders Yjs attribution as decorations over a
 * clean document. Follows the cursor-plugin pattern: a separate plugin
 * with its own key, state, and decorations prop.
 *
 * Use alongside `syncPlugin()` which always syncs clean content (no
 * attribution marks, no deleted text). This plugin reads the attributed
 * delta separately and overlays suggestions as decorations.
 *
 * The sync plugin dispatches y-sync-transaction meta on remote Y changes
 * and AM change events. This plugin rebuilds decorations in `apply`
 * when it sees that meta or a doc change.
 */
import * as Y from '@y/y'
import { Plugin } from 'prosemirror-state'
import { DecorationSet } from 'prosemirror-view'
import { ySyncPluginKey, ySuggestionDecorationPluginKey } from './keys.js'
import { ydeltaToDiffSet } from './y-attribution-to-diffset.js'
import { buildDiffDecorationSet } from './diff-decorations.js' // eslint-disable-line
/** @typedef {import('./diff-decorations.js').SuggestionDecorationOptions} SuggestionDecorationOptions */

/**
 * Build decorations from the Yjs attribution delta.
 *
 * @param {import('prosemirror-model').Node} doc
 * @param {import('prosemirror-model').Schema} schema
 * @param {Y.Type | null} ytype
 * @param {Y.AbstractAttributionManager | null} am
 * @param {SuggestionDecorationOptions} opts
 * @returns {DecorationSet}
 */
function computeDecorations (doc, schema, ytype, am, opts) {
  if (!ytype || !am || am === Y.noAttributionsManager) {
    return DecorationSet.empty
  }
  const attributedDelta = ytype.toDeltaDeep(am)
  const diffs = ydeltaToDiffSet(attributedDelta, { displayedDoc: doc, schema })
  try {
    return buildDiffDecorationSet(doc, diffs, schema, opts)
  } catch (err) {
    console.error('[y-prosemirror] decoration build failed:', err)
    return DecorationSet.empty
  }
}

/**
 * @param {SuggestionDecorationOptions} [opts]
 * @returns {Plugin<DecorationSet>}
 */
export const ySuggestionDecorationPlugin = (opts = {}) =>
  new Plugin({
    key: ySuggestionDecorationPluginKey,
    state: {
      init: () => DecorationSet.empty,
      apply: (tr, prev, oldState, newState) => {
        const ySyncMeta = tr.getMeta('y-sync-transaction')
        const configMeta = tr.getMeta(ySyncPluginKey)
        const metaOverride = configMeta || ySyncMeta
        if (metaOverride) {
          const baseSync = ySyncPluginKey.getState(oldState) || ySyncPluginKey.getState(newState)
          const ystate = Object.assign({}, baseSync, metaOverride)
          if (ystate?.attributionManager && ystate.attributionManager !== Y.noAttributionsManager) {
            return computeDecorations(
              newState.doc, newState.schema, ystate.ytype, ystate.attributionManager, opts
            )
          }
        }
        if (tr.docChanged) return prev.map(tr.mapping, tr.doc)
        return prev
      }
    },
    props: {
      decorations: (state) => ySuggestionDecorationPluginKey.getState(state)
    }
  })
