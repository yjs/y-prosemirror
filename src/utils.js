import * as sha256 from 'lib0/hash/sha256'
import * as buf from 'lib0/buffer'
import * as Y from '@y/y'

/**
 * Custom function to transform sha256 hash to N byte
 *
 * @param {Uint8Array} digest
 */
const _convolute = digest => {
  const N = 6
  for (let i = N; i < digest.length; i++) {
    digest[i % N] = digest[i % N] ^ digest[i]
  }
  return digest.slice(0, N)
}

/**
 * @param {any} json
 */
export const hashOfJSON = (json) => buf.toBase64(_convolute(sha256.digest(buf.encodeAny(json))))

/**
 * To find a fragment in another ydoc, we need to search for it.
 *
 * @template {Y.AbstractType<any>} T
 * @param {T} ytype - The Yjs type to locate (should extend Y.AbstractType)
 * @param {Y.Doc} otherYdoc - The target Y.Doc in which to find the equivalent type
 * @returns {T} - The corresponding type instance in the other Yjs document
 * @throws {Error} If ytype does not have a ydoc or can't be found in the other doc
 */
export function findTypeInOtherYdoc (ytype, otherYdoc) {
  if (ytype.doc === otherYdoc) {
    // fast-path, this is the same ydoc
    return ytype
  }
  const ydoc = ytype.doc
  if (!ydoc) {
    throw new Error('type does not have a ydoc')
  }
  if (ytype._item === null) {
    // Root type case: find key in ydoc.share that matches ytype, then get from otherYdoc
    const rootKey = Array.from(ydoc.share.keys()).find(
      function (key) { return ydoc.share.get(key) === ytype }
    )
    if (rootKey == null) {
      throw new Error('type does not exist')
    }
    // Use the ytype's constructor to get the type from the other document
    return /** @type {T} */ (otherYdoc.get(rootKey, ytype.constructor))
  } else {
    // Subtype case: locate by item id via internals
    const ytypeItem = ytype._item
    const otherStructs = otherYdoc.store.clients.get(ytypeItem.id.client) || []
    const itemIndex = Y.findIndexSS(otherStructs, ytypeItem.id.clock)
    const otherItem = /** @type {Y.Item|undefined} */ (otherStructs[itemIndex])
    if (!otherItem) {
      throw new Error('type does not exist in other ydoc')
    }
    const otherContent = /** @type {Y.ContentType|undefined} */ (otherItem.content)
    if (!otherContent) {
      throw new Error('type does not exist in other ydoc')
    }
    return /** @type {T} */ (otherContent.type)
  }
}
