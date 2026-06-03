import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { syncPlugin, yCursorPlugin, ySyncPluginKey, defaultMapAttributionToMark } from '@y/prosemirror'
import { userColorForId, initialsForName } from './user-colors.js'

// ── y-prosemirror plugins, wrapped as Tiptap extensions ──────────────────────
//
// We deliberately do NOT use `@tiptap/extension-collaboration`: it wraps the
// *old* y-prosemirror ySyncPlugin and is incompatible with the new attribution
// binding. Instead we add `syncPlugin` / `yCursorPlugin` directly via
// `addProseMirrorPlugins`, the same shape the BlockNote demo uses through
// `createExtension`.

/**
 * @param {object} [opts]
 * @param {Function} [opts.mapAttributionToMark]
 */
export const createYSyncExtension = (opts = {}) => Extension.create({
  name: 'ySync',
  addProseMirrorPlugins () {
    return [syncPlugin({ mapAttributionToMark: opts.mapAttributionToMark ?? defaultMapAttributionToMark })]
  }
})

/**
 * @param {import('@y/protocols/awareness').Awareness} awareness
 */
export const createYCursorExtension = (awareness) => Extension.create({
  name: 'yCursor',
  addProseMirrorPlugins () {
    return [yCursorPlugin(awareness)]
  }
})

// ── Block-level attribution decorations (gutter avatars + bars) ───────────────
// Ported verbatim from yhub-demo/demo.js. Walks the doc and tags each
// block-level node with the users who edited it, so CSS can render an avatar in
// the left gutter and (for wholly-inserted/deleted blocks) a colored left bar.

const INSERT_MARK = 'y-attributed-insert'
const DELETE_MARK = 'y-attributed-delete'
const FORMAT_MARK = 'y-attributed-format'

/**
 * @param {import('@tiptap/pm/model').Mark} mark
 * @returns {string | null}
 */
const userIdFromMark = (mark) => {
  const uids = mark.attrs.userIds
  if (Array.isArray(uids) && uids.length > 0) return String(uids[0])
  if (typeof uids === 'string' || typeof uids === 'number') return String(uids)
  return null
}

/**
 * format marks track users per-attribute: { strong: ['u1'], em: ['u2'] }.
 * Pull the first id we find, in stable iteration order.
 * @param {import('@tiptap/pm/model').Mark} mark
 * @returns {string | null}
 */
const userIdFromFormatMark = (mark) => {
  const byAttr = mark.attrs.userIdsByAttr
  if (!byAttr || typeof byAttr !== 'object') return null
  for (const key of Object.keys(byAttr)) {
    const uids = byAttr[key]
    if (Array.isArray(uids) && uids.length > 0) return String(uids[0])
  }
  return null
}

/**
 * Walks one block-level node and summarises the attribution found inside.
 * @param {import('@tiptap/pm/model').Node} blockNode
 */
const summariseBlockAttribution = (blockNode) => {
  /** @type {string[]} */
  const users = []
  const seen = new Set()
  let textChars = 0
  let insertedChars = 0
  let deletedChars = 0
  let hasInsertMark = false
  let hasDelMark = false
  let hasFmtMark = false

  /**
   * @param {import('@tiptap/pm/model').Mark} m
   * @returns {'ins' | 'del' | null}
   */
  const noteMark = (m) => {
    const name = m.type.name
    if (name === INSERT_MARK) {
      hasInsertMark = true
      const uid = userIdFromMark(m)
      if (uid && !seen.has(uid)) { seen.add(uid); users.push(uid) }
      return 'ins'
    } else if (name === DELETE_MARK) {
      hasDelMark = true
      const uid = userIdFromMark(m)
      if (uid && !seen.has(uid)) { seen.add(uid); users.push(uid) }
      return 'del'
    } else if (name === FORMAT_MARK) {
      hasFmtMark = true
      const uid = userIdFromFormatMark(m)
      if (uid && !seen.has(uid)) { seen.add(uid); users.push(uid) }
    }
    return null
  }

  // Block-level marks on the node itself (a wholly-inserted/deleted paragraph —
  // including an empty one — carries the mark here even with no text descendants).
  let blockHasInsertMark = false
  let blockHasDeleteMark = false
  for (const m of blockNode.marks) {
    const kind = noteMark(m)
    if (kind === 'ins') blockHasInsertMark = true
    else if (kind === 'del') blockHasDeleteMark = true
  }

  // Then inline marks on every text descendant.
  blockNode.descendants((child) => {
    if (!child.isText) return
    const len = child.text ? child.text.length : 0
    textChars += len
    let inserted = false
    let deleted = false
    for (const m of child.marks) {
      const kind = noteMark(m)
      if (kind === 'ins') inserted = true
      else if (kind === 'del') deleted = true
    }
    if (inserted) insertedChars += len
    if (deleted) deletedChars += len
  })

  const whollyInserted = blockHasInsertMark ||
    (hasInsertMark && textChars > 0 && insertedChars === textChars)
  const whollyDeleted = blockHasDeleteMark ||
    (hasDelMark && textChars > 0 && deletedChars === textChars)

  return {
    users,
    edited: hasInsertMark || hasDelMark || hasFmtMark,
    whollyInserted,
    whollyDeleted
  }
}

const blockAttributionPluginKey = new PluginKey('block-attribution-decorations')

/** @param {import('@tiptap/pm/state').EditorState} state */
const buildBlockDecorations = (state) => {
  /** @type {Decoration[]} */
  const decos = []
  state.doc.descendants((node, pos) => {
    if (!node.isBlock || !node.isTextblock) return true
    const { users, edited, whollyInserted, whollyDeleted } = summariseBlockAttribution(node)
    if (!edited) return false
    const primary = users[0] || null
    const secondary = users[1] || null
    let cls = 'y-block-edited'
    if (whollyInserted) cls += ' y-block-inserted'
    if (whollyDeleted) cls += ' y-block-deleted'
    const attrs = /** @type {Record<string, string>} */ ({
      class: cls,
      'data-initials': primary ? initialsForName(primary) : '··',
      style: `--block-user-color: ${userColorForId(primary)}`
    })
    if (secondary) {
      attrs['data-initials-2'] = initialsForName(secondary)
      attrs.style += `; --block-user-color-2: ${userColorForId(secondary)}`
    }
    decos.push(Decoration.node(pos, pos + node.nodeSize, attrs))
    return false
  })
  return DecorationSet.create(state.doc, decos)
}

const blockAttributionPlugin = new Plugin({
  key: blockAttributionPluginKey,
  state: {
    init: (_, state) => buildBlockDecorations(state),
    apply: (tr, oldSet, _oldState, newState) => {
      if (!tr.docChanged && tr.getMeta(ySyncPluginKey) == null) return oldSet
      return buildBlockDecorations(newState)
    }
  },
  props: {
    decorations (state) { return /** @type {DecorationSet} */ (blockAttributionPluginKey.getState(state)) }
  }
})

export const BlockAttributionExtension = Extension.create({
  name: 'blockAttribution',
  addProseMirrorPlugins () { return [blockAttributionPlugin] }
})
