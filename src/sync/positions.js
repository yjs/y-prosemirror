import * as Y from '@y/y'

/**
 * Transforms a Prosemirror based absolute position to a {@link Y.RelativePosition}.
 *
 * @param {number} pos
 * @param {Y.XmlFragment} type
 * @param {import('prosemirror-model').Node} pmDoc
 * @param {Y.AbstractAttributionManager} [am]
 * @return {Y.RelativePosition} relative position
 */
export const absolutePositionToRelativePosition = (pos, type, pmDoc, am = Y.noAttributionsManager) => {
  if (pos === 0) {
    // if the type is later populated, we want to retain the 0 position (hence assoc=-1)
    return Y.createRelativePositionFromTypeIndex(type, 0, type.length === 0 ? -1 : 0, am)
  }
  const resolvedPos = pmDoc.resolve(pos)
  const depth = resolvedPos.depth
  // Navigate through the Y.js structure using the path from ResolvedPos
  let currentYType = type
  for (let d = 0; d < depth; d++) {
    const childIndex = resolvedPos.index(d)
    currentYType = currentYType.get(childIndex, am) // @todo get method should support attribution manager
  }
  // Use the parent offset as the position within the target Y.js type
  const offset = resolvedPos.parentOffset

  return Y.createRelativePositionFromTypeIndex(currentYType, offset,
    // If we are at the end of a type, then we want to be associated to the end of the type
    offset > 0 && offset === currentYType.length ? -1 : 0, am)
}

/**
 * Transforms a {@link Y.RelativePosition} to a Prosemirror based absolute position.
 * @param {Y.RelativePosition} relPos Encoded Yjs based relative position
 * @param {Y.XmlFragment} documentType Top level type that is bound to pView
 * @param {import('prosemirror-model').Node} pmDoc
 * @param {Y.AbstractAttributionManager} [am]
 * @return {null|number} Prosemirror based absolute position
 */
export const relativePositionToAbsolutePosition = (relPos, documentType, pmDoc, am = Y.noAttributionsManager) => {
  // (1) decodedPos.index is the absolute position starting at the referred  prosemirror node.
  const decodedPos = Y.createAbsolutePositionFromRelativePosition(relPos, documentType.doc, undefined, am)
  if (decodedPos === null || (decodedPos.type !== documentType && !Y.isParentOf(documentType, decodedPos.type._item))) {
    return null
  }
  /*
   * Now, we need to compute the nested position.
   * - Compute the path of the targeted type Y.getPathTo(decodedPos.type).
   * - (2) Use that path to calculate the absolute prosemirror position based on the prosemirror state.
   * result = (1) + (2)
   */
  const path = Y.getPathTo(documentType, decodedPos.type)
  // TODO what if the ytype is a grandchild of the documentType? I think this assumes a direct child relationship
  let pos = 1 // Start inside the document
  let currentNode = pmDoc
  // Traverse the path to find the nested position
  for (let i = 0; i < path.length; i++) {
    const childIndex = path[i]
    // Add sizes of all previous siblings
    for (let j = 0; j < childIndex; j++) {
      pos += currentNode.child(j).nodeSize
    }
    // enter node
    pos += 1
    currentNode = currentNode.child(childIndex)
  }
  // Add the offset within the target node
  return pos + decodedPos.index
}

/**
 * Creates a function that can be used to keep track of an absolute position of a Prosemirror document, and restore it to an absolute position in a different Prosemirror document.
 * @param {number} pos Absolute position in the Prosemirror document
 * @param {Y.XmlFragment} type Top level type that is bound to pView
 * @param {import('prosemirror-model').Node} pmDoc Prosemirror document
 * @param {Y.AbstractAttributionManager} [am] Attribution manager to use for the relative position
 * @returns {(doc: import('prosemirror-model').Node, documentType?: Y.XmlFragment, attributionManager?: Y.AbstractAttributionManager) => number}
 */
export const relativePositionStore = (pos, type, pmDoc, am) => {
  const relPos = absolutePositionToRelativePosition(pos, type, pmDoc, am)

  return (doc, documentType = type, attributionManager) => {
    return relativePositionToAbsolutePosition(relPos, documentType, doc, attributionManager)
  }
}

/**
 *
 * @param {Y.XmlFragment} type
 * @param {import('prosemirror-model').Node} pmDoc
 * @param {Y.AbstractAttributionManager} [am]
 * @returns {{captureMapping: import('prosemirror-transform').Mappable, restoreMapping: (type: Y.XmlFragment, pmDoc: import('prosemirror-model').Node, am?: Y.AbstractAttributionManager) => import('prosemirror-transform').Mappable}}
 */
export const relativePositionStoreMapping = (type, pmDoc, am) => {
  /**
   * @type {Map<number, Y.RelativePosition>}
   */
  const positionMapping = new Map()

  return {
    captureMapping: (clear = false) => {
      if (clear) {
        positionMapping.clear()
      }
      return {
        map (pos) {
          // Store the relative position using the position as the key
          positionMapping.set(pos, absolutePositionToRelativePosition(pos, type, pmDoc, am))

          // Pass through the position unchanged, since we are just using it to store the relative position
          return pos
        },
        mapResult (pos) {
          // Call the map function to store the relative position
          return { pos: this.map(pos), deleted: false, deletedAcross: false, deletedAfter: false, deletedBefore: false }
        }
      }
    },
    restoreMapping (type, pmDoc, am) {
      return {
        map (pos) {
          const relPos = positionMapping.get(pos)
          if (!relPos) {
            throw new Error('Relative position not set')
          }
          return relativePositionToAbsolutePosition(relPos, type, pmDoc, am)
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
