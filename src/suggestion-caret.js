import { Selection } from 'prosemirror-state'

/**
 * Caret placement across the fix round trip of a local deletion.
 *
 * A delete in suggestion mode keeps its content: the Y side turns it into a
 * *pending* delete and returns the content as a fix, which the binding
 * re-inserts at the caret. ProseMirror maps a caret across an insertion at its
 * own position to the right (assoc `1`), which parks it behind the
 * struck-through character - and the next Backspace then hits content that is
 * already pending-deleted, a write Yjs reverts, so the user could never delete
 * more than one character (yjs/y-prosemirror#242).
 *
 * The correction must not be unconditional: forward delete (`Delete`) leaves
 * the caret in place, and landing *after* the struck character is exactly what
 * lets it keep advancing. The direction is not recoverable from the change
 * alone, which is why {@link isBackwardDeletion} reads the selection the view
 * held *before* the local edit.
 *
 * These two helpers are transaction-time plugin machinery, driven by the sync
 * plugin (see `syncPlugin` in sync-plugin.js) and deliberately not part of the
 * package surface.
 */

/**
 * Whether a local change was a *backward* deletion - Backspace, or deleting a
 * selection - i.e. the caret ended up left of where the changed range started
 * (Backspace: 12 -> 11; deleting a 7..12 selection: -> 7). Forward delete
 * leaves the caret in place and keeps ProseMirror's default right bias.
 *
 * @param {import('prosemirror-state').Selection} prevSelection the selection
 *   the view held before the local edit
 * @param {import('prosemirror-state').Selection} selection the selection the
 *   view holds after it
 * @return {boolean}
 */
export const isBackwardDeletion = (prevSelection, selection) =>
  prevSelection != null && selection.empty && selection.head < prevSelection.to

/**
 * The caret correction for a sync dispatch that re-inserted a pending delete at
 * the caret: re-map the caret across the dispatch with a *left* bias, so it
 * stays where the local delete left it.
 *
 * Returns `null` when there is nothing to correct - which includes the
 * selection-only transaction this function itself produces, so ProseMirror's
 * `appendTransaction` loop terminates after one round.
 *
 * @param {readonly import('prosemirror-state').Transaction[]} trs
 * @param {import('prosemirror-state').EditorState} oldState
 * @param {import('prosemirror-state').EditorState} newState
 * @return {import('prosemirror-state').Transaction?}
 */
export const biasCaretLeft = (trs, oldState, newState) => {
  if (!oldState.selection.empty) return null
  // `y-sync-transaction` is the meta every dispatch of the ProseMirror RDT
  // carries (see `ProsemirrorRdt._dispatch`)
  if (!trs.some(tr => tr.getMeta('y-sync-transaction') != null && tr.docChanged)) return null
  const head = trs.reduce((pos, tr) => tr.mapping.map(pos, -1), oldState.selection.head)
  if (head === newState.selection.head) return null
  try {
    return newState.tr
      .setSelection(Selection.near(newState.doc.resolve(head), -1))
      .setMeta('addToHistory', false)
  } catch (_err) {
    // the caret is cosmetic - never let it break a sync dispatch
    return null
  }
}
