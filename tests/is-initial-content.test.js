import * as YPM from '@y/prosemirror'
import * as Y from '@y/y'
import * as t from 'lib0/testing'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { schema } from './complexSchema.js'

/**
 * Treat a document holding exactly one empty paragraph as the integrator's
 * initial (empty) state - even though it is NOT the schema's
 * `createAndFill()` default (an empty doc for this schema, whose `doc`
 * allows zero blocks). This is the "compare in your own way" hook:
 * `singleEmptyParagraphIsInitial` gates `doc(paragraph(""))` but lets
 * `doc(paragraph("hi"))` sync immediately.
 *
 * @type {IsInitialContent}
 */
const singleEmptyParagraphIsInitial = (doc) =>
  doc.childCount === 1 &&
  doc.firstChild?.type.name === 'paragraph' &&
  doc.firstChild?.textContent === ''

/**
 * `doc(paragraph(""))` - non-default for this schema, but "initial" per the
 * paragraph predicate above.
 *
 * @return {import('prosemirror-model').Node}
 */
const emptyParagraphDoc = () => schema.nodes.doc.create(null, schema.nodes.paragraph.create())

/**
 * Treat a document holding exactly one `custom` block as the starter doc,
 * whatever its `checked` value is.
 *
 * @type {IsInitialContent}
 */
const singleCustomIsInitial = (doc) =>
  doc.childCount === 1 &&
  doc.firstChild?.type.name === 'custom'

/**
 * `doc(custom(checked))` - not the schema default, but a starter doc for
 * any `checked` value.
 *
 * @param {boolean} checked
 * @return {import('prosemirror-model').Node}
 */
const customDoc = (checked) => schema.nodes.doc.create(null, schema.nodes.custom.create({ checked }))

/**
 * `doc(paragraph("hi"))` - neither the schema default nor "initial" per the
 * predicate above.
 *
 * @return {import('prosemirror-model').Node}
 */
const textDoc = () => schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, schema.text('hi')))

/**
 * Build a bound view over an explicit initial document (so ProseMirror does
 * not auto-`createAndFill()`).
 *
 * @param {Y.Node} ytype
 * @param {import('prosemirror-model').Node} doc
 * @param {IsInitialContent?} [isInitialContent]
 * @return {EditorView}
 */
const mkView = (ytype, doc, isInitialContent) => {
  const view = new EditorView({ mount: document.createElement('div') }, {
    state: EditorState.create({
      schema,
      doc,
      plugins: [YPM.syncPlugin({ ...(isInitialContent != null ? { isInitialContent } : {}) })]
    })
  })
  YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
  return view
}

/**
 * @param {EditorView} view
 * @return {any}
 */
const getPmRdt = view => /** @type {any} */ (YPM.ySyncPluginKey.getState(view.state))?.binding?.b

/**
 * The custom predicate arms the initial-content gate for a document the
 * default check would let through: nothing is written to the empty ytype,
 * and the first real edit clears the gate and writes to the ytype.
 *
 * @param {t.TestCase} _tc
 */
export const testIsInitialContentGatesCustomInitial = (_tc) => {
  const ydoc = new Y.Doc({ gc: false })
  const ytype = ydoc.get('prosemirror')
  const view = mkView(ytype, emptyParagraphDoc(), singleEmptyParagraphIsInitial)
  try {
    const rdt = getPmRdt(view)
    t.assert(rdt._defaultFingerprint != null, 'gate is armed for the custom initial doc')
    t.assert(ytype.length === 0, 'nothing is written to the empty ytype')
    t.assert(
      YPM.ySyncPluginKey.getState(view.state)?.isInitialContent === singleEmptyParagraphIsInitial,
      'isInitialContent is stored in the plugin state'
    )
    view.dispatch(view.state.tr.insertText('hi', 1))
    t.assert(rdt._defaultFingerprint == null, 'gate cleared by the first real edit')
    t.assert(ytype.length === 1, 'the edit was written to the ytype')
    t.compare(
      /** @type {any} */ (YPM.docToDelta(view.state.doc).done(false)),
      /** @type {any} */ (ytype.toDeltaDeep()),
      'view and ytype converge after the gate-clearing edit'
    )
  } finally {
    view.destroy()
  }
}

/**
 * The same predicate lets a non-initial document through - the gate is not
 * armed, so the ytype (always the source of truth at bind time) immediately
 * replaces the editor content instead of gating it.
 *
 * @param {t.TestCase} _tc
 */
export const testIsInitialContentYtypeWinsWhenNotInitial = (_tc) => {
  const ydoc = new Y.Doc({ gc: false })
  const ytype = ydoc.get('prosemirror')
  const view = mkView(ytype, textDoc(), singleEmptyParagraphIsInitial)
  try {
    t.assert(getPmRdt(view)._defaultFingerprint == null, 'gate is not armed for a non-initial doc')
    t.assert(view.state.doc.childCount === 0, 'the empty ytype wins immediately: editor content is replaced')
    t.assert(ytype.length === 0, 'nothing is written to the ytype')
  } finally {
    view.destroy()
  }
}

/**
 * If the starter doc is re-created with a different attribute (new
 * fingerprint, still initial content), nothing may be written to Y - and the
 * next real edit must still write exactly itself.
 *
 * @param {t.TestCase} _tc
 */
export const testIsInitialContentRecreatedStarterStaysOutOfY = (_tc) => {
  const ydoc = new Y.Doc({ gc: false })
  const ytype = ydoc.get('prosemirror')
  const view = mkView(ytype, customDoc(false), singleCustomIsInitial)
  try {
    const rdt = getPmRdt(view)
    t.assert(rdt._defaultFingerprint != null, 'gate is armed for the initial doc')
    t.assert(ytype.length === 0, 'nothing is written to the empty ytype')
    const armedFingerprint = rdt._defaultFingerprint
    // Same starter doc, only the `checked` attr flipped - the fingerprint
    // changes but the doc is still initial content.
    view.dispatch(view.state.tr.setNodeAttribute(0, 'checked', true))
    t.assert(singleCustomIsInitial(view.state.doc), 'doc is still the starter doc')
    t.assert(rdt._defaultFingerprint != null, 'gate still holds for the starter doc')
    t.assert(rdt._defaultFingerprint !== armedFingerprint, 'gate memorized the new fingerprint')
    t.assert(ytype.length === 0, 'starter doc is not written to the ytype')
    // The first real edit still clears the gate and writes exactly itself.
    view.dispatch(view.state.tr.insert(0, schema.nodes.paragraph.create(null, schema.text('hi'))))
    t.assert(rdt._defaultFingerprint == null, 'first real edit clears the gate')
    t.compare(
      /** @type {any} */ (YPM.docToDelta(view.state.doc).done(false)),
      /** @type {any} */ (ytype.toDeltaDeep()),
      'view and ytype hold just the real content'
    )
  } finally {
    view.destroy()
  }
}

/**
 * Without the option the default check is unchanged: a non-default document
 * is NOT gated - the empty ytype replaces the editor content.
 *
 * @param {t.TestCase} _tc
 */
export const testIsInitialContentDefaultsToSchemaDefault = (_tc) => {
  const ydoc = new Y.Doc({ gc: false })
  const ytype = ydoc.get('prosemirror')
  const view = mkView(ytype, emptyParagraphDoc())
  try {
    t.assert(getPmRdt(view)._defaultFingerprint == null, 'default check does not gate a non-default doc')
    t.assert(view.state.doc.childCount === 0, 'default behavior lets the empty ytype replace the editor content')
    t.assert(ytype.length === 0, 'nothing is written to the ytype')
  } finally {
    view.destroy()
  }
}

/**
 * The predicate is only consulted while the ytype has no children: a ytype
 * that already holds content is the source of truth at bind time, whatever
 * the predicate says.
 *
 * @param {t.TestCase} _tc
 */
export const testIsInitialContentIgnoredWhenYtypeHasContent = (_tc) => {
  const ydoc = new Y.Doc({ gc: false })
  const ytype = ydoc.get('prosemirror')
  ytype.applyDelta(YPM.pmnodeToDelta(textDoc()))
  const view = mkView(ytype, emptyParagraphDoc(), () => true)
  try {
    t.assert(getPmRdt(view)._defaultFingerprint == null, 'gate is not armed against a non-empty ytype')
    t.compare(view.state.doc.textContent, 'hi', 'the ytype content replaces the editor content')
    t.compare(
      /** @type {any} */ (YPM.docToDelta(view.state.doc).done(false)),
      /** @type {any} */ (ytype.toDeltaDeep()),
      'view and ytype agree'
    )
  } finally {
    view.destroy()
  }
}

/**
 * Remote content arriving while the gate holds opens it: the starter doc is
 * replaced by the remote content and never reaches Y.
 *
 * @param {t.TestCase} _tc
 */
export const testIsInitialContentRemoteContentOpensTheGate = (_tc) => {
  const ydoc = new Y.Doc({ gc: false })
  const ytype = ydoc.get('prosemirror')
  const view = mkView(ytype, emptyParagraphDoc(), singleEmptyParagraphIsInitial)
  try {
    t.assert(getPmRdt(view)._defaultFingerprint != null, 'gate is armed')
    const peer = new Y.Doc({ gc: false })
    peer.get('prosemirror').applyDelta(YPM.pmnodeToDelta(textDoc()))
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(peer))
    t.assert(getPmRdt(view)._defaultFingerprint == null, 'remote content opens the gate')
    t.compare(view.state.doc.textContent, 'hi', 'the remote content is rendered')
    t.compare(
      /** @type {any} */ (YPM.docToDelta(view.state.doc).done(false)),
      /** @type {any} */ (ytype.toDeltaDeep()),
      'the starter doc was not merged into Y'
    )
  } finally {
    view.destroy()
  }
}
