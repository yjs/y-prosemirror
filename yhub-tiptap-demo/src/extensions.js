import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import {
  syncPlugin, yCursorPlugin, yUndoPlugin, ySyncPluginKey,
  defaultMapAttributionToMark, undoCommand, redoCommand
} from '@y/prosemirror'
import { userColorForId, initialsForName } from './user-colors.js'

// ── y-prosemirror plugins, wrapped as Tiptap extensions ──────────────────────
//
// We deliberately do NOT use `@tiptap/extension-collaboration`: it wraps the
// *old* y-prosemirror ySyncPlugin and is incompatible with the new attribution
// binding. Instead we add `syncPlugin` / `yCursorPlugin` directly via
// `addProseMirrorPlugins`, the same shape the BlockNote demo uses through
// `createExtension`.

/**
 * `mapAttributionToMark`, `attributedNodes` and `customCompare` live in the
 * sync plugin's STATE, so they could in principle be swapped through a meta.
 * `transformers` and `onInternalError` are CONSTRUCTION options - they are
 * baked into the RDTs when the binding is built - which is why the demo drives
 * them from URL flags and a reload rather than from the UI.
 *
 * @param {object} [opts]
 * @param {AttributionMapper} [opts.mapAttributionToMark]
 * @param {AttributedNodesPredicate} [opts.attributedNodes]
 * @param {NodeCompare | null} [opts.customCompare]
 * @param {Array<(($d: any) => any)>} [opts.transformers]
 * @param {null | ((err: Error, errCode: number) => any)} [opts.onInternalError]
 */
export const createYSyncExtension = (opts = {}) => Extension.create({
  name: 'ySync',
  addProseMirrorPlugins () {
    return [syncPlugin({
      mapAttributionToMark: opts.mapAttributionToMark ?? defaultMapAttributionToMark,
      attributedNodes: opts.attributedNodes,
      customCompare: opts.customCompare ?? null,
      transformers: opts.transformers ?? [],
      onInternalError: opts.onInternalError ?? null
    })]
  }
})

/**
 * Yjs owns history, so StarterKit's `undoRedo` is disabled and this replaces
 * it. Without it the demo has no undo at all.
 *
 * The UndoManager is per-`Y.Doc` (it hooks `doc.on('afterTransaction')` and its
 * scope cannot span documents), and this demo binds three different docs - the
 * live doc, the suggestion doc and a historical version doc - so main.js swaps
 * the manager whenever it rebinds. See `setUndoManager` there.
 *
 * @param {import('@y/y').UndoManager} undoManager the manager for the initially bound doc
 */
export const createYUndoExtension = (undoManager) => Extension.create({
  name: 'yUndo',
  addProseMirrorPlugins () { return [yUndoPlugin(undoManager)] },
  addKeyboardShortcuts () {
    return {
      'Mod-z': () => undoCommand(this.editor.state, this.editor.view.dispatch),
      'Mod-y': () => redoCommand(this.editor.state, this.editor.view.dispatch),
      'Mod-Shift-z': () => redoCommand(this.editor.state, this.editor.view.dispatch)
    }
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
const ATTRS_MARK = 'y-attributed-attrs'

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
    } else if (name === ATTRS_MARK) {
      // node attribute change (e.g. heading level) - counts as an edit
      hasFmtMark = true
      const changes = /** @type {Record<string, { userIds?: string[] }>|null} */ (m.attrs.changes) ?? {}
      for (const uid of new Set(Object.values(changes).flatMap(c => c?.userIds ?? []))) {
        if (!seen.has(uid)) { seen.add(uid); users.push(uid) }
      }
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

const ATTRIBUTION_MARK_SET = new Set([INSERT_MARK, DELETE_MARK, FORMAT_MARK, ATTRS_MARK])

/**
 * Whether the node itself carries an attribution NODE mark. A container that
 * does is the case this walker exists for: a `blockquote--attributed` whose
 * children were deleted for real in the base document has no textblock at all,
 * so without this it would render as an invisible zero-height element with no
 * gutter avatar and no strike bar - i.e. the headline suggestion-mode scenario
 * would look like nothing happened.
 *
 * @param {import('@tiptap/pm/model').Node} node
 */
const hasAttributionNodeMark = (node) =>
  node.marks.some(m => ATTRIBUTION_MARK_SET.has(m.type.name))

/** @param {import('@tiptap/pm/state').EditorState} state */
const buildBlockDecorations = (state) => {
  /** @type {Decoration[]} */
  const decos = []
  state.doc.descendants((node, pos) => {
    if (!node.isBlock) return true
    const isContainer = !node.isTextblock
    // Containers only earn their own decoration when the attribution sits on
    // the container node itself; otherwise we just descend and let the inner
    // textblocks speak for themselves.
    if (isContainer && !hasAttributionNodeMark(node)) return true
    const { users, edited, whollyInserted, whollyDeleted } = summariseBlockAttribution(node)
    // Always keep descending through a container so nested textblocks still get
    // their own avatars.
    if (!edited) return isContainer
    const primary = users[0] || null
    const secondary = users[1] || null
    let cls = 'y-block-edited'
    if (whollyInserted) cls += ' y-block-inserted'
    if (whollyDeleted) cls += ' y-block-deleted'
    if (isContainer) cls += ' y-block-container'
    if (node.type.name.endsWith('--attributed')) cls += ' y-block-variant'
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
    return isContainer
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
