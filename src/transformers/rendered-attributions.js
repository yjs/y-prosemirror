import * as delta from 'lib0/delta'
import { Transformer, Template, createTransformResult } from 'lib0/delta/transformer'

/**
 * # `renderedAttributions` — y-prosemirror's replacement for lib0's `fullAttributions`
 *
 * Same pipeline role and output contract as
 * `lib0/delta/transformer/full-attributions`: whenever an op changes
 * attribution, re-emit the **complete accumulated** attribution for that
 * position (in "set present + clear removed" instruction form), so the
 * downstream `attributionToFormat` can render whole mark values. `applyB` is a
 * passthrough (the view never attributes).
 *
 * ## Why not lib0's `fullAttributions`?
 *
 * `fullAttributions` is *stateful*: it accumulates attribution in a private
 * overlay by tracking the change stream it is fed. Parts of the y-prosemirror
 * data side's change stream are diffs (returned fixes are
 * `diff(expected, actual)`; the uncertain-window emissions are diffs of full
 * renders) — and a diff between two renders is not unique: with several
 * equal-named nodes of similar content (e.g. short paragraphs), `diff` may
 * pair node instances differently on different peers (see CAVEATS.md
 * "Diffing ambiguity"). Applying any of those diffs converges to the same
 * *content*, but an overlay that tracks the *ops* accumulates the attribution
 * at whichever node the local pairing chose — peers' overlays drift apart,
 * and with them the attribution marks their views render (observed in the
 * suggestion-mode fuzz: two peers showing a format-suggestion on different
 * paragraphs). (The data side's *steady-state* emissions are nowadays the
 * native change deltas — identical on every peer — which shrinks that
 * ambiguity class, but does not remove it: fixes stay diffs.)
 *
 * This transformer is therefore **stateless**: it resolves the full
 * attribution from the data side's *current rendered state* (`getState()` — a
 * shared read value, never mutated here). Every change flowing `applyA` is, by
 * construction of the data RDT, positioned against exactly that state (a
 * native change payload is emitted right after the maintained cache was
 * patched with it; an uncertain-window emission is `diff(prev, next)` where
 * `next` is the state at emission time; a returned fix is
 * `diff(expected, actual)` where `actual` is the state), so a parallel walk
 * lines the two up — retains/modifies consume state positions, inserts do
 * not, deletes consume none (the state is the post-change render). Whatever
 * pairing produced the change, the attribution emitted here is the render's
 * truth at that position.
 *
 * Like `fullAttributions`, `applyA` enriches its input **in place** via
 * `d.apply(full, { move: true })` (the binding hands the transformer a
 * privately-owned builder) and never mutates a shared `format`/`attribution`
 * object — every emitted attribution is freshly allocated.
 *
 * @module transformers/rendered-attributions
 */

/**
 * The full attribution to emit for a position: the state's truth, plus a
 * `null` clear for every key the change touched that the truth no longer has
 * ("set present + clear removed" — a downstream consumer merges wholesale, so
 * removed keys must be cleared explicitly). The nested `format` map merges one
 * level, mirroring `Attribution` semantics.
 *
 * @param {{[k:string]:any}|null|undefined} stateAttr the render's attribution
 * @param {{[k:string]:any}|null|undefined} opAttr the change's attribution update
 * @return {{[k:string]:any}|null}
 */
const resolveAttr = (stateAttr, opAttr) => {
  if (stateAttr == null) return null // truth: no attribution — clear everything
  /** @type {{[k:string]:any}} */
  const out = {}
  for (const k in stateAttr) {
    out[k] = k === 'format' ? { ...stateAttr.format } : stateAttr[k]
  }
  if (opAttr != null) {
    for (const k in opAttr) {
      if (k === 'format' && opAttr.format != null && typeof opAttr.format === 'object') {
        const f = /** @type {{[k:string]:any}} */ (out.format ?? (out.format = {}))
        for (const fk in opAttr.format) {
          if (f[fk] === undefined) f[fk] = null // cleared format key
        }
      } else if (out[k] === undefined) {
        out[k] = null // cleared key
      }
    }
  }
  return out
}

/**
 * Build the content-free `full` delta carrying the resolved attribution at
 * exactly `d`'s attribution-touching positions, walking `state` (the
 * post-change render) in parallel. Mirrors `full-attributions.js`' `buildFull`,
 * with the overlay replaced by the render.
 *
 * @param {delta.DeltaAny} d
 * @param {delta.DeltaAny | null} state
 * @return {delta.DeltaBuilderAny}
 */
const buildFull = (d, state) => {
  const full = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  let cur = state == null ? null : state.children.start
  let off = 0
  const advance = () => {
    if (cur != null && off >= cur.length) {
      cur = cur.next
      off = 0
    }
  }
  /**
   * Read ≤ `rem` positions of one uniform run at the cursor, advancing.
   *
   * @param {number} rem
   * @return {{ take: number, attr: {[k:string]:any}|null|undefined, el: any }}
   */
  const readRun = (rem) => {
    if (cur == null) return { take: rem, attr: undefined, el: null }
    const take = Math.min(cur.length - off, rem)
    const attr = /** @type {any} */ (cur).attribution
    const el = delta.$insertOp.check(cur) ? cur.insert[off] : null
    off += take
    advance()
    return { take, attr, el }
  }
  for (const op of d.children) {
    if (delta.$retainOp.check(op)) {
      if (op.attribution === undefined) {
        full.retain(op.retain) // untouched — gap; still consume state positions
        let rem = op.retain
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
          const { take, attr } = readRun(rem)
          full.retain(take, undefined, resolveAttr(attr, op.attribution))
          rem -= take
        }
      }
    } else if (delta.$textOp.check(op)) {
      // data op: its attribution comes from the render diff and is already
      // complete — gap; consume the state positions it occupies
      full.retain(op.insert.length)
      let rem = op.insert.length
      while (rem > 0) {
        if (cur == null) break
        const take = Math.min(cur.length - off, rem)
        off += take
        rem -= take
        advance()
      }
    } else if (delta.$insertOp.check(op)) {
      full.retain(op.insert.length)
      let rem = op.insert.length
      while (rem > 0) {
        if (cur == null) break
        const take = Math.min(cur.length - off, rem)
        off += take
        rem -= take
        advance()
      }
    } else if (delta.$deleteOp.check(op)) {
      // deleted content has no position in the post-change render — no state
      // consumption, no entry in `full`
    } else { // $modifyOp
      const { attr, el } = readRun(1)
      const stateChild = delta.$deltaAny.check(el) ? el : null
      full.modify(
        buildFull(op.value, stateChild),
        undefined,
        op.attribution === undefined ? undefined : resolveAttr(attr, op.attribution)
      )
    }
  }
  full.done(false)
  return full
}

/**
 * @extends {Transformer<any,any>}
 */
export class RenderedAttributionsTransformer extends Transformer {
  /**
   * @param {import('lib0/schema').Schema<delta.Delta<any>>} $in
   * @param {import('lib0/schema').Schema<delta.Delta<any>>} $out
   * @param {() => delta.DeltaAny} getState
   */
  constructor ($in, $out, getState) {
    super($in, $out)
    this.getState = getState
  }

  /**
   * @param {delta.DeltaBuilderAny} d
   * @return {import('lib0/delta/transformer').TransformResultAny}
   */
  applyA (d) {
    const full = buildFull(d, this.getState())
    d.apply(full, { move: true })
    return createTransformResult(null, d)
  }

  /**
   * @param {delta.DeltaBuilderAny} d
   * @return {import('lib0/delta/transformer').TransformResultAny}
   */
  applyB (d) {
    return createTransformResult(d, null)
  }
}

/**
 * @template {delta.DeltaConf} [IN=any]
 * @extends {Template<IN, IN>}
 */
export class RenderedAttributions extends Template {
  /**
   * @param {import('lib0/schema').Schema<delta.Delta<IN>>} $d
   * @param {() => delta.DeltaAny} getState
   */
  constructor ($d, getState) {
    super($d, $d) // attribution is delta metadata — output schema equals input
    this.getState = getState
  }

  get name () { return 'y-prosemirror:renderedAttributions' }

  /**
   * @return {Transformer<IN, IN>}
   */
  init () {
    return new RenderedAttributionsTransformer(this.$in, this.$out, this.getState)
  }
}

/**
 * Expand every attribution-bearing op of an `applyA` change to the complete
 * accumulated attribution, resolved from the data side's current rendered
 * state — see the {@link module:transformers/rendered-attributions module
 * doc} for why this replaces lib0's stateful `fullAttributions` here.
 * Typically piped before `attributionToFormat`.
 *
 * @template {delta.DeltaConf} IN
 * @param {import('lib0/schema').Schema<delta.Delta<IN>>} $d
 * @param {() => delta.DeltaAny} getState the data-side RDT's current state
 * @return {RenderedAttributions<IN>}
 */
export const renderedAttributions = ($d, getState) => new RenderedAttributions($d, getState)
