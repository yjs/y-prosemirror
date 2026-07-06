import { ObservableV2 } from 'lib0/observable'
import * as delta from 'lib0/delta'
import { $prosemirrorDelta } from '../sync-utils.js'

/**
 * The Y side of the sync binding: a thin lib0-`RDT` wrapper around a
 * {@link YType}, which implements the RDT interface natively — the `'delta'`
 * channel (with transaction origins, delivered through deleted parents, and
 * covering renderer `'change'` overlay updates), `applyDelta(d, origin, opts)`,
 * and the maintained {@link YType#delta} cache. The native surface cannot be
 * bound directly (see below), but it carries all the state and change
 * information, so this wrapper does **no full re-renders in steady state**:
 * foreign changes are forwarded as the native event payloads, the RDT state is
 * the ytype's maintained cache, and the only per-write work is a diff of two
 * already-materialized deltas. The wrapper adds exactly what the native
 * surface cannot express:
 *
 * 1. **Fix computation** — applying a view-originated change can *change its
 *    meaning*: under a `DiffRenderer` in suggestion mode a plain insert comes
 *    back attributed, a delete keeps its content (attributed as a pending
 *    removal), and formatting suggestion-deleted content is dropped. The
 *    native `applyDelta` return value covers only the deleted-but-rendered
 *    revert class; the renderer's transformation of the *applied* part rides
 *    the `'delta'` emission that fires synchronously inside our own
 *    `applyDelta` — which the binding's echo suppression swallows — so it must
 *    instead be returned as the RDT **fix**: `diff(expected, actual)` where
 *    `expected = old state + d` and `actual` is the ytype's post-write state.
 *    The write is wrapped in `doc.transact(fn, origin)` so the renderer
 *    cascades that fire inside the same transaction share the plugin origin
 *    (which the undo plugin tracks) — the binding-supplied RDT origin is
 *    deliberately ignored for the same reason.
 * 2. **Origin filtering** — emissions of our own transactions can fire
 *    *outside* the `applyDelta` window: a write issued during another
 *    transaction's cleanup is queued by Yjs and its event fires after the
 *    binding's echo mutex was released. Those echoes are recognized by origin
 *    and skipped.
 *
 * ## The two modes
 *
 * In **steady state** (`_stateOverride === null`) the maintained
 * {@link YType#delta} cache is the RDT state, and it is trustworthy by
 * construction: Yjs patches it with the *same* change object immediately
 * before every `'delta'` emission, so inside a listener the cache is exactly
 * the post-change state, and each forwarded payload is positioned exactly
 * against it. (That the incrementally-maintained cache equals a fresh deep
 * render — even under an active `DiffRenderer`, through suggestion edits and
 * accept/reject overlay updates — is pinned upstream by the yjs
 * `testRdt*CacheDrift` suite and continuously by `.dbg-fuzz.mjs`.)
 *
 * The cache is only *eventually* consistent while the doc is mid-transaction
 * or mid-cleanup: a write we issue in that window (the binding maps a view
 * fix back to Y while a foreign transaction's events are being delivered)
 * mutates the CRDT immediately, but the cache patch and the emission are
 * queued — and the renderer's attribution bookkeeping for the fresh items
 * only materializes when the queued cleanup runs. Reading the cache then
 * would fabricate a revert-fix. So such a write enters the **uncertain
 * window**: `_stateOverride` holds a fresh full render (the legacy, always-
 * correct source of truth), the state getter serves it, and foreign
 * emissions are consumed as `diff(override, freshRender)` — the legacy
 * self-healing behavior, which also absorbs the merged-transaction case
 * (app code wrapping a view dispatch in its own `doc.transact`: the single
 * merged emission carries the app's origin *and contains our write* — the
 * diff nets it out instead of double-applying). The window closes via a
 * drain check (`doc._transaction === null && doc._transactionCleanups.length
 * === 0`) at every entry point: the cleanup queue only resets after every
 * queued patch — including ours — was applied, so an empty queue proves the
 * cache has caught up.
 *
 * ## Semantic notes
 *
 * - Steady-state emissions are the **native change deltas** — the change as
 *   it actually happened, identical on every peer — not `diff(prev, next)`
 *   re-pairings. The `compare` option therefore no longer influences
 *   steady-state Y→view changes (it still applies to every diff this wrapper
 *   computes: fixes and uncertain-window emissions).
 * - Emitted deltas and the `delta` getter are *shared read* values per the
 *   RDT contract; the binding deep-clones before its transformer touches
 *   them, and this wrapper never hands out anything it mutates later.
 * - Third-party code must not synchronously write to `ytype.doc` from inside
 *   a binding-initiated view dispatch: the resulting emission fires while the
 *   binding's echo mutex is held and is dropped (already lossy before this
 *   design — documented in CAVEATS.md).
 *
 * @extends {ObservableV2<{ delta: (d: import('lib0/delta').Delta<any>, origin: any) => void, destroy: (rdt: YSyncRdt) => void }>}
 */
export class YSyncRdt extends ObservableV2 {
  /**
   * @param {object} opts
   * @param {YType} opts.ytype
   * @param {Renderer?} opts.renderer - null renders plain content (no attributions)
   * @param {any} opts.origin origin for Y transactions this RDT writes
   *   (typically the sync Plugin instance, so the undo plugin tracks them)
   * @param {NodeCompare?} [opts.compare] forwarded to every `delta.diff`
   */
  constructor ({ ytype, renderer, origin, compare = null }) {
    super()
    if (ytype.doc == null) {
      throw new Error('[y/prosemirror]: the ytype must be integrated into a Y.Doc before binding')
    }
    this.ytype = ytype
    this.renderer = renderer
    this.origin = origin
    this.compare = compare ?? undefined
    this.$delta = $prosemirrorDelta
    this._applying = false
    /**
     * Non-null while in the uncertain window: the last known-good full render,
     * serving as the RDT state until the doc's cleanup queue drains and the
     * maintained cache has caught up. `null` in steady state.
     *
     * @type {import('lib0/delta').Delta<any> | null}
     */
    this._stateOverride = null
    // The native 'delta' channel renders through the type's active renderer —
    // keep it consistent with our explicit renders. This also covers renderer
    // 'change' overlay updates (accept/reject): the ytype subscribes to the
    // renderer itself and re-emits them on the 'delta' channel.
    ytype.useRenderer(renderer)
    const doc = /** @type {import('@y/y').Doc} */ (ytype.doc)
    if (doc._transaction !== null || doc._transactionCleanups.length > 0) {
      // Constructed mid-transaction/cleanup (a config dispatch from inside a Y
      // observer): materializing the cache now would render *ahead* of still-
      // queued patches, which would then double-apply into it — start in the
      // uncertain window instead and let the cache materialize after the drain.
      this._stateOverride = this._render()
    } else {
      // Materialize the maintained cache — the steady-state source of truth.
      // From here on Yjs keeps it current on every event of this type.
      this.ytype.delta // eslint-disable-line no-unused-expressions
    }
    /**
     * @param {import('lib0/delta').Delta<any>} d
     * @param {any} origin
     */
    this._onDelta = (d, origin) => this._handleDelta(d, origin)
    ytype.on('delta', this._onDelta)
  }

  /**
   * Native-channel handler. Fires for Y transactions (including through
   * suggestion-deleted parents) and for renderer overlay updates. Our own
   * writes are handled by `applyDelta` itself (`_applying`; the origin check
   * catches emissions of our transactions that fire outside that window,
   * e.g. queued nested transaction cleanups).
   *
   * @param {import('lib0/delta').Delta<any>} d
   * @param {any} origin
   */
  _handleDelta (d, origin) {
    if (this._applying) return
    this._maybeSettle()
    if (origin === this.origin) return
    if (this._stateOverride !== null) {
      // uncertain window: legacy self-healing consumption — whatever this
      // payload carried (or a merged emission double-carried) is delivered
      // as the difference of full renders
      const next = this._render()
      const change = delta.diff(/** @type {any} */ (this._stateOverride), /** @type {any} */ (next), { compare: this.compare, clone: true })
      this._stateOverride = next
      if (!change.isEmpty()) {
        this.emit('delta', [change, origin])
      }
    } else {
      // steady state: the payload is positioned exactly against the cache
      // (Yjs patches the cache right before emitting) — forward it as-is
      this.emit('delta', [d, origin])
    }
  }

  /**
   * A fresh full attributed render (uncertain-window source of truth).
   *
   * @return {import('lib0/delta').Delta<any>}
   */
  _render () {
    return /** @type {import('lib0/delta').Delta<any>} */ (this.ytype.toDeltaDeep({ renderer: this.renderer }))
  }

  /**
   * Close the uncertain window once the doc's cleanup queue has drained: the
   * queue only resets after every queued cache patch — including our own —
   * was applied, so an empty queue proves the maintained cache is current
   * again.
   */
  _maybeSettle () {
    if (this._stateOverride !== null) {
      const doc = /** @type {import('@y/y').Doc} */ (this.ytype.doc)
      if (doc._transaction === null && doc._transactionCleanups.length === 0) {
        this._stateOverride = null
      }
    }
  }

  /**
   * Current state — the maintained {@link YType#delta} cache (or the
   * uncertain-window override). A shared read value; consumers must not
   * mutate it. During a `'delta'` emission this is the post-change state,
   * which is exactly what the `renderedAttributions` transformer requires.
   *
   * @return {import('lib0/delta').Delta<any>}
   */
  get delta () {
    this._maybeSettle()
    return this._stateOverride ?? /** @type {import('lib0/delta').Delta<any>} */ (this.ytype.delta)
  }

  /**
   * Apply a foreign (view-originated) change. Returns the **fix**: the
   * difference between `old state + d` and what the ytype actually renders
   * after the write — renderer-added attribution (suggestion mode), content
   * kept by a suggestion-delete, dropped formatting on suggestion-deleted
   * content, and any Y-side normalization (duty 1).
   *
   * @param {import('lib0/delta').Delta<any>} d
   * @param {any} _origin the RDT origin (unused — Y transactions carry
   *   `this.origin` so the undo plugin can track them)
   * @return {import('lib0/delta').DeltaBuilder<any> | null}
   */
  applyDelta (d, _origin) {
    this._maybeSettle()
    if (d.isEmpty()) return null
    const doc = /** @type {import('@y/y').Doc} */ (this.ytype.doc)
    // A write issued mid-transaction/mid-cleanup defers its cache patch and
    // its renderer attribution — the cache cannot serve as `actual` for this
    // write, and every consumer of `delta` must keep seeing a post-write
    // state until the queue drains.
    const uncertain = this._stateOverride !== null || doc._transaction !== null || doc._transactionCleanups.length > 0
    // Pin `expected` before the transact: renderer 'change' cascades fire
    // synchronously inside it and must not shift the baseline.
    const expected = delta.cloneDeep(/** @type {any} */ (this.delta))
    expected.apply(delta.cloneDeep(/** @type {any} */ (d)), { final: true, move: true })
    this._applying = true
    try {
      doc.transact(() => {
        // `applyDelta` returns its own revert fix for the parts it cannot
        // apply (e.g. a `modify` into a suggestion-deleted node is reverted).
        // We intentionally ignore it: the diff below is computed against the
        // post-write state and subsumes it — returning both would
        // double-apply the correction.
        this.ytype.applyDelta(d, this.origin, { renderer: this.renderer })
      }, this.origin)
    } catch (err) {
      // Last-resort safety: should the Y-side apply ever throw mid-transact,
      // the ops before the failing one have already been applied — do NOT
      // rethrow; the fix below is computed from the actual post-write state
      // and heals both sides from whatever actually landed.
      console.warn('[y/prosemirror] ytype.applyDelta failed - reverting the unappliable part of the change', err)
    } finally {
      this._applying = false
    }
    // `actual`: in steady state the transact above ran top-level, so its
    // cleanup (cache patch, renderer cascades, chained formatting-cleanup
    // transactions) completed inside it — the cache *is* the post-write
    // state, no render needed. It must be `cloneDeep`ed for the diff though:
    // lib0's in-place `apply` does not invalidate memoized fingerprints when
    // an insert merges into an existing op, so once a previous diff memoized
    // the live cache's fingerprints, a later `diff` against it trims changed
    // content as unchanged and fabricates a revert (pinned upstream by lib0
    // `testFingerprintInvalidatedByInplaceApplyMerge`; the pre-workaround
    // repro here was `node .dbg-fuzz.mjs 140276057 10`). The clone computes
    // fresh fingerprints. Once fixed upstream, the clone can be dropped.
    // In the uncertain window the cache lags — fall back to a fresh render
    // and keep serving it until the drain.
    const actual = uncertain ? this._render() : /** @type {import('lib0/delta').Delta<any>} */ (/** @type {any} */ (delta.cloneDeep(/** @type {any} */ (this.ytype.delta))))
    if (uncertain) {
      this._stateOverride = actual
    }
    const fix = delta.diff(/** @type {any} */ (expected), /** @type {any} */ (actual), { compare: this.compare, clone: true })
    return fix.isEmpty() ? null : /** @type {any} */ (fix)
  }

  destroy () {
    this.ytype.off('delta', this._onDelta)
    this.emit('destroy', [this])
    super.destroy()
  }
}
