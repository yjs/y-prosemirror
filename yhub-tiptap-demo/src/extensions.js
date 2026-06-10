import { Extension } from '@tiptap/core'
import { syncPlugin, yCursorPlugin, ySuggestionDecorationPlugin } from '@y/prosemirror'

// ── y-prosemirror plugins, wrapped as Tiptap extensions ──────────────────────
//
// We deliberately do NOT use `@tiptap/extension-collaboration`: it wraps the
// *old* y-prosemirror ySyncPlugin and is incompatible with the new attribution
// binding. Instead we add `syncPlugin` / `yCursorPlugin` directly via
// `addProseMirrorPlugins`, the same shape the BlockNote demo uses through
// `createExtension`.

export const createYSyncExtension = () => Extension.create({
  name: 'ySync',
  addProseMirrorPlugins () {
    return [syncPlugin()]
  }
})

/**
 * @param {import('@y/protocols/awareness').Awareness} awareness
 */
export const createYCursorExtension = (awareness) => Extension.create({
  name: 'yCursor',
  addProseMirrorPlugins () {
    return [yCursorPlugin(awareness)]
  }
})

// ── Suggestion decoration extension ──────────────────────────────────────────
// Wraps the decoration-based suggestion plugin as a Tiptap extension.

export const YSuggestionDecorationExtension = Extension.create({
  name: 'ySuggestionDecoration',
  addProseMirrorPlugins () { return [ySuggestionDecorationPlugin()] }
})
