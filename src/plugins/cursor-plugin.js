import * as Y from 'yjs'
import { Decoration, DecorationSet } from 'prosemirror-view' // eslint-disable-line
import { Plugin, PluginKey } from 'prosemirror-state' // eslint-disable-line
import { Awareness } from 'y-protocols/awareness.js' // eslint-disable-line
import { ySyncPluginKey } from './sync-plugin.js'
import { absolutePositionToRelativePosition, relativePositionToAbsolutePosition, setMeta } from '../lib.js'

import * as math from 'lib0/math.js'

/**
 * The unique prosemirror plugin key for cursorPlugin.type
 *
 * @public
 */
export const yCursorPluginKey = new PluginKey('yjs-cursor')

/**
 * Default generator for a cursor element
 *
 * @param {any} user user data
 * @return HTMLElement
 */
export const defaultCursorBuilder = user => {
  const cursor = document.createElement('span')
  cursor.classList.add('ProseMirror-yjs-cursor')
  cursor.setAttribute('style', `border-color: ${user.color}`)
  const userDiv = document.createElement('div')
  userDiv.setAttribute('style', `background-color: ${user.color}`)
  userDiv.insertBefore(document.createTextNode(user.name), null)
  cursor.insertBefore(userDiv, null)
  return cursor
}

/**
 * @param {string} cursorId
 * @param {any} state
 * @param {Awareness} awareness
 * @param {Function} createCursor
 * @return {any} DecorationSet
 */
export const createDecorations = (cursorId, state, awareness, createCursor) => {
  const ystate = ySyncPluginKey.getState(state)
  const y = ystate.doc
  const decorations = []

  if (ystate.snapshot != null || ystate.prevSnapshot != null || ystate.binding === null) {
    // do not render cursors while snapshot is active
    return DecorationSet.create(state.doc, [])
  }
  awareness.getStates().forEach((aw, clientId) => {
    if (clientId === y.clientID) {
      return
    }
    const cursorInfo = aw.cursor
    if (cursorInfo != null && cursorInfo.cursorId === cursorId) {
      const user = aw.user || {}
      if (user.color == null) {
        user.color = '#ffa500'
      }
      if (user.name == null) {
        user.name = `User: ${clientId}`
      }
      let anchor = relativePositionToAbsolutePosition(y, ystate.type, Y.createRelativePositionFromJSON(cursorInfo.anchor), ystate.binding.mapping)
      let head = relativePositionToAbsolutePosition(y, ystate.type, Y.createRelativePositionFromJSON(cursorInfo.head), ystate.binding.mapping)
      if (anchor !== null && head !== null) {
        const maxsize = math.max(state.doc.content.size - 1, 0)
        anchor = math.min(anchor, maxsize)
        head = math.min(head, maxsize)
        decorations.push(Decoration.widget(head, () => createCursor(user), { key: clientId + '', side: 10 }))
        const from = math.min(anchor, head)
        const to = math.max(anchor, head)
        decorations.push(
          Decoration.inline(from, to, {
            style: `background-color: ${user.color}70`
          }, {
            inclusiveEnd: true,
            inclusiveStart: false
          })
        )
      }
    }
  })
  return DecorationSet.create(state.doc, decorations)
}

/**
 * A prosemirror plugin that listens to awareness information on Yjs.
 * This requires that a `prosemirrorPlugin` is also bound to the prosemirror.
 *
 * @public
 * @param {Awareness} awareness
 * @param {object} [opts]
 * @param {function(any):HTMLElement} [opts.cursorBuilder]
 * @param {function(any):any} [opts.getSelection]
 * @param {any} [opts.cursorId]
 * @return {any}
 */
export const yCursorPlugin = (
  awareness,
  {
    cursorBuilder = defaultCursorBuilder,
    getSelection = state => state.selection,
    cursorId = null
  } = {}
) => new Plugin({
  key: yCursorPluginKey,
  state: {
    init (_, state) {
      return createDecorations(cursorId, state, awareness, cursorBuilder)
    },
    apply (tr, prevState, oldState, newState) {
      const ystate = ySyncPluginKey.getState(newState)
      const yCursorState = tr.getMeta(yCursorPluginKey)
      if ((ystate && ystate.isChangeOrigin) || (yCursorState && yCursorState.awarenessUpdated)) {
        return createDecorations(cursorId, newState, awareness, cursorBuilder)
      }
      return prevState.map(tr.mapping, tr.doc)
    }
  },
  props: {
    decorations: state => {
      return yCursorPluginKey.getState(state)
    }
  },
  view: view => {
    const awarenessListener = () => {
      // @ts-ignore
      if (view.docView) {
        setMeta(view, yCursorPluginKey, { awarenessUpdated: true })
      }
    }
    const updateCursorInfo = () => {
      const ystate = ySyncPluginKey.getState(view.state)

      // @note We make implicit checks when checking for the cursor property
      const current = awareness.getLocalState() || {}
      const currentCursorInfo = current.cursor

      if (view.hasFocus() && ystate.binding !== null) {
        let shouldUpdateCursor = currentCursorInfo == null
        const updateCursorInfo = {}

        if (shouldUpdateCursor || currentCursorInfo.cursorId !== cursorId) {
          updateCursorInfo.cursorId = cursorId
          shouldUpdateCursor = true
        }

        const selection = getSelection(view.state)

        /**
         * @type {Y.RelativePosition}
         */
        const anchor = absolutePositionToRelativePosition(selection.anchor, ystate.type, ystate.binding.mapping)
        if (shouldUpdateCursor || !Y.compareRelativePositions(Y.createRelativePositionFromJSON(currentCursorInfo.anchor), anchor)) {
          updateCursorInfo.anchor = anchor
          shouldUpdateCursor = true
        }

        /**
         * @type {Y.RelativePosition}
         */
        const head = absolutePositionToRelativePosition(selection.head, ystate.type, ystate.binding.mapping)
        if (shouldUpdateCursor || !Y.compareRelativePositions(Y.createRelativePositionFromJSON(currentCursorInfo.head), head)) {
          updateCursorInfo.head = head
          shouldUpdateCursor = true
        }

        if (shouldUpdateCursor) {
          awareness.setLocalStateField('cursor', updateCursorInfo)
        }
      } else if (currentCursorInfo != null) {
        if (currentCursorInfo.cursorId === cursorId) {
          awareness.setLocalStateField('cursor', null)
        }
      }
    }
    awareness.on('change', awarenessListener)
    view.dom.addEventListener('focusin', updateCursorInfo)
    view.dom.addEventListener('focusout', updateCursorInfo)
    return {
      update: updateCursorInfo,
      destroy: () => {
        awareness.off('change', awarenessListener)
        view.dom.removeEventListener('focusin', updateCursorInfo)
        view.dom.removeEventListener('focusout', updateCursorInfo)

        const current = awareness.getLocalState() || {}
        const currentCursorInfo = current.cursor

        if (currentCursorInfo.cursorId === cursorId) {
          awareness.setLocalStateField('cursor', null)
        }
      }
    }
  }
})
