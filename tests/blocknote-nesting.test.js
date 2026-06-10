/**
 * Reproduction tests for the "two blockGroups" reconcile failure observed in
 * BlockNote, whose `doc` requires EXACTLY ONE `blockGroup` child
 * (`doc -> blockGroup -> blockContainer+ -> blockContent`).
 *
 * Root cause: a top-level node with a strict (exactly-one) required child.
 * When a peer binds to an EMPTY Y.Doc, `configureYProsemirror` `createAndFill`s
 * a default `blockGroup` and the PM->Y sync writes it into Y. If TWO peers do
 * this INDEPENDENTLY and then merge, the CRDT keeps both `blockGroup`s -
 * schema-invalid for `doc: "blockGroup"`. This is the "schema mismatch under
 * concurrency" documented in CAVEATS.md: two individually valid edits compose
 * into an invalid document.
 *
 * The realistic collaboration pattern - a document is initialized ONCE and
 * other peers receive that state before binding - is concurrency-safe and is
 * what production providers (and BlockNote's collaboration option) do.
 */
import * as YPM from '@y/prosemirror'
import * as Y from '@y/y'
import * as t from 'lib0/testing'
import { Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { setupTwoWaySync } from './cohort.js'

// A minimal mirror of BlockNote's nesting: doc has EXACTLY ONE blockGroup.
const schema = new Schema({
  nodes: {
    doc: { content: 'blockGroup' },
    blockGroup: {
      content: 'blockContainer+',
      toDOM: () => ['div', { class: 'bg' }, 0]
    },
    blockContainer: {
      content: 'blockContent blockGroup?',
      defining: true,
      toDOM: () => ['div', { class: 'bc' }, 0]
    },
    paragraph: {
      content: 'inline*',
      group: 'blockContent',
      toDOM: () => ['p', 0]
    },
    text: { group: 'inline' }
  }
})

const PM = 'prosemirror'

/** @param {Y.Type} ytype */
const mkView = (ytype) => {
  const view = new EditorView(
    { mount: document.createElement('div') },
    { state: EditorState.create({ schema, plugins: [YPM.syncPlugin()] }) }
  )
  YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
  return view
}

/**
 * KNOWN LIMITATION: two peers that INDEPENDENTLY initialize an empty Y.Doc each
 * createAndFill a `blockGroup`; merging keeps both, which is invalid for a
 * `doc: "blockGroup"` schema. This pins the boundary so a future binding-side
 * reshape (merge over-cardinality children) has a regression target.
 *
 * @param {t.TestCase} _tc
 */
export const testIndependentInitIsKnownLimitation = _tc => {
  const docA = new Y.Doc({ gc: false, guid: 'A' })
  const docB = new Y.Doc({ gc: false, guid: 'B' })
  docA.clientID = 1
  docB.clientID = 2
  mkView(docA.get(PM)) // createAndFill -> blockGroup_A, written to docA
  mkView(docB.get(PM)) // createAndFill -> blockGroup_B, written to docB

  let threw = null
  try {
    setupTwoWaySync(docA, docB)
  } catch (e) {
    threw = /** @type {Error} */ (e)
  }
  // Document the current boundary: the independent-init merge is invalid.
  t.assert(
    threw !== null && /Invalid content for node doc/.test(threw.message),
    'independent init of a single-required-child top node merges to an invalid doc (known limitation)'
  )
}

/**
 * CORRECT USAGE: one peer initializes; the second binds to a Y.Doc that already
 * received the first peer's state, so it never independently createAndFills.
 * This converges cleanly - and is exactly how BlockNote collaboration is meant
 * to be used (one initialized document, shared).
 *
 * @param {t.TestCase} _tc
 */
export const testSharedInitConverges = _tc => {
  const docA = new Y.Doc({ gc: false, guid: 'A' })
  const docB = new Y.Doc({ gc: false, guid: 'B' })
  docA.clientID = 1
  docB.clientID = 2

  const viewA = mkView(docA.get(PM))
  // type real content into the existing (createAndFill'd) paragraph
  viewA.dispatch(viewA.state.tr.insertText('hello', 3))

  // share the initialized state to B BEFORE B binds
  setupTwoWaySync(docA, docB)
  const viewB = mkView(docB.get(PM))

  t.compare(
    viewB.state.doc.toJSON(),
    viewA.state.doc.toJSON(),
    'A and B converge to a single valid doc'
  )

  // a subsequent edit on B propagates back to A and still converges
  viewB.dispatch(viewB.state.tr.insertText('!', viewB.state.doc.content.size - 4))
  t.compare(
    viewA.state.doc.toJSON(),
    viewB.state.doc.toJSON(),
    'edits round-trip and converge'
  )
}
