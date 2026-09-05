import { ObservableV2 } from 'lib0/observable'
import * as delta from 'lib0/delta'
import * as env from 'lib0/environment'
import {
  $prosemirrorDelta,
  defaultAttributedNodes,
  deltaToPNode,
  deltaToPSteps,
  nodeToDeltaCached,
  pmDocDiff
} from '../sync-utils.js'

const Y_PREFIX = 'y-attributed-'

/**
 * Opt-in debug mode (`--yprosemirror-debug` on the CLI, or the equivalent
 * env conf): every pull that took the incremental reference-walk replays the
 * walk's change against the snapshot diff's outcome and throws on
 * divergence. Costs one pre-optimization pull per pull - test rigs only.
 */
const debugRdt = env.hasConf('yprosemirror-debug')

/**
 * Debug mode only: deterministic JSON with recursively sorted object keys.
 *
 * @param {any} v
 * @return {string}
 */
const debugStableJson = v => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(debugStableJson).join(',') + ']'
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + debugStableJson(v[k])).join(',') + '}'
}

/**
 * Debug mode only: canonicalize a delta's JSON for outcome comparison -
 * merge adjacent text runs whose formats are (order-insensitively) equal.
 * Applying a change may split text runs differently than a fresh snapshot
 * and may merge format objects in a different key order; both are
 * canonically insignificant, while every structural difference surfaces.
 *
 * @param {any} node
 * @return {any}
 */
const debugNormalizeDeltaJson = node => {
  if (node == null || typeof node !== 'object') return node
  const out = { ...node }
  if (Array.isArray(node.children)) {
    /** @type {Array<any>} */
    const merged = []
    for (const rawOp of node.children) {
      const op = { ...rawOp }
      if (Array.isArray(op.insert)) op.insert = op.insert.map(debugNormalizeDeltaJson)
      if (op.value != null) op.value = debugNormalizeDeltaJson(op.value)
      const last = merged[merged.length - 1]
      if (
        last != null && last.type === 'insert' && op.type === 'insert' &&
        typeof last.insert === 'string' && typeof op.insert === 'string' &&
        debugStableJson(last.format ?? null) === debugStableJson(op.format ?? null)
      ) {
        merged[merged.length - 1] = { ...last, insert: last.insert + op.insert }
      } else {
        merged.push(op)
      }
    }
    out.children = merged
  }
  return out
}

/**
 * The gated initial `_state` (see "Initial-content gate" in
 * {@link ProsemirrorRdt}): the document's root shell with no children — the
 * same shape {@link nodeToDelta} produces for a childless doc, so it diffs
 * empty against the binding's projection of an empty ytype.
 *
 * @param {import('prosemirror-model').Node} doc
 * @return {ProsemirrorDelta}
 */
const emptyDocState = doc => {
  const d = delta.create(doc.type.name, $prosemirrorDelta)
  d.setAttrs(doc.attrs)
  return /** @type {ProsemirrorDelta} */ (d.done(false))
}

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
 * Change detection is **pull-based and incremental** (iteration 2 of the RDT
 * refactor): the sync plugin's `view().update` hook calls
 * {@link ProsemirrorRdt#pull} after each committed dispatch. Snapshots are
 * memoized per ProseMirror node ({@link nodeToDeltaCached} - PM nodes are
 * persistent immutable trees, so unchanged subtrees keep object identity and
 * their frozen snapshot deltas are reference-shared across states), and the
 * emitted change comes from a reference-walk over the before/after documents
 * ({@link pmDocDiff}) whenever `_pmstate` tracks the previous document; any
 * doubt falls back to `delta.diff` of the memoized snapshots (see
 * {@link ProsemirrorRdt#_computeChange}). We deliberately do not translate
 * transaction steps into deltas - steps are unavailable in the `update` hook,
 * and a step's effect can exceed what it describes (ProseMirror's fitting
 * algorithm, `ReplaceAroundStep`; see PROJECT_GOALS.md). The opt-in
 * `--yprosemirror-debug` conf cross-checks every walk-based pull against the
 * snapshot diff and throws on divergence.
 *
 * The `y-attributed-*` projection is **read-only in ProseMirror**: it mirrors
 * the Y side's attribution, so a local edit to it cannot be written back — the
 * `swallowFormats` pipeline stage (`../transformers/swallow-formats.js`)
 * swallows the keys — and would silently diverge from every other peer.
 * Guarding it is split by what each layer can know:
 *
 * - `pull` **restores** the projection on *retained* content
 *   ({@link buildAttributionCorrection}), which needs the pre-change snapshot
 *   this class holds. That repairs a local "clear formatting" as well as
 *   ProseMirror's incidental damage — a delete that re-splits text runs can
 *   drop a mark off a neighbouring character.
 * - The `swallowFormats` stage clears the keys off freshly *inserted* content
 *   (inherited or pasted marks) and swallows everything else, including the
 *   `applyDelta` fix path below, which `pull` never sees.
 *
 * The Y side then re-attributes the emitted content and sends the resulting
 * marks back as a fix.
 *
 * ## Initial-content gate (`gateInitialContent`)
 *
 * A fresh editor is never truly empty: the schema's `createAndFill()` default
 * (e.g. `doc > blockquote > paragraph` for a `doc{blockquote}` schema) is
 * always materialized. Binding that default to an *empty* ytype must not write
 * it into Y — every fresh client would seed its own copy and merging two such
 * docs duplicates the content (the init race). When the sync plugin signals
 * that the ytype has no children and the document fingerprints equal to the
 * schema default, `_state` starts as the **empty** delta instead of a document
 * snapshot, with {@link ProsemirrorRdt#_defaultFingerprint} set. The
 * binding's initial sync then diffs empty against empty — nothing is rendered
 * or written — while the schema-default skeleton stays visible in the editor,
 * invisible to the sync layer, until either side produces real content:
 *
 * - a local edit diverges the doc from the default fingerprint → `pull` emits
 *   `diff(empty, doc)`, one full-content insert that validly seeds the empty
 *   ytype through the normal pipeline;
 * - a foreign delta arrives → `applyDelta` force-renders the whole document
 *   from `expected` (never incremental steps, which could keep the stale
 *   skeleton next to the foreign content and leak it into Y via the fix).
 *
 * The first render in either direction clears the gate; from then on the RDT
 * behaves exactly as usual.
 *
 * Note that the gate is the only concession to editor-held content: the ytype
 * is always the source of truth at bind time, and pre-existing editor content
 * is intentionally NOT imported into Yjs — only edits made during an active
 * binding are synced (see CAVEATS.md, "Initial content").
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
   * @param {boolean} [opts.gateInitialContent] the counterpart ytype has no
   *   children — gate the schema-default document instead of treating it as
   *   content (see "Initial-content gate" in the class doc)
   * @param {null|((err:Error,errCode:number)=>any)} [opts.onInternalError]
   *   Listen to internal errors for debugging purposes. This API is unstable
   *   and can be changed/removed at any time! (errCode 2: the `applyDelta`
   *   reconcile diff failed — see the fail-safe there)
   */
  constructor ({ view, attributedNodes = defaultAttributedNodes, compare = null, getMeta, gateInitialContent = false, onInternalError = null }) {
    super()
    this.view = view
    this.attributedNodes = attributedNodes
    this.compare = compare ?? undefined
    this.getMeta = getMeta
    this._onInternalError = onInternalError
    this.$delta = $prosemirrorDelta
    const snapshot = nodeToDeltaCached(view.state.doc)
    const dflt = gateInitialContent ? view.state.doc.type.createAndFill() : null
    const dfltFingerprint = dflt != null ? nodeToDeltaCached(dflt).fingerprint : null
    /**
     * Non-null while the initial content is gated (see class doc): the
     * fingerprint of the schema-default document, which `pull` must not emit.
     * The first render in either direction resets this to `null`.
     *
     * @type {string?}
     */
    this._defaultFingerprint = dfltFingerprint != null && snapshot.fingerprint === dfltFingerprint ? dfltFingerprint : null
    /**
     * @type {ProsemirrorDelta}
     */
    this._state = this._defaultFingerprint != null ? emptyDocState(view.state.doc) : snapshot
    /**
     * The ProseMirror document `_state` (the lib0 delta) was computed from,
     * or `null` when `_state` has no document counterpart (the
     * initial-content gate's empty shell, a desync, a projected `expected`
     * state). Non-null enables the incremental reference-walk in
     * {@link ProsemirrorRdt#pull}; `null` drops to a full `delta.diff` of
     * the memoized snapshots, which must stay bulletproof.
     *
     * Invariant: every `_state` assignment also assigns `_pmstate`, and
     * whenever `_pmstate != null`, `_state === nodeToDeltaCached(_pmstate)`
     * by object identity.
     *
     * @type {import('prosemirror-model').Node?}
     */
    this._pmstate = this._defaultFingerprint != null ? null : view.state.doc
    /**
     * Pull-path statistics, exposed for tests and debugging: `walk` counts
     * pulls that used the incremental reference-walk (including the
     * identical-document fast path), `fallback` counts pulls that took the
     * full snapshot diff, and `walkError` counts walk attempts that threw
     * before falling back. A healthy steady-state session is all walks with
     * zero errors; the fuzz suite asserts exactly that, so a regression that
     * silently degrades every pull to the fallback cannot pass unnoticed.
     */
    this._pullStats = { walk: 0, fallback: 0, walkError: 0 }
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
    const doc = nodeToDeltaCached(this.view.state.doc)
    const toState = delta.diff(/** @type {any} */ (doc), /** @type {any} */ (this._state), { compare: this.compare })
    if (!toState.isEmpty()) {
      try {
        if (!this._dispatch(deltaToPSteps(this.view.state.tr, /** @type {any} */ (toState), undefined, undefined, this.attributedNodes))) {
          return false
        }
      } catch (_err) {
        return false
      }
      if (!delta.diff(/** @type {any} */ (nodeToDeltaCached(this.view.state.doc)), /** @type {any} */ (this._state), { compare: this.compare }).isEmpty()) {
        return false
      }
    }
    // `_pmstate` stays null: recovery proves canonical equality only, not
    // object identity with the cached snapshot - the next pull takes the
    // full-diff fallback once and re-establishes the pair.
    this._desynced = false
    return true
  }

  /**
   * The change that turns `_state` into `next`: an incremental
   * reference-walk from `_pmstate` when available (`_state` is by
   * construction the cached snapshot of `_pmstate`), the full `delta.diff`
   * of the memoized snapshots otherwise. The walk is an optimization only -
   * any doubt (no tracked document, a `prevDoc` cross-check mismatch, an
   * unexpected error inside the walk) drops to the diff, whose result is
   * always correct.
   *
   * Note that `_pmstate` may legitimately lag the view by more than one
   * transaction (an empty-change pull returns early without moving it) -
   * the walk then simply sees a wider window.
   *
   * @param {import('prosemirror-model').Node} doc the document `next` was
   *   snapshotted from
   * @param {ProsemirrorDelta} next
   * @param {import('prosemirror-model').Node} [prevDoc] cross-check: when
   *   given and different from `_pmstate`, the walk is skipped
   * @return {delta.DeltaAny}
   */
  _computeChange (doc, next, prevDoc) {
    const pmstate = this._pmstate
    if (pmstate === doc) {
      this._pullStats.walk++
      return /** @type {delta.DeltaAny} */ (delta.create().done(false))
    }
    if (pmstate != null && (prevDoc === undefined || prevDoc === pmstate)) {
      /** @type {delta.DeltaAny | null} */
      let change = null
      try {
        change = /** @type {delta.DeltaAny} */ (pmDocDiff(pmstate, doc, this.compare))
      } catch (_err) {
        // fall through: the snapshot diff below is the ground truth
        this._pullStats.walkError++
      }
      if (change != null) {
        // deliberately outside the try - a debug-mode divergence must throw,
        // not silently take the fallback
        if (debugRdt) this._debugCheckChange(change, next)
        this._pullStats.walk++
        return change
      }
    }
    this._pullStats.fallback++
    return /** @type {delta.DeltaAny} */ (delta.diff(/** @type {any} */ (this._state), /** @type {any} */ (next), { compare: this.compare }))
  }

  /**
   * `--yprosemirror-debug` cross-check: the walk's change, applied to the
   * previous state, must land exactly on `next` (up to op-boundary and
   * format-key-order noise, which the canonicalization ignores).
   *
   * @param {delta.DeltaAny} change
   * @param {ProsemirrorDelta} next
   */
  _debugCheckChange (change, next) {
    const replay = delta.clone(/** @type {any} */ (this._state))
    replay.apply(delta.cloneDeep(/** @type {any} */ (change)), { final: true })
    const replayJson = debugStableJson(debugNormalizeDeltaJson(replay.done(false).toJSON()))
    const nextJson = debugStableJson(debugNormalizeDeltaJson(next.toJSON()))
    if (replayJson !== nextJson) {
      console.warn('[y/prosemirror] yprosemirror-debug REPLAY', replayJson)
      console.warn('[y/prosemirror] yprosemirror-debug NEXT  ', nextJson)
      throw new Error('[y/prosemirror] yprosemirror-debug: the incremental pmDocDiff change diverged from the snapshot diff')
    }
  }

  /**
   * Snapshot the document, revert any local change to the read-only
   * `y-attributed-*` projection, and emit the difference against the previous
   * snapshot. Called by the sync plugin's `update` hook after a committed
   * dispatch that was not our own.
   *
   * @param {import('prosemirror-model').Node} [prevDoc] the document the
   *   view held before the update that triggered this pull (the sync plugin
   *   passes `prevState.doc`); used as a cross-check for the incremental
   *   walk in {@link ProsemirrorRdt#_computeChange}
   */
  pull (prevDoc) {
    if (!this._recover()) return
    let doc = this.view.state.doc
    let next = nodeToDeltaCached(doc)
    if (this._defaultFingerprint != null) {
      // initial-content gate: while the doc still equals the schema default,
      // the skeleton must not leak into Y — not even via a transaction that
      // changed the doc and changed it back (see class doc)
      if (next.fingerprint === this._defaultFingerprint) return
      this._defaultFingerprint = null
    }
    let change = this._computeChange(doc, next, prevDoc)
    if (change.isEmpty()) return
    const correction = buildAttributionCorrection(change, this._state)
    if (correction != null) {
      try {
        this._dispatch(deltaToPSteps(this.view.state.tr, /** @type {any} */ (correction), undefined, undefined, this.attributedNodes))
      } catch (_err) {
        // the corrective transaction is best-effort — the emitted change is
        // stripped by the reverse transformer either way, so Y stays clean
      }
      // re-walk across the corrective dispatch from the unchanged `_pmstate`;
      // the prevDoc cross-check is skipped on purpose (the correction moved
      // the document, that is the point)
      doc = this.view.state.doc
      next = nodeToDeltaCached(doc)
      change = this._computeChange(doc, next, undefined)
    }
    this._state = next
    this._pmstate = doc
    if (!change.isEmpty()) {
      this.emit('delta', [(change), this])
    }
  }

  /**
   * Apply a foreign (Y-originated, already transformed to view space) change
   * to the document. Returns the **fix**: the difference between
   * `old state + d` and what the document actually contains after the dispatch
   * — ProseMirror's schema normalization (`createAndFill`, content-expression
   * coercion, dropped unknown marks). A dropped `y-attributed-*` mark (a node
   * declaring `marks: ''` makes `tr.addMark` skip it silently) surfaces here
   * as a format-clear in the fix; the `swallowFormats` stage swallows it, so
   * the loss is never written to Y and is not re-asserted on the view —
   * re-asserting a mark the schema cannot hold would loop forever.
   *
   * The initial binding sync arrives here as a whole-document difference; when
   * its raw steps cannot be fitted (e.g. deleting the only block of a
   * `doc{block+}`), the whole document is replaced via `tr.replaceWith`, which
   * uses ProseMirror's fitting algorithm — the ytype fully overwrites the
   * ProseMirror content.
   *
   * **Fail-safe**: a malformed foreign change — one positioned against a
   * space this view never held (e.g. the upstream accept-cascade bug pinned
   * as known issue 5 in tests/prosemirror-rdt.test.js) — leaves non-insert
   * residue in `expected`, and the fix diff below is the first place that
   * can notice. By then the dispatch has already committed, so the document
   * is the truth of the view: the error is reported through
   * `onInternalError` (errCode 2), the actual document is adopted as the new
   * state, and no fix is returned. Throwing instead would leave `_state`
   * permanently stale with no desync AND abort the surrounding Y
   * transaction's event delivery, starving every later observer.
   *
   * @param {ProsemirrorDelta} d
   * @param {any} origin
   * @return {delta.DeltaBuilder<any> | null}
   */
  applyDelta (d, origin) {
    if (d.isEmpty()) return null
    // Structure-sharing clone: `_state`'s children are frozen cache entries,
    // so `clone` shares them and copy-on-write isolates whatever `apply`
    // touches. `final: true` must stay explicit (`clone` does not carry
    // `isFinal`), and the applied change must be a private deep clone: `d` is
    // re-emitted below, and `move: true` re-parents the applied content.
    const expected = delta.clone(/** @type {any} */ (this._state))
    expected.apply(delta.cloneDeep(/** @type {any} */ (d)), { final: true, move: true })
    if (!this._recover()) {
      // The view cannot be written to right now (dispatches are filtered).
      // Track the projection so subsequent deltas keep applying in the right
      // coordinate space; the document catches up once dispatches land again.
      this._defaultFingerprint = null
      this._state = /** @type {ProsemirrorDelta} */ (expected.done(false))
      this._pmstate = null
      return null
    }
    /** @type {import('prosemirror-state').Transaction} */
    let tr
    if (this._defaultFingerprint != null) {
      // initial-content gate: the first render replaces the gated
      // schema-default skeleton wholesale. Raw steps must not run here — a
      // schema that permits it would fit the foreign content *next to* the
      // skeleton, and the fix below would write the skeleton into Y.
      this._defaultFingerprint = null
      tr = this.view.state.tr
      tr.replaceWith(0, tr.doc.content.size, deltaToPNode(/** @type {any} */ (expected), tr.doc.type.schema, null, this.attributedNodes))
    } else {
      try {
        tr = deltaToPSteps(this.view.state.tr, /** @type {any} */ (d), undefined, undefined, this.attributedNodes)
      } catch (_err) {
        // Raw steps could not express the change against the schema — replace
        // the whole document through ProseMirror's fitting `replaceWith`.
        tr = this.view.state.tr
        tr.replaceWith(0, tr.doc.content.size, deltaToPNode(/** @type {any} */ (expected), tr.doc.type.schema, null, this.attributedNodes))
      }
    }
    if (tr.docChanged && !this._dispatch(tr)) {
      this._state = /** @type {ProsemirrorDelta} */ (expected.done(false))
      this._pmstate = null
      this._desynced = true
      return null
    }
    const actualDoc = this.view.state.doc
    const actual = nodeToDeltaCached(actualDoc)
    /** @type {delta.Delta<any> | null} */
    let fix = null
    try {
      // `clone: true` stays: without it the fix would alias the live `_state`/
      // memo subtrees between this return and the binding's own deep clone.
      fix = delta.diff(/** @type {any} */ (expected), /** @type {any} */ (actual), { compare: this.compare, clone: true })
    } catch (err) {
      // fail-safe (see method doc): report, adopt the dispatched document,
      // return no fix — never unwind into the Y transaction's event delivery
      this._onInternalError?.(/** @type {any} */ (err), 2)
    }
    this._state = actual
    this._pmstate = actualDoc
    this.emit('delta', [d, origin])
    return fix == null || fix.isEmpty() ? null : /** @type {any} */ (fix)
  }

  destroy () {
    this.emit('destroy', [this])
    super.destroy()
  }
}

/**
 * Restore the read-only `y-attributed-*` projection on content the change
 * *retained*: for every retain/modify whose format touches a `y-attributed-*`
 * key, put back the key's value from `state` at that position (or remove it
 * when `state` had none). The result is in *post-change* coordinates, so it
 * can be applied to the current document via {@link deltaToPSteps}.
 *
 * This repairs ProseMirror's incidental damage to the projection - a local
 * "clear formatting", but also a plain delete that re-splits text runs and
 * drops a mark off a neighbouring character. It needs the *pre-change*
 * snapshot to know what to put back, which is why it lives here and not in
 * the pipeline.
 *
 * Freshly *inserted* content carrying the projection (a mark inherited from an
 * attributed neighborhood, attributed content pasted back in) is NOT handled
 * here - the `swallowFormats` stage
 * (`../transformers/swallow-formats.js`) clears those, and it also covers the
 * `applyDelta` fix path that never reaches this function.
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
    } else if (delta.$textOp.check(op) || delta.$insertOp.check(op)) {
      // inserted content occupies post-change positions but has none in
      // `state`; the projection it carries is the `swallowFormats` stage's job
      correction.retain(op.insert.length)
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
