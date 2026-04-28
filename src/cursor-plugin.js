import * as Y from '@y/y'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { Plugin } from 'prosemirror-state'
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition
} from './positions.js'
import { yCursorPluginKey, ySyncPluginKey } from './keys.js'

import * as math from 'lib0/math'
import { $syncPluginStateUpdate } from './sync-plugin.js'

/**
 * @typedef {Object} User
 * @property {string} [name] The label to display for the user
 * @property {string} [color] The color to display for the user
 */

/**
 * @callback AwarenessFilter
 * @param {number} currentClientId
 * @param {number} userClientId
 * @param {Record<string, any>} awarenessState
 * @returns {boolean}
 */

/**
 * Default generator for a cursor element
 *
 * @param {User} user user data
 * @return {HTMLElement}
 */
export const defaultCursorBuilder = (user) => {
  const cursor = document.createElement('span')
  cursor.classList.add('ProseMirror-yjs-cursor')
  if (user.color) {
    cursor.style.setProperty('--user-color', user.color)
  }
  const userDiv = document.createElement('div')
  if (user.color) {
    userDiv.style.setProperty('--user-color', user.color)
  }
  userDiv.insertBefore(document.createTextNode(user.name || ''), null)
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
 * @param {User} user user data
 * @return {import('prosemirror-view').DecorationAttrs}
 */
export const defaultSelectionBuilder = (user) => {
  return {
    style: `--user-color: ${user.color}`,
    class: 'ProseMirror-yjs-selection'
  }
}

/**
 * @param {import('prosemirror-state').EditorState} state
 * @param {import('@y/protocols/awareness').Awareness} awareness
 * @param {AwarenessFilter} awarenessFilter
 * @param {(user: User, clientId: number) => Element} createCursor
 * @param {(user: User, clientId: number) => import('prosemirror-view').DecorationAttrs} createSelection
 * @param {string} cursorStateField
 * @param {any} [syncStateOverride] Pre-resolved sync plugin state. When provided, used in place of looking it up from `state`. Used by `apply` so we can read the sync state from `oldState` (which is fully populated) instead of from `newState` (which may not have the sync field yet if this plugin runs before the sync plugin in the field order).
 * @return {DecorationSet}
 */
export const createDecorations = (
  state,
  awareness,
  awarenessFilter,
  createCursor,
  createSelection,
  cursorStateField,
  syncStateOverride
) => {
  const ystate = syncStateOverride != null ? syncStateOverride : ySyncPluginKey.getState(state)
  const type = ystate?.ytype
  const doc = type?.doc
  if (!type || !doc) {
    // do not render cursors while snapshot is active
    return DecorationSet.empty
  }
  /**
   * @type {Decoration[]}
   */
  const decorations = []
  // Use `awareness.doc.clientID` (or its `clientID` field, which mirrors it)
  // rather than `type.doc.clientID` for the local-client identity. They're the
  // same in normal collaboration, but diverge when the bound `ytype` lives in a
  // *different* Y.Doc than the awareness — e.g., a suggestion-tracking Y.Doc
  // whose clientID is deliberately swapped to attribute edits to a "suggester"
  // identity. Awareness peer keys are always the awareness doc's clientIDs, so
  // filtering against the bound type's doc would fail to recognize the local
  // user and we'd render our own cursor as if it were a remote one.
  const localClientId = awareness.doc ? awareness.doc.clientID : awareness.clientID
  awareness.getStates().forEach((aw, clientId) => {
    if (!awarenessFilter(localClientId, clientId, aw)) {
      return
    }

    const cursor = aw[cursorStateField]

    if (cursor != null) {
      const user = aw.user || {}
      if (user.color == null) {
        user.color = '#ffa500'
      }
      if (user.name == null) {
        user.name = `User: ${clientId}`
      }
      let anchor = relativePositionToAbsolutePosition(
        Y.createRelativePositionFromJSON(cursor.anchor),
        type,
        state.doc,
        ystate.attributionManager
      )
      let head = relativePositionToAbsolutePosition(
        Y.createRelativePositionFromJSON(cursor.head),
        type,
        state.doc,
        ystate.attributionManager
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
 * @param {import('@y/protocols/awareness').Awareness} awareness
 * @param {object} opts
 * @param {AwarenessFilter} [opts.awarenessStateFilter] A function that filters the awareness states to be rendered
 * @param {(user: User, clientId: number) => HTMLElement} [opts.cursorBuilder] A function that creates a cursor element
 * @param {(user: User, clientId: number) => import('prosemirror-view').DecorationAttrs} [opts.selectionBuilder] A function that creates a selection decoration
 * @param {(state: import('prosemirror-state').EditorState) => {$anchor: import('prosemirror-model').ResolvedPos, $head: import('prosemirror-model').ResolvedPos}} [opts.getSelection] A function that gets the selection from the editor state
 * @param {string} [cursorStateField] By default all editor bindings use the awareness 'cursor' field to propagate cursor information, this allows you to use a different field name
 * @return {any}
 */
export const yCursorPlugin = (
  awareness,
  {
    awarenessStateFilter = (currentClientId, userClientId) => currentClientId !== userClientId,
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
          selectionBuilder,
          cursorStateField
        )
      },
      apply (tr, prevState, oldState, newState) {
        const ySyncMeta = $syncPluginStateUpdate.nullable.expect(tr.getMeta(ySyncPluginKey) || null)
        const yCursorState = tr.getMeta(yCursorPluginKey)
        if (
          (ySyncMeta) ||
          (yCursorState && yCursorState.awarenessUpdated)
        ) {
          // PM fills `newState` plugin fields in field order during apply, so
          // `ySyncPluginKey.getState(newState)` may return null if this plugin
          // runs before the sync plugin (which can happen when the host
          // editor — e.g., Tiptap/BlockNote — orders plugins by name or
          // priority). Read the sync state from `oldState` (fully populated)
          // and overlay the in-flight update from this transaction's meta, if
          // any, so we still see the new ytype the moment configureYProsemirror
          // is dispatched.
          const baseSync = ySyncPluginKey.getState(oldState) || ySyncPluginKey.getState(newState)
          const syncState = ySyncMeta ? Object.assign({}, baseSync, ySyncMeta) : baseSync
          return createDecorations(
            newState,
            awareness,
            awarenessStateFilter,
            cursorBuilder,
            selectionBuilder,
            cursorStateField,
            syncState
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
        if (view.docView) { // TODO why is this using docView? Ask Kevin about this.
          view.dispatch(view.state.tr.setMeta(yCursorPluginKey, { awarenessUpdated: true }))
        }
      }
      const updateCursorInfo = () => {
        const ystate = ySyncPluginKey.getState(view.state)
        // @note We make implicit checks when checking for the cursor property
        const current = awareness.getLocalState() || {}
        /**
         * @type {{anchor: any, head: any}}
         */
        const cursor = current[cursorStateField]
        if (view.hasFocus() && ystate?.ytype) {
          const selection = getSelection(view.state)
          const anchor = absolutePositionToRelativePosition(
            selection.$anchor,
            ystate.ytype,
            ystate.attributionManager
          )
          const head = absolutePositionToRelativePosition(
            selection.$head,
            ystate.ytype,
            ystate.attributionManager
          )
          if (
            cursor == null ||
            !Y.compareRelativePositions(
              Y.createRelativePositionFromJSON(cursor.anchor),
              anchor
            ) ||
            !Y.compareRelativePositions(
              Y.createRelativePositionFromJSON(cursor.head),
              head
            )
          ) {
            awareness.setLocalStateField(cursorStateField, {
              anchor,
              head
            })
          }
        } else if (
          cursor != null &&
          ystate?.ytype &&
          relativePositionToAbsolutePosition(
            Y.createRelativePositionFromJSON(cursor.anchor),
            ystate.ytype,
            view.state.doc,
            ystate.attributionManager
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
