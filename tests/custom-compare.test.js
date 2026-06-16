import * as YPM from '@y/prosemirror'
import * as Y from '@y/y'
import * as delta from 'lib0/delta'
import * as t from 'lib0/testing'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { schema } from './complexSchema.js'

/**
 * Name of the first child node of a `lib0/delta` node, or `null` if the node
 * has no node-child. Used by the strict `customCompare` predicate below.
 *
 * @param {delta.DeltaAny} node
 * @return {string | null}
 */
const firstChildName = (node) => {
  for (const child of node.children) {
    if (delta.$insertOp.check(child)) {
      const first = child.insert[0]
      return delta.$deltaAny.check(first) ? first.name : null
    }
  }
  return null
}

/**
 * Shift the diffing boundary: two `blockquote` nodes only pair (diff in place)
 * when their first child's node type also matches. Mirrors the `blockContainer`
 * example from the `customCompare` docs.
 *
 * @type {NodeCompare}
 */
const strictBlockquoteCompare = (a, b) =>
  a.name === b.name &&
  (a.name !== 'blockquote' || firstChildName(a) === firstChildName(b))

/**
 * Build a `<doc><blockquote><{firstChild}>a</></blockquote></doc>` delta.
 *
 * @param {'paragraph'|'heading'} firstChild
 * @return {delta.DeltaAny}
 */
const docWithBlockquoteChild = (firstChild) => {
  const child = firstChild === 'heading'
    ? delta.create('heading', { level: 1 }, 'a')
    : delta.create('paragraph', {}, 'a')
  const blockquote = delta.create('blockquote', {}).insert(/** @type {any} */ ([child]))
  return delta.create().insert(/** @type {any} */ ([blockquote])).done()
}

/**
 * @param {delta.DeltaAny} d
 * @return {Array<delta.ChildrenOpAny>}
 */
const childOps = (d) => {
  /** @type {Array<delta.ChildrenOpAny>} */
  const ops = []
  for (const op of d.children) ops.push(op)
  return ops
}

/**
 * The diffing boundary only changes *how* a change is expressed (in-place
 * `modify` vs. wholesale `delete`+`insert`) - the converged document is
 * identical either way - so the difference is asserted on the diff delta
 * itself, on y-prosemirror-shaped deltas.
 *
 * @param {t.TestCase} _tc
 */
export const testCustomCompareShiftsDiffingBoundary = (_tc) => {
  // Same blockquote name on both sides, but its first child type changes
  // (paragraph -> heading).
  const d1 = docWithBlockquoteChild('paragraph')
  const d2 = docWithBlockquoteChild('heading')

  // Default boundary: names match (blockquote === blockquote), so the
  // blockquote is paired and diffed in place via a single `modify` op.
  const defaultOps = childOps(delta.diff(d1, d2))
  t.assert(
    defaultOps.length === 1 && delta.$modifyOp.check(defaultOps[0]),
    'default boundary diffs the blockquote in place (modify)'
  )

  // Strict boundary: the first-child type differs, so the blockquote no longer
  // pairs and is replaced wholesale (delete + insert).
  const strictOps = childOps(delta.diff(d1, d2, { compare: strictBlockquoteCompare }))
  t.assert(
    strictOps.some(o => delta.$deleteOp.check(o)) && strictOps.some(o => delta.$insertOp.check(o)),
    'strict boundary replaces the blockquote wholesale (delete + insert)'
  )
  t.assert(
    !strictOps.some(o => delta.$modifyOp.check(o)),
    'strict boundary produces no modify op'
  )
}

/**
 * The `customCompare` option must thread from `syncPlugin(opts)` into the
 * plugin state and drive a successful, convergent sync (PM <-> Y).
 *
 * @param {t.TestCase} _tc
 */
export const testCustomCompareSyncsConvergently = (_tc) => {
  const ydoc1 = new Y.Doc()
  const ydoc2 = new Y.Doc()
  ydoc1.on('update', (u) => Y.applyUpdate(ydoc2, u))
  ydoc2.on('update', (u) => Y.applyUpdate(ydoc1, u))
  const ytype1 = ydoc1.get('prosemirror')
  const ytype2 = ydoc2.get('prosemirror')

  // <blockquote><paragraph>hello</paragraph></blockquote>
  const blockquote = delta.create('blockquote', {}).insert(/** @type {any} */ ([delta.create('paragraph', {}, 'hello')]))
  ytype1.applyDelta(delta.create().insert(/** @type {any} */ ([blockquote])).done())

  /** @param {Y.Type} ytype */
  const mkView = (ytype) => {
    const view = new EditorView({ mount: document.createElement('div') }, {
      state: EditorState.create({ schema, plugins: [YPM.syncPlugin({ customCompare: strictBlockquoteCompare })] })
    })
    YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
    return view
  }

  const view1 = mkView(ytype1)
  const view2 = mkView(ytype2)

  // The predicate is threaded into the plugin state.
  t.assert(
    YPM.ySyncPluginKey.getState(view1.state)?.customCompare === strictBlockquoteCompare,
    'customCompare is stored in the plugin state'
  )

  // Change the blockquote's first child paragraph -> heading on peer 1. The
  // paragraph sits at pos 1 (inside the blockquote at pos 0).
  view1.dispatch(view1.state.tr.setNodeMarkup(1, schema.nodes.heading, { level: 2 }))

  // Both peers + the Y document converge to the same content despite the
  // shifted boundary (which here triggers a wholesale blockquote replace).
  const pm1 = YPM.docToDelta(view1.state.doc).done(false)
  const pm2 = YPM.docToDelta(view2.state.doc).done(false)
  t.compare(pm1, pm2, 'both PM peers converge')
  t.compare(pm1, ytype1.toDeltaDeep(), 'PM converges with the Y document')
  t.assert(view1.state.doc.firstChild?.firstChild?.type.name === 'heading', 'edit applied: first child is now a heading')

  view1.destroy()
  view2.destroy()
}
