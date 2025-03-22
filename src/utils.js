import * as sha256 from 'lib0/hash/sha256'
import * as buf from 'lib0/buffer'

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
