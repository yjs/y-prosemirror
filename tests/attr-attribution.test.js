import * as YPM from '@y/prosemirror'
import * as Y from '@y/y'
import * as delta from 'lib0/delta'
import * as t from 'lib0/testing'
import { DOMSerializer, Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { nodes, marks, schema as complexSchema } from './complexSchema.js'
import { setupTwoWaySync } from './cohort.js'
import { schema as demoSchema } from '../demo/schema.js'
import { schema as yhubDemoSchema } from '../yhub-demo/schema.js'

/**
 * Tests for the `y-attributed-attrs` mark: a suggestion that changes a node
 * ATTRIBUTE (e.g. heading level) must render as an attributed change. The
 * lift is lib0's `attributionToFormat` transformer (`conf.attrs`), gated on
 * the schema declaring the mark - see sync-utils.js `defaultMapAttrAttribution`
 * and the gate in sync-plugin.js.
 */

const attrMarkNames = 'y-attributed-insert y-attributed-delete y-attributed-format y-attributed-attrs'

// complexSchema + the y-attributed-attrs mark (declared => lift enabled).
const schema = new Schema({
  nodes: {
    ...nodes,
    doc: { ...nodes.doc, marks: attrMarkNames },
    blockquote: { ...nodes.blockquote, marks: attrMarkNames },
    // complexSchema's `code_block` whitelists only the three content marks it
    // declares; this schema adds a fourth, so widen it too or the binding's
    // bind-time audit rightly reports it
    code_block: { ...nodes.code_block, marks: attrMarkNames }
  },
  marks: {
    ...marks,
    // DEFAULT excludes on purpose (unlike the three siblings' `excludes: ''`):
    // the mark's attrs change between renders, and addToSet must REPLACE the
    // previous instance - stacking instances would collide on the reserved
    // (unhashed) format key. See the note on the sibling marks in
    // complexSchema.js.
    'y-attributed-attrs': {
      attrs: { changes: { default: null } },
      parseDOM: [{ tag: 'y-attr' }],
      toDOM () {
        return ['y-attr', 0]
      }
    }
  }
})

/** The attrs mark as it appears in PM doc JSON for an anonymous level change */
const levelAttrsMark = {
  type: 'y-attributed-attrs',
  attrs: { changes: { level: { userIds: [], timestamp: null } } }
}

/**
 * @param {import('prosemirror-model').Node} doc
 * @param {object} expected
 * @param {string} message
 */
const assertDocJSON = (doc, expected, message) => {
  t.compare(JSON.parse(JSON.stringify(doc.toJSON())), expected, message)
}

/**
 * All marks of the given type name anywhere in the doc.
 *
 * @param {import('prosemirror-model').Node} doc
 * @param {string} markName
 */
const collectMarks = (doc, markName) => {
  /** @type {Array<import('prosemirror-model').Mark>} */
  const found = []
  doc.descendants(node => {
    node.marks.forEach(m => {
      if (m.type.name === markName) found.push(m)
    })
  })
  return found
}

/**
 * The standard 3-doc suggestion setup (mirrors attributed-nodes.test.js).
 *
 * @param {import('prosemirror-model').Schema} [s]
 * @param {import('lib0/delta').Delta} [seedDelta]
 */
const setup = (s = schema, seedDelta = delta.create().insert([delta.create('heading', { level: 1 }, 'title')]).done()) => {
  const doc = new Y.Doc({ gc: false, guid: 'base' })
  const suggestionDoc = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'suggestions' })
  const suggestionModeDoc = new Y.Doc({ isSuggestionDoc: true, gc: false, guid: 'suggestions-edit' })

  const attrs = Y.createContentMap()
  const suggestionRenderer = Y.createDiffRenderer(doc, suggestionDoc, { attributions: attrs })
  suggestionRenderer.suggestionMode = false
  const suggestionModeRenderer = Y.createDiffRenderer(doc, suggestionModeDoc, { attributions: attrs })
  suggestionModeRenderer.suggestionMode = true

  setupTwoWaySync(suggestionDoc, suggestionModeDoc)

  /**
   * @param {Y.Node} ytype
   * @param {Y.AbstractRenderer?} [renderer]
   */
  const mkView = (ytype, renderer = null) => {
    const view = new EditorView(
      { mount: document.createElement('div') },
      { state: EditorState.create({ schema: s, plugins: [YPM.syncPlugin({})] }) }
    )
    YPM.configureYProsemirror({ ytype, renderer })(view.state, view.dispatch)
    return view
  }

  const base = mkView(doc.get('prosemirror'))
  const viewer = mkView(suggestionDoc.get('prosemirror'), suggestionRenderer)
  const editor = mkView(suggestionModeDoc.get('prosemirror'), suggestionModeRenderer)

  doc.get('prosemirror').applyDelta(seedDelta)

  return { doc, suggestionDoc, suggestionModeDoc, suggestionModeRenderer, base, viewer, editor, mkView }
}

/**
 * A suggested heading-level change renders the new value plus the
 * `y-attributed-attrs` mark on the suggestion views; the base doc keeps the
 * old value and no mark leaks into the base Y document.
 *
 * @param {t.TestCase} _tc
 */
export const testSuggestHeadingLevelChange = _tc => {
  const { doc, base, viewer, editor } = setup()

  editor.dispatch(editor.state.tr.setNodeAttribute(0, 'level', 2))

  assertDocJSON(base.state.doc, {
    type: 'doc',
    content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'title' }] }]
  }, 'base doc unchanged')
  const expected = {
    type: 'doc',
    content: [{
      type: 'heading',
      attrs: { level: 2 },
      marks: [levelAttrsMark],
      content: [{ type: 'text', text: 'title' }]
    }]
  }
  assertDocJSON(editor.state.doc, expected, 'editor renders level 2 + attrs mark')
  assertDocJSON(viewer.state.doc, expected, 'viewer renders level 2 + attrs mark')
  t.assert(!JSON.stringify(doc.get('prosemirror').toDelta({ deep: true }).toJSON()).includes('"level":2'), 'base Y doc has no level 2')
}

/**
 * Accepting the suggestion merges the attr change into the base doc and the
 * mark disappears everywhere.
 *
 * @param {t.TestCase} _tc
 */
export const testAcceptClearsAttrMark = _tc => {
  const { base, viewer, editor } = setup()
  editor.dispatch(editor.state.tr.setNodeAttribute(0, 'level', 2))

  YPM.acceptAllChanges()(viewer.state, viewer.dispatch)

  const expected = {
    type: 'doc',
    content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'title' }] }]
  }
  assertDocJSON(base.state.doc, expected, 'base doc has level 2 after accept')
  assertDocJSON(viewer.state.doc, expected, 'viewer clean after accept')
  assertDocJSON(editor.state.doc, expected, 'editor clean after accept')
}

/**
 * Rejecting the suggestion reverts the attr change and the mark disappears.
 *
 * @param {t.TestCase} _tc
 */
export const testRejectRevertsAttrChange = _tc => {
  const { base, viewer, editor } = setup()
  editor.dispatch(editor.state.tr.setNodeAttribute(0, 'level', 2))

  YPM.rejectAllChanges()(viewer.state, viewer.dispatch)

  const expected = {
    type: 'doc',
    content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'title' }] }]
  }
  assertDocJSON(base.state.doc, expected, 'base doc back to level 1')
  assertDocJSON(viewer.state.doc, expected, 'viewer reverted')
  assertDocJSON(editor.state.doc, expected, 'editor reverted')
}

/**
 * The regression class that once motivated dropping attr attribution: the
 * rendered delta must equal the PM-derived delta or the reconcile diff never
 * reaches an empty fixpoint (historically: infinite loop / stack overflow -
 * which would crash *this test* synchronously). Also pins hydration ≡ steady
 * state: a freshly bound view must render exactly what the live view shows.
 *
 * @param {t.TestCase} _tc
 */
export const testAttrAttributionRenderFixpoint = _tc => {
  const { suggestionModeDoc, suggestionModeRenderer, editor, mkView } = setup()
  editor.dispatch(editor.state.tr.setNodeAttribute(0, 'level', 2))

  // unrelated edits - each triggers a full reconcile against the render
  editor.dispatch(editor.state.tr.insertText('x', 6))
  editor.dispatch(editor.state.tr.insertText('y', 7))

  const fresh = mkView(suggestionModeDoc.get('prosemirror'), suggestionModeRenderer)
  t.compare(
    JSON.parse(JSON.stringify(fresh.state.doc.toJSON())),
    JSON.parse(JSON.stringify(editor.state.doc.toJSON())),
    'fresh hydration matches steady state'
  )
}

/**
 * Pins the lift semantics for wholly suggestion-inserted nodes: lib0's
 * transformer lifts attr attribution on inserted node elements too, so an
 * inserted heading carries BOTH `y-attributed-insert` and the attrs mark for
 * its `level` attr.
 *
 * @param {t.TestCase} _tc
 */
export const testFreshInsertAttrsMarkSemantics = _tc => {
  const { editor, viewer } = setup()

  editor.dispatch(editor.state.tr.insert(
    editor.state.doc.content.size,
    schema.nodes.heading.create({ level: 3 }, schema.text('new'))
  ))

  const inserted = editor.state.doc.child(1)
  t.assert(inserted.marks.some(m => m.type.name === 'y-attributed-insert'), 'inserted node carries insert mark')
  const attrsMarks = collectMarks(editor.state.doc, 'y-attributed-attrs')
  t.compare(
    JSON.parse(JSON.stringify(attrsMarks.map(m => m.toJSON()))),
    [{ type: 'y-attributed-attrs', attrs: { changes: { level: { userIds: [], timestamp: null } } } }],
    'inserted heading also carries the attrs mark for its level attr (lib0 lift semantics)'
  )
  t.compare(viewer.state.doc.toJSON(), editor.state.doc.toJSON(), 'viewer agrees')
}

/**
 * Two attributed attrs on one node must both survive a later change that
 * touches only one of them (pins the wholesale-map-merge risk).
 *
 * @param {t.TestCase} _tc
 */
export const testTwoAttributedAttrs = _tc => {
  // the inner builder is cast: nesting two typed `delta.create` calls trips
  // TS2589 (type instantiation depth) once nothing else in the program has
  // instantiated the builder types first
  const imageDelta = /** @type {any} */ (delta.create('image', { src: 'a.png', alt: 'old', title: 'old' }))
  const { editor, viewer } = setup(schema, delta.create().insert([delta.create('paragraph', {}, [imageDelta])]).done())

  // image sits at pos 1 (inside the paragraph)
  editor.dispatch(editor.state.tr.setNodeAttribute(1, 'alt', 'new-alt'))
  editor.dispatch(editor.state.tr.setNodeAttribute(1, 'title', 'new-title'))
  // touch one of the two again
  editor.dispatch(editor.state.tr.setNodeAttribute(1, 'alt', 'newer-alt'))

  const image = editor.state.doc.nodeAt(1)
  t.assert(image != null && image.attrs.alt === 'newer-alt' && image.attrs.title === 'new-title', 'values applied')
  const mark = image?.marks.find(m => m.type.name === 'y-attributed-attrs')
  t.assert(mark != null, 'attrs mark present')
  const changes = mark?.attrs.changes ?? {}
  t.assert(changes.alt != null, 'alt entry present')
  t.assert(changes.title != null, 'title entry survives a change touching only alt')
  t.compare(viewer.state.doc.toJSON(), editor.state.doc.toJSON(), 'viewer agrees')
}

/**
 * The attrs mark is part of the read-only attribution projection: removing it
 * from the view is corrected back (prefix-based correction layer).
 *
 * @param {t.TestCase} _tc
 */
export const testAttrMarkIsReadOnly = _tc => {
  const { editor } = setup()
  editor.dispatch(editor.state.tr.setNodeAttribute(0, 'level', 2))

  editor.dispatch(editor.state.tr.removeNodeMark(0, schema.marks['y-attributed-attrs']))

  const markNames = editor.state.doc.child(0).marks.map(m => m.type.name)
  t.assert(markNames.includes('y-attributed-attrs'), 'attrs mark restored by the correction layer')
}

/**
 * Back-compat: a schema WITHOUT the mark behaves exactly as before - the attr
 * value applies, no mark is materialized, and the reconcile stays stable.
 *
 * @param {t.TestCase} _tc
 */
export const testAttrChangeWithoutAttrMark = _tc => {
  const { base, viewer, editor } = setup(complexSchema)

  editor.dispatch(editor.state.tr.setNodeAttribute(0, 'level', 2))
  // unrelated edit: reconcile must stay stable without the mark
  editor.dispatch(editor.state.tr.insertText('x', 6))

  assertDocJSON(base.state.doc, {
    type: 'doc',
    content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'title' }] }]
  }, 'base unchanged')
  const expected = {
    type: 'doc',
    content: [{
      type: 'heading',
      attrs: { level: 2 },
      content: [
        { type: 'text', text: 'title' },
        { type: 'text', marks: [{ type: 'y-attributed-insert', attrs: { userIds: [], timestamp: null } }], text: 'x' }
      ]
    }]
  }
  assertDocJSON(editor.state.doc, expected, 'editor: value applies, no attrs mark (only the text insert mark)')
  assertDocJSON(viewer.state.doc, expected, 'viewer: value applies, no attrs mark (only the text insert mark)')
}

/**
 * The in-repo demos must RENDER a suggested attribute change: the demo
 * schemas declare `y-attributed-attrs` (with the default `excludes`, see the
 * note in demo/schema.js) and serialize it to a `<y-attr>` wrapper that
 * their stylesheets outline. demo/schema.js is bound into the standard
 * suggestion setup: a suggested heading-level change must carry the mark and
 * serialize to `<y-attr>` on both suggestion views. yhub-demo/schema.js
 * resolves its own prosemirror-model copy (yhub-demo/node_modules), so it
 * cannot be bound from this process; its mark spec is checked structurally
 * instead. Either way the demo schemas cannot drift away from what the sync
 * plugin's attr-attribution gate expects.
 *
 * @param {t.TestCase} _tc
 */
export const testDemoSchemasRenderAttrAttribution = _tc => {
  const { base, viewer, editor } = setup(demoSchema)
  editor.dispatch(editor.state.tr.setNodeAttribute(0, 'level', 2))
  /** @type {Array<[string, EditorView]>} */
  const views = [['editor', editor], ['viewer', viewer]]
  for (const [name, view] of views) {
    const heading = view.state.doc.child(0)
    t.assert(heading.attrs.level === 2, `demo ${name}: renders level 2`)
    const mark = heading.marks.find(m => m.type.name === 'y-attributed-attrs')
    t.assert(mark != null && mark.attrs.changes?.level != null, `demo ${name}: carries the attrs mark for level`)
    const dom = document.createElement('div')
    dom.appendChild(DOMSerializer.fromSchema(demoSchema).serializeFragment(view.state.doc.content))
    const wrapper = dom.querySelector('y-attr')
    t.assert(wrapper != null && wrapper.querySelector('h2') != null, `demo ${name}: serializes to <y-attr> around the h2`)
  }
  t.assert(base.state.doc.child(0).attrs.level === 1, 'demo: base keeps level 1')
  base.destroy()
  viewer.destroy()
  editor.destroy()

  // yhub-demo: structural check of the mark spec (own prosemirror-model copy)
  const yhubMark = /** @type {any} */ (yhubDemoSchema).marks['y-attributed-attrs']
  t.assert(yhubMark != null, 'yhub-demo declares y-attributed-attrs')
  t.assert(yhubMark.spec.excludes === undefined, 'yhub-demo keeps the default excludes (a re-render must replace the mark)')
  t.assert(yhubMark.spec.attrs?.changes != null, 'yhub-demo declares the changes attr')
  const rendered = yhubMark.spec.toDOM(yhubMark.create({ changes: { level: { userIds: ['u1'], timestamp: null } } }), false)
  t.assert(rendered[0] === 'y-attr', 'yhub-demo serializes the mark to <y-attr>')
  t.assert(/** @type {any} */ (yhubDemoSchema).nodes.heading.markSet == null || /** @type {any} */ (yhubDemoSchema).nodes.doc.spec.marks.includes('y-attributed-attrs'), 'yhub-demo allows the mark on block content')
}
