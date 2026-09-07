/**
 * Helpers for exercising the real v1 binding (`y-prosemirror@1.3.7` on
 * `yjs@13`, installed under the npm alias `y-prosemirror-v1`) next to the v2
 * binding (`@y/prosemirror` on `@y/y`), used by tests/v1-compat.test.js.
 *
 * The two Yjs majors live in one process as distinct packages. Only binary
 * updates and JSON ever cross the boundary - never deltas, Y types, or
 * awareness instances - and both bindings resolve `prosemirror-*` to the
 * single root copy, which is why the alias must be a root-level
 * devDependency (a nested copy would break `instanceof` checks in v1).
 */

import * as Y13 from 'yjs'
import * as v1 from 'y-prosemirror-v1'
import * as Y from '@y/y'
import * as delta from 'lib0/delta'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { createPMView } from './cohort.js'

export { Y13, v1 }

/**
 * The root key both bindings use in these tests. v1's helpers default to it
 * (`prosemirrorToYDoc`, `yDocToProsemirror`); v2 takes the ytype explicitly.
 */
export const PM_KEY = 'prosemirror'

/**
 * Write a ProseMirror document with the v1 binding into a fresh yjs 13 doc.
 * The clientID is fixed so captured item ids reproduce across runs and so
 * v1's merge-neighbouring-`Y.XmlText` read path (#160, which only fires for
 * text created by the *local* client) stays dormant in the reader docs.
 *
 * @param {import('prosemirror-model').Node} pmDoc
 * @param {number} [clientID]
 * @return {Y13.Doc}
 */
export const v1DocFromPm = (pmDoc, clientID = 1) => {
  const ydoc = new Y13.Doc()
  ydoc.clientID = clientID
  v1.prosemirrorToYXmlFragment(pmDoc, ydoc.getXmlFragment(PM_KEY))
  return ydoc
}

/**
 * Transfer the full state of a yjs 13 doc into a fresh `@y/y` doc, the way a
 * v2 client loads a document that was written by v1.
 *
 * @param {Y13.Doc} ydoc13
 * @param {number} [clientID]
 * @return {Y.Doc}
 */
export const toY14 = (ydoc13, clientID = 2) => {
  const ydoc = new Y.Doc({ gc: false })
  ydoc.clientID = clientID
  Y.applyUpdate(ydoc, Y13.encodeStateAsUpdate(ydoc13))
  return ydoc
}

/**
 * Replay updates captured from a `@y/y` doc into a yjs 13 doc. This is the
 * only direction v14 -> v13 we use: incremental updates contain exactly the
 * structs v2 created.
 *
 * @param {Y13.Doc} ydoc13
 * @param {Array<Uint8Array>} updates
 */
export const replayTo13 = (ydoc13, updates) => {
  for (const u of updates) Y13.applyUpdate(ydoc13, u)
}

/**
 * Read a yjs 13 doc with v1's pure JSON path (`yDocToProsemirror`). Unlike
 * v1's binding path this never mutates the document: `createNodeFromYElement`
 * deletes nodes it fails to build.
 *
 * @param {import('prosemirror-model').Schema} schema
 * @param {Y13.Doc} ydoc13
 * @return {import('prosemirror-model').Node}
 */
export const v1ReadPm = (schema, ydoc13) => v1.yDocToProsemirror(schema, ydoc13)

/**
 * A v1 editor bound to a yjs 13 fragment, the way the v1 README sets it up.
 * Passing the `mapping` from `initProseMirrorDoc` skips v1's forced rerender.
 *
 * @param {Y13.XmlFragment} frag13
 * @param {import('prosemirror-model').Schema} schema
 * @return {{ view: EditorView, mapping: Map<any, any> }}
 */
export const v1BindView = (frag13, schema) => {
  const { doc, mapping } = v1.initProseMirrorDoc(frag13, schema)
  const view = new EditorView({ mount: document.createElement('div') }, {
    state: EditorState.create({ doc, schema, plugins: [v1.ySyncPlugin(frag13, { mapping })] })
  })
  return { view, mapping }
}

/**
 * A v2 editor bound to `ydoc.get(PM_KEY)`, plus every update the doc emits
 * from *before* the bind onwards. `updates.length` right after the call is
 * the bind-time-write probe: loading a document must not write to it.
 *
 * @param {Y.Doc} ydoc
 * @param {Parameters<typeof createPMView>[2]} [opts]
 * @return {{ view: EditorView, updates: Array<Uint8Array>, ytype: Y.Node }}
 */
export const bindV2 = (ydoc, opts = {}) => {
  /**
   * @type {Array<Uint8Array>}
   */
  const updates = []
  ydoc.on('update', (/** @type {Uint8Array} */ u) => { updates.push(u) })
  const ytype = ydoc.get(PM_KEY)
  const view = createPMView(ytype, null, opts)
  return { view, updates, ytype }
}

/**
 * Inserted child *node* deltas of a delta.
 *
 * @param {delta.DeltaAny} d
 * @return {Array<delta.DeltaAny>}
 */
export const deltaNodeChildren = (d) => {
  /**
   * @type {Array<delta.DeltaAny>}
   */
  const els = []
  for (const op of d.children) {
    if (delta.$insertOp.check(op)) {
      for (const el of op.insert) {
        if (delta.$deltaAny.check(el)) els.push(el)
      }
    }
  }
  return els
}

/**
 * Concatenated direct text content of a delta.
 *
 * @param {delta.DeltaAny} d
 * @return {string}
 */
export const deltaTextOf = (d) => {
  let str = ''
  for (const op of d.children) {
    if (delta.$textOp.check(op)) str += op.insert
  }
  return str
}

/**
 * Every format key used anywhere in a (deep) delta - the Y-side mark keys,
 * including the hashed `mark--xxxxxxxx` keys of overlapping marks.
 *
 * @param {delta.DeltaAny} d
 * @param {Set<string>} [out]
 * @return {Set<string>}
 */
export const collectFormatKeys = (d, out = new Set()) => {
  for (const op of d.children) {
    const format = /** @type {any} */ (op).format
    if (format != null) {
      for (const k of Object.keys(format)) out.add(k)
    }
    if (delta.$insertOp.check(op)) {
      for (const el of op.insert) {
        if (delta.$deltaAny.check(el)) collectFormatKeys(el, out)
      }
    }
  }
  return out
}
