/**
 * A BlockNote-shaped ProseMirror schema and helpers, shared by the
 * suggestion tests (issue #247) and the initial-content gate tests.
 *
 * BlockNote nests `doc > blockGroup > blockContainer > blockContent >
 * paragraph`, and every `blockContainer` carries an `id` attr that its
 * `UniqueID` extension stamps with a generated uuid - including on the
 * default document a fresh editor starts with. {@link uniqueIdPlugin} mimics
 * that stamping so tests see the same documents the sync plugin sees in a
 * real BlockNote editor.
 */

import { Schema } from 'prosemirror-model'
import { Plugin, PluginKey } from 'prosemirror-state'

export const blocknoteAttributionMarkNames = 'y-attributed-insert y-attributed-delete y-attributed-format'

export const blocknoteSchema = new Schema({
  nodes: {
    doc: { content: 'blockGroup', marks: blocknoteAttributionMarkNames },
    blockGroup: {
      content: 'blockContainer+',
      group: 'block',
      marks: blocknoteAttributionMarkNames,
      toDOM () { return ['div', { class: 'blockGroup' }, 0] },
      parseDOM: [{ tag: 'div.blockGroup' }]
    },
    blockContainer: {
      content: 'blockContent blockGroup?',
      attrs: { id: { default: null } },
      group: 'blockContainer',
      marks: blocknoteAttributionMarkNames,
      defining: true,
      toDOM (n) { return ['div', { class: 'blockContainer', 'data-id': n.attrs.id }, 0] },
      parseDOM: [{ tag: 'div.blockContainer' }]
    },
    blockContent: {
      content: 'paragraph',
      marks: blocknoteAttributionMarkNames,
      toDOM () { return ['div', { class: 'blockContent' }, 0] },
      parseDOM: [{ tag: 'div.blockContent' }]
    },
    paragraph: {
      content: 'inline*',
      marks: blocknoteAttributionMarkNames,
      toDOM () { return ['p', 0] },
      parseDOM: [{ tag: 'p' }]
    },
    text: { group: 'inline' }
  },
  marks: {
    'y-attributed-insert': {
      attrs: { userIds: { default: null }, timestamp: { default: null } },
      parseDOM: [{ tag: 'y-ins' }],
      toDOM () { return ['y-ins', 0] }
    },
    'y-attributed-delete': {
      attrs: { userIds: { default: null }, timestamp: { default: null } },
      parseDOM: [{ tag: 'y-del' }],
      toDOM () { return ['y-del', 0] }
    },
    'y-attributed-format': {
      attrs: { userIds: { default: null }, userIdsByAttr: { default: null }, timestamp: { default: null } },
      parseDOM: [{ tag: 'y-fmt' }],
      toDOM () { return ['y-fmt', 0] }
    }
  }
})

/**
 * A block: `blockContainer(id) > blockContent > paragraph(text)`.
 *
 * @param {string} id
 * @param {string} text
 */
export const bnBlock = (id, text) =>
  blocknoteSchema.nodes.blockContainer.create({ id },
    blocknoteSchema.nodes.blockContent.create(null,
      blocknoteSchema.nodes.paragraph.create(null,
        text ? blocknoteSchema.text(text) : null)))

/**
 * The document a fresh BlockNote editor starts with: one block group holding
 * one block whose id BlockNote generates at random. The paragraph's text
 * starts at position 4 (`doc > blockGroup > blockContainer > blockContent >
 * paragraph`).
 *
 * @param {string} id
 * @param {string} [text]
 */
export const bnDoc = (id, text = '') =>
  blocknoteSchema.nodes.doc.create(null,
    blocknoteSchema.nodes.blockGroup.create(null, bnBlock(id, text)))

/**
 * The id of the first block, or `null`.
 *
 * @param {import('prosemirror-model').Node} doc
 * @return {string | null}
 */
export const bnFirstBlockId = doc => doc.firstChild?.firstChild?.attrs.id ?? null

/**
 * BlockNote's notion of initial content, defined structurally: one block
 * group holding one block whose paragraph is empty - whatever the generated
 * `id` on the block is. This is the predicate a BlockNote integration passes
 * as `syncPlugin({ isInitialContent })`.
 *
 * @param {import('prosemirror-model').Node} doc
 * @return {boolean}
 */
export const isBlocknoteInitialContent = doc => {
  const group = doc.childCount === 1 ? doc.firstChild : null
  const block = group != null && group.type.name === 'blockGroup' && group.childCount === 1 ? group.firstChild : null
  const content = block != null && block.type.name === 'blockContainer' && block.childCount === 1 ? block.firstChild : null
  const paragraph = content != null && content.type.name === 'blockContent' && content.childCount === 1 ? content.firstChild : null
  return paragraph != null && paragraph.type.name === 'paragraph' && paragraph.childCount === 0
}

/**
 * Mimics BlockNote's `UniqueID` extension: after any transaction that changed
 * the document, every `blockContainer` whose `id` is still `null` is stamped
 * with a generated one, in an appended transaction. Ids come from the caller
 * so tests stay deterministic.
 *
 * @param {() => string} generateId
 * @return {Plugin}
 */
export const uniqueIdPlugin = generateId => new Plugin({
  key: new PluginKey('uniqueId'),
  appendTransaction: (transactions, oldState, newState) => {
    if (!transactions.some(tr => tr.docChanged) || oldState.doc.eq(newState.doc)) return null
    const tr = newState.tr
    newState.doc.descendants((node, pos) => {
      if (node.type.name === 'blockContainer' && node.attrs.id == null) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: generateId() })
      }
      return true
    })
    return tr.steps.length > 0 ? tr : null
  }
})
