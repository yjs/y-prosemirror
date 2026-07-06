/**
 * Shared test infrastructure for collaborative suggestion-mode tests.
 *
 * # Mental model
 *
 * The suggestion-mode test suite revolves around a small set of recurring
 * shapes, captured here once:
 *
 *   - **`createPMView(ytype, renderer)`**: build a ProseMirror EditorView bound to a
 *     Y type via the y-prosemirror sync-plugin, optionally observed through an
 *     Renderer.
 *
 *   - **`setupTwoWaySync(docA, docB)`**: bridge two Y.Docs - initial state
 *     vector exchange + live `update` forwarding in both directions. Idempotent
 *     under state-vector, so chaining and cycling are both safe.
 *
 *   - **`Cohort`**: a multi-user collaborative session. One shared `baseDoc`
 *     plus, for each non-`no-suggestions` user, a private suggestion `Y.Doc`
 *     that the user's Renderer bridges to base. Every suggestion
 *     doc is chain-synced two-way (linear chain is enough; updates propagate
 *     transitively). Each user has a PM EditorView either on baseDoc directly
 *     (no-suggestions mode) or on their own suggDoc (view-/suggestion-mode).
 *
 *     The three modes:
 *       - `'no-suggestions'`   — edits commit to base directly, no renderer.
 *       - `'view-suggestions'` — sees pending suggestions, own edits commit to base.
 *       - `'suggestion-mode'`  — sees pending suggestions, own edits stay as suggestions.
 *
 *   - **`TracedOp`**: a serialised, deterministic PM operation
 *     `{ user, op, args }`. The same shape is produced by the fuzz framework
 *     (record) and consumed by the cohort-replay regression tests (replay).
 *     `applyTracedOp` is the inverse of the fuzz framework's per-op recorder
 *     and the single dispatcher used everywhere - one schema, one place to
 *     extend with new op kinds.
 *
 *   - **`findDivergences` / `assertCohortConsistency`**: cross-peer consistency
 *     check within each mode group. Uses `stableStringify` so that mark-`attrs`
 *     key ordering (e.g. `userIdsByAttr: {em, code}` vs `{code, em}`) does not
 *     create spurious divergences - only structural disagreement fails.
 */

import * as YPM from '@y/prosemirror'
import * as Y from '@y/y'
import * as ldelta from 'lib0/delta'
import * as t from 'lib0/testing'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { schema as defaultSchema } from './complexSchema.js'

const PM_KEY = 'prosemirror'

/** @typedef {'no-suggestions' | 'view-suggestions' | 'suggestion-mode'} UserMode */

/**
 * @typedef {Object} CohortUser
 * @property {number} idx
 * @property {UserMode} mode
 * @property {EditorView} view
 * @property {Y.AbstractRenderer?} renderer
 * @property {Y.Doc | null} suggestionDoc
 */

/**
 * Build a PM EditorView wired through the y-prosemirror sync-plugin to a Y
 * type and an Renderer.
 *
 * @param {Y.Type} ytype
 * @param {Y.AbstractRenderer?} [renderer]
 * @param {Object} [opts]
 * @param {import('prosemirror-model').Schema} [opts.schema]
 * @param {typeof YPM.defaultMapAttributionToMark} [opts.mapAttributionToMark]
 * @returns {EditorView}
 */
export const createPMView = (ytype, renderer = Y.baseRenderer, opts = {}) => {
  const s = opts.schema || defaultSchema
  const plugin = YPM.syncPlugin(opts.mapAttributionToMark ? { mapAttributionToMark: opts.mapAttributionToMark } : {})
  const view = new EditorView(
    { mount: document.createElement('div') },
    { state: EditorState.create({ schema: s, plugins: [plugin] }) }
  )
  YPM.configureYProsemirror({ ytype, renderer })(view.state, view.dispatch)
  return view
}

/**
 * Two-way live sync between two Y.Docs. Performs an initial state-vector
 * exchange and then forwards every subsequent `update` event both ways.
 *
 * Idempotent: applying an update a peer already has is a state-vector no-op,
 * so wiring multiple pairs into a chain (or cycle) is safe.
 *
 * @param {Y.Doc} doc1
 * @param {Y.Doc} doc2
 */
export const setupTwoWaySync = (doc1, doc2) => {
  Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
  Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))
  doc1.on('update', (u) => Y.applyUpdate(doc2, u))
  doc2.on('update', (u) => Y.applyUpdate(doc1, u))
}

/**
 * Deterministic `JSON.stringify` with recursively sorted object keys.
 *
 * Necessary for cross-peer doc comparison because mark `attrs` (e.g.
 * `userIdsByAttr`) carry plain objects whose key order depends on op
 * sequencing - structurally identical docs can serialise with different key
 * orderings, which a naive string compare would flag as a (spurious)
 * divergence.
 *
 * @param {any} v
 * @returns {string}
 */
export const stableStringify = (v) => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'
  const keys = Object.keys(v).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}'
}

/**
 * Canonicalize a ProseMirror doc JSON for cross-peer comparison: sort every
 * text node's marks and merge adjacent text nodes that carry the same (sorted)
 * mark set.
 *
 * Overlapping marks of one type (e.g. several comments on a span) have no
 * significant array order - see CAVEATS.md ("Overlapping marks and mark
 * order"). PM stores same-type marks in an order-sensitive array and
 * `Mark.sameSet` compares positionally, so two peers may legitimately differ
 * only in mark-array order and, consequently, in where adjacent text nodes are
 * split. Normalizing collapses exactly that noise while still surfacing real
 * divergences (different mark *sets*, text, or block structure).
 *
 * @param {any} node
 * @returns {any}
 */
export const normalizeDoc = (node) => {
  if (node === null || typeof node !== 'object') return node
  const out = { ...node }
  if (Array.isArray(node.marks)) {
    out.marks = node.marks.slice().sort((/** @type {any} */ a, /** @type {any} */ b) => {
      const ka = stableStringify(a)
      const kb = stableStringify(b)
      return ka < kb ? -1 : ka > kb ? 1 : 0
    })
  }
  if (Array.isArray(node.content)) {
    /** @type {any[]} */
    const merged = []
    for (const child of node.content.map(normalizeDoc)) {
      const last = merged[merged.length - 1]
      if (last != null && last.type === 'text' && child.type === 'text' &&
          stableStringify(last.marks ?? []) === stableStringify(child.marks ?? [])) {
        merged[merged.length - 1] = { ...last, text: (last.text ?? '') + (child.text ?? '') }
      } else {
        merged.push(child)
      }
    }
    out.content = merged
  }
  return out
}

/**
 * A multi-user collaborative session backed by one shared `baseDoc` plus a
 * chain-synced suggestion Y.Doc per suggestion-aware user.
 *
 *   baseDoc                                  (shared Y state)
 *     ↑↓ via Renderer bridge
 *   user[i].suggestionDoc                    (per user, only if mode != 'no-suggestions')
 *     ↔ user[i+1].suggestionDoc              (chain-synced; propagates transitively)
 *
 * A 'no-suggestions' user has `suggestionDoc = null` and the editor view binds
 * directly to `baseDoc`. Otherwise the user's renderer bridges base↔suggestion and
 * the view binds to the suggestion doc.
 */
export class Cohort {
  /**
   * @param {Array<UserMode>} modes
   * @param {Object} [opts]
   * @param {import('prosemirror-model').Schema} [opts.schema]
   * @param {typeof YPM.defaultMapAttributionToMark} [opts.mapAttributionToMark]
   */
  constructor (modes, opts = {}) {
    this.opts = opts
    this.baseDoc = new Y.Doc({ gc: false, guid: 'base' })
    // Deterministic clientIDs so CRDT ordering and any captured Y item
    // identifiers (`{client, clock}`) reproduce across runs. Y.Doc normally
    // assigns a random clientID per process. We give baseDoc clientID 0 and
    // every suggestion doc the matching user's `idx + 1` - all unique, and
    // trivially mapped back to the user that produced the items.
    this.baseDoc.clientID = 0
    this.attrs = new Y.Attributions()
    /** @type {Array<CohortUser>} */
    this.users = modes.map((mode, idx) => this._mkUser(idx, mode))
    // Chain-sync every suggestion-aware user.
    const sd = /** @type {Array<Y.Doc>} */ (this.users.map(u => u.suggestionDoc).filter(d => d !== null))
    for (let i = 0; i + 1 < sd.length; i++) setupTwoWaySync(sd[i], sd[i + 1])
  }

  /**
   * @param {number} idx
   * @param {UserMode} mode
   * @returns {CohortUser}
   */
  _mkUser (idx, mode) {
    if (mode === 'no-suggestions') {
      // No private suggDoc - edits go straight to baseDoc, so this user's
      // items will carry baseDoc.clientID (= 0). Multiple no-suggestions users
      // in the same cohort therefore share a clientID, which is fine: in this
      // test framework they all dispatch sequentially against the same Y.Doc
      // and the clocks remain monotonic.
      return {
        idx,
        mode,
        suggestionDoc: null,
        renderer: Y.baseRenderer,
        view: createPMView(this.baseDoc.get(PM_KEY), Y.baseRenderer, this.opts)
      }
    }
    const suggestionDoc = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: `sugg-${idx}` })
    suggestionDoc.clientID = idx + 1
    const renderer = Y.createDiffRenderer(this.baseDoc, suggestionDoc, { attrs: this.attrs })
    renderer.suggestionMode = mode === 'suggestion-mode'
    return {
      idx,
      mode,
      suggestionDoc,
      renderer,
      view: createPMView(suggestionDoc.get(PM_KEY), renderer, this.opts)
    }
  }

  /**
   * Insert a single paragraph with the given text into the base doc. All peers
   * receive it through their renderer bridge / chain-sync.
   *
   * @param {string} text
   */
  seed (text) {
    this.baseDoc.get(PM_KEY).applyDelta(
      ldelta.create().insert([ldelta.create('paragraph', {}, text)]).done()
    )
  }

  /**
   * @param {number} idx
   * @returns {CohortUser}
   */
  user (idx) {
    return this.users[idx]
  }

  /** Group users by mode (in their original order). */
  byMode () {
    /** @type {Map<UserMode, Array<CohortUser>>} */
    const m = new Map()
    for (const u of this.users) {
      const arr = m.get(u.mode) || []
      arr.push(u)
      m.set(u.mode, arr)
    }
    return m
  }

  destroy () {
    for (const u of this.users) {
      u.view.destroy()
      u.renderer?.destroy?.()
    }
  }
}

/**
 * Args shape varies by op kind; downstream code reads only the fields the
 * matching switch case needs and the whole dispatcher is wrapped in a
 * try/catch that swallows schema-invalid edits, so we widen `args` to a
 * loose record. Each `case` documents which keys it consumes.
 *
 * @typedef {Object} TracedOp
 * @property {number} user — index into `cohort.users`
 * @property {('insertText'|'insertPlainText'|'deleteRange'|'addMark'|'removeMark'|'splitBlock'|'insertParagraph')} op
 * @property {Record<string, any>} args
 */

/**
 * Apply a single `TracedOp` to a cohort. Schema-invalid edits (positions that
 * don't resolve, marks on non-inline content, etc.) are silently skipped -
 * traces captured from one cohort layout can produce ops that no longer fit
 * after reduction, and we want the replay to push through.
 *
 * Centralising op dispatch here keeps the trace format and the simulation's
 * record/replay path in lockstep. Add a new op kind in exactly one place.
 *
 * @param {Cohort} cohort
 * @param {TracedOp} step
 * @param {import('prosemirror-model').Schema} [schemaOverride]
 */
export const applyTracedOp = (cohort, step, schemaOverride) => {
  const user = cohort.user(step.user)
  if (!user) return
  const s = schemaOverride || defaultSchema
  const { state } = user.view
  const dispatch = (/** @type {import('prosemirror-state').Transaction} */ tr) => {
    try { user.view.dispatch(tr) } catch (_) { /* swallow */ }
  }
  try {
    const a = step.args
    switch (step.op) {
      case 'insertText':
        dispatch(state.tr.insertText(a.text, a.pos))
        break
      case 'insertPlainText': {
        const $pos = state.doc.resolve(a.pos)
        if (!$pos.parent.isTextblock) break
        dispatch(state.tr.insert(a.pos, s.text(a.text)))
        break
      }
      case 'deleteRange':
        dispatch(state.tr.delete(a.from, a.to))
        break
      case 'addMark':
        // consumes: from, to, markName, markAttrs? (e.g. comment `{ id }`)
        dispatch(state.tr.addMark(a.from, a.to, s.marks[a.markName].create(a.markAttrs)))
        break
      case 'removeMark':
        // consumes: from, to, markName, markAttrs?. With markAttrs, removes only
        // the specific (overlapping) instance; otherwise removes the whole type.
        dispatch(state.tr.removeMark(a.from, a.to, a.markAttrs != null ? s.marks[a.markName].create(a.markAttrs) : s.marks[a.markName]))
        break
      case 'splitBlock': {
        const $pos = state.doc.resolve(a.pos)
        if (!$pos.parent.isTextblock) break
        dispatch(state.tr.split(a.pos))
        break
      }
      case 'insertParagraph':
        dispatch(state.tr.insert(a.pos, s.nodes.paragraph.create(null, s.text(a.text))))
        break
    }
  } catch (_) { /* schema-invalid edits skip */ }
}

/**
 * @typedef {Object} Divergence
 * @property {UserMode} mode
 * @property {number} idxA
 * @property {number} idxB
 * @property {any} jsonA
 * @property {any} jsonB
 */

/**
 * Compare each mode group's users pairwise (first vs each subsequent) and
 * return the structural divergences. Uses `stableStringify` so key-ordering
 * noise in mark `attrs` doesn't masquerade as a real divergence.
 *
 * @param {Cohort} cohort
 * @returns {Array<Divergence>}
 */
export const findDivergences = (cohort) => {
  /** @type {Array<Divergence>} */
  const out = []
  for (const [mode, users] of cohort.byMode()) {
    if (users.length < 2) continue
    // Normalize before comparing: overlapping marks have no significant order
    // (see `normalizeDoc` / CAVEATS.md), so we compare canonical forms.
    const baseJSON = normalizeDoc(users[0].view.state.doc.toJSON())
    const baseStr = stableStringify(baseJSON)
    for (let i = 1; i < users.length; i++) {
      const otherJSON = normalizeDoc(users[i].view.state.doc.toJSON())
      if (stableStringify(otherJSON) !== baseStr) {
        out.push({
          mode,
          idxA: users[0].idx,
          idxB: users[i].idx,
          jsonA: JSON.parse(JSON.stringify(baseJSON)),
          jsonB: JSON.parse(JSON.stringify(otherJSON))
        })
      }
    }
  }
  return out
}

/**
 * Fail the test (via `t.compare`) if any mode-pair structurally diverges.
 * Pretty-prints every divergence first so the test log shows the actual
 * doc states.
 *
 * @param {Cohort} cohort
 * @param {string} [label]
 */
export const assertCohortConsistency = (cohort, label = '') => {
  const divergences = findDivergences(cohort)
  if (divergences.length === 0) return
  for (const d of divergences) {
    console.log(`\n=== Divergence (${label}) in mode "${d.mode}" between user ${d.idxA} and user ${d.idxB} ===`)
    console.log(`-- user ${d.idxA} --`)
    console.log(JSON.stringify(d.jsonA, null, 2))
    console.log(`-- user ${d.idxB} --`)
    console.log(JSON.stringify(d.jsonB, null, 2))
  }
  const d = divergences[0]
  t.compare(
    d.jsonB,
    d.jsonA,
    `mode=${d.mode} u${d.idxA} vs u${d.idxB} (${divergences.length} divergence(s) total)${label ? ' [' + label + ']' : ''}`
  )
}
