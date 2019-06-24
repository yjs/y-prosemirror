
import { Plugin, PluginKey, EditorState, TextSelection } from 'prosemirror-state' // eslint-disable-line

import { ySyncPluginKey, getRelativeSelection } from './sync-plugin.js'
import { UndoManager } from 'yjs'

export const undo = state => {
  const undoManager = yUndoPluginKey.getState(state).undoManager
  if (undoManager != null) {
    undoManager.undo()
    return true
  }
}

export const redo = state => {
  const undoManager = yUndoPluginKey.getState(state).undoManager
  if (undoManager != null) {
    undoManager.redo()
    return true
  }
}

export const yUndoPluginKey = new PluginKey('y-undo')

export const yUndoPlugin = new Plugin({
  key: yUndoPluginKey,
  state: {
    init: (initargs, state) => {
      // TODO: check if plugin order matches and fix
      const ystate = ySyncPluginKey.getState(state)
      const undoManager = new UndoManager(ystate.type, new Set([null, ySyncPluginKey]))
      return {
        undoManager,
        prevSel: null
      }
    },
    apply: (tr, val, oldState, state) => {
      const binding = ySyncPluginKey.getState(state).binding
      if (binding) {
        return {
          undoManager: val.undoManager,
          prevSel: getRelativeSelection(binding, oldState)
        }
      } else {
        return val
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
