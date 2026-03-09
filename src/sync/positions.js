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
 * @param {Y.Doc} y
 * @param {Y.XmlFragment} documentType Top level type that is bound to pView
 * @param {Y.RelativePosition} relPos Encoded Yjs based relative position
 * @param {import('prosemirror-model').Node} pmDoc
 * @return {null|number} Prosemirror based absolute position
 */
export const relativePositionToAbsolutePosition = (y, documentType, relPos, pmDoc) => {
  // (1) decodedPos.index is the absolute position starting at the referred  prosemirror node.
  const decodedPos = Y.createAbsolutePositionFromRelativePosition(relPos, y)
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
