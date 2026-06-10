/**
 * Convert a Yjs attributed delta into a DiffSet for decoration rendering.
 *
 * The attributed delta (from ytype.toDeltaDeep(am)) includes both current
 * content and deleted content (retained because gc:false). This function
 * walks the delta, maps each span onto the clean (displayed) PM document,
 * and produces a Diff[] in the same contract that diff-decorations.js expects.
 *
 * Strategy B: the PM document mirrors the clean suggestion content (synced
 * without attribution marks). This function reads the attribution separately
 * and produces decorations without touching the document model.
 */
import * as d from 'lib0/delta'
import { Fragment } from 'prosemirror-model'
import { formattingAttributesToMarks } from './sync-utils.js'

/**
 * Who made a change and whether it was an insertion or deletion.
 *
 * @typedef {{
 *   type: 'added' | 'removed',
 *   authorIds: string[],
 *   timestamp?: number
 * }} Attribution
 */

/**
 * The six diff types produced by `ydeltaToDiffSet`.
 *
 * @typedef {'inline-insert' | 'inline-delete' | 'block-insert' | 'block-delete' | 'inline-update' | 'block-update'} DiffType
 */

/**
 * A single difference between the base and suggestion documents.
 *
 * `from`/`to` are positions in the *displayed* (clean) PM document.
 * For delete types, `from === to` (zero-width) and `content` holds the
 * removed fragment for ghost rendering.  For update types, `attributes`
 * holds the new values and `previousAttributes` (when available) the old.
 *
 * @typedef {{
 *   type: DiffType,
 *   from: number,
 *   to: number,
 *   content?: import('prosemirror-model').Fragment,
 *   attribution: Attribution,
 *   attributes?: Record<string, any>,
 *   previousAttributes?: Record<string, any>
 * }} Diff
 */

/**
 * An ordered array of `Diff` objects covering all changes between the
 * base and suggestion documents.
 *
 * @typedef {Diff[]} DiffSet
 */

/**
 * Convert an attributed delta from `ytype.toDeltaDeep(am)` into a DiffSet
 * whose positions are expressed in the clean (displayed) PM document.
 *
 * @param {d.DeltaAny} attributedDelta
 * @param {{ displayedDoc: import('prosemirror-model').Node, schema: import('prosemirror-model').Schema }} opts
 * @returns {DiffSet}
 */
export const ydeltaToDiffSet = (attributedDelta, { displayedDoc, schema }) => {
  /** @type {Diff[]} */
  const diffs = []
  const pos = { i: 0 }
  walkBlockLevel(attributedDelta, pos, diffs, displayedDoc, schema)
  return suppressSplitDeletes(diffs)
}

/**
 * Drop the spurious delete halves produced when a block is *split* in
 * suggestion mode.
 *
 * A CRDT cannot move text: splitting "abc|def" into two blocks is recorded as
 * "delete `def` from the first block" + "insert a new block whose content is
 * `def`". `toDeltaDeep(am)` therefore reports `def` twice - once with
 * `{delete}` at the tail of the original block, once with `{insert}` in the
 * brand-new block - even though the clean displayed doc only shows it once (in
 * the new block). Rendering the delete half draws a phantom strikethrough of
 * text the user can already see (now green) in the inserted block right after
 * it, and turns a trivial "add a paragraph below" into "delete the tail and
 * re-insert it merged with the new text".
 *
 * Detection is structural: a delete diff (`inline-delete`/`block-delete`)
 * immediately followed by a `block-insert` whose inserted content *contains*
 * the deleted text as a contiguous substring is the source half of a split.
 * The inserted block genuinely is new content (typed text plus the moved text),
 * so we keep it as-is and only drop the redundant delete ghost.
 *
 * @param {Diff[]} diffs
 * @returns {Diff[]}
 */
function suppressSplitDeletes (diffs) {
  /** @type {Set<number>} */
  const drop = new Set()
  for (let i = 0; i < diffs.length - 1; i++) {
    const cur = diffs[i]
    const next = diffs[i + 1]
    if (cur.type !== 'inline-delete' && cur.type !== 'block-delete') continue
    if (next.type !== 'block-insert') continue
    // The moved-out block must sit right after the split point: only the
    // source block's close token and the new block's open token (<= 2 PM
    // positions) separate the delete anchor from the inserted block's start.
    // This keeps the heuristic to genuine splits and avoids suppressing an
    // unrelated delete that merely happens to share text with a later insert.
    if (next.from - cur.from > 2) continue
    const deletedText = fragmentText(cur.content)
    if (deletedText.length === 0) continue
    const insertedText = fragmentText(next.content)
    if (insertedText.includes(deletedText)) {
      drop.add(i)
    }
  }
  if (drop.size === 0) return diffs
  return diffs.filter((_, i) => !drop.has(i))
}

/**
 * @param {import('prosemirror-model').Fragment | undefined} fragment
 * @returns {string}
 */
function fragmentText (fragment) {
  if (!fragment || fragment.size === 0) return ''
  return fragment.textBetween(0, fragment.size)
}

/**
 * Walk the children of a block-level delta (the doc delta or a container like
 * blockquote). Each child is an insert op containing a sub-delta (block node).
 *
 * @param {d.DeltaAny} parentDelta
 * @param {{ i: number }} pos - mutable PM position cursor
 * @param {Diff[]} diffs
 * @param {import('prosemirror-model').Node} displayedDoc
 * @param {import('prosemirror-model').Schema} schema
 */
function walkBlockLevel (parentDelta, pos, diffs, displayedDoc, schema) {
  for (const op of parentDelta.children) {
    if (d.$insertOp.check(op)) {
      for (const child of op.insert) {
        if (d.$deltaAny.check(child)) {
          processBlockNode(child, op, pos, diffs, displayedDoc, schema)
        }
      }
    } else if (d.$textOp.check(op)) {
      processTextOp(op, pos, diffs, schema)
    }
  }
}

/**
 * Process a single block node from the attributed delta.
 *
 * @param {d.DeltaAny} nodeDelta - the block node's delta (paragraph, heading, etc.)
 * @param {d.InsertOp<any>} parentOp - the insert op that contains this node
 * @param {{ i: number }} pos
 * @param {Diff[]} diffs
 * @param {import('prosemirror-model').Node} displayedDoc
 * @param {import('prosemirror-model').Schema} schema
 */
function processBlockNode (nodeDelta, parentOp, pos, diffs, displayedDoc, schema) {
  const attr = parentOp.attribution

  if (attr?.delete) {
    const content = reconstructNodeFragment(nodeDelta, schema)
    diffs.push({
      type: 'block-delete',
      from: pos.i,
      to: pos.i,
      content,
      attribution: { type: 'removed', authorIds: attr.delete }
    })
    return
  }

  if (attr?.insert) {
    const node = displayedDoc.nodeAt(pos.i)
    if (node) {
      diffs.push({
        type: 'block-insert',
        from: pos.i,
        to: pos.i + node.nodeSize,
        content: Fragment.from(node),
        attribution: { type: 'added', authorIds: attr.insert }
      })
      pos.i += node.nodeSize
    }
    return
  }

  if (attr?.format) {
    const node = displayedDoc.nodeAt(pos.i)
    if (node) {
      const authorIds = uniqueAuthors(attr.format)
      const formattedKeys = Object.keys(attr.format)
      const allAttrs = extractDeltaAttrs(nodeDelta)
      /** @type {Record<string, any>} */
      const attributes = {}
      for (const key of formattedKeys) {
        attributes[key] = allAttrs[key]
      }
      diffs.push({
        type: 'block-update',
        from: pos.i,
        to: pos.i + node.nodeSize,
        attribution: { type: 'added', authorIds },
        attributes,
        previousAttributes: undefined
      })
    }
  }

  // Leaf block nodes (e.g. horizontal_rule) have no content and a fixed
  // nodeSize of 1 - there is no separate close token to skip, so advancing
  // by the open/close pair below would over-count by 1 and drift every
  // subsequent position. Detect via the schema (not the document, which may
  // transiently disagree with the attributed delta mid-edit) and advance by 1.
  const nodeType = nodeDelta.name ? schema.nodes[nodeDelta.name] : null
  if (nodeType?.isLeaf) {
    pos.i += 1
    return
  }
  pos.i += 1
  walkInlineLevel(nodeDelta, pos, diffs, displayedDoc, schema)
  pos.i += 1
}

/**
 * Walk inline children of a block node delta.
 *
 * @param {d.DeltaAny} blockDelta
 * @param {{ i: number }} pos
 * @param {Diff[]} diffs
 * @param {import('prosemirror-model').Node} displayedDoc
 * @param {import('prosemirror-model').Schema} schema
 */
function walkInlineLevel (blockDelta, pos, diffs, displayedDoc, schema) {
  for (const op of blockDelta.children) {
    if (d.$textOp.check(op)) {
      processTextOp(op, pos, diffs, schema)
    } else if (d.$insertOp.check(op)) {
      for (const child of op.insert) {
        if (d.$deltaAny.check(child)) {
          processBlockNode(child, op, pos, diffs, displayedDoc, schema)
        }
      }
    }
  }
}

/**
 * Process a text op from the attributed delta.
 *
 * @param {d.TextOp} op
 * @param {{ i: number }} pos
 * @param {Diff[]} diffs
 * @param {import('prosemirror-model').Schema} schema
 */
function processTextOp (op, pos, diffs, schema) {
  const text = op.insert
  const len = text.length
  const attr = op.attribution

  if (attr?.delete) {
    const marks = safeMarks(op.format, schema)
    diffs.push({
      type: 'inline-delete',
      from: pos.i,
      to: pos.i,
      content: Fragment.from(schema.text(text, marks.length ? marks : undefined)),
      attribution: { type: 'removed', authorIds: attr.delete }
    })
    return
  }

  if (attr?.insert) {
    diffs.push({
      type: 'inline-insert',
      from: pos.i,
      to: pos.i + len,
      attribution: { type: 'added', authorIds: attr.insert }
    })
    pos.i += len
    return
  }

  if (attr?.format) {
    const authorIds = uniqueAuthors(attr.format)
    diffs.push({
      type: 'inline-update',
      from: pos.i,
      to: pos.i + len,
      attribution: { type: 'added', authorIds },
      attributes: formatToDiffAttributes(op.format)
    })
    pos.i += len
    return
  }

  pos.i += len
}

/**
 * Reconstruct a PM Fragment from a delta for ghost rendering.
 *
 * @param {d.DeltaAny} nodeDelta
 * @param {import('prosemirror-model').Schema} schema
 * @returns {Fragment}
 */
function reconstructNodeFragment (nodeDelta, schema) {
  const node = reconstructNode(nodeDelta, schema)
  return node ? Fragment.from(node) : Fragment.empty
}

/**
 * @param {d.DeltaAny} nodeDelta
 * @param {import('prosemirror-model').Schema} schema
 * @returns {import('prosemirror-model').Node | null}
 */
function reconstructNode (nodeDelta, schema) {
  const nodeName = nodeDelta.name || 'paragraph'
  const nodeType = schema.nodes[nodeName]
  if (!nodeType) return null

  /** @type {Record<string, any>} */
  const attrs = {}
  for (const attr of nodeDelta.attrs) {
    attrs[attr.key] = attr.value
  }

  /** @type {import('prosemirror-model').Node[]} */
  const children = []
  for (const op of nodeDelta.children) {
    if (d.$textOp.check(op)) {
      const marks = safeMarks(op.format, schema)
      children.push(schema.text(op.insert, marks.length ? marks : undefined))
    } else if (d.$insertOp.check(op)) {
      for (const sub of op.insert) {
        if (d.$deltaAny.check(sub)) {
          const subNode = reconstructNode(sub, schema)
          if (subNode) children.push(subNode)
        }
      }
    }
  }

  return nodeType.createAndFill(attrs, children)
}

/**
 * @param {Record<string, unknown> | null | undefined} format
 * @param {import('prosemirror-model').Schema} schema
 * @returns {import('prosemirror-model').Mark[]}
 */
function safeMarks (format, schema) {
  if (!format) return []
  try {
    return formattingAttributesToMarks(format, schema)
  } catch {
    return []
  }
}

/**
 * @param {Record<string, string[]>} formatAttribution
 * @returns {string[]}
 */
function uniqueAuthors (formatAttribution) {
  return [...new Set(Object.values(formatAttribution).flat())]
}

/**
 * @param {d.DeltaAny} nodeDelta
 * @returns {Record<string, any>}
 */
function extractDeltaAttrs (nodeDelta) {
  /** @type {Record<string, any>} */
  const attrs = {}
  for (const attr of nodeDelta.attrs) {
    attrs[attr.key] = attr.value
  }
  return attrs
}

/**
 * Convert a delta format object to the Diff.attributes shape.
 * The result captures which formatting keys changed (e.g. `{strong: {}, em: {}}`),
 * stored under `format` so downstream code can display what changed.
 *
 * @param {Record<string, unknown> | null | undefined} fmt
 * @returns {{ format: Record<string, any> } | undefined}
 */
function formatToDiffAttributes (fmt) {
  if (!fmt) return undefined
  /** @type {Record<string, any>} */
  const format = {}
  for (const [k, v] of Object.entries(fmt)) {
    format[k] = v
  }
  return { format }
}
