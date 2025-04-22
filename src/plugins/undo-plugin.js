import { Plugin } from 'prosemirror-state'

import { getRelativeSelection } from './sync-plugin.js'
import { UndoManager, Item, ContentType, XmlElement, Text } from 'yjs'
import { yUndoPluginKey, ySyncPluginKey } from './keys.js'

/**
 * @typedef {Object} UndoPluginState
 * @property {import('yjs').UndoManager} undoManager
 * @property {ReturnType<typeof getRelativeSelection> | null} prevSel
 * @property {boolean} hasUndoOps
 * @property {boolean} hasRedoOps
 */

/**
 * Undo the last user action
 *
 * @param {import('prosemirror-state').EditorState} state
 * @return {boolean} whether a change was undone
 */
export const undo = state => yUndoPluginKey.getState(state)?.undoManager?.undo() != null

/**
 * Redo the last user action
 *
 * @param {import('prosemirror-state').EditorState} state
 * @return {boolean} whether a change was undone
 */
export const redo = state => yUndoPluginKey.getState(state)?.undoManager?.redo() != null

/**
 * Undo the last user action if there are undo operations available
 * @type {import('prosemirror-state').Command}
 */
export const undoCommand = (state, dispatch) => dispatch == null ? yUndoPluginKey.getState(state)?.undoManager?.canUndo() : undo(state)

/**
 * Redo the last user action if there are redo operations available
 * @type {import('prosemirror-state').Command}
 */
export const redoCommand = (state, dispatch) => dispatch == null ? yUndoPluginKey.getState(state)?.undoManager?.canRedo() : redo(state)

export const defaultProtectedNodes = new Set(['paragraph'])

/**
 * @param {import('yjs').Item} item
 * @param {Set<string>} protectedNodes
 * @returns {boolean}
 */
export const defaultDeleteFilter = (item, protectedNodes) => !(item instanceof Item) ||
  !(item.content instanceof ContentType) ||
  !(item.content.type instanceof Text ||
  (item.content.type instanceof XmlElement && protectedNodes.has(item.content.type.nodeName))) ||
  item.content.type._length === 0

/**
 * @param {object} [options]
 * @param {Set<string>} [options.protectedNodes]
 * @param {any[]} [options.trackedOrigins]
 * @param {import('yjs').UndoManager | null} [options.undoManager]
 */
export const yUndoPlugin = ({ protectedNodes = defaultProtectedNodes, trackedOrigins = [], undoManager = null } = {}) => new Plugin({
  key: yUndoPluginKey,
  state: {
    init: (initargs, state) => {
      // TODO: check if plugin order matches and fix
      const ystate = ySyncPluginKey.getState(state)
      const _undoManager = undoManager || new UndoManager(ystate.type, {
        trackedOrigins: new Set([ySyncPluginKey].concat(trackedOrigins)),
        deleteFilter: (item) => defaultDeleteFilter(item, protectedNodes),
        captureTransaction: tr => tr.meta.get('addToHistory') !== false
      })
      return {
        undoManager: _undoManager,
        prevSel: null,
        hasUndoOps: _undoManager.undoStack.length > 0,
        hasRedoOps: _undoManager.redoStack.length > 0
      }
    },
    apply: (tr, val, oldState, state) => {
      const binding = ySyncPluginKey.getState(state).binding
      const undoManager = val.undoManager
      const hasUndoOps = undoManager.undoStack.length > 0
      const hasRedoOps = undoManager.redoStack.length > 0
      if (binding) {
        return {
          undoManager,
          prevSel: getRelativeSelection(binding, oldState),
          hasUndoOps,
          hasRedoOps
        }
      } else {
        if (hasUndoOps !== val.hasUndoOps || hasRedoOps !== val.hasRedoOps) {
          return Object.assign({}, val, {
            hasUndoOps: undoManager.undoStack.length > 0,
            hasRedoOps: undoManager.redoStack.length > 0
          })
        } else { // nothing changed
          return val
        }
      }
    }
  },
  view: view => {
    const ystate = ySyncPluginKey.getState(view.state)
    const undoManager = yUndoPluginKey.getState(view.state).undoManager
    undoManager.on('stack-item-added', ({ stackItem }) => {
      const binding = ystate.binding
      if (binding) {
        stackItem.meta.set(binding, yUndoPluginKey.getState(view.state).prevSel)
      }
    })
    undoManager.on('stack-item-popped', ({ stackItem }) => {
      const binding = ystate.binding
      if (binding) {
        binding.beforeTransactionSelection = stackItem.meta.get(binding) || binding.beforeTransactionSelection
      }
    })
    return {
      destroy: () => {
        undoManager.destroy()
      }
    }
  }
})
