import * as t from 'lib0/testing'
import * as YPM from '@y/prosemirror'
import * as Y from '@y/y'
import * as delta from 'lib0/delta'
import * as basicSchema from 'prosemirror-schema-basic'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { Schema } from 'prosemirror-model'
import { normalizeDoc } from './cohort.js'

/**
 * Basic marks + a `comment` mark that excludes nothing, so several comments may
 * overlap on the same text span. This is exactly the case that collides when
 * marks are stored under their bare name - see `markToYattrName` in sync-utils.
 *
 * @type {Object<string, import('prosemirror-model').MarkSpec>}
 */
const marks = {
  ...basicSchema.marks,
  comment: {
    attrs: { id: { default: null } },
    excludes: '',
    parseDOM: [{ tag: 'comment' }],
    toDOM (node) {
      return ['comment', { comment_id: node.attrs.id }]
    }
  }
}

const schema = new Schema({ nodes: basicSchema.nodes, marks })

/**
 * @param {Y.Type} ytype
 * @return {EditorView}
 */
const createView = ytype => {
  const view = new EditorView({ mount: document.createElement('div') }, {
    state: EditorState.create({ schema, plugins: [YPM.syncPlugin()] })
  })
  YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
  return view
}

/**
 * Two peers synced through Y, seeded with `<p>hello world</p>`. Peer 1 then adds
 * two overlapping comments: id 4 over "he" and id 5 over "el" - so "e" carries
 * both.
 *
 * @return {{ ytype1: Y.Type, view1: EditorView, view2: EditorView }}
 */
const setup = () => {
  const ydoc1 = new Y.Doc()
  const ydoc2 = new Y.Doc()
  // bidirectional live sync (echoes are no-ops, so this terminates)
  ydoc1.on('update', /** @param {Uint8Array} u */ u => Y.applyUpdate(ydoc2, u))
  ydoc2.on('update', /** @param {Uint8Array} u */ u => Y.applyUpdate(ydoc1, u))
  const ytype1 = ydoc1.get('prosemirror')
  ytype1.applyDelta(delta.create().insert([delta.create('paragraph', {}, 'hello world')]).done())
  const view1 = createView(ytype1)
  const view2 = createView(ydoc2.get('prosemirror'))
  view1.dispatch(view1.state.tr.addMark(1, 3, schema.mark('comment', { id: 4 })))
  view1.dispatch(view1.state.tr.addMark(2, 4, schema.mark('comment', { id: 5 })))
  return { ytype1, view1, view2 }
}

/**
 * Per-text-node view of the (single) paragraph: its text and the sorted set of
 * comment ids on it. Order-independent so it doesn't depend on mark ordering.
 *
 * @param {EditorView} view
 * @return {Array<{ text: string|undefined, ids: number[] }>}
 */
const commentLayout = view => {
  const para = /** @type {import('prosemirror-model').Node} */ (view.state.doc.firstChild)
  return para.content.content.map(node => ({
    text: node.text,
    ids: node.marks.filter(m => m.type.name === 'comment').map(m => m.attrs.id).sort((a, b) => a - b)
  }))
}

/**
 * Two comments overlap on the same span; both must survive the round-trip
 * through Y and reach the second peer.
 *
 * @param {t.TestCase} _tc
 */
export const testOverlappingComments = _tc => {
  const { ytype1, view1, view2 } = setup()
  const expected = [
    { text: 'h', ids: [4] },
    { text: 'e', ids: [4, 5] },
    { text: 'l', ids: [5] },
    { text: 'lo world', ids: [] }
  ]
  t.compare(commentLayout(view1), expected, 'view1 keeps both overlapping comments')
  t.compare(commentLayout(view2), expected, 'synced peer receives both overlapping comments')
  // Overlapping-mark array order is not significant (see CAVEATS), so compare
  // canonical forms.
  t.compare(normalizeDoc(view1.state.doc.toJSON()), normalizeDoc(view2.state.doc.toJSON()), 'peers converge')

  // A peer that renders the Y document from scratch (rather than accumulating
  // the marks incrementally via addMark) is the real test of what was stored:
  // a collision would surface here as a missing comment on the overlap.
  const ydoc3 = new Y.Doc()
  Y.applyUpdate(ydoc3, Y.encodeStateAsUpdate(/** @type {Y.Doc} */ (ytype1.doc)))
  const view3 = createView(ydoc3.get('prosemirror'))
  t.compare(commentLayout(view3), expected, 'fresh peer rendered from Y keeps both overlapping comments')

  // overlapping marks must be stored under distinct hashed keys in Y
  const yjson = JSON.stringify(ytype1.toDeltaDeep().toJSON())
  const distinctHashed = new Set(yjson.match(/comment--[A-Za-z0-9+/=]{8}/g) || [])
  t.assert(distinctHashed.size === 2, `Y stores two distinct hashed comment keys (got ${distinctHashed.size})`)
}

/**
 * Removing one of two overlapping comments must leave the other intact - on the
 * editing peer *and* on the receiving peer, whose reconcile applies a
 * value-less format-remove (exercises the targeted-removal path in
 * deltaToPSteps).
 *
 * @param {t.TestCase} _tc
 */
export const testRemoveOneOverlappingComment = _tc => {
  const { view1, view2 } = setup()
  view1.dispatch(view1.state.tr.removeMark(2, 4, schema.mark('comment', { id: 5 })))
  const expected = [
    { text: 'he', ids: [4] },
    { text: 'llo world', ids: [] }
  ]
  t.compare(commentLayout(view1), expected, 'editing peer: only the id:4 comment remains')
  t.compare(commentLayout(view2), expected, 'receiving peer: targeted removal kept the id:4 comment')
  t.compare(normalizeDoc(view1.state.doc.toJSON()), normalizeDoc(view2.state.doc.toJSON()), 'peers converge after removal')
}

/**
 * Reserved `y-attributed-*` attribution marks are render-only and must stay
 * addressable by their exact name - the binding strips/branches on the literal
 * names. They must never get the overlapping-mark hash suffix, even when the
 * schema declares them non-self-excluding (which would otherwise route them
 * through the overlapping-mark path). A real overlapping mark on the same span
 * is still hashed.
 *
 * @param {t.TestCase} _tc
 */
export const testAttributionMarksAreNeverHashed = _tc => {
  /** @type {Object<string, import('prosemirror-model').MarkSpec>} */
  const attributedMarks = {
    ...basicSchema.marks,
    comment: {
      attrs: { id: { default: null } },
      excludes: '',
      toDOM () { return ['comment', 0] }
    },
    // declared non-self-excluding on purpose - the binding must still keep it
    // addressable by its bare name rather than hashing it
    'y-attributed-insert': {
      attrs: { userIds: { default: null }, timestamp: { default: null } },
      excludes: '',
      toDOM () { return ['y-ins', 0] }
    }
  }
  const attrSchema = new Schema({ nodes: basicSchema.nodes, marks: attributedMarks })
  const doc = attrSchema.node('doc', undefined, attrSchema.node('paragraph', undefined,
    attrSchema.text('x', [
      attrSchema.mark('y-attributed-insert', { userIds: ['u1'], timestamp: 1 }),
      attrSchema.mark('comment', { id: 7 })
    ])
  ))
  const json = JSON.stringify(YPM.docToDelta(doc).toJSON())
  t.assert(json.includes('"y-attributed-insert"'), 'attribution mark keeps its bare name')
  t.assert(!json.includes('y-attributed-insert--'), 'attribution mark is never hashed')
  t.assert(/comment--[A-Za-z0-9+/=]{8}/.test(json), 'a real overlapping mark is still hashed')
}
