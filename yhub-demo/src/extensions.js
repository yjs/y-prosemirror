import { createExtension } from '@blocknote/core'
import { syncPlugin } from '@y/prosemirror'
import { yCursorPlugin } from '../../src/cursor-plugin.js'

export const mapAttributionToMark = (format, attribution) => {
  let mergeWith = null
  if (attribution.insert) {
    mergeWith = { insertion: { id: 1 } }
  } else if (attribution.delete) {
    mergeWith = { deletion: { id: 1 } }
  } else if (attribution.format) {
    mergeWith = {
      modification: {
        id: 1,
        type: 'format',
        attrName: null,
        previousValue: null,
        newValue: null
      }
    }
  }
  return Object.assign({}, format, mergeWith)
}

// y-sync must run BEFORE y-cursor so cursor.apply() sees the updated ytype
// when `configureYProsemirror` dispatches a transaction that swaps it in.
// BlockNote reorders plugins at editor build time, so we bundle both plugins
// into the same extension to keep them adjacent and in the right order.
export const YSyncExtension = createExtension(({ options }) => ({
  key: 'ySync',
  prosemirrorPlugins: [
    syncPlugin({ mapAttributionToMark }),
    ...(options?.awareness ? [yCursorPlugin(options.awareness)] : [])
  ]
}))
