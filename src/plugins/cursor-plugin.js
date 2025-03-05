import * as Y from 'yjs'
import { Decoration, DecorationSet } from "prosemirror-view"; // eslint-disable-line
import { Plugin } from "prosemirror-state"; // eslint-disable-line
import { Awareness } from "y-protocols/awareness"; // eslint-disable-line
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  setMeta
} from '../lib.js'
import { yCursorPluginKey, ySyncPluginKey } from './keys.js'

import * as math from 'lib0/math'

/**
 * Default awareness state filter
 *
 * @param {number} currentClientId current client id
 * @param {number} userClientId user client id
 * @param {any} _user user data
 * @return {boolean}
 */
export const defaultAwarenessStateFilter = (currentClientId, userClientId, _user) => currentClientId !== userClientId

/**
 * Default generator for a cursor element
 *
 * @param {any} user user data
 * @return {HTMLElement}
 */
export const defaultCursorBuilder = (user) => {
  const cursor = document.createElement('span')
  cursor.classList.add('ProseMirror-yjs-cursor')
  cursor.setAttribute('style', `border-color: ${user.color}`)
  const userDiv = document.createElement('div')
  userDiv.setAttribute('style', `background-color: ${user.color}`)
  userDiv.insertBefore(document.createTextNode(user.name), null)
  const nonbreakingSpace1 = document.createTextNode('\u2060')
  const nonbreakingSpace2 = document.createTextNode('\u2060')
  cursor.insertBefore(nonbreakingSpace1, null)
  cursor.insertBefore(userDiv, null)
  cursor.insertBefore(nonbreakingSpace2, null)
  return cursor
}

/**
 * Default generator for the selection attributes
 *
 * @param {any} user user data
 * @return {import('prosemirror-view').DecorationAttrs}
 */
export const defaultSelectionBuilder = (user) => {
  return {
    style: `background-color: ${user.color}70`,
    class: 'ProseMirror-yjs-selection'
  }
}

const rxValidColor = /^#[0-9a-fA-F]{6}$/

/**
 * @param {any} state
 * @param {Awareness} awareness
 * @param {function(number, number, any):boolean} awarenessFilter
 * @param {(user: { name: string, color: string }, clientId: number) => Element} createCursor
 * @param {(user: { name: string, color: string }, clientId: number) => import('prosemirror-view').DecorationAttrs} createSelection
 * @return {any} DecorationSet
 */
export const createDecorations = (
  state,
  awareness,
  awarenessFilter,
  createCursor,
  createSelection
) => {
  const ystate = ySyncPluginKey.getState(state)
  const y = ystate.doc
  const decorations = []
  if (
    ystate.snapshot != null || ystate.prevSnapshot != null ||
    ystate.binding.mapping.size === 0
  ) {
    // do not render cursors while snapshot is active
    return DecorationSet.create(state.doc, [])
  }
  awareness.getStates().forEach((aw, clientId) => {
    if (!awarenessFilter(y.clientID, clientId, aw)) {
      return
    }

    if (aw.cursor != null) {
      const user = aw.user || {}
      if (user.color == null) {
        user.color = '#ffa500'
      } else if (!rxValidColor.test(user.color)) {
        // We only support 6-digit RGB colors in y-prosemirror
        console.warn('A user uses an unsupported color format', user)
      }
      if (user.name == null) {
        user.name = `User: ${clientId}`
      }
      let anchor = relativePositionToAbsolutePosition(
        y,
        ystate.type,
        Y.createRelativePositionFromJSON(aw.cursor.anchor),
        ystate.binding.mapping
      )
      let head = relativePositionToAbsolutePosition(
        y,
        ystate.type,
        Y.createRelativePositionFromJSON(aw.cursor.head),
        ystate.binding.mapping
      )
      if (anchor !== null && head !== null) {
        const maxsize = math.max(state.doc.content.size - 1, 0)
        anchor = math.min(anchor, maxsize)
        head = math.min(head, maxsize)
        decorations.push(
          Decoration.widget(head, () => createCursor(user, clientId), {
            key: clientId + '',
            side: 10
          })
        )
        const from = math.min(anchor, head)
        const to = math.max(anchor, head)
        decorations.push(
          Decoration.inline(from, to, createSelection(user, clientId), {
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
 * @param {object} opts
 * @param {function(any, any, any):boolean} [opts.awarenessStateFilter]
 * @param {(user: any, clientId: number) => HTMLElement} [opts.cursorBuilder]
 * @param {(user: any, clientId: number) => import('prosemirror-view').DecorationAttrs} [opts.selectionBuilder]
 * @param {function(any):any} [opts.getSelection]
 * @param {string} [cursorStateField] By default all editor bindings use the awareness 'cursor' field to propagate cursor information.
 * @return {any}
 */
export const yCursorPlugin = (
  awareness,
  {
    awarenessStateFilter = defaultAwarenessStateFilter,
    cursorBuilder = defaultCursorBuilder,
    selectionBuilder = defaultSelectionBuilder,
    getSelection = (state) => state.selection
  } = {},
  cursorStateField = 'cursor'
) =>
  new Plugin({
    key: yCursorPluginKey,
    state: {
      init (_, state) {
        return createDecorations(
          state,
          awareness,
          awarenessStateFilter,
          cursorBuilder,
          selectionBuilder
        )
      },
      apply (tr, prevState, _oldState, newState) {
        const ystate = ySyncPluginKey.getState(newState)
        const yCursorState = tr.getMeta(yCursorPluginKey)
        if (
          (ystate && ystate.isChangeOrigin) ||
          (yCursorState && yCursorState.awarenessUpdated)
        ) {
          return createDecorations(
            newState,
            awareness,
            awarenessStateFilter,
            cursorBuilder,
            selectionBuilder
          )
        }
        return prevState.map(tr.mapping, tr.doc)
      }
    },
    props: {
      decorations: (state) => {
        return yCursorPluginKey.getState(state)
      }
    },
    view: (view) => {
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
        if (view.hasFocus()) {
          const selection = getSelection(view.state)
          /**
           * @type {Y.RelativePosition}
           */
          const anchor = absolutePositionToRelativePosition(
            selection.anchor,
            ystate.type,
            ystate.binding.mapping
          )
          /**
           * @type {Y.RelativePosition}
           */
          const head = absolutePositionToRelativePosition(
            selection.head,
            ystate.type,
            ystate.binding.mapping
          )
          if (
            current.cursor == null ||
            !Y.compareRelativePositions(
              Y.createRelativePositionFromJSON(current.cursor.anchor),
              anchor
            ) ||
            !Y.compareRelativePositions(
              Y.createRelativePositionFromJSON(current.cursor.head),
              head
            )
          ) {
            awareness.setLocalStateField(cursorStateField, {
              anchor,
              head
            })
          }
        } else if (
          current.cursor != null &&
          relativePositionToAbsolutePosition(
            ystate.doc,
            ystate.type,
            Y.createRelativePositionFromJSON(current.cursor.anchor),
            ystate.binding.mapping
          ) !== null
        ) {
          // delete cursor information if current cursor information is owned by this editor binding
          awareness.setLocalStateField(cursorStateField, null)
        }
      }
      awareness.on('change', awarenessListener)
      view.dom.addEventListener('focusin', updateCursorInfo)
      view.dom.addEventListener('focusout', updateCursorInfo)
      return {
        update: updateCursorInfo,
        destroy: () => {
          view.dom.removeEventListener('focusin', updateCursorInfo)
          view.dom.removeEventListener('focusout', updateCursorInfo)
          awareness.off('change', awarenessListener)
          awareness.setLocalStateField(cursorStateField, null)
        }
      }
    }
  })
