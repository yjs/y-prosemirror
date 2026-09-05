import * as delta from 'lib0/delta'
import * as object from 'lib0/object'
import { Transformer, Template, createTransformResult } from 'lib0/delta/transformer'

/**
 * # `swallowFormats` — the one-way gate for the `y-attributed-*` projection
 *
 * The reserved `y-attributed-*` format keys are a *projection* of the Y side's
 * attribution dimension: Yjs and its renderer own the attributions, and only
 * the binding may produce these keys. This stage is the single place that
 * enforces that, and it is deliberately asymmetric:
 *
 * - **A-side (Y → view)**: pure passthrough. The formats `attributionToFormat`
 *   rendered flow to the view untouched.
 * - **B-side (view → Y)**: every change to a swallowed key is *swallowed* —
 *   the key never reaches the Y document. What happens to the view depends on
 *   the direction of the change:
 *   - the view **removes** (or clears) a key → dropped, and *nothing* is
 *     pushed back. This covers both a user stripping the mark by hand ("clear
 *     formatting") and ProseMirror refusing to hold it at all (a node whose
 *     schema declares `marks: ''`, where `tr.addMark` silently skips it and
 *     the RDT's `diff(expected, actual)` reports the loss). Re-asserting the
 *     mark would be correct for the first case and an infinite
 *     render → drop → restore → drop loop for the second, and the transformer
 *     cannot tell them apart — so it accepts the loss and logs a warning
 *     ({@link warnRemoval}). The view keeps rendering the stripped state until
 *     a Y change re-renders that region.
 *   - the view **adds** a key (content pasted from an attributed span, or a
 *     fresh insert inheriting an inclusive attribution mark from its
 *     neighborhood) → dropped *and* corrected: `applyB` returns a `b`-side
 *     change that removes the key again, which the binding applies straight
 *     back to the view (see `propagate` in `lib0/delta/rdt`).
 *
 * Only additions produce a correction, so every correction round strictly
 * *removes* formats — the binding's fix loop stays monotone and cannot
 * oscillate.
 *
 * ## Pipeline position
 *
 * This must be the **last** stage (closest to the view). An `applyB` change
 * flows right-to-left, so any earlier position would let
 * `attributionToFormat`'s own strip erase the keys before this stage could see
 * them, and the swallow/correct decision could never be made.
 *
 * Like every transformer it is an *owning* consumer of the delta it is handed
 * (see `lib0/delta/transformer`'s `Transformer` doc); the binding hands it a
 * privately-owned builder.
 *
 * @module transformers/swallow-formats
 */

/**
 * The format keys swallowed by default: the reserved attribution marks
 * produced by `attributionToFormat` (`insert`/`delete`/`format` for content
 * ops, `attrs` for the node-level attribute projection).
 *
 * @type {Array<string>}
 */
export const defaultSwallowedFormats = [
  'y-attributed-insert',
  'y-attributed-delete',
  'y-attributed-format',
  'y-attributed-attrs'
]

/**
 * Whether a delta carries anything besides its children — attrs or root
 * (cursor) marks. Such a change is never a no-op, even when every child op
 * strips down to a bare retain.
 *
 * @param {delta.DeltaAny} d
 */
const hasNonChildContent = d =>
  !object.isEmpty(d.attrs) ||
  (d.marks !== null && d.marks.size > 0) ||
  (d.deleteMarks !== null && d.deleteMarks.size > 0)

/**
 * The result of one recursive walk: the swallowed change for the Y side
 * (`out`), the view-side correction (`corr`), and the two flags deciding
 * whether either is worth emitting.
 *
 * @typedef {{ out: delta.DeltaBuilderAny, corr: delta.DeltaBuilderAny, touched: boolean, corrected: boolean }} WalkResult
 */

/**
 * @extends {Transformer<any,any>}
 */
export class SwallowFormatsTransformer extends Transformer {
  /**
   * @param {import('lib0/schema').Schema<delta.Delta<any>>} $in
   * @param {import('lib0/schema').Schema<delta.Delta<any>>} $out
   * @param {Array<string>} formats
   */
  constructor ($in, $out, formats) {
    super($in, $out)
    /**
     * @type {Set<string>}
     */
    this.formats = new Set(formats)
    /**
     * Keys already warned about, so a node that structurally cannot hold a
     * mark logs once instead of on every render of that region.
     *
     * @type {Set<string>}
     */
    this._warned = new Set()
  }

  /**
   * Log the first removal of each swallowed key: the view no longer agrees
   * with what Y says the attribution is, and this stage does not push it back.
   *
   * Deliberately vague about the *cause*. At swallow time a schema that cannot
   * hold the mark is indistinguishable from a user clearing it or from a
   * benign render/doc asymmetry, so the actionable schema diagnosis is left to
   * the binding's bind-time audit (`warnUnsupportedAttributionMarks` in
   * `src/sync-plugin.js`), which names the offending node types before any
   * editing happens.
   *
   * @param {string} key
   */
  warnRemoval (key) {
    if (this._warned.has(key)) return
    this._warned.add(key)
    console.warn(
      `[y/prosemirror] a view-side change removed the render-only attribution format "${key}"; it was swallowed - Yjs and its renderer own the attributions, so it is not written back, and it is not re-asserted on the view either (a mark the schema cannot hold would loop forever). This view may render stale attribution for that range until a Y change re-renders it. If the bind-time warning about node types that do not allow attribution marks also fired, whitelist "${key}" on the node type it named; otherwise check what is editing the attribution projection.`
    )
  }

  /**
   * The swallowed key/value pairs of a format map. `null` values are removals
   * (nothing to correct), anything else is an addition the view must be
   * corrected for.
   *
   * @param {{[k:string]:any}|null|undefined} format
   * @return {{ strip: {[k:string]:any}|null|undefined, clear: {[k:string]:any}|null }}
   */
  _split (format) {
    if (format == null) return { strip: format, clear: null } // `undefined` skip / `null` clear-all
    /** @type {{[k:string]:any}} */
    const rest = {}
    /** @type {{[k:string]:any}|null} */
    let clear = null
    let swallowed = false
    for (const k in format) {
      if (this.formats.has(k)) {
        swallowed = true
        if (format[k] == null) this.warnRemoval(k) // the view dropped it
        else (clear ??= {})[k] = null // the view added it — correct it away
      } else {
        rest[k] = format[k]
      }
    }
    if (!swallowed) return { strip: format, clear: null }
    // `undefined` (skip), not `{}`, when stripping emptied the map
    return { strip: object.isEmpty(rest) ? undefined : rest, clear }
  }

  /**
   * One recursive walk over a view-side change, building both output sides in
   * parallel. The correction is expressed in **post-change** coordinates (so
   * it applies to the document the change produced): retains and inserted
   * content consume positions, deletes do not.
   *
   * @param {delta.DeltaAny} d
   * @return {WalkResult}
   */
  _walk (d) {
    const out = /** @type {delta.DeltaBuilderAny} */ (delta.cloneShallow(d))
    const corr = /** @type {delta.DeltaBuilderAny} */ (delta.create())
    let touched = hasNonChildContent(d)
    let corrected = false
    for (const op of d.children) {
      // `DeleteOp` has no `format` — reading it yields `undefined` (a skip)
      const { strip, clear } = this._split(/** @type {any} */ (op).format)
      if (clear != null) corrected = true
      if (delta.$textOp.check(op)) {
        out.insert(op.insert, strip, op.attribution)
        corr.retain(op.insert.length, clear ?? undefined)
        touched = true
      } else if (delta.$insertOp.check(op)) {
        // one element at a time: the builder re-coalesces equal formats, and
        // each element needs its own correction slot
        for (const el of op.insert) {
          if (delta.$deltaAny.check(el)) {
            const sub = this._walk(el)
            out.insert([sub.out.done(false)], strip, op.attribution)
            if (sub.corrected) {
              corr.modify(sub.corr.done(false), clear ?? undefined)
              corrected = true
            } else {
              corr.retain(1, clear ?? undefined)
            }
          } else {
            out.insert([el], strip, op.attribution)
            corr.retain(1, clear ?? undefined)
          }
        }
        touched = true
      } else if (delta.$retainOp.check(op)) {
        out.retain(op.retain, strip, op.attribution)
        corr.retain(op.retain, clear ?? undefined)
        // a bare retain is pure positioning — only a surviving format or an
        // attribution instruction makes it a real change for the Y side
        touched ||= strip !== undefined || op.attribution !== undefined
      } else if (delta.$deleteOp.check(op)) {
        out.delete(op.delete)
        // deleted content has no position in the post-change document
        touched = true
      } else { // $modifyOp
        const sub = this._walk(op.value)
        out.modify(sub.out.done(false), strip, op.attribution)
        if (sub.corrected) {
          corr.modify(sub.corr.done(false), clear ?? undefined)
          corrected = true
        } else {
          corr.retain(1, clear ?? undefined)
        }
        touched ||= sub.touched || strip !== undefined || op.attribution !== undefined
      }
    }
    return { out, corr, touched, corrected }
  }

  /**
   * @param {delta.DeltaBuilderAny} d
   * @return {import('lib0/delta/transformer').TransformResultAny}
   */
  applyA (d) {
    return createTransformResult(null, d)
  }

  /**
   * @param {delta.DeltaBuilderAny} d
   * @return {import('lib0/delta/transformer').TransformResultAny}
   */
  applyB (d) {
    const { out, corr, touched, corrected } = this._walk(d)
    return createTransformResult(
      touched ? /** @type {any} */ (out.done(false)) : null,
      corrected ? /** @type {any} */ (corr.done(false)) : null
    )
  }
}

/**
 * @template {delta.DeltaConf} [IN=any]
 * @extends {Template<IN, IN>}
 */
export class SwallowFormats extends Template {
  /**
   * @param {import('lib0/schema').Schema<delta.Delta<IN>>} $d
   * @param {Array<string>} formats
   */
  constructor ($d, formats) {
    super($d, $d) // the stage only removes format keys — the schema is unchanged
    /**
     * @type {Array<string>}
     */
    this.formats = formats
  }

  get name () { return 'y-prosemirror:swallowFormats' }

  /**
   * @return {Transformer<IN, IN>}
   */
  init () {
    return new SwallowFormatsTransformer(this.$in, this.$out, this.formats)
  }
}

/**
 * Gate a set of render-only format keys so they flow data → view only — see
 * the {@link module:transformers/swallow-formats module doc}. Must be piped
 * *after* `attributionToFormat` (last stage, closest to the view).
 *
 * @template {delta.DeltaConf} IN
 * @param {import('lib0/schema').Schema<delta.Delta<IN>>} $d
 * @param {Array<string>} [formats] the swallowed keys — defaults to
 * {@link defaultSwallowedFormats}
 * @return {SwallowFormats<IN>}
 */
export const swallowFormats = ($d, formats = defaultSwallowedFormats) => new SwallowFormats($d, formats)
