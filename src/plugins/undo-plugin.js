import { Plugin } from "@stitchkit/pm/state"

import { getRelativeSelection } from "./sync-plugin.js"
import { UndoManager, Item, ContentType, XmlElement, Text } from "yjs"
import { yUndoPluginKey, ySyncPluginKey } from "./keys.js"

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
export const undo = (state) => yUndoPluginKey.getState(state)?.undoManager?.undo() != null

/**
 * Redo the last user action
 *
 * @param {import('prosemirror-state').EditorState} state
 * @return {boolean} whether a change was undone
 */
export const redo = (state) => yUndoPluginKey.getState(state)?.undoManager?.redo() != null

/**
 * Undo the last user action if there are undo operations available
 * @type {import('prosemirror-state').Command}
 */
export const undoCommand = (state, dispatch) =>
  dispatch == null ? yUndoPluginKey.getState(state)?.undoManager?.canUndo() : undo(state)

/**
 * Redo the last user action if there are redo operations available
 * @type {import('prosemirror-state').Command}
 */
export const redoCommand = (state, dispatch) =>
  dispatch == null ? yUndoPluginKey.getState(state)?.undoManager?.canRedo() : redo(state)

export const defaultProtectedNodes = new Set(["paragraph"])

/**
 * @param {import('yjs').Item} item
 * @param {Set<string>} protectedNodes
 * @returns {boolean}
 */
export const defaultDeleteFilter = (item, protectedNodes) =>
  !(item instanceof Item) ||
  !(item.content instanceof ContentType) ||
  !(
    item.content.type instanceof Text ||
    (item.content.type instanceof XmlElement && protectedNodes.has(item.content.type.nodeName))
  ) ||
  item.content.type._length === 0

/**
 * @param {object} [options]
 * @param {Set<string>} [options.protectedNodes]
 * @param {any[]} [options.trackedOrigins]
 * @param {UndoManagerDelayedDestroy | null} [options.undoManager]
 */
export const yUndoPlugin = ({ protectedNodes = defaultProtectedNodes, trackedOrigins = [], undoManager = null } = {}) =>
  new Plugin({
    key: yUndoPluginKey,
    state: {
      init: (initargs, state) => {
        // TODO: check if plugin order matches and fix
        const ystate = ySyncPluginKey.getState(state)
        /** @type {UndoManagerDelayedDestroy} */
        const _undoManager =
          undoManager ||
          new UndoManagerDelayedDestroy(ystate.type, {
            trackedOrigins: new Set([ySyncPluginKey].concat(trackedOrigins)),
            deleteFilter: (item) => defaultDeleteFilter(item, protectedNodes),
            captureTransaction: (tr) => tr.meta.get("addToHistory") !== false,
          })
        return {
          undoManager: _undoManager,
          prevSel: null,
          hasUndoOps: _undoManager.undoStack.length > 0,
          hasRedoOps: _undoManager.redoStack.length > 0,
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
            hasRedoOps,
          }
        } else {
          if (hasUndoOps !== val.hasUndoOps || hasRedoOps !== val.hasRedoOps) {
            return Object.assign({}, val, {
              hasUndoOps: undoManager.undoStack.length > 0,
              hasRedoOps: undoManager.redoStack.length > 0,
            })
          } else {
            // nothing changed
            return val
          }
        }
      },
    },
    view: (view) => {
      const ystate = ySyncPluginKey.getState(view.state)
      /** @type {UndoManagerDelayedDestroy} */
      const undoManager = /** @type {UndoManagerDelayedDestroy} */ (yUndoPluginKey.getState(view.state).undoManager)
      if (typeof undoManager.preventDestroy === "function") {
        undoManager.preventDestroy()
      }
      undoManager.on("stack-item-added", ({ stackItem }) => {
        const binding = ystate.binding
        if (binding) {
          stackItem.meta.set(binding, yUndoPluginKey.getState(view.state).prevSel)
        }
      })
      undoManager.on("stack-item-popped", ({ stackItem }) => {
        const binding = ystate.binding
        if (binding) {
          binding.beforeTransactionSelection = stackItem.meta.get(binding) || binding.beforeTransactionSelection
        }
      })
      return {
        destroy: () => {
          if (typeof undoManager.delayedDestroy === "function") {
            undoManager.delayedDestroy()
          }
        },
      }
    },
  })

// replace "new UndoManager"
// const _undoManager = undoManager || new UndoManagerDelayedDestroy(ystate.type, {

// Call undoManager.preventDestroy at the beginning of the view function
// const undoManager = yUndoPluginKey.getState(view.state).undoManager
// undoManager.preventDestroy()

// Call `undoManager.delayedDestroy` instead of `undoManager.destroy`.
//     if (typeof undoManager.delayedDestroy === 'function') {
//       undoManager.delayedDestroy()

class UndoManagerDelayedDestroy extends UndoManager {
  constructor(type, opts) {
    super(type, opts)
    this.destroyCounter = 0
  }

  preventDestroy() {
    this.destroyCounter++
  }

  delayedDestroy() {
    const memorizedCounter = this.destroyCounter
    queue(() => this.destroyCounter === memorizedCounter && super.destroy())
  }
}

const queue = (fn) => Promise.resolve().then(fn)
