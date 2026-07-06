import { ObservableV2 } from 'lib0/observable'
import * as delta from 'lib0/delta'
import {
  $prosemirrorDelta,
  defaultAttributedNodes,
  deltaToPNode,
  deltaToPSteps,
  nodeToDelta
} from '../sync-utils.js'

const Y_PREFIX = 'y-attributed-'

/**
 * @param {Record<string, any> | null | undefined} format
 */
const touchesAttributionSpace = format => {
  if (format == null) return false
  for (const k in format) {
    if (k.startsWith(Y_PREFIX)) return true
  }
  return false
}

/**
 * The view side of the sync binding: a lib0-`RDT` wrapping a ProseMirror
 * {@link EditorView}.
 *
 * State (`_state`) is the current document as a *canonicalized*
 * {@link $prosemirrorDelta} snapshot — attributed-variant node names and the
 * render-only `y-attributed` attr are stripped, while the `y-attributed-*`
 * marks stay as format keys (they are the view-space rendering of the Y side's
 * attribution dimension, produced by the `attributionToFormat` transformer).
 *
 * Change detection is **pull-based** (iteration 1 of the RDT refactor): the
 * sync plugin's `view().update` hook calls {@link ProsemirrorRdt#pull} after
 * each committed dispatch, which re-snapshots the document and emits
 * `delta.diff(previous, next)`. A later iteration can emit smaller deltas by
 * translating the transaction's steps directly.
 *
 * The `y-attributed-*` projection is **read-only in ProseMirror**: it mirrors
 * the Y side's attribution, so a local edit to it (removing a mark via "clear
 * formatting", or a fresh insert *inheriting* an inclusive attribution mark
 * from its neighborhood) cannot be written back — the reverse transformer
 * strips the keys — and would silently diverge from every other peer. `pull`
 * therefore reverts any local change to that projection with a corrective
 * transaction before emitting (the Y side re-attributes the emitted content
 * and sends the resulting marks back as a fix).
 *
 * @extends {ObservableV2<{ delta: (d: ProsemirrorDelta, origin: any) => void, destroy: (rdt: ProsemirrorRdt) => void }>}
 */
export class ProsemirrorRdt extends ObservableV2 {
  /**
   * @param {object} opts
   * @param {import('prosemirror-view').EditorView} opts.view
   * @param {AttributedNodesPredicate} [opts.attributedNodes]
   * @param {NodeCompare?} [opts.compare] forwarded to every `delta.diff`
   * @param {() => any} opts.getMeta value for the `y-sync-transaction` meta on
   *   every transaction this RDT dispatches
   */
  constructor ({ view, attributedNodes = defaultAttributedNodes, compare = null, getMeta }) {
    super()
    this.view = view
    this.attributedNodes = attributedNodes
    this.compare = compare ?? undefined
    this.getMeta = getMeta
    this.$delta = $prosemirrorDelta
    /**
     * @type {ProsemirrorDelta}
     */
    this._state = nodeToDelta(view.state.doc, undefined, true)
    this._applying = false
    /**
     * Set when a dispatch was filtered away (e.g. a readonly mode's
     * `filterTransaction`): the document is behind `_state` (which tracks the
     * Y side's projection). While desynced, `pull` must not run — diffing the
     * stale document against `_state` would emit an "undo everything that was
     * filtered" change and revert remote content globally.
     */
    this._desynced = false
  }

  /**
   * `true` while this RDT dispatches its own transaction — the sync plugin's
   * `update` hook (which fires synchronously for that dispatch) must not pull.
   */
  get isApplying () {
    return this._applying
  }

  /**
   * Current state as a canonicalized delta (a shared read value; consumers
   * must not mutate it).
   *
   * @return {ProsemirrorDelta}
   */
  get delta () {
    return this._state
  }

  /**
   * @param {import('prosemirror-state').Transaction} tr
   * @return {boolean} whether the dispatch landed (was not filtered away)
   */
  _dispatch (tr) {
    tr.setMeta('addToHistory', false)
    tr.setMeta('y-sync-transaction', this.getMeta())
    const docBefore = this.view.state.doc
    this._applying = true
    try {
      this.view.dispatch(tr)
    } finally {
      this._applying = false
    }
    return !tr.docChanged || this.view.state.doc !== docBefore
  }

  /**
   * Try to bring a desynced document back to `_state` (the Y-side projection).
   *
   * @return {boolean} `true` when the document matches `_state` again
   */
  _recover () {
    if (!this._desynced) return true
    const doc = nodeToDelta(this.view.state.doc, undefined, true)
    const toState = delta.diff(doc, /** @type {any} */ (this._state), { compare: this.compare })
    if (!toState.isEmpty()) {
      try {
        if (!this._dispatch(deltaToPSteps(this.view.state.tr, /** @type {any} */ (toState), undefined, undefined, this.attributedNodes))) {
          return false
        }
      } catch (_err) {
        return false
      }
      if (!delta.diff(nodeToDelta(this.view.state.doc, undefined, true), /** @type {any} */ (this._state), { compare: this.compare }).isEmpty()) {
        return false
      }
    }
    this._desynced = false
    return true
  }

  /**
   * Snapshot the document, revert any local change to the read-only
   * `y-attributed-*` projection, and emit the difference against the previous
   * snapshot. Called by the sync plugin's `update` hook after a committed
   * dispatch that was not our own.
   */
  pull () {
    if (!this._recover()) return
    let next = nodeToDelta(this.view.state.doc, undefined, true)
    let change = delta.diff(/** @type {any} */ (this._state), /** @type {any} */ (next), { compare: this.compare })
    if (change.isEmpty()) return
    const correction = buildAttributionCorrection(change, this._state)
    if (correction != null) {
      try {
        this._dispatch(deltaToPSteps(this.view.state.tr, /** @type {any} */ (correction), undefined, undefined, this.attributedNodes))
      } catch (_err) {
        // the corrective transaction is best-effort — the emitted change is
        // stripped by the reverse transformer either way, so Y stays clean
      }
      next = nodeToDelta(this.view.state.doc, undefined, true)
      change = delta.diff(/** @type {any} */ (this._state), /** @type {any} */ (next), { compare: this.compare })
    }
    this._state = next
    if (!change.isEmpty()) {
      this.emit('delta', [(change), this])
    }
  }

  /**
   * Apply a foreign (Y-originated, already transformed to view space) change
   * to the document. Returns the **fix**: the difference between
   * `old state + d` and what the document actually contains after the dispatch
   * — ProseMirror's schema normalization (`createAndFill`, content-expression
   * coercion, dropped unknown marks).
   *
   * The initial binding sync arrives here as a whole-document difference; when
   * its raw steps cannot be fitted (e.g. deleting the only block of a
   * `doc{block+}`), the whole document is replaced via `tr.replaceWith`, which
   * uses ProseMirror's fitting algorithm — the ytype fully overwrites the
   * ProseMirror content.
   *
   * @param {ProsemirrorDelta} d
   * @param {any} origin
   * @return {delta.DeltaBuilder<any> | null}
   */
  applyDelta (d, origin) {
    if (d.isEmpty()) return null
    const expected = delta.cloneDeep(/** @type {any} */ (this._state))
    expected.apply(delta.cloneDeep(/** @type {any} */ (d)), { final: true, move: true })
    if (!this._recover()) {
      // The view cannot be written to right now (dispatches are filtered).
      // Track the projection so subsequent deltas keep applying in the right
      // coordinate space; the document catches up once dispatches land again.
      this._state = /** @type {ProsemirrorDelta} */ (expected.done(false))
      return null
    }
    /** @type {import('prosemirror-state').Transaction} */
    let tr
    try {
      tr = deltaToPSteps(this.view.state.tr, /** @type {any} */ (d), undefined, undefined, this.attributedNodes)
    } catch (_err) {
      // Raw steps could not express the change against the schema — replace
      // the whole document through ProseMirror's fitting `replaceWith`.
      tr = this.view.state.tr
      tr.replaceWith(0, tr.doc.content.size, deltaToPNode(/** @type {any} */ (expected), tr.doc.type.schema, null, this.attributedNodes))
    }
    if (tr.docChanged && !this._dispatch(tr)) {
      this._state = /** @type {ProsemirrorDelta} */ (expected.done(false))
      this._desynced = true
      return null
    }
    const actual = nodeToDelta(this.view.state.doc, undefined, true)
    const fix = delta.diff(/** @type {any} */ (expected), /** @type {any} */ (actual), { compare: this.compare, clone: true })
    this._state = actual
    this.emit('delta', [d, origin])
    return fix.isEmpty() ? null : /** @type {any} */ (fix)
  }

  destroy () {
    this.emit('destroy', [this])
    super.destroy()
  }
}

/**
 * Build the corrective delta that reverts every change `change` makes to the
 * read-only `y-attributed-*` projection, in *post-change* coordinates (so it
 * can be applied to the current document via {@link deltaToPSteps}):
 *
 * - a retain/modify whose format touches a `y-attributed-*` key → restore the
 *   key's value from `state` at that position (or remove it when `state` had
 *   none),
 * - inserted content carrying `y-attributed-*` formats (marks inherited from
 *   an attributed neighborhood, or attributed content pasted back in) → remove
 *   them, recursively for inserted subtrees.
 *
 * Returns `null` when `change` does not touch the projection.
 *
 * @param {delta.DeltaAny} change the local change, `diff(state, next)`
 * @param {delta.DeltaAny | null} state the pre-change snapshot
 * @return {delta.DeltaBuilderAny | null}
 */
const buildAttributionCorrection = (change, state) => {
  const correction = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  let touched = false
  // read cursor over `state`'s children (retain/delete/modify consume state
  // positions; inserts do not)
  let cur = state == null ? null : state.children.start
  let off = 0
  const advance = () => {
    if (cur != null && off >= cur.length) {
      cur = cur.next
      off = 0
    }
  }
  /**
   * Read up to `rem` positions of one uniform run at the cursor, advancing.
   *
   * @param {number} rem
   * @return {{ take: number, format: Record<string, any> | null | undefined, el: any }}
   */
  const readRun = (rem) => {
    if (cur == null) return { take: rem, format: null, el: null }
    const take = Math.min(cur.length - off, rem)
    const format = /** @type {any} */ (cur).format
    const el = delta.$insertOp.check(cur) ? cur.insert[off] : (delta.$modifyOp.check(cur) ? cur.value : null)
    off += take
    advance()
    return { take, format, el }
  }
  /**
   * The restore-format for the `y-attributed-*` keys `opFormat` touches, given
   * the state format at that position.
   *
   * @param {Record<string, any> | null | undefined} opFormat
   * @param {Record<string, any> | null | undefined} stateFormat
   * @return {Record<string, any> | null}
   */
  const restoreFormat = (opFormat, stateFormat) => {
    /** @type {Record<string, any>} */
    const restore = {}
    let any = false
    for (const k in opFormat) {
      if (k.startsWith(Y_PREFIX)) {
        restore[k] = stateFormat?.[k] ?? null
        any = true
      }
    }
    return any ? restore : null
  }
  /**
   * The format-remove for every `y-attributed-*` key present on inserted
   * content.
   *
   * @param {Record<string, any> | null | undefined} format
   * @return {Record<string, any> | null}
   */
  const clearFormat = (format) => {
    /** @type {Record<string, any>} */
    const clear = {}
    let any = false
    for (const k in format) {
      if (k.startsWith(Y_PREFIX)) {
        clear[k] = null
        any = true
      }
    }
    return any ? clear : null
  }
  for (const op of change.children) {
    if (delta.$retainOp.check(op)) {
      if (!touchesAttributionSpace(op.format)) {
        // fast-forward the state cursor without reading formats
        let rem = op.retain
        correction.retain(rem)
        while (rem > 0) {
          if (cur == null) break
          const take = Math.min(cur.length - off, rem)
          off += take
          rem -= take
          advance()
        }
      } else {
        let rem = op.retain
        while (rem > 0) {
          const { take, format } = readRun(rem)
          // `?? undefined`: a format of `null` means "clear all" to the
          // builder — absence must be expressed as `undefined` (skip)
          correction.retain(take, restoreFormat(op.format, format) ?? undefined)
          rem -= take
          touched = true
        }
      }
    } else if (delta.$deleteOp.check(op)) {
      // removed from the output — nothing to correct, just consume state
      let rem = op.delete
      while (rem > 0) {
        if (cur == null) break
        const take = Math.min(cur.length - off, rem)
        off += take
        rem -= take
        advance()
      }
    } else if (delta.$textOp.check(op)) {
      const clear = clearFormat(op.format)
      correction.retain(op.insert.length, clear ?? undefined)
      if (clear != null) touched = true
    } else if (delta.$insertOp.check(op)) {
      const clear = clearFormat(op.format)
      if (clear != null) touched = true
      for (const el of op.insert) {
        if (delta.$deltaAny.check(el)) {
          // recurse: freshly inserted subtrees must not carry the projection
          // anywhere inside either
          const sub = buildAttributionCorrection(el, null)
          if (sub != null) {
            touched = true
            correction.modify(sub, clear ?? undefined)
          } else {
            correction.retain(1, clear ?? undefined)
          }
        } else {
          correction.retain(1, clear ?? undefined)
        }
      }
    } else { // $modifyOp
      const { format, el } = readRun(1)
      const restore = restoreFormat(op.format, format)
      const sub = buildAttributionCorrection(op.value, delta.$deltaAny.check(el) ? el : null)
      if (restore != null || sub != null) touched = true
      if (sub != null) {
        correction.modify(sub, restore ?? undefined)
      } else {
        correction.retain(1, restore ?? undefined)
      }
    }
  }
  correction.done(false)
  return touched && !correction.isEmpty() ? correction : null
}
