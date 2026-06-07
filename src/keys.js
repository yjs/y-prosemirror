import { PluginKey } from 'prosemirror-state' // eslint-disable-line

/** @typedef {import('lib0/schema').Unwrap<typeof import('./sync-plugin.js').$syncPluginState>} SyncPluginState */

/**
 * The unique prosemirror plugin key for {@link import('./sync-plugin.js').syncPlugin}
 *
 * @public
 * @type {PluginKey<SyncPluginState>}
 */
export const ySyncPluginKey = new PluginKey('y-sync')

/**
 * The unique prosemirror plugin key for {@link import('./undo-plugin.js').yUndoPlugin}
 *
 * @public
 * @type {PluginKey<import('./undo-plugin.js').UndoPluginState>}
 */
export const yUndoPluginKey = new PluginKey('y-undo')

/**
 * The unique prosemirror plugin key for {@link import('./cursor-plugin.js').cursorPlugin}
 *
 * @public
 * @type {PluginKey<import('prosemirror-view').DecorationSet>}
 */
export const yCursorPluginKey = new PluginKey('y-cursor')

/**
 * The unique prosemirror plugin key for {@link import('./suggestion-decoration-plugin.js').ySuggestionDecorationPlugin}
 *
 * @public
 * @type {PluginKey<import('prosemirror-view').DecorationSet>}
 */
export const ySuggestionDecorationPluginKey = new PluginKey('y-suggestion-decorations')

/**
 * The unique prosemirror plugin key for {@link import('./diff-decorations.js').suggestionDiffPlugin}
 *
 * @public
 * @type {PluginKey<import('prosemirror-view').DecorationSet>}
 */
export const suggestionDiffPluginKey = new PluginKey('suggestion-diff')
