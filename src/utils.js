import * as rabin from 'lib0/hash/rabin'
import * as buf from 'lib0/buffer'

/**
 * Compact, stable base64 tag of an arbitrary json-serializable value. It only
 * needs to disambiguate overlapping marks of the same type (see `markToYattrName`
 * in sync-utils.js), not resist attacks, so a cheap Rabin fingerprint is plenty.
 *
 * We use the *full* 4-byte (degree-32) fingerprint rather than truncating a
 * wider one: a Rabin fingerprint propagates small input changes into its
 * low-order bytes, so slicing the leading bytes off a degree-64 fingerprint
 * collides for near-identical inputs (e.g. `{id:4}` vs `{id:5}`). The 4 bytes
 * encode to 8 base64 chars - the length `hashedMarkNameRegex` expects - so
 * keys written by older (sha256-based) versions still parse. Keys are
 * recomputed on every canonical render, though, so the first bind of such a
 * document re-keys its overlapping marks once (pinned in
 * tests/v1-compat.test.js, see CAVEATS.md).
 *
 * @param {any} json
 * @return {string}
 */
export const hashOfJSON = (json) => buf.toBase64(rabin.fingerprint(rabin.StandardIrreducible32, buf.encodeAny(json)))
