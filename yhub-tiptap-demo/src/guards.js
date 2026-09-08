/* eslint-env browser */
//
// Guards for third-party ProseMirror plugins that REPAIR the document.
//
// A plugin whose `appendTransaction` fixes the document up - prosemirror-tables'
// `fixTables`, Tiptap's `TrailingNode`, `Link`'s autolink - fires on the
// binding's own dispatches too. The sync plugin's `update` hook then pulls that
// repair out of the view and writes it into Y, so a rendering artifact of the
// attributed projection becomes real content on every peer. In a version-diff
// view it mutates a historical document the user is only reading.
//
// `fixTables` is the sharpest case: an attributed table legitimately holds a
// pending-deleted row next to an inserted one, which `TableMap` reports as
// ragged - and `fixTable` pads rows and DELETES zero-sized tables outright.
//
import { Plugin } from '@tiptap/pm/state'
import { columnResizingPluginKey } from '@tiptap/pm/tables'
import { ySyncPluginKey } from '@y/prosemirror'

/**
 * A renderer is configured, so the document on screen is a *projection* of the
 * Y side's attribution dimension, not content anybody authored. Nothing may
 * "repair" it.
 *
 * @param {import('@tiptap/pm/state').EditorState} state
 */
const isRenderingAttribution = (state) =>
  ySyncPluginKey.getState(state)?.renderer != null

/**
 * The transaction batch came from the binding. Mirrors the check in
 * `src/undo-plugin.js`: `y-sync-transaction` is the meta on every ProseMirror
 * RDT dispatch, `y-sync-append` marks its appended fixes, and a
 * `ySyncPluginKey` meta is a plugin reconfiguration.
 *
 * Repairs must be skipped even in plain live mode, because every peer would
 * otherwise repair the same incoming remote change independently and write
 * conflicting repairs back into Y.
 *
 * @param {ReadonlyArray<import('@tiptap/pm/state').Transaction>} trs
 */
const isBindingBatch = (trs) => trs.some(tr =>
  tr.getMeta('y-sync-transaction') != null ||
  tr.getMeta('y-sync-append') != null ||
  tr.getMeta(ySyncPluginKey) != null
)

/**
 * Wrap a third-party plugin so it cannot mutate a document the binding owns.
 *
 * `tableEditing`'s spec cannot simply be re-implemented: `drawCellSelection`,
 * `handleMouseDown`, `handleTripleClick`, `handleKeyDown` and
 * `normalizeSelection` are all internal to prosemirror-tables. So we build the
 * stock plugin and rebuild it around a guarded copy of its spec. That is safe:
 * `EditorState` reads `plugin.spec.appendTransaction` at call time and `spec.key`
 * rides along with the spread, so `tableEditingKey.getState()` keeps working.
 *
 * Two different gates, deliberately applied to different hooks:
 *
 *   - `appendTransaction` on EVERY wrapped plugin - this is the repair channel.
 *   - `handleDOMEvents` ONLY on `columnResizing`. Its handlers write `colwidth`
 *     via `setNodeMarkup` on mouse drag and never consult `view.editable`,
 *     and `Table.addProseMirrorPlugins` computes `resizable && isEditable` once
 *     at construction while `Editor.setEditable` does not rebuild plugins - so
 *     without this you can drag column borders in the read-only version-diff
 *     view and the write lands in the historical document. Gating DOM events on
 *     `tableEditing` too would kill cell selection in suggestion-edit mode,
 *     which we want to keep.
 *
 * @param {Plugin} plugin
 * @return {Plugin}
 */
export const guardBindingMutations = (plugin) => {
  const spec = plugin.spec
  const guardDomEvents = spec.key === columnResizingPluginKey
  const props = spec.props ?? {}
  const domEvents = props.handleDOMEvents

  return new Plugin({
    ...spec,
    props: (guardDomEvents && domEvents != null)
      ? {
          ...props,
          handleDOMEvents: Object.fromEntries(
            Object.entries(domEvents).map(([name, handler]) => [
              name,
              /** @param {import('@tiptap/pm/view').EditorView} view */
              (view, event) =>
                isRenderingAttribution(view.state)
                  ? false
                  : /** @type {any} */ (handler)(view, event)
            ])
          )
        }
      : props,
    appendTransaction: spec.appendTransaction == null
      ? undefined
      : function (trs, oldState, newState) {
        if (isRenderingAttribution(newState) || isBindingBatch(trs)) return null
        return /** @type {any} */ (spec.appendTransaction).call(this, trs, oldState, newState)
      }
  })
}
