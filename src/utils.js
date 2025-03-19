import * as sha256 from 'lib0/hash/sha256'
import * as buf from 'lib0/buffer'

/**
 * @param {any} json
 */
export const hashOfJSON = (json) => buf.toBase64(sha256.digest(buf.encodeAny(json)))

