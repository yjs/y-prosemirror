import * as t from 'lib0/testing'
import * as prng from 'lib0/prng'
import * as Y from '@y/y'
import * as YPM from '@y/prosemirror'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { Awareness } from '@y/protocols/awareness'
import { schema } from './complexSchema.js'
import { createPMView, normalizeDoc, setupTwoWaySync } from './cohort.js'
import { hashOfJSON } from '../src/utils.js'
import {
  Y13,
  v1,
  PM_KEY,
  v1DocFromPm,
  toY14,
  replayTo13,
  v1ReadPm,
  v1BindView,
  bindV2,
  deltaNodeChildren,
  deltaTextOf,
  collectFormatKeys
} from './v1.js'

/**
 * Compatibility with documents written by the v1 binding (`y-prosemirror@1.3.7`
 * on `yjs@13`), exercised against the real packages rather than a hand-built
 * legacy layout (tests/inline-nodes.test.js covers that).
 *
 * What we promise: a v1 document loads in v2 and can be edited further -
 * rendering, editing, undo, stored relative positions and remote cursors all
 * work. What we do not promise: that v1 can read what v2 writes, or that v1
 * and v2 peers can collaborate on one document. The tests marked PIN assert
 * the current behaviour at that boundary so a change is noticed, not to
 * declare it correct. See "Compatibility with older y-prosemirror" in
 * CAVEATS.md.
 */

const { em, strong, link, comment } = schema.marks
const { paragraph, heading, blockquote, image, hard_break: hardBreak, code_block: codeBlock, horizontal_rule: horizontalRule } = schema.nodes

/**
 * @param {string} text
 * @param {Array<import('prosemirror-model').Mark>} [marks]
 */
const txt = (text, marks = []) => schema.text(text, marks)

/**
 * @param {Array<import('prosemirror-model').Node>} content
 */
const p = (...content) => paragraph.create(null, content)

/**
 * @param {Array<import('prosemirror-model').Node>} content
 */
const doc = (...content) => schema.nodes.doc.create(null, content)

/**
 * A document touching every construct the v1 format encodes differently from
 * a flat delta: attrs on blocks, mark attrs, nested blocks, inline leaves
 * between text runs, an empty paragraph, a code block, a leaf block.
 *
 * `clean` avoids the two constructs a v2 bind normalizes (overlapping marks
 * and node attrs holding `null`), so a bind of the clean fixture must not
 * write to Y at all.
 *
 * @param {{ clean: boolean }} opts
 */
const buildFixture = ({ clean }) => doc(
  heading.create({ level: 2 }, [txt('Title '), txt('emph', [em.create()])]),
  p(txt('plain '), txt('bold', [strong.create()]), txt(' '), txt('link', [link.create({ href: 'https://example.com', title: 'Example' })]), txt(' tail')),
  clean
    ? p(txt('over', [em.create()]), txt('lap', [em.create(), strong.create()]), txt('ping', [strong.create()]))
    : p(txt('over', [comment.create({ id: 1 })]), txt('lap', [comment.create({ id: 1 }), comment.create({ id: 2 })]), txt('ping', [comment.create({ id: 2 })])),
  p(txt('before '), image.create(clean ? { src: 'a.png', alt: 'A', title: 'T' } : { src: 'a.png' }), txt(' after'), hardBreak.create(), txt('next line')),
  blockquote.create(null, [p(txt('quoted')), blockquote.create(null, [heading.create({ level: 3 }, [txt('deep')]), p(txt('deeper'))])]),
  p(),
  codeBlock.create(null, [txt('const x = 1\nconsole.log(x)')]),
  horizontalRule.create(),
  p(txt('end'))
)

/**
 * Random inline content: 1..4 non-empty runs with em/strong/link marks and
 * the occasional hard break. Never empty strings (`schema.text('')` throws).
 *
 * @param {prng.PRNG} gen
 * @return {Array<import('prosemirror-model').Node>}
 */
const randomInline = (gen) => {
  /**
   * @type {Array<import('prosemirror-model').Node>}
   */
  const out = []
  const runs = prng.int32(gen, 1, 4)
  for (let i = 0; i < runs; i++) {
    const marks = prng.oneOf(gen, [
      [],
      [],
      [em.create()],
      [strong.create()],
      [em.create(), strong.create()],
      [link.create({ href: 'https://x.test/' + prng.word(gen, 1, 6), title: prng.bool(gen) ? prng.word(gen, 1, 6) : null })]
    ])
    out.push(txt(prng.word(gen, 1, 8), marks))
    if (i + 1 < runs && prng.int32(gen, 0, 3) === 0) out.push(hardBreak.create())
  }
  return out
}

/**
 * @param {prng.PRNG} gen
 * @param {number} depth
 * @return {import('prosemirror-model').Node}
 */
const randomBlock = (gen, depth) => {
  const pick = prng.int32(gen, 0, 11)
  if (pick <= 4) return p(...randomInline(gen))
  if (pick === 5) return p()
  if (pick <= 7) return heading.create({ level: prng.int32(gen, 1, 6) }, randomInline(gen))
  if (pick === 8) return codeBlock.create(null, [txt(prng.word(gen, 1, 12))])
  if (pick === 9) return horizontalRule.create()
  if (depth >= 2) return p(...randomInline(gen))
  const n = prng.int32(gen, 1, 3)
  const children = []
  for (let i = 0; i < n; i++) children.push(randomBlock(gen, depth + 1))
  return blockquote.create(null, children)
}

/**
 * A random document without the constructs a v2 bind normalizes (overlapping
 * marks, node attrs holding `null`).
 *
 * @param {prng.PRNG} gen
 * @return {import('prosemirror-model').Node}
 */
const randomPmDoc = (gen) => {
  const n = prng.int32(gen, 1, 6)
  const blocks = []
  for (let i = 0; i < n; i++) blocks.push(randomBlock(gen, 0))
  const d = doc(...blocks)
  d.check()
  return d
}

/**
 * ProseMirror position of the first occurrence of `needle` in a text node.
 *
 * @param {import('prosemirror-model').Node} pmDoc
 * @param {string} needle
 * @return {number}
 */
const posOf = (pmDoc, needle) => {
  let found = -1
  pmDoc.descendants((node, pos) => {
    if (found >= 0) return false
    if (node.isText && node.text != null) {
      const i = node.text.indexOf(needle)
      if (i >= 0) found = pos + i
    }
    return found < 0
  })
  if (found < 0) throw new Error(`text "${needle}" not found`)
  return found
}

/**
 * @param {import('prosemirror-model').Node} a
 * @param {import('prosemirror-model').Node} b
 * @param {string} message
 */
const assertSameDoc = (a, b, message) => {
  t.compare(normalizeDoc(a.toJSON()), normalizeDoc(b.toJSON()), message)
}

/**
 * The top-level node deltas of a ytype's deep render.
 *
 * @param {Y.Node} ytype
 */
const yBlocks = (ytype) => deltaNodeChildren(/** @type {any} */ (ytype.toDeltaDeep()))

/**
 * A v1 document renders identically in v2. v1 stores each run of text as a
 * nested `Y.XmlText` (an anonymous node in v14); the binding's
 * `inlineAnonymousNodes` stage flattens it for the view and leaves the Y
 * representation untouched.
 *
 * @param {t.TestCase} _tc
 */
export const testV1FixtureRendersInV2 = (_tc) => {
  const pm = buildFixture({ clean: false })
  const ydoc13 = v1.prosemirrorToYDoc(pm, PM_KEY)
  const ydoc14 = toY14(ydoc13)
  const { view, ytype } = bindV2(ydoc14, { schema })
  view.state.doc.check()
  assertSameDoc(view.state.doc, pm, 'v1 fixture renders identically in v2')
  const headingNode = /** @type {any} */ (ytype.get(0))
  t.assert(headingNode.name === 'heading', 'first block is the heading')
  t.assert(headingNode.get(0).name === null, 'Y keeps the nested anonymous text container of the v1 format')
  view.destroy()
}

/**
 * Same through v1's JSON entry point.
 *
 * @param {t.TestCase} _tc
 */
export const testV1JsonFixtureRendersInV2 = (_tc) => {
  const pm = buildFixture({ clean: false })
  const ydoc13 = v1.prosemirrorJSONToYDoc(schema, pm.toJSON(), PM_KEY)
  const { view } = bindV2(toY14(ydoc13), { schema })
  view.state.doc.check()
  assertSameDoc(view.state.doc, pm, 'v1 JSON fixture renders identically in v2')
  view.destroy()
}

/**
 * Loading a v1 document is read-only: without overlapping marks and without
 * node attrs holding `null` (the two normalizations pinned below), the v2
 * bind renders the document without writing a single update.
 *
 * @param {t.TestCase} tc
 */
export const testRepeatRandomV1DocRendersInV2 = (tc) => {
  const pm = randomPmDoc(tc.prng)
  const ydoc13 = v1DocFromPm(pm)
  const { view, updates } = bindV2(toY14(ydoc13), { schema })
  t.compare(view.state.doc.toJSON(), pm.toJSON(), 'random v1 document renders identically in v2')
  t.assert(updates.length === 0, `binding a v1 document must not write to Y (got ${updates.length} updates)`)
  view.destroy()
}

/**
 * Editing a loaded v1 document: two v2 peers on the same v1 document stay
 * converged through interior inserts (routed into the nested `Y.XmlText`),
 * inserts at a paragraph start and new paragraphs (written flat), marks,
 * splits and deletes across runs, and a fresh load of the resulting mixed
 * representation renders the same document.
 *
 * @param {t.TestCase} _tc
 */
export const testContinueEditingV1Doc = (_tc) => {
  const pm = doc(heading.create({ level: 1 }, [txt('Title')]), p(txt('hello world')), p(txt('second')))
  const ydoc13 = v1DocFromPm(pm)
  const ydocA = toY14(ydoc13, 2)
  const ydocB = toY14(ydoc13, 3)
  setupTwoWaySync(ydocA, ydocB)
  const viewA = createPMView(ydocA.get(PM_KEY), null, { schema })
  const viewB = createPMView(ydocB.get(PM_KEY), null, { schema })
  /**
   * @param {string} step
   */
  const converged = (step) => {
    viewA.state.doc.check()
    t.compare(viewB.state.doc.toJSON(), viewA.state.doc.toJSON(), `peers converge after ${step}`)
    const fresh = new Y.Doc({ gc: false })
    Y.applyUpdate(fresh, Y.encodeStateAsUpdate(ydocA))
    const viewC = createPMView(fresh.get(PM_KEY), null, { schema })
    t.compare(viewC.state.doc.toJSON(), viewA.state.doc.toJSON(), `fresh load renders the same document after ${step}`)
    viewC.destroy()
  }
  const dispatch = (/** @type {(tr: import('prosemirror-state').Transaction, d: import('prosemirror-model').Node) => import('prosemirror-state').Transaction} */ f) => {
    viewA.dispatch(f(viewA.state.tr, viewA.state.doc))
  }

  dispatch((tr, d) => tr.insertText('XY', posOf(d, 'hello') + 5))
  converged('interior insert')
  const par1 = yBlocks(ydocA.get(PM_KEY))[1]
  t.assert(par1.name === 'paragraph' && deltaNodeChildren(par1)[0]?.name === null, 'edited paragraph keeps its anonymous container')
  t.compare(deltaTextOf(deltaNodeChildren(par1)[0]), 'helloXY world', 'interior insert routed into the nested container')

  dispatch((tr, d) => tr.insertText('Z', posOf(d, 'helloXY')))
  converged('insert at paragraph start')
  t.compare(viewA.state.doc.child(1).textContent, 'ZhelloXY world', 'insert at paragraph start rendered')

  dispatch((tr, d) => tr.addMark(posOf(d, 'hello'), posOf(d, 'hello') + 5, strong.create()))
  converged('addMark')

  dispatch((tr, d) => tr.split(posOf(d, ' world')))
  converged('split')
  t.assert(viewA.state.doc.childCount === 4, 'split produced a fourth block')

  dispatch((tr, d) => tr.delete(posOf(d, 'Z') + 1, posOf(d, 'XY') + 2))
  converged('delete across runs')
  t.compare(viewA.state.doc.child(1).textContent, 'Z', 'delete across runs rendered')

  dispatch((tr, d) => tr.insert(d.content.size, p(txt('new'))))
  converged('new paragraph')
  const blocks = yBlocks(ydocA.get(PM_KEY))
  const last = blocks[blocks.length - 1]
  t.assert(deltaNodeChildren(last).length === 0 && deltaTextOf(last) === 'new', 'new paragraph is written flat')

  viewA.destroy()
  viewB.destroy()
}

/**
 * Undo and redo on a loaded v1 document, including the selection bookmark
 * that the undo plugin anchors as a relative position inside the nested
 * container.
 *
 * @param {t.TestCase} _tc
 */
export const testUndoRedoOnV1Doc = (_tc) => {
  const pm = doc(p(txt('hello world')))
  const ydoc14 = toY14(v1DocFromPm(pm))
  const ytype = ydoc14.get(PM_KEY)
  const undoManager = new Y.UndoManager(ytype)
  const view = new EditorView({ mount: document.createElement('div') }, {
    state: EditorState.create({ schema, plugins: [YPM.syncPlugin(), YPM.yUndoPlugin(undoManager)] })
  })
  YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
  t.compare(view.state.doc.toJSON(), pm.toJSON(), 'v1 document loaded')
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 6)))
  view.dispatch(view.state.tr.insertText('XY'))
  t.compare(view.state.doc.textContent, 'helloXY world', 'typed into the v1 paragraph')
  t.assert(YPM.undo(view.state), 'undo available')
  t.compare(view.state.doc.textContent, 'hello world', 'undo restored the v1 content')
  t.assert(view.state.selection.anchor === 6, `selection restored inside the v1 paragraph (got ${view.state.selection.anchor})`)
  t.assert(YPM.redo(view.state), 'redo available')
  t.compare(view.state.doc.textContent, 'helloXY world', 'redo reapplied the edit')
  view.destroy()
}

/**
 * PIN - accepted one-time normalization. v1 keyed overlapping marks with a
 * sha256-based hash, v2 uses a Rabin fingerprint (`hashOfJSON`), so the first
 * v2 bind of a v1 document that holds overlapping marks re-keys them once.
 * The render is correct before and after, and a second bind is silent.
 *
 * @param {t.TestCase} _tc
 */
export const testOverlappingMarksOnV1DocAreRehashedOnce = (_tc) => {
  const pm = doc(p(txt('over', [comment.create({ id: 1 })]), txt('lap', [comment.create({ id: 1 }), comment.create({ id: 2 })]), txt('ping', [comment.create({ id: 2 })])))
  const ydoc14 = toY14(v1DocFromPm(pm))
  const ytype = ydoc14.get(PM_KEY)
  const keysBefore = collectFormatKeys(/** @type {any} */ (ytype.toDeltaDeep()))
  t.assert(keysBefore.size === 2 && [...keysBefore].every(k => /^comment--[A-Za-z0-9+/=]{8}$/.test(k)), 'v1 stored two hashed comment keys')
  const { view, updates } = bindV2(ydoc14, { schema })
  assertSameDoc(view.state.doc, pm, 'overlapping comments render')
  // PIN: the reconcile recomputes the keys with v2's hash and writes the rename
  t.assert(updates.length > 0, 'first bind re-keys the overlapping marks (pinned normalization)')
  const keysAfter = collectFormatKeys(/** @type {any} */ (ytype.toDeltaDeep()))
  const expected = new Set([1, 2].map(id => `comment--${hashOfJSON(comment.create({ id }).toJSON())}`))
  t.compare([...keysAfter].sort(), [...expected].sort(), 'Y now holds the v2 keys only')
  t.assert([...keysBefore].every(k => !keysAfter.has(k)), 'the v1 keys are gone')
  view.destroy()
  // the normalized document loads silently
  const again = new Y.Doc({ gc: false })
  Y.applyUpdate(again, Y.encodeStateAsUpdate(ydoc14))
  const second = bindV2(again, { schema })
  assertSameDoc(second.view.state.doc, pm, 'second load renders the same document')
  t.assert(second.updates.length === 0, 'second bind writes nothing')
  second.view.destroy()
}

/**
 * PIN - accepted one-time normalization. v1 omits node attrs whose value is
 * `null`; v2 stores every attr the ProseMirror node holds. The first bind
 * writes the missing `null`s once, a second bind is silent.
 *
 * @param {t.TestCase} _tc
 */
export const testNullNodeAttrsOnV1DocAreWrittenOnce = (_tc) => {
  const pm = doc(p(txt('a '), image.create({ src: 'a.png' }), txt(' b')))
  const ydoc14 = toY14(v1DocFromPm(pm))
  const img = () => /** @type {any} */ (ydoc14.get(PM_KEY).get(0)).get(1)
  t.compare(img().getAttrs(), { src: 'a.png' }, 'v1 omitted the null attrs')
  const { view, updates } = bindV2(ydoc14, { schema })
  t.compare(view.state.doc.toJSON(), pm.toJSON(), 'image renders with schema defaults')
  // PIN: the reconcile writes the null attrs the schema materialized
  t.assert(updates.length > 0, 'first bind writes the null attrs (pinned normalization)')
  t.compare(img().getAttrs(), { src: 'a.png', alt: null, title: null }, 'Y now holds explicit nulls')
  view.destroy()
  const again = new Y.Doc({ gc: false })
  Y.applyUpdate(again, Y.encodeStateAsUpdate(ydoc14))
  const second = bindV2(again, { schema })
  t.assert(second.updates.length === 0, 'second bind writes nothing')
  second.view.destroy()
}

/**
 * PIN - the unsupported direction. v2 writes new content flat (text directly
 * inside the element), which v1 cannot decode: mixed v1/v2 collaboration is
 * not supported. Edits strictly inside existing v1 text are the exception
 * because they route into the nested `Y.XmlText`.
 *
 * @param {t.TestCase} _tc
 */
export const testV1CannotReadV2Content = (_tc) => {
  const pm = doc(p(txt('hello world')))
  const ydoc13 = v1DocFromPm(pm)
  const ydoc14 = toY14(ydoc13)
  const { view, updates } = bindV2(ydoc14, { schema })
  view.dispatch(view.state.tr.insertText('X', 3))
  replayTo13(ydoc13, updates.splice(0))
  t.compare(v1ReadPm(schema, ydoc13).toJSON(), view.state.doc.toJSON(), 'an interior edit is still readable by v1')
  view.dispatch(view.state.tr.insert(view.state.doc.content.size, p(txt('new'))))
  replayTo13(ydoc13, updates.splice(0))
  // PIN: v1 throws on flat text
  t.fails(() => { v1ReadPm(schema, ydoc13) })
  t.fails(() => { v1.yXmlFragmentToProseMirrorRootNode(ydoc13.getXmlFragment(PM_KEY), schema) })
  view.destroy()
}

/**
 * Relative positions created by v1 (stored comment anchors, bookmarks)
 * resolve to the same ProseMirror position in v2, at every position of the
 * document.
 *
 * @param {t.TestCase} _tc
 */
export const testV1RelativePositionsResolveInV2 = (_tc) => {
  const pm = buildFixture({ clean: true })
  const ydoc13 = v1DocFromPm(pm)
  const frag13 = ydoc13.getXmlFragment(PM_KEY)
  const { doc: pm13, mapping } = v1.initProseMirrorDoc(frag13, schema)
  t.assert(pm13.eq(pm), 'v1 reads its own document back')
  const { view } = bindV2(toY14(ydoc13), { schema })
  t.assert(view.state.doc.eq(pm), 'v2 renders the fixture')
  /**
   * @type {Array<{ pos: number, got: number | null }>}
   */
  const mismatches = []
  for (let pos = 0; pos <= view.state.doc.content.size; pos++) {
    const json = Y13.relativePositionToJSON(v1.absolutePositionToRelativePosition(pos, frag13, mapping))
    const resolved = YPM.relativePositionToResolvedPosition(view, Y.createRelativePositionFromJSON(json))
    const got = resolved == null ? null : resolved.pos
    if (got !== pos) mismatches.push({ pos, got })
  }
  t.compare(mismatches, [], 'every v1 relative position resolves to its ProseMirror position in v2')
  view.destroy()
}

/**
 * A remote cursor published by a v1 peer (relative positions in the awareness
 * `cursor` field) renders at the right place in v2's cursor plugin.
 *
 * @param {t.TestCase} _tc
 */
export const testV1CursorRendersInV2CursorPlugin = (_tc) => {
  const pm = doc(p(txt('hello world')))
  const ydoc13 = v1DocFromPm(pm)
  const frag13 = ydoc13.getXmlFragment(PM_KEY)
  const { mapping } = v1.initProseMirrorDoc(frag13, schema)
  const cursor = {
    anchor: Y13.relativePositionToJSON(v1.absolutePositionToRelativePosition(2, frag13, mapping)),
    head: Y13.relativePositionToJSON(v1.absolutePositionToRelativePosition(6, frag13, mapping))
  }
  const ydoc14 = toY14(ydoc13)
  const awareness = new Awareness(ydoc14)
  const ytype = ydoc14.get(PM_KEY)
  const view = new EditorView({ mount: document.createElement('div') }, {
    state: EditorState.create({ schema, plugins: [YPM.syncPlugin(), YPM.yCursorPlugin(awareness)] })
  })
  YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
  const remoteId = 999
  awareness.states.set(remoteId, { cursor, user: { name: 'v1 peer', color: '#ff0000' } })
  awareness.meta.set(remoteId, { clock: 1, lastUpdated: Date.now() })
  const emitter = /** @type {any} */ (awareness)
  emitter.emit('change', [{ added: [remoteId], updated: [], removed: [] }, 'remote'])
  const cursorState = /** @type {import('prosemirror-view').DecorationSet} */ (YPM.yCursorPluginKey.getState(view.state))
  const decorations = cursorState.find(0, view.state.doc.content.size)
  t.assert(decorations.some((/** @type {any} */ d) => d.from === 6 && d.to === 6), 'cursor widget at the v1 head position')
  t.assert(decorations.some((/** @type {any} */ d) => d.from === 2 && d.to === 6), 'selection spans the v1 range')
  view.destroy()
  awareness.destroy()
}

/**
 * `ynodeToPmnode` renders a v1 document without a binding: it maps through
 * the binding's pipeline, whose compat stage flattens the nested text
 * containers.
 *
 * @param {t.TestCase} _tc
 */
export const testYnodeToPmnodeOnV1Doc = (_tc) => {
  const pm = buildFixture({ clean: true })
  const ydoc14 = toY14(v1DocFromPm(pm))
  const rendered = YPM.ynodeToPmnode(ydoc14.get(PM_KEY), schema)
  t.compare(rendered.toJSON(), pm.toJSON(), 'ynodeToPmnode flattens the v1 representation')
}

/**
 * A paragraph emptied through the v1 editor keeps an empty `Y.XmlText` (v1
 * issue #108). It renders as an empty paragraph in v2 without a write. This
 * also exercises the v1 editor setup the benchmarks use.
 *
 * @param {t.TestCase} _tc
 */
export const testV1EmptiedParagraphRendersEmpty = (_tc) => {
  const ydoc13 = new Y13.Doc()
  ydoc13.clientID = 1
  const frag13 = ydoc13.getXmlFragment(PM_KEY)
  const { view: v1view } = v1BindView(frag13, schema)
  v1view.dispatch(v1view.state.tr.insert(0, p(txt('123'))))
  t.assert(frag13.length === 1, 'v1 wrote the paragraph')
  v1view.dispatch(v1view.state.tr.delete(1, 4))
  t.compare(v1view.state.doc.toJSON(), { type: 'doc', content: [{ type: 'paragraph' }] }, 'v1 editor emptied the paragraph')
  const { view, updates } = bindV2(toY14(ydoc13), { schema })
  t.compare(view.state.doc.toJSON(), { type: 'doc', content: [{ type: 'paragraph' }] }, 'v2 renders the emptied v1 paragraph')
  t.assert(updates.length === 0, 'no write on bind')
  view.destroy()
  v1view.destroy()
}
