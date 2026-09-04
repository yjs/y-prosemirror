import * as Y from '@y/y'
import * as dpos from 'lib0/delta/position'
import { ySyncPluginKey } from './keys.js'
import { usableTransformer } from './sync-plugin.js'

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
 * The slice of the sync plugin state that position mapping needs. Normally derived from
 * the editor state (`ySyncPluginKey.getState(state)`) - callers only pass it explicitly
 * to overlay an in-flight `configureYProsemirror` update (see the cursor plugin's
 * `apply`, which may run before the sync plugin's).
 *
 * @typedef {{ytype: Y.Node | null, renderer: Y.AbstractRenderer | null, binding?: import('lib0/delta/rdt').Binding<any, any> | null} | undefined} MappingSyncState
 */

/**
 * Transaction-time machinery: maps {@link Y.RelativePosition}s to Prosemirror resolved
 * positions against a specific editor state - Y render space → binding transformer
 * (data→view) → `state.doc`. Used by plugin internals that run *during* state
 * application (plugin `apply`), where no view exists yet; positions resolve against the
 * state being applied. Application code should use the view-based
 * {@link relativePositionsToResolvedPositions} instead - a held state reference can be
 * stale, `view.state` cannot.
 *
 * The bound ytype, its renderer, and the live binding transformer are derived from the
 * sync plugin state. Batched - one Y resolution and one transformer pass serve all
 * positions. Results are 1:1 with the input; `null` marks positions that could not be
 * resolved or were dropped by the transformer (`null` inputs stay `null`). Without a
 * bound ytype (no sync plugin, or not configured) every result is `null`. Never throws.
 *
 * @param {import('prosemirror-state').EditorState} state
 * @param {Array<Y.RelativePosition | null>} rposs
 * @param {MappingSyncState} [ystate] sync plugin state override (mid-dispatch overlays)
 * @return {Array<import('prosemirror-model').ResolvedPos | null>}
 */
export const mapRelativePositionsToResolvedPositions = (state, rposs, ystate = ySyncPluginKey.getState(state)) => {
  const ytype = ystate?.ytype
  if (ytype == null) {
    return rposs.map(() => null)
  }
  // `renderer` is passed explicitly (null = plain render, never undefined): the binding
  // renders the data side with exactly this renderer, so the delta positions must
  // resolve in the same coordinates
  const deltaPoss = Y.createDeltaPositionsFromRelativePositions(ytype, rposs, { renderer: ystate?.renderer ?? null })
  const transformer = usableTransformer(ystate)
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
      result[compactIndex[i]] = deltaPositionToResolvedPosition(state.doc, p)
    }
  })
  return result
}

/**
 * Transaction-time machinery: maps Prosemirror resolved positions to
 * {@link Y.RelativePosition}s against a specific editor state - PM doc → binding
 * transformer (view→data) → Y render space. Used by plugin internals that run *during*
 * state application; application code should use the view-based
 * {@link resolvedPositionsToRelativePositions} instead.
 *
 * The bound ytype, its renderer, and the live binding transformer are derived from the
 * sync plugin state. Batched - one transformer pass serves all positions. `null` marks
 * positions the transformer dropped or that could not be anchored in the Y document.
 * Without a bound ytype (no sync plugin, or not configured) every result is `null`.
 * Never throws.
 *
 * @param {import('prosemirror-state').EditorState} state
 * @param {Array<import('prosemirror-model').ResolvedPos>} resolvedPositions
 * @param {MappingSyncState} [ystate] sync plugin state override (mid-dispatch overlays)
 * @return {Array<Y.RelativePosition | null>}
 */
export const mapResolvedPositionsToRelativePositions = (state, resolvedPositions, ystate = ySyncPluginKey.getState(state)) => {
  const ytype = ystate?.ytype
  if (ytype == null) {
    return resolvedPositions.map(() => null)
  }
  const deltaPoss = resolvedPositions.map(resolvedPositionToDeltaPosition)
  const transformer = usableTransformer(ystate)
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
  const rposs = Y.createRelativePositionsFromDeltaPositions(ytype, compact, { renderer: ystate?.renderer ?? null })
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
 * Maps {@link Y.RelativePosition}s to Prosemirror resolved positions in the view's
 * current document (batched - one Y resolution and one transformer pass serve all
 * positions). See {@link mapRelativePositionsToResolvedPositions} for the mapping
 * semantics. Takes the view rather than a state: a Prosemirror position is only
 * meaningful against the latest document, and that is bound to the view.
 *
 * @param {import('prosemirror-view').EditorView} view
 * @param {Array<Y.RelativePosition | null>} rposs
 * @return {Array<import('prosemirror-model').ResolvedPos | null>}
 */
export const relativePositionsToResolvedPositions = (view, rposs) =>
  mapRelativePositionsToResolvedPositions(view.state, rposs)

/**
 * Maps Prosemirror resolved positions from the view's current document to
 * {@link Y.RelativePosition}s (batched - one transformer pass serves all positions).
 * See {@link mapResolvedPositionsToRelativePositions} for the mapping semantics.
 *
 * @param {import('prosemirror-view').EditorView} view
 * @param {Array<import('prosemirror-model').ResolvedPos>} resolvedPositions
 * @return {Array<Y.RelativePosition | null>}
 */
export const resolvedPositionsToRelativePositions = (view, resolvedPositions) =>
  mapResolvedPositionsToRelativePositions(view.state, resolvedPositions)

/**
 * Maps a single Prosemirror resolved position to a {@link Y.RelativePosition} through
 * the live binding transformer. Returns `null` when the position cannot be anchored.
 * See {@link resolvedPositionsToRelativePositions}.
 *
 * @param {import('prosemirror-view').EditorView} view
 * @param {import('prosemirror-model').ResolvedPos} resolvedPos
 * @return {Y.RelativePosition | null}
 */
export const resolvedPositionToRelativePosition = (view, resolvedPos) =>
  resolvedPositionsToRelativePositions(view, [resolvedPos])[0]

/**
 * Maps a single {@link Y.RelativePosition} to a Prosemirror resolved position through
 * the live binding transformer. Returns `null` when the position cannot be resolved.
 * See {@link relativePositionsToResolvedPositions}.
 *
 * @param {import('prosemirror-view').EditorView} view
 * @param {Y.RelativePosition | null} rpos
 * @return {import('prosemirror-model').ResolvedPos | null}
 */
export const relativePositionToResolvedPosition = (view, rpos) =>
  relativePositionsToResolvedPositions(view, [rpos])[0]

/**
 * Keeps track of a position across document changes: encodes `resolvedPos` as a
 * {@link Y.RelativePosition} and returns a function that resolves it in the view's
 * (possibly changed) current document - pass another editor's view to restore the
 * position there. Returns `null` when the position cannot be anchored in the Y tree;
 * the restore function returns `null` when the position can no longer be resolved.
 * Never throws.
 *
 * @param {import('prosemirror-view').EditorView} view
 * @param {import('prosemirror-model').ResolvedPos} resolvedPos
 * @returns {null | ((view: import('prosemirror-view').EditorView) => import('prosemirror-model').ResolvedPos | null)}
 */
export const relativePositionStore = (view, resolvedPos) => {
  const relPos = resolvedPositionsToRelativePositions(view, [resolvedPos])[0]
  if (relPos == null) {
    return null
  }
  return (view) => relativePositionsToResolvedPositions(view, [relPos])[0]
}

/**
 * @callback CaptureMapping
 * @param {import('prosemirror-state').EditorState} state Editor state used to resolve and encode positions
 * @param {boolean} [clear] If true, clears all previously stored positions and captures fresh values for the mapping
 * @returns {import('prosemirror-transform').Mappable}
 */

/**
 * @callback RestoreMapping
 * @param {import('prosemirror-state').EditorState} state Editor state to resolve the stored positions in
 * @returns {import('prosemirror-transform').Mappable}
 */

/**
 * Creates a pair of Mappable-compatible objects for capturing and restoring positions
 * via Y.js relative positions. Designed to work with ProseMirror's SelectionBookmark.map().
 * Unlike the view-based utilities this is transaction-time machinery and takes editor
 * *states*: the undo plugin captures bookmarks inside its plugin `apply`, where no view
 * exists. Also unlike the other position utilities, the restore mapping throws when a
 * position was never captured or can no longer be resolved - PM's `Mappable` contract
 * is number-based and has no null channel, so callers treat a throw as "skip
 * restoration".
 *
 * @returns {{captureMapping: CaptureMapping, restoreMapping: RestoreMapping}}
 */
export const relativePositionStoreMapping = () => {
  /**
   * @type {Map<number, Y.RelativePosition>}
   */
  const positionMapping = new Map()

  return {
    captureMapping: (state, clear = false) => {
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
          const relPos = mapResolvedPositionsToRelativePositions(state, [state.doc.resolve(pos)])[0]
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
    restoreMapping (state) {
      return {
        map (pos) {
          const relPos = positionMapping.get(pos)
          if (!relPos) {
            throw new Error('Relative position not set')
          }
          const resolved = mapRelativePositionsToResolvedPositions(state, [relPos])[0]
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
