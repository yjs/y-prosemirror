
import * as Y from 'yjs'
import { Decoration, DecorationSet } from 'prosemirror-view' // eslint-disable-line
import { Plugin, PluginKey, EditorState, TextSelection } from 'prosemirror-state' // eslint-disable-line
import { Awareness } from 'y-protocols/awareness.js' // eslint-disable-line
import { ySyncPluginKey } from './sync-plugin.js'
import { absolutePositionToRelativePosition, relativePositionToAbsolutePosition } from '../lib.js'

import * as math from 'lib0/math.js'

/**
 * The unique prosemirror plugin key for cursorPlugin.type
 *
 * @public
 */
export const yCursorPluginKey = new PluginKey('yjs-cursor')

/**
 * A prosemirror plugin that listens to awareness information on Yjs.
 * This requires that a `prosemirrorPlugin` is also bound to the prosemirror.
 *
 * @public
 * @param {Awareness} awareness
 * @return {Plugin}
 */
export const yCursorPlugin = awareness => new Plugin({
  key: yCursorPluginKey,
  props: {
    decorations: state => {
      const ystate = ySyncPluginKey.getState(state)
      const y = ystate.doc
      const decorations = []
      if (ystate.snapshot != null || ystate.binding === null) {
        // do not render cursors while snapshot is active
        return
      }
      awareness.getStates().forEach((aw, clientId) => {
        if (clientId === y.clientID) {
          return
        }
        if (aw.cursor != null) {
          let user = aw.user || {}
          if (user.color == null) {
            user.color = '#ffa500'
          }
          if (user.name == null) {
            user.name = `User: ${clientId}`
          }
          let anchor = relativePositionToAbsolutePosition(y, ystate.type, Y.createRelativePositionFromJSON(aw.cursor.anchor), ystate.binding.mapping)
          let head = relativePositionToAbsolutePosition(y, ystate.type, Y.createRelativePositionFromJSON(aw.cursor.head), ystate.binding.mapping)
          if (anchor !== null && head !== null) {
            let maxsize = math.max(state.doc.content.size - 1, 0)
            anchor = math.min(anchor, maxsize)
            head = math.min(head, maxsize)
            decorations.push(Decoration.widget(head, () => {
              const cursor = document.createElement('span')
              cursor.classList.add('ProseMirror-yjs-cursor')
              cursor.setAttribute('style', `border-color: ${user.color}`)
              const userDiv = document.createElement('div')
              userDiv.setAttribute('style', `background-color: ${user.color}`)
              userDiv.insertBefore(document.createTextNode(user.name), null)
              cursor.insertBefore(userDiv, null)
              return cursor
            }, { key: clientId + '' }))
            const from = math.min(anchor, head)
            const to = math.max(anchor, head)
            decorations.push(Decoration.inline(from, to, { style: `background-color: ${user.color}70` }))
          }
        }
      })
      return DecorationSet.create(state.doc, decorations)
    }
  },
  view: view => {
    const ystate = ySyncPluginKey.getState(view.state)
    const awarenessListener = () => {
      view.updateState(view.state)
    }
    const updateCursorInfo = () => {
      const current = awareness.getLocalState() || {}
      if (view.hasFocus() && ystate.binding !== null) {
        /**
         * @type {Y.RelativePosition}
         */
        const anchor = absolutePositionToRelativePosition(view.state.selection.anchor, ystate.type, ystate.binding.mapping)
        /**
         * @type {Y.RelativePosition}
         */
        const head = absolutePositionToRelativePosition(view.state.selection.head, ystate.type, ystate.binding.mapping)
        if (current.cursor == null || !Y.compareRelativePositions(Y.createRelativePositionFromJSON(current.cursor.anchor), anchor) || !Y.compareRelativePositions(Y.createRelativePositionFromJSON(current.cursor.head), head)) {
          awareness.setLocalStateField('cursor', {
            anchor, head
          })
        }
      } else if (current.cursor !== null) {
        awareness.setLocalStateField('cursor', null)
      }
    }
    awareness.on('change', awarenessListener)
    view.dom.addEventListener('focusin', updateCursorInfo)
    view.dom.addEventListener('focusout', updateCursorInfo)
    return {
      update: updateCursorInfo,
      destroy: () => {
        const y = ySyncPluginKey.getState(view.state).doc
        y.setAwarenessField('cursor', null)
        y.off('change', awarenessListener)
      }
    }
  }
})
