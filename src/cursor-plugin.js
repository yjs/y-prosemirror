import * as Y from '@y/y'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { Plugin } from 'prosemirror-state'
import {
  absolutePositionsToRelativePositions,
  relativePositionsToAbsolutePositions
} from './positions.js'
import { yCursorPluginKey, ySyncPluginKey } from './keys.js'

import * as math from 'lib0/math'
import { $syncPluginStateUpdate, usableTransformer } from './sync-plugin.js'

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
 * @returns {boolean} true if the cursor should be rendered for the given client
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
 * @typedef {{ytype: Y.Node | null, renderer: Y.AbstractRenderer | null, binding?: import('lib0/delta/rdt').Binding<any, any> | null} | undefined} CursorSyncState
 */

/**
 * @param {import('prosemirror-state').EditorState} state
 * @param {import('@y/protocols/awareness').Awareness} awareness
 * @param {AwarenessFilter} awarenessFilter
 * @param {(user: User, clientId: number) => Element} createCursor
 * @param {(user: User, clientId: number) => import('prosemirror-view').DecorationAttrs} createSelection
 * @param {string} cursorStateField
 * @param {CursorSyncState} ystate
 * @return {DecorationSet}
 */
export const createDecorations = (
  state,
  awareness,
  awarenessFilter,
  createCursor,
  createSelection,
  cursorStateField,
  ystate
) => {
  const type = ystate?.ytype
  const doc = type?.doc
  if (!type || !doc) {
    // do not render cursors while snapshot is active
    return DecorationSet.empty
  }
  const maxsize = math.max(state.doc.content.size - 1, 0)
  /**
   * @type {Array<{clientId: number, user: User, anchor: Y.RelativePosition, head: Y.RelativePosition}>}
   */
  const entries = []
  awareness.getStates().forEach((aw, clientId) => {
    const cursor = aw[cursorStateField]

    if (cursor == null || !awarenessFilter(awareness.clientID, clientId, aw)) {
      return
    }

    const user = aw.user || {}
    if (user.color == null) {
      user.color = '#ffa500'
    }
    if (user.name == null) {
      user.name = `User: ${clientId}`
    }
    entries.push({
      clientId,
      user,
      anchor: Y.createRelativePositionFromJSON(cursor.anchor),
      head: Y.createRelativePositionFromJSON(cursor.head)
    })
  })
  const rposs = entries.flatMap(e => [e.anchor, e.head])
  // Map all awareness positions through the binding transformer in one batch, so they
  // resolve in the coordinates of the transformed (view-side) document. Without a live
  // binding (headless usage, or the pre-setup/stale-binding window) the positions
  // resolve directly against the Y render.
  const ctx = { ytype: type, renderer: ystate.renderer ?? null, transformer: usableTransformer(ystate) }
  /**
   * @type {Array<number | null>}
   */
  let positions
  try {
    positions = relativePositionsToAbsolutePositions(rposs, ctx, state.doc)
  } catch (err) {
    console.warn('y-prosemirror cursor-plugin: transformer position mapping failed, falling back to direct resolution', err)
    positions = relativePositionsToAbsolutePositions(rposs, { ...ctx, transformer: null }, state.doc)
  }
  /**
   * @type {Decoration[]}
   */
  const decorations = []
  entries.forEach(({ clientId, user }, i) => {
    let anchor = positions[i * 2]
    let head = positions[i * 2 + 1]
    if (anchor !== null && head !== null) {
      anchor = math.min(anchor, maxsize)
      head = math.min(head, maxsize)
      decorations.push(
        Decoration.widget(head, () => createCursor(user, clientId), {
          key: clientId + '',
          side: 10
        })
      )
      decorations.push(
        Decoration.inline(math.min(anchor, head), math.max(anchor, head), createSelection(user, clientId), {
          inclusiveEnd: true,
          inclusiveStart: false
        })
      )
    }
  })
  return DecorationSet.create(state.doc, decorations)
}

/**
 * @callback ResolveLocalCursorStateCallback
 * @param {object} ctx - The context object
 * @param {import('prosemirror-view').EditorView} ctx.view - The editor view
 * @param {{anchor: Y.RelativePosition, head: Y.RelativePosition} | null} ctx.prevState - The previous local cursor state currently published in awareness for this client (decoded to Y.RelativePosition), or null if not set
 * @param {{anchor: Y.RelativePosition, head: Y.RelativePosition} | null} ctx.nextState - The candidate next cursor state, freshly derived from the editor's current selection (not yet published to awareness), or null if no Y type is bound or the selection could not be anchored in the Y document
 * @param {boolean} ctx.isOwnState - Whether `prevState` resolves inside this editor binding's bound type (i.e. this binding is the source of truth for the published cursor state)
 * @param {'update' | 'focus' | 'blur'} ctx.reason - What triggered this invocation: 'update' (PM view.update tick), 'focus' (focusin on view.dom; only fires when no `setSelection` transaction is pending — see `selectionUpdateIsPending` in cursor-plugin.js), or 'blur' (focusout on view.dom)
 * @returns {{anchor: Y.RelativePosition, head: Y.RelativePosition} | null} The next local cursor state to publish under `cursorStateField` in awareness, or null to clear it
 */

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
 * @param {ResolveLocalCursorStateCallback} [opts.resolveLocalCursorState] A policy that decides which cursor state to publish to awareness given the previously-published state, the state derived from the current selection, and what triggered the update
 * @param {string} [opts.cursorStateField = 'cursor'] By default all editor bindings use the awareness 'cursor' field to propagate cursor information, this allows you to use a different field name
 * @return {Plugin<DecorationSet>}
 */
export const yCursorPlugin = (
  awareness,
  {
    awarenessStateFilter = (currentClientId, userClientId) => currentClientId !== userClientId,
    cursorBuilder = defaultCursorBuilder,
    selectionBuilder = defaultSelectionBuilder,
    cursorStateField = 'cursor',
    resolveLocalCursorState = (ctx) => {
      if (ctx.view.hasFocus()) {
        return ctx.nextState
      }
      // clear the published cursor state if this binding owns it,
      // otherwise leave the previously-published state in place
      return ctx.isOwnState ? null : ctx.prevState
    }
  } = {}
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
          cursorStateField,
          undefined
        )
      },
      apply (tr, prevState, oldState, newState) {
        const ySyncMeta = $syncPluginStateUpdate.nullable.expect(tr.getMeta(ySyncPluginKey) || null)
        const ySyncTransaction = tr.getMeta('y-sync-transaction')
        const yCursorMeta = tr.getMeta(yCursorPluginKey)

        if (ySyncMeta || ySyncTransaction || yCursorMeta?.awarenessUpdated) {
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
        // remap decorations
        return prevState.map(tr.mapping, tr.doc)
      }
    },
    props: {
      decorations: (state) => yCursorPluginKey.getState(state)
    },
    view: (view) => {
      const awarenessListener = () => {
        if (view.isDestroyed) {
          return
        }
        view.dispatch(view.state.tr.setMeta(yCursorPluginKey, { awarenessUpdated: true }))
      }

      /**
       * @param {'update' | 'focus' | 'blur'} reason
       */
      const updateCursorInfo = (reason) => {
        if (view.isDestroyed) {
          return
        }
        const ystate = ySyncPluginKey.getState(view.state)
        const rawCursor = (awareness.getLocalState() || {})[cursorStateField]
        /**
         * @type {{anchor: Y.RelativePosition, head: Y.RelativePosition} | null}
         */
        const prevState = rawCursor != null
          ? {
              anchor: Y.createRelativePositionFromJSON(rawCursor.anchor),
              head: Y.createRelativePositionFromJSON(rawCursor.head)
            }
          : null

        // Belt-and-braces around the PM->Y position encoding. positions.js
        // already falls back to a doc-root relative position on traversal
        // failure, but anything else throwing here (DOM-change-time selection
        // resolution, renderer internals) would bubble up through dispatch and
        // tear the editor down on every keystroke - just skip the awareness
        // update in that case.
        /** @type {{anchor: Y.RelativePosition, head: Y.RelativePosition} | null} */
        let nextState = null
        if (ystate?.ytype) {
          try {
            const sel = view.state.selection
            // map the selection through the binding transformer (view→data) so the
            // published positions anchor where the content actually lives in Y
            const mapped = absolutePositionsToRelativePositions(
              [sel.$anchor, sel.$head],
              { ytype: ystate.ytype, renderer: ystate.renderer ?? null, transformer: usableTransformer(ystate) }
            )
            // An unresolvable endpoint leaves nextState null - the policy then clears
            // the published cursor. Never publish a half-mapped pair (it could invert
            // the selection).
            if (mapped[0] != null && mapped[1] != null) {
              nextState = { anchor: mapped[0], head: mapped[1] }
            }
          } catch (err) {
            console.warn('y-prosemirror cursor-plugin: failed to encode selection, skipping awareness update', err)
            return
          }
        }
        const resolvedState = resolveLocalCursorState({
          view,
          prevState,
          nextState,
          reason,
          get isOwnState () {
            // a pure containment check ("does the published rpos resolve inside the
            // bound type") - Y-side resolution suffices, no transformer pass needed
            return prevState != null && ystate?.ytype != null && Y.createDeltaPositionFromRelativePosition(
              ystate.ytype,
              prevState.anchor,
              { renderer: ystate.renderer ?? null }
            ) != null
          }
        })

        // compute whether the published cursor state has changed
        const cursorChanged = (prevState == null) !== (resolvedState == null) || (
          prevState != null && resolvedState != null && (
            !Y.compareRelativePositions(prevState.anchor, resolvedState.anchor) ||
            !Y.compareRelativePositions(prevState.head, resolvedState.head)
          )
        )

        if (cursorChanged) {
          awareness.setLocalStateField(cursorStateField, resolvedState)
        }
      }

      const onFocusIn = () => {
        if (view.isDestroyed) return
        // This fixes an issue where focusin is called before the selection is updated
        // This allows us to bail out if the selection will change immediately after focusin
        // This allows us to skip a flicker of setting the cursor, just to change it to the correct position
        /** @type {Selection | null} */
        const sel = (/** @type {any} */ (view.root)).getSelection()
        if (sel && sel.rangeCount > 0 && sel.anchorNode) {
          try {
            if (view.posAtDOM(sel.anchorNode, sel.anchorOffset, -1) !== view.state.selection.anchor) {
              return
            }
          } catch { /* posAtDOM failed; re-evaluate the cursor */ }
        }
        updateCursorInfo('focus')
      }
      const onFocusOut = () => updateCursorInfo('blur')

      awareness.on('change', awarenessListener)
      view.dom.addEventListener('focusin', onFocusIn)
      view.dom.addEventListener('focusout', onFocusOut)

      return {
        update: () => updateCursorInfo('update'),
        destroy: () => {
          view.dom.removeEventListener('focusin', onFocusIn)
          view.dom.removeEventListener('focusout', onFocusOut)
          awareness.off('change', awarenessListener)
        }
      }
    }
  })
