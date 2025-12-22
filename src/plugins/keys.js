import { PluginKey } from 'prosemirror-state' // eslint-disable-line

/**
 * The unique prosemirror plugin key for syncPlugin
 *
 * @public
 * @type {PluginKey<{ytype: Y.XmlFragment; diff?: import('../index.js').ProsemirrorDelta}>}
 */
export const ySyncPluginKey = new PluginKey('y-sync')

/**
 * The unique prosemirror plugin key for undoPlugin
 *
 * @public
 * @type {PluginKey<import('./undo-plugin').UndoPluginState>}
 */
export const yUndoPluginKey = new PluginKey('y-undo')

/**
 * The unique prosemirror plugin key for cursorPlugin
 *
 * @public
 */
export const yCursorPluginKey = new PluginKey('yjs-cursor')
