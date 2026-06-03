import { Mark } from '@tiptap/core'
import { userColorForId } from './user-colors.js'

// ── Attribution marks ────────────────────────────────────────────────────────
//
// y-prosemirror surfaces "who changed what" as three ProseMirror marks. The
// names are part of the binding's contract and are NOT configurable — internals
// (the PM->Y strip step, accept/reject) reference them by name. See
// ATTRIBUTION.md / CAVEATS.md ("Attribution mark names are fixed").
//
//   - y-attributed-insert
//   - y-attributed-delete
//   - y-attributed-format
//
// Constraints baked in below (ATTRIBUTION.md §1-4):
//   §1 Use exactly these names.
//   §2 Allow them on every node that holds text. Tiptap's StarterKit nodes do
//      not restrict marks and ship no colliding `insertion`/`deletion` family,
//      so they are accepted everywhere by default — no markSet patching needed.
//      (Exception: `codeBlock` sets `marks: ''`; a suggestion-mode edit inside a
//      code block would throw RangeError. Out of scope for this demo.)
//   §3 The three must not exclude each other -> `excludes: ''` on each, so a span
//      can carry e.g. insert + format simultaneously.
//   §4 The declared attrs must cover EVERYTHING `defaultMapAttributionToMark`
//      emits, each with an explicit value, or the readback won't match the mapper
//      output and the sync plugin loops. The mark attrs are internal payload (not
//      DOM attributes), hence `rendered: false`; we render the DOM ourselves in
//      renderHTML to paint the per-user color + hover tooltip.

/**
 * Pick the "primary" user id from a userIds array stored on an attribution mark.
 * @param {any} userIds
 * @returns {string | null}
 */
const primaryUserId = (userIds) => {
  if (Array.isArray(userIds) && userIds.length > 0) return String(userIds[0])
  if (typeof userIds === 'string' || typeof userIds === 'number') return String(userIds)
  return null
}

/**
 * Build the `title` tooltip string shown on hover over an attribution mark.
 * @param {string} action - 'Inserted' | 'Deleted' | 'Formatted'
 * @param {string[]|null} userIds
 * @param {number|null} timestamp
 * @returns {string}
 */
const formatAttributionTitle = (action, userIds, timestamp) => {
  const who = userIds && userIds.length > 0 ? userIds.join(', ') : 'unknown'
  const when = timestamp != null
    ? new Date(timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    : 'unknown time'
  return `${action} by ${who} on ${when}`
}

/**
 * DOM attrs that expose the per-user color as a CSS variable the stylesheet
 * picks up, plus the hover tooltip.
 * @param {string | null} uid
 * @param {string} title
 */
const colorAttrs = (uid, title) => {
  if (!uid) return { title }
  return { title, 'data-userid': uid, style: `--user-color: ${userColorForId(uid)}` }
}

/** Insert / delete share the same `{ userIds, timestamp }` attr payload. */
const insertDeleteAttrs = () => ({
  userIds: { default: null, rendered: false },
  timestamp: { default: null, rendered: false }
})

export const AttributedInsert = Mark.create({
  name: 'y-attributed-insert',
  excludes: '',
  inclusive: false,
  addAttributes: insertDeleteAttrs,
  parseHTML () { return [{ tag: 'y-ins' }] },
  renderHTML ({ mark }) {
    const title = formatAttributionTitle('Inserted', mark.attrs.userIds, mark.attrs.timestamp)
    return ['y-ins', colorAttrs(primaryUserId(mark.attrs.userIds), title), 0]
  }
})

export const AttributedDelete = Mark.create({
  name: 'y-attributed-delete',
  excludes: '',
  inclusive: false,
  addAttributes: insertDeleteAttrs,
  parseHTML () { return [{ tag: 'y-del' }] },
  renderHTML ({ mark }) {
    const title = formatAttributionTitle('Deleted', mark.attrs.userIds, mark.attrs.timestamp)
    return ['y-del', colorAttrs(primaryUserId(mark.attrs.userIds), title), 0]
  }
})

export const AttributedFormat = Mark.create({
  name: 'y-attributed-format',
  excludes: '',
  inclusive: false,
  // `defaultMapAttributionToMark` emits userIds + userIdsByAttr + timestamp for
  // format ops. Declare all three (unlike yhub-demo/schema.js which omits
  // `userIds` and so incurs a benign phantom reconcile per keystroke).
  addAttributes () {
    return {
      userIds: { default: null, rendered: false },
      userIdsByAttr: { default: null, rendered: false },
      timestamp: { default: null, rendered: false }
    }
  },
  parseHTML () { return [{ tag: 'y-fmt' }] },
  renderHTML ({ mark }) {
    const byAttr = /** @type {Record<string, string[]>|null} */ (mark.attrs.userIdsByAttr)
    const ids = byAttr ? [...new Set(Object.values(byAttr).flat())] : mark.attrs.userIds
    const title = formatAttributionTitle('Formatted', ids, mark.attrs.timestamp)
    return ['y-fmt', colorAttrs(primaryUserId(ids), title), 0]
  }
})
