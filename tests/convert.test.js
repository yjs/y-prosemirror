/**
 * `ynodeToPmnode` / `pmnodeToDelta` map through the same transformer pipeline
 * as the sync binding (`defaultTransformer`), without a binding.
 */

import * as YPM from '@y/prosemirror'
import * as Y from '@y/y'
import * as delta from 'lib0/delta'
import * as dt from 'lib0/delta/transformer'
import * as t from 'lib0/testing'
import { Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { nodes, marks, schema as complexSchema } from './complexSchema.js'
import { createPMView } from './cohort.js'

const PM_KEY = 'prosemirror'

const attrMarkNames = 'y-attributed-insert y-attributed-delete y-attributed-format y-attributed-attrs'

/**
 * complexSchema + the `y-attributed-attrs` mark (see attr-attribution.test.js),
 * so the parity test covers every attribution kind.
 */
const attrSchema = new Schema({
  nodes: {
    ...nodes,
    doc: { ...nodes.doc, marks: attrMarkNames },
    blockquote: { ...nodes.blockquote, marks: attrMarkNames },
    code_block: { ...nodes.code_block, marks: attrMarkNames }
  },
  marks: {
    ...marks,
    'y-attributed-attrs': {
      attrs: { changes: { default: null } },
      parseDOM: [{ tag: 'y-attr' }],
      toDOM () {
        return ['y-attr', 0]
      }
    }
  }
})

/**
 * @param {import('prosemirror-model').Node} node
 * @return {Set<string>}
 */
const attributionMarkNames = node => {
  /** @type {Set<string>} */
  const found = new Set()
  node.descendants(n => {
    n.marks.forEach(m => { if (m.type.name.startsWith('y-attributed-')) found.add(m.type.name) })
  })
  return found
}

/**
 * @param {t.TestCase} _tc
 */
export const testRoundTrip = _tc => {
  const s = complexSchema
  const pm = s.node('doc', null, [
    s.node('heading', { level: 2 }, [s.text('title')]),
    s.node('paragraph', null, [
      s.text('plain '),
      s.text('bold', [s.mark('strong')]),
      s.text(' both', [s.mark('strong'), s.mark('em')]),
      s.node('hard_break'),
      s.text('link', [s.mark('link', { href: 'https://example.com' })]),
      s.node('image', { src: 'img.png' })
    ]),
    s.node('paragraph', null, [
      s.text('commented', [s.mark('comment', { id: 'a' }), s.mark('comment', { id: 'b' })])
    ]),
    s.node('blockquote', null, [s.node('paragraph', null, [s.text('quoted')])]),
    s.node('horizontal_rule'),
    s.node('paragraph'),
    s.node('code_block', null, [s.text('code')])
  ])
  const ytype = new Y.Doc().get(PM_KEY)
  ytype.applyDelta(YPM.pmnodeToDelta(pm))
  const back = YPM.ynodeToPmnode(ytype, s)
  t.compare(back.toJSON(), pm.toJSON(), 'the document round-trips')
  t.assert(back.eq(pm))
}

/**
 * `ynodeToPmnode` with a renderer renders exactly what a bound view renders,
 * attribution marks of every kind included.
 *
 * @param {t.TestCase} _tc
 */
export const testYnodeToPmnodeMatchesBinding = _tc => {
  const baseDoc = new Y.Doc({ gc: false })
  const suggestionDoc = new Y.Doc({ isSuggestionDoc: true, gc: false })
  const renderer = Y.createDiffRenderer(baseDoc, suggestionDoc, { attributions: Y.createContentMap() })
  renderer.suggestionMode = true
  baseDoc.get(PM_KEY).applyDelta(delta.create()
    .insert([delta.create('heading', { level: 1 }, 'title')])
    .insert([delta.create('paragraph', {}, 'hello world')])
    .done())
  const ytype = suggestionDoc.get(PM_KEY)
  const view = createPMView(ytype, renderer, { schema: attrSchema })
  // 'title' is 1-6, 'hello world' is 9-20
  view.dispatch(view.state.tr.insertText('new ', 9))
  view.dispatch(view.state.tr.delete(19, 24))
  view.dispatch(view.state.tr.addMark(13, 18, attrSchema.marks.strong.create()))
  view.dispatch(view.state.tr.setNodeMarkup(0, null, { level: 2 }))
  t.compare(
    [...attributionMarkNames(view.state.doc)].sort(),
    ['y-attributed-attrs', 'y-attributed-delete', 'y-attributed-format', 'y-attributed-insert'],
    'the view renders every attribution kind'
  )
  const rendered = YPM.ynodeToPmnode(ytype, attrSchema, { renderer })
  t.compare(rendered.toJSON(), view.state.doc.toJSON())
  t.assert(rendered.eq(view.state.doc), 'ynodeToPmnode renders what the binding renders')
  const plain = YPM.ynodeToPmnode(ytype, attrSchema)
  t.assert(attributionMarkNames(plain).size === 0, 'without a renderer there is no attribution')
  view.destroy()
}

/**
 * A node without attrs and children keeps its name in both directions (the
 * pipeline returns nothing for it).
 *
 * @param {t.TestCase} _tc
 */
export const testChildlessNodesKeepTheirName = _tc => {
  const s = complexSchema
  t.compare(YPM.pmnodeToDelta(s.node('horizontal_rule')).name, 'horizontal_rule')
  t.compare(YPM.pmnodeToDelta(s.node('paragraph')).name, 'paragraph')
  const ytype = new Y.Doc().get(PM_KEY)
  ytype.applyDelta(delta.create().insert([delta.create('paragraph'), delta.create('horizontal_rule')]).done())
  const [paragraph, hr] = ytype.toArray()
  t.compare(YPM.ynodeToPmnode(/** @type {any} */ (paragraph), s).type.name, 'paragraph')
  t.compare(YPM.ynodeToPmnode(/** @type {any} */ (hr), s).type.name, 'horizontal_rule')
}

/**
 * Y stores a heading's level as `ylevel`, the view sees `level`.
 *
 * @param {import('lib0/schema').Schema<any>} $d
 */
const renameLevel = $d => dt.children($d, (child, $child) => child.name === 'heading' ? dt.renameAttrs($child, { ylevel: 'level' }) : null)

/**
 * A custom stage configured on the plugin applies to the conversions when
 * the same stages are passed to `defaultTransformer`.
 *
 * @param {t.TestCase} _tc
 */
export const testCustomTransformerMatchesBinding = _tc => {
  const ytype = new Y.Doc().get(PM_KEY)
  ytype.applyDelta(delta.create()
    .insert([delta.create('heading', { ylevel: 3 }, 'title')])
    .insert([delta.create('paragraph', {}, 'text')])
    .done())
  const view = new EditorView(
    { mount: document.createElement('div') },
    { state: EditorState.create({ schema: complexSchema, plugins: [YPM.syncPlugin({ transformers: [renameLevel] })] }) }
  )
  YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
  t.compare(view.state.doc.firstChild?.attrs.level, 3, 'the binding maps ylevel to level')
  const transformer = YPM.defaultTransformer({ transformers: [renameLevel] })
  const rendered = YPM.ynodeToPmnode(ytype, complexSchema, { transformer })
  t.assert(rendered.eq(view.state.doc), 'ynodeToPmnode applies the custom stage')
  t.assert(!YPM.ynodeToPmnode(ytype, complexSchema).eq(view.state.doc), 'the default transformer does not')
  // edit through the view, then compare what the binding wrote with what
  // pmnodeToDelta produces for the same document
  view.dispatch(view.state.tr.setNodeMarkup(0, null, { level: 4 }))
  view.dispatch(view.state.tr.insertText('new ', 9))
  const fresh = new Y.Doc().get(PM_KEY)
  fresh.applyDelta(YPM.pmnodeToDelta(view.state.doc, { transformer }))
  t.compare(fresh.toDeltaDeep().toJSON(), ytype.toDeltaDeep().toJSON(), 'pmnodeToDelta writes what the binding writes')
  const heading = /** @type {any} */ (ytype.toDeltaDeep().toJSON()).children[0].insert[0]
  t.compare(heading.attrs, { ylevel: { type: 'insert', value: 4 } }, 'Y stores ylevel')
  view.destroy()
}
