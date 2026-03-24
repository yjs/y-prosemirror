import { PluginKey } from 'prosemirror-state' // eslint-disable-line

/**
 * The unique prosemirror plugin key for {@link import('./sync').syncPlugin}
 *
 * @public
 * @type {PluginKey<SyncPluginState>}
 */
export const ySyncPluginKey = new PluginKey('y-sync')

// /**
//  * The unique prosemirror plugin key for {@link import('./undo').undoPlugin}
//  *
//  * @public
//  * @type {PluginKey<import('./undo').UndoPluginState>}
//  */
// export const yUndoPluginKey = new PluginKey('y-undo')
//
// /**
//  * The unique prosemirror plugin key for {@link import('./cursor').cursorPlugin}
//  *
//  * @public
//  * @type {PluginKey<import('./cursor').CursorPluginState>}
//  */
// export const yCursorPluginKey = new PluginKey('yjs-cursor')
