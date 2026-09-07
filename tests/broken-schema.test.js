/**
 * Schema-invalid content produced by concurrency (yjs/y-prosemirror#258).
 *
 * Two individually valid changes can compose into a document that violates
 * the ProseMirror schema: both paragraphs of a `block+` blockquote deleted by
 * two peers. The previous binding resolved this by deleting the invalid node;
 * this binding does the same at node-construction time (`deltaToPNode` in
 * src/sync-utils.js drops the node) and the RDT fix loop writes that deletion
 * back to Y on every peer, so all peers converge on the same document without
 * per-peer schema fillers.
 *
 * Suggestion mode is the exception: a node that is already a pending delete
 * cannot be dropped (the Y side re-inserts it) and cannot be filled (`@y/y`
 * bounces writes into deleted nodes), so it is rendered as-is until the
 * deletion is accepted or a base-writing peer drops it for real.
 */

import * as YPM from '@y/prosemirror'
import * as Y from '@y/y'
import * as delta from 'lib0/delta'
import * as t from 'lib0/testing'
import * as basicSchema from 'prosemirror-schema-basic'
import { Schema } from 'prosemirror-model'
import { Cohort, createPMView, normalizeDoc, stableStringify } from './cohort.js'

const PM_KEY = 'prosemirror'

/**
 * The shared fixture. Positions in the rendered document:
 * paragraph('head') 0..6, blockquote 6..18 holding paragraph('one') 7..12 and
 * paragraph('two') 12..17, paragraph('tail') 18..24.
 */
const seedDelta = () => delta.create().insert([
  delta.create('paragraph', {}, 'head'),
  /** @type {any} */ (delta.create('blockquote', {}, [
    delta.create('paragraph', {}, 'one'),
    delta.create('paragraph', {}, 'two')
  ])),
  delta.create('paragraph', {}, 'tail')
]).done()

/**
 * Really delete both paragraphs of the fixture's blockquote at the Y level,
 * which is what the merged state of two concurrent deletes looks like.
 */
const emptyBlockquoteDelta = () => delta.create().retain(1).modify(/** @type {any} */ (delta.create().delete(2))).done()

/**
 * Top-level node type names of a ProseMirror document.
 *
 * @param {import('prosemirror-model').Node} doc
 * @return {Array<string>}
 */
const blockTypes = doc => {
  /** @type {Array<string>} */
  const names = []
  doc.forEach(n => { names.push(n.type.name) })
  return names
}

/**
 * Top-level node names of a Y type, read off its deep render.
 *
 * @param {Y.Node} ytype
 * @return {Array<string>}
 */
const yBlockNames = ytype => {
  const json = /** @type {any} */ (ytype.toDeltaDeep().toJSON())
  return json.children.flatMap((/** @type {any} */ op) => op.insert.map((/** @type {any} */ n) => n.name))
}

/**
 * @param {import('prosemirror-view').EditorView} a
 * @param {import('prosemirror-view').EditorView} b
 * @param {string} msg
 */
const assertSameDoc = (a, b, msg) => t.compare(
  stableStringify(normalizeDoc(a.state.doc.toJSON())),
  stableStringify(normalizeDoc(b.state.doc.toJSON())),
  msg
)

/**
 * Count `'delta'` emissions on both RDTs of every view and throw past the
 * limit, mirroring `installLoopBreaker` in prosemirror-rdt.test.js: a fix loop
 * that does not converge must fail the test instead of hanging the run.
 *
 * @param {Array<import('prosemirror-view').EditorView>} views
 * @param {number} [limit]
 * @return {{ n: number }}
 */
const installLoopBreaker = (views, limit = 300) => {
  const counter = { n: 0 }
  for (const view of views) {
    const binding = /** @type {any} */ (YPM.ySyncPluginKey.getState(view.state)).binding
    for (const rdt of [binding.a, binding.b]) {
      const origEmit = rdt.emit.bind(rdt)
      rdt.emit = (/** @type {any} */ name, /** @type {any} */ args) => {
        if (name === 'delta' && ++counter.n > limit) {
          throw new Error('broken-schema-loop-breaker: the fix loop did not converge')
        }
        return origEmit(name, args)
      }
    }
  }
  return counter
}

/**
 * @param {Y.Doc} from
 * @param {Y.Doc} to
 */
const syncOneWay = (from, to) => {
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from, Y.encodeStateVector(to)))
}

/**
 * The issue itself: two offline peers each delete one paragraph of a
 * two-paragraph blockquote. The merge empties the blockquote, both peers drop
 * it, both fixes delete the same Y item, and editing continues.
 *
 * @param {t.TestCase} _tc
 */
export const testConcurrentDeletesDropEmptyBlockquote = _tc => {
  const ydoc1 = new Y.Doc({ gc: false })
  ydoc1.clientID = 1
  const ydoc2 = new Y.Doc({ gc: false })
  ydoc2.clientID = 2
  ydoc1.get(PM_KEY).applyDelta(seedDelta())
  syncOneWay(ydoc1, ydoc2) // one-shot sync, then the peers go offline
  const view1 = createPMView(ydoc1.get(PM_KEY))
  const view2 = createPMView(ydoc2.get(PM_KEY))
  try {
    installLoopBreaker([view1, view2])
    view1.dispatch(view1.state.tr.delete(7, 12)) // paragraph('one')
    view2.dispatch(view2.state.tr.delete(12, 17)) // paragraph('two')
    t.assert(view1.state.doc.textContent === 'headtwotail', 'peer 1 deleted "one"')
    t.assert(view2.state.doc.textContent === 'headonetail', 'peer 2 deleted "two"')
    // Encode both updates before applying either, so both peers receive the
    // merge that empties the blockquote and both take the drop path.
    const u1 = Y.encodeStateAsUpdate(ydoc1, Y.encodeStateVector(ydoc2))
    const u2 = Y.encodeStateAsUpdate(ydoc2, Y.encodeStateVector(ydoc1))
    Y.applyUpdate(ydoc1, u2)
    Y.applyUpdate(ydoc2, u1)
    // exchange the fixes (both deleted the same Y item, so this is idempotent)
    syncOneWay(ydoc1, ydoc2)
    syncOneWay(ydoc2, ydoc1)
    view1.state.doc.check()
    view2.state.doc.check()
    t.compare(blockTypes(view1.state.doc), ['paragraph', 'paragraph'], 'peer 1 dropped the emptied blockquote')
    t.compare(blockTypes(view2.state.doc), ['paragraph', 'paragraph'], 'peer 2 dropped the emptied blockquote')
    t.compare(yBlockNames(ydoc1.get(PM_KEY)), ['paragraph', 'paragraph'], 'the fix deleted the blockquote from Y (peer 1)')
    t.compare(yBlockNames(ydoc2.get(PM_KEY)), ['paragraph', 'paragraph'], 'the fix deleted the blockquote from Y (peer 2)')
    t.compare(ydoc1.get(PM_KEY).toDeltaDeep().toJSON(), ydoc2.get(PM_KEY).toDeltaDeep().toJSON(), 'ytypes converge')
    assertSameDoc(view1, view2, 'views converge')
    view1.dispatch(view1.state.tr.insertText('!', 5))
    syncOneWay(ydoc1, ydoc2)
    t.assert(view2.state.doc.textContent === 'head!tail', 'editing continues to sync after the repair')
  } finally {
    view1.destroy()
    view2.destroy()
  }
}

/**
 * Invalid nodes already present in the ytype when the editor binds are
 * dropped, including a nested cascade (an empty blockquote inside a
 * blockquote empties its parent, which is dropped in turn).
 *
 * @param {t.TestCase} _tc
 */
export const testEmptyBlockquoteDroppedAtBind = _tc => {
  const ydoc = new Y.Doc({ gc: false })
  const ytype = ydoc.get(PM_KEY)
  ytype.applyDelta(delta.create().insert([
    delta.create('paragraph', {}, 'a'),
    delta.create('blockquote', {}), // invalid: block+ without children
    /** @type {any} */ (delta.create('blockquote', {}, [delta.create('blockquote', {})])), // nested cascade
    /** @type {any} */ (delta.create('blockquote', {}, [delta.create('paragraph', {}, 'kept')])),
    delta.create('paragraph', {}, 'b')
  ]).done())
  const view = createPMView(ytype)
  try {
    installLoopBreaker([view])
    view.state.doc.check()
    t.compare(blockTypes(view.state.doc), ['paragraph', 'blockquote', 'paragraph'], 'both invalid blockquotes were dropped')
    t.assert(view.state.doc.textContent === 'akeptb', 'valid content survived')
    t.compare(yBlockNames(ytype), ['paragraph', 'blockquote', 'paragraph'], 'both invalid blockquotes were deleted from Y')
  } finally {
    view.destroy()
  }
}

/**
 * A remote insert of an invalid node into a bound editor takes the
 * incremental step path (`deltaToPSteps`): the node is dropped from the
 * inserted content and deleted from Y by the fix, and later valid inserts at
 * the same position still land.
 *
 * @param {t.TestCase} _tc
 */
export const testInvalidRemoteInsertDropped = _tc => {
  const ydoc = new Y.Doc({ gc: false })
  const ytype = ydoc.get(PM_KEY)
  ytype.applyDelta(seedDelta())
  const view = createPMView(ytype)
  try {
    installLoopBreaker([view])
    const before = stableStringify(view.state.doc.toJSON())
    ytype.applyDelta(delta.create().retain(1).insert([delta.create('blockquote', {})]).done())
    view.state.doc.check()
    t.compare(stableStringify(view.state.doc.toJSON()), before, 'the invalid insert never reached the view')
    t.assert(ytype.length === 3, `the fix deleted the invalid insert from Y (got ${ytype.length} children)`)
    const ok = /** @type {any} */ (delta.create('blockquote', {}, [delta.create('paragraph', {}, 'ok')]))
    ytype.applyDelta(delta.create().retain(1).insert([ok]).done())
    view.state.doc.check()
    t.assert(view.state.doc.textContent === 'headokonetwotail', 'a valid remote insert still lands')
  } finally {
    view.destroy()
  }
}

/**
 * prosemirror-schema-basic declares `doc: block+`.
 */
const basic = new Schema({ nodes: basicSchema.nodes, marks: basicSchema.marks })

/**
 * The document node can never be dropped: when its only child is invalid it
 * is refilled through `createAndFill`, and the filler reaches Y through the
 * fix like any other normalization.
 *
 * @param {t.TestCase} _tc
 */
export const testRootIsFilledNotDropped = _tc => {
  const ydoc = new Y.Doc({ gc: false })
  const ytype = ydoc.get(PM_KEY)
  ytype.applyDelta(delta.create().insert([delta.create('blockquote', {})]).done())
  const view = createPMView(ytype, null, { schema: basic })
  try {
    installLoopBreaker([view])
    view.state.doc.check()
    t.compare(blockTypes(view.state.doc), ['paragraph'], 'the blockquote was dropped and the document refilled')
    t.compare(
      /** @type {any} */ (ytype.toDeltaDeep()),
      /** @type {any} */ (YPM.docToDelta(view.state.doc).done(false)),
      'Y holds the filler and no blockquote'
    )
  } finally {
    view.destroy()
  }
}

/**
 * Suggestion mode next to a base-doc editor: the merged deletes empty the
 * blockquote in the base doc. The base peer drops it for real; the
 * suggestion-mode peer's drop is only a pending delete, whose re-render is
 * held as-is until the base delete arrives. Terminates and converges.
 *
 * @param {t.TestCase} _tc
 */
export const testSuggestionModeEmptiedBlockquoteTerminates = _tc => {
  const cohort = new Cohort(['no-suggestions', 'suggestion-mode'])
  try {
    cohort.baseDoc.get(PM_KEY).applyDelta(seedDelta())
    installLoopBreaker(cohort.users.map(u => u.view))
    cohort.baseDoc.get(PM_KEY).applyDelta(emptyBlockquoteDelta())
    for (const u of cohort.users) {
      u.view.state.doc.check()
      t.compare(blockTypes(u.view.state.doc), ['paragraph', 'paragraph'], `user ${u.idx} (${u.mode}) shows no blockquote`)
    }
    t.compare(yBlockNames(cohort.baseDoc.get(PM_KEY)), ['paragraph', 'paragraph'], 'the base doc lost the blockquote')
    assertSameDoc(cohort.user(0).view, cohort.user(1).view, 'modes converge')
  } finally {
    cohort.destroy()
  }
}

/**
 * Assert the as-is rendering of a pending-deleted blockquote that lost all
 * of its content, then resolve it by binding a base-doc editor whose
 * bind-time drop is a real delete.
 *
 * `doc.check()` is deliberately not called while the shell is on screen: an
 * empty `block+` node is not a valid ProseMirror node, and rendering it as-is
 * is what keeps the fix loop finite.
 *
 * @param {Cohort} cohort
 * @param {import('prosemirror-view').EditorView} view
 * @param {{ n: number }} counter
 */
const assertPendingDeleteShellThenResolve = (cohort, view, counter) => {
  t.assert(counter.n < 50, `the fix loop settled (${counter.n} emissions)`)
  t.compare(blockTypes(view.state.doc), ['paragraph', 'blockquote', 'paragraph'], 'the pending-deleted blockquote is still rendered')
  const bq = view.state.doc.child(1)
  t.assert(bq.childCount === 0, 'it is rendered as-is: not filled')
  t.assert(bq.marks.some(m => m.type.name === 'y-attributed-delete'), 'it carries the pending-delete mark')
  const baseView = createPMView(cohort.baseDoc.get(PM_KEY))
  try {
    baseView.state.doc.check()
    t.compare(blockTypes(baseView.state.doc), ['paragraph', 'paragraph'], 'the base editor dropped the empty blockquote')
    view.state.doc.check()
    t.compare(blockTypes(view.state.doc), ['paragraph', 'paragraph'], 'the real delete cleared the pending-deleted shell')
    t.compare(yBlockNames(cohort.baseDoc.get(PM_KEY)), ['paragraph', 'paragraph'], 'the base doc lost the blockquote')
  } finally {
    baseView.destroy()
  }
}

/**
 * Pre-existing loop, independent of the concurrent-delete case but fixed by
 * the same rule: the whole blockquote is pending-deleted first, then the base
 * doc really deletes its paragraphs. Filling the pending-deleted empty node
 * used to loop forever (`@y/y` reverts writes into deleted nodes); it is now
 * rendered unfilled.
 *
 * @param {t.TestCase} _tc
 */
export const testPendingDeletedBlockquoteEmptiedByBase = _tc => {
  const cohort = new Cohort(['suggestion-mode'])
  try {
    cohort.baseDoc.get(PM_KEY).applyDelta(seedDelta())
    const view = cohort.user(0).view
    const counter = installLoopBreaker([view])
    view.dispatch(view.state.tr.delete(6, 18)) // pending delete of the whole blockquote
    t.assert(view.state.doc.child(1).marks.some(m => m.type.name === 'y-attributed-delete'), 'the blockquote is a pending delete')
    counter.n = 0
    cohort.baseDoc.get(PM_KEY).applyDelta(emptyBlockquoteDelta())
    assertPendingDeleteShellThenResolve(cohort, view, counter)
  } finally {
    cohort.destroy()
  }
}

/**
 * The same fixpoint reached the other way round: with no base-doc editor
 * around, the suggestion-mode peer's own drop becomes the pending delete of
 * the emptied blockquote, and its re-render is the as-is shell.
 *
 * @param {t.TestCase} _tc
 */
export const testSuggestionModeDropBecomesPendingDelete = _tc => {
  const cohort = new Cohort(['suggestion-mode'])
  try {
    cohort.baseDoc.get(PM_KEY).applyDelta(seedDelta())
    const view = cohort.user(0).view
    const counter = installLoopBreaker([view])
    cohort.baseDoc.get(PM_KEY).applyDelta(emptyBlockquoteDelta())
    assertPendingDeleteShellThenResolve(cohort, view, counter)
  } finally {
    cohort.destroy()
  }
}

// === Required attributes ===

/**
 * A paragraph holding one inline image: `'a'`, the image, `'b'`. Positions in
 * the rendered document: paragraph open 0, `'a'` 1..2, image 2..3, `'b'` 3..4.
 *
 * @param {Record<string, any>} imageAttrs
 */
const imageParagraphDelta = imageAttrs => delta.create().insert([
  /** @type {any} */ (delta.create('paragraph', {}).insert('a').insert([delta.create('image', imageAttrs)]).insert('b'))
]).done()

/**
 * The image node of {@link imageParagraphDelta}'s paragraph in a view.
 *
 * @param {import('prosemirror-view').EditorView} view
 */
const imageOf = view => view.state.doc.child(0).child(1)

/**
 * A required attribute is part of a node's validity. Y does not validate
 * schemas, so a live node can arrive without one (a peer with a different
 * schema; `@y/y` 14.0.0-rc.25's range accept shipped a node without its
 * attrs). Building it used to throw `RangeError: No value supplied for
 * attribute src` out of `deltaToPNode` and out of Y's event delivery, which
 * desynced the view and starved every later observer of the transaction. It
 * is dropped like rejected content instead: the fix deletes it from Y, an
 * observer registered after the binding still receives the transaction, and
 * later valid inserts still land.
 *
 * @param {t.TestCase} _tc
 */
export const testMissingRequiredAttrDropped = _tc => {
  const ydoc = new Y.Doc({ gc: false })
  const ytype = ydoc.get(PM_KEY)
  ytype.applyDelta(seedDelta())
  const view = createPMView(ytype)
  let observed = 0
  const laterObserver = () => { observed++ }
  ytype.on('delta', laterObserver)
  try {
    installLoopBreaker([view])
    const before = stableStringify(view.state.doc.toJSON())
    // an image without its required `src`, after "he" of paragraph('head')
    ytype.applyDelta(delta.create().modify(/** @type {any} */ (delta.create().retain(2).insert([delta.create('image', {})]))).done())
    view.state.doc.check()
    t.compare(stableStringify(view.state.doc.toJSON()), before, 'the attr-less image never reached the view')
    t.assert(observed > 0, 'an observer registered after the binding still received the transaction')
    t.assert(!JSON.stringify(ytype.toDeltaDeep().toJSON()).includes('"image"'), 'the fix deleted the attr-less image from Y')
    ytype.applyDelta(delta.create().modify(/** @type {any} */ (delta.create().retain(2).insert([delta.create('image', { src: 'ok.png' })]))).done())
    view.state.doc.check()
    const image = view.state.doc.child(0).child(1)
    t.assert(image.type.name === 'image' && image.attrs.src === 'ok.png', 'a valid image still lands')
  } finally {
    ytype.off('delta', laterObserver)
    view.destroy()
  }
}

/**
 * The pending-delete counterpart, which can never be dropped: the
 * suggestion-mode user pending-deletes an image, then the base doc really
 * deletes the image's required `src` (and its optional `title`). The change
 * arrives as `deleteAttr` ops on a pending-deleted node. The view applies
 * them as far as the schema allows - the optional attr falls back to its
 * default, the required one is held as `null` - keeps a schema-valid
 * document, and never writes the attributes back into the deleted node
 * (`@y/y` would revert that and the fix loop would never settle).
 *
 * @param {t.TestCase} _tc
 */
export const testPendingDeletedNodeLosesRequiredAttr = _tc => {
  const cohort = new Cohort(['suggestion-mode'])
  try {
    const base = cohort.baseDoc.get(PM_KEY)
    base.applyDelta(imageParagraphDelta({ src: 'x.png', title: 't' }))
    const user = cohort.user(0)
    const view = user.view
    const counter = installLoopBreaker([view])
    t.compare({ ...imageOf(view).attrs }, { src: 'x.png', alt: null, title: 't' }, 'the image renders with its attrs')
    view.dispatch(view.state.tr.delete(2, 3)) // pending delete of the image
    t.assert(imageOf(view).marks.some(m => m.type.name === 'y-attributed-delete'), 'the image is a pending delete')
    counter.n = 0
    base.applyDelta(delta.create().modify(/** @type {any} */ (delta.create().retain(1).modify(/** @type {any} */ (delta.create().deleteAttr('src').deleteAttr('title'))))).done())
    t.assert(counter.n < 50, `the fix loop settled (${counter.n} emissions)`)
    view.state.doc.check()
    t.assert(imageOf(view).marks.some(m => m.type.name === 'y-attributed-delete'), 'still rendered as a pending delete')
    t.compare({ ...imageOf(view).attrs }, { src: null, alt: null, title: null }, 'the required attr is held as null, the optional one as its default')
    const rendered = JSON.stringify(/** @type {Y.Doc} */ (user.suggestionDoc).get(PM_KEY).toDeltaDeep({ renderer: user.renderer }).toJSON())
    t.assert(!rendered.includes('"src"') && !rendered.includes('"title"'), 'nothing was written back into the pending-deleted node')
  } finally {
    cohort.destroy()
  }
}

/**
 * The same state at bind time, i.e. the fresh-render path of
 * `deltaToPNodeOrDrop` rather than a change: the base doc holds an image
 * without `src`, the suggestion doc has it pending-deleted, and a
 * suggestion-mode view binding to it renders the pending delete with
 * `src: null` instead of throwing.
 *
 * @param {t.TestCase} _tc
 */
export const testPendingDeletedNodeWithoutRequiredAttrAtBind = _tc => {
  const base = new Y.Doc({ gc: false })
  base.clientID = 0
  const sugg = new Y.Doc({ isSuggestionDoc: true, gc: false })
  sugg.clientID = 1
  const renderer = Y.createDiffRenderer(base, sugg, { attributions: Y.createContentMap() })
  renderer.suggestionMode = true
  base.get(PM_KEY).applyDelta(imageParagraphDelta({}))
  sugg.get(PM_KEY).applyDelta(delta.create().modify(/** @type {any} */ (delta.create().retain(1).delete(1))).done()) // pending delete of the image
  const view = createPMView(sugg.get(PM_KEY), renderer)
  try {
    const counter = installLoopBreaker([view])
    view.state.doc.check()
    const image = imageOf(view)
    t.assert(image.type.name === 'image', 'the pending-deleted image is rendered')
    t.assert(image.marks.some(m => m.type.name === 'y-attributed-delete'), 'as a pending delete')
    t.compare({ ...image.attrs }, { src: null, alt: null, title: null }, 'with its missing required attr held as null')
    t.assert(counter.n < 50, `the bind settled (${counter.n} emissions)`)
    t.assert(!JSON.stringify(sugg.get(PM_KEY).toDeltaDeep({ renderer }).toJSON()).includes('"src"'), 'nothing was written into the pending-deleted node')
  } finally {
    view.destroy()
    renderer.destroy()
  }
}
