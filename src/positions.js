import * as Y from '@y/y'
import * as dpos from 'lib0/delta/position'

/**
 * Content index (lib0 delta coordinates: 1 slot per character, 1 slot per element child)
 * of the child at `childIndex` within `parent`. This mirrors how `nodeToDelta` renders a
 * PM node - text as strings, every other child as a single embed.
 *
 * @param {import('prosemirror-model').Node} parent
 * @param {number} childIndex
 * @return {number}
 */
const pmContentIndex = (parent, childIndex) => {
  let idx = 0
  for (let i = 0; i < childIndex; i++) {
    const child = parent.child(i)
    idx += child.isText ? child.nodeSize : 1
  }
  return idx
}

/**
 * Transforms a Prosemirror position to a lib0 delta position (a tree position) rooted at
 * the PM doc - the coordinate space of the binding's view side.
 *
 * @param {import('prosemirror-model').ResolvedPos} resolvedPos
 * @return {import('lib0/delta/position').Pos}
 */
export const resolvedPositionToDeltaPosition = (resolvedPos) => {
  const depth = resolvedPos.depth
  /**
   * @type {Array<number>}
   */
  const path = []
  for (let d = 0; d < depth; d++) {
    path.push(pmContentIndex(resolvedPos.node(d), resolvedPos.index(d)))
  }
  const parent = resolvedPos.node(depth)
  const terminal = pmContentIndex(parent, resolvedPos.index(depth)) + resolvedPos.textOffset
  path.push(terminal)
  const contentLength = pmContentIndex(parent, parent.childCount)
  // End-of-parent binds left; position 0 in an empty parent also binds left so the
  // position is retained if content is inserted later.
  const assoc = (terminal > 0 && terminal === contentLength) || (resolvedPos.pos === 0 && contentLength === 0) ? -1 : 1
  return dpos.create(path, assoc)
}

/**
 * Resolves a lib0 delta position (a tree position, PM-doc-rooted, view-side coordinates)
 * to a Prosemirror {@link import('prosemirror-model').ResolvedPos}. Returns null when
 * the path cannot be followed (attribute steps, descent into text/leaf nodes,
 * out-of-range non-terminal steps). A terminal offset beyond the parent's content is
 * clamped to the parent's end (end-of-type relative positions resolve there).
 *
 * @param {import('prosemirror-model').Node} pmDoc
 * @param {import('lib0/delta/position').Pos} pos
 * @return {import('prosemirror-model').ResolvedPos | null}
 */
export const deltaPositionToResolvedPosition = (pmDoc, pos) => {
  let node = pmDoc
  let base = 0
  const path = pos.path
  for (let i = 0; i < path.length; i++) {
    const step = path[i]
    if (typeof step === 'string') {
      // attribute step - no PM position equivalent
      return null
    }
    if (i < path.length - 1) {
      // non-terminal: descend into the element child at content index `step`
      let rem = step
      let sizeBefore = 0
      /**
       * @type {import('prosemirror-model').Node | null}
       */
      let target = null
      for (let j = 0; j < node.childCount; j++) {
        const child = node.child(j)
        const width = child.isText ? child.nodeSize : 1
        if (rem >= width) {
          rem -= width
          sizeBefore += child.nodeSize
        } else {
          target = child
          break
        }
      }
      if (target == null || rem !== 0 || target.isText || target.isLeaf) {
        return null
      }
      base += sizeBefore + 1 // + 1 enters the node
      node = target
    } else {
      // terminal: cursor gap at content index `step` within `node`
      let rem = step
      let off = 0
      for (let j = 0; j < node.childCount && rem > 0; j++) {
        const child = node.child(j)
        const width = child.isText ? child.nodeSize : 1
        if (rem >= width) {
          rem -= width
          off += child.nodeSize
        } else {
          // the gap sits inside a text node - the remainder is a character offset
          off += rem
          rem = 0
        }
      }
      // the walk guarantees an in-range position, so `resolve` cannot throw
      return pmDoc.resolve(base + (rem > 0 ? node.content.size : off))
    }
  }
  // an empty path addresses the root node itself, not a cursor gap
  return null
}

/**
 * Transforms a Prosemirror resolved position to a {@link Y.RelativePosition}.
 * Returns null when the position cannot be anchored in the Y tree (mid-dispatch
 * divergence, or structurally transformed subtrees like old-representation anonymous
 * containers - map through the binding transformer via
 * {@link resolvedPositionsToRelativePositions} to bridge those).
 *
 * @param {import('prosemirror-model').ResolvedPos} resolvedPos
 * @param {Y.Node} type
 * @param {Y.AbstractRenderer | null} [renderer]
 * @return {Y.RelativePosition | null} relative position
 */
export const resolvedPositionToRelativePosition = (resolvedPos, type, renderer) =>
  Y.createRelativePositionFromDeltaPosition(
    type, resolvedPositionToDeltaPosition(resolvedPos), { renderer: renderer ?? null })

/**
 * @typedef {object} TransformerPositionCtx
 * @property {Y.Node} ytype The bound root type (the data side of the binding)
 * @property {Y.AbstractRenderer | null} [renderer] The renderer the binding renders the data side with (the sync plugin state's `renderer`)
 * @property {import('lib0/delta/transformer').Transformer<any, any> | null} [transformer] A live binding's transformer (`binding.t`). It must already have been fed the document state - a live binding always has. When null, positions resolve directly (only correct while the Y render and the PM doc are structurally identical).
 */

/**
 * Maps {@link Y.RelativePosition}s to Prosemirror resolved positions through a live
 * binding transformer: Y render space → transformer (data→view) → PM doc. Batched - one
 * Y resolution and one transformer pass serve all positions. Results are 1:1 with the
 * input; `null` marks positions that could not be resolved or were dropped by the
 * transformer (`null` inputs stay `null`).
 *
 * @param {Array<Y.RelativePosition | null>} rposs
 * @param {TransformerPositionCtx} ctx
 * @param {import('prosemirror-model').Node} pmDoc
 * @return {Array<import('prosemirror-model').ResolvedPos | null>}
 */
export const relativePositionsToResolvedPositions = (rposs, { ytype, renderer = null, transformer = null }, pmDoc) => {
  // `renderer` is passed explicitly (null = plain render, never undefined): the binding
  // renders the data side with exactly this renderer, so the delta positions must
  // resolve in the same coordinates
  const deltaPoss = Y.createDeltaPositionsFromRelativePositions(ytype, rposs, { renderer })
  // compact - mapPositionsA does not accept null entries
  /**
   * @type {Array<import('lib0/delta/position').Pos>}
   */
  const compact = []
  /**
   * @type {Array<number>}
   */
  const compactIndex = []
  deltaPoss.forEach((p, i) => {
    if (p != null) {
      compact.push(p)
      compactIndex.push(i)
    }
  })
  const mapped = transformer == null ? compact : dpos.mapPositionsA(transformer, compact)
  /**
   * @type {Array<import('prosemirror-model').ResolvedPos | null>}
   */
  const result = rposs.map(() => null)
  mapped.forEach((p, i) => {
    if (p != null) {
      result[compactIndex[i]] = deltaPositionToResolvedPosition(pmDoc, p)
    }
  })
  return result
}

/**
 * Maps Prosemirror positions to {@link Y.RelativePosition}s through a live binding
 * transformer: PM doc → transformer (view→data) → Y render space. Batched - one
 * transformer pass serves all positions. `null` marks positions the transformer dropped
 * or that could not be anchored in the Y document.
 *
 * @param {Array<import('prosemirror-model').ResolvedPos>} resolvedPositions
 * @param {TransformerPositionCtx} ctx
 * @return {Array<Y.RelativePosition | null>}
 */
export const resolvedPositionsToRelativePositions = (resolvedPositions, { ytype, renderer = null, transformer = null }) => {
  const deltaPoss = resolvedPositions.map(resolvedPositionToDeltaPosition)
  const mapped = transformer == null ? deltaPoss : dpos.mapPositionsB(transformer, deltaPoss)
  /**
   * @type {Array<import('lib0/delta/position').Pos>}
   */
  const compact = []
  /**
   * @type {Array<number>}
   */
  const compactIndex = []
  mapped.forEach((p, i) => {
    if (p != null) {
      compact.push(p)
      compactIndex.push(i)
    }
  })
  const rposs = Y.createRelativePositionsFromDeltaPositions(ytype, compact, { renderer })
  /**
   * @type {Array<Y.RelativePosition | null>}
   */
  const result = resolvedPositions.map(() => null)
  rposs.forEach((rpos, i) => {
    result[compactIndex[i]] = rpos
  })
  return result
}

/**
 * Renderer/transformer context for encoding and resolving positions - the ytype comes
 * from the utility itself.
 *
 * @typedef {object} PositionCtx
 * @property {Y.AbstractRenderer | null} [renderer]
 * @property {import('lib0/delta/transformer').Transformer<any, any> | null} [transformer]
 */

/**
 * Creates a function that can be used to keep track of a position of a Prosemirror document, and restore it to a position (number) in a different Prosemirror document.
 * Throws when the position cannot be anchored in the Y tree.
 * @param {import('prosemirror-model').ResolvedPos} resolvedPos Absolute position in the Prosemirror document
 * @param {Y.Node} type Top level type that is bound to pView
 * @param {PositionCtx} [ctx] renderer/transformer to encode the relative position with
 * @returns {(doc: import('prosemirror-model').Node, documentType?: Y.Node, ctx?: PositionCtx) => number}
 */
export const relativePositionStore = (resolvedPos, type, ctx = {}) => {
  const relPos = resolvedPositionsToRelativePositions([resolvedPos], { ytype: type, ...ctx })[0]
  if (relPos == null) {
    throw new Error('Failed to encode position')
  }
  return (doc, documentType = type, ctx = {}) => {
    const resolved = relativePositionsToResolvedPositions([relPos], { ytype: documentType, ...ctx }, doc)[0]
    if (resolved === null) {
      throw new Error('Failed to resolve position')
    }
    return resolved.pos
  }
}

/**
 * @callback CaptureMapping
 * @param {import('prosemirror-model').Node} doc Prosemirror document used to resolve positions
 * @param {PositionCtx} [ctx] renderer/transformer to encode the relative positions with
 * @param {boolean} [clear] If true, clears all previously stored positions and captures fresh values for the mapping
 * @returns {import('prosemirror-transform').Mappable}
 */

/**
 * @callback RestoreMapping
 * @param {Y.Node} type Top level type that is bound to pView
 * @param {import('prosemirror-model').Node} pmDoc Prosemirror document
 * @param {PositionCtx} [ctx] renderer/transformer to resolve the relative positions with
 * @returns {import('prosemirror-transform').Mappable}
 */

/**
 * Creates a pair of Mappable-compatible objects for capturing and restoring positions
 * via Y.js relative positions. Designed to work with ProseMirror's SelectionBookmark.map().
 *
 * @param {Y.Node} type
 * @returns {{captureMapping: CaptureMapping, restoreMapping: RestoreMapping}}
 */
export const relativePositionStoreMapping = (type) => {
  /**
   * @type {Map<number, Y.RelativePosition>}
   */
  const positionMapping = new Map()

  return {
    captureMapping: (doc, ctx = {}, clear = false) => {
      if (clear) {
        positionMapping.clear()
      }
      return {
        /**
         * @param {number} pos
         */
        map (pos) {
          // Store the relative position using the position as the key. Unresolvable
          // positions are not stored - restoring them throws, which callers treat
          // as "skip restoration".
          const relPos = resolvedPositionsToRelativePositions([doc.resolve(pos)], { ytype: type, ...ctx })[0]
          if (relPos != null) {
            positionMapping.set(pos, relPos)
          }

          // Pass through the position unchanged, since we are just using it to store the relative position
          return pos
        },
        /**
         * @param {number} pos
         */
        mapResult (pos) {
          // Call the map function to store the relative position
          return { pos: this.map(pos), deleted: false, deletedAcross: false, deletedAfter: false, deletedBefore: false }
        }
      }
    },
    restoreMapping (type, pmDoc, ctx = {}) {
      return {
        map (pos) {
          const relPos = positionMapping.get(pos)
          if (!relPos) {
            throw new Error('Relative position not set')
          }
          const resolved = relativePositionsToResolvedPositions([relPos], { ytype: type, ...ctx }, pmDoc)[0]
          if (resolved === null) {
            throw new Error('Failed to resolve position')
          }
          // PM's Mappable contract is number-based
          return resolved.pos
        },
        mapResult (originalPos) {
          const mappedPos = this.map(originalPos)
          if (mappedPos === null) {
            return { pos: originalPos, deleted: true, deletedAcross: true, deletedAfter: true, deletedBefore: true }
          }
          return { pos: mappedPos, deleted: false, deletedAcross: false, deletedAfter: false, deletedBefore: false }
        }
      }
    }
  }
}
