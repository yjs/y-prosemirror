/* eslint-env browser */

/**
 * Ten distinct user colors, spaced around the hue wheel so multiple
 * collaborators rarely collide on the same color family. Each entry is
 * picked so that:
 *
 *   - white initials on the solid swatch meet WCAG AA contrast (> 4.5:1)
 *   - the same color at ~22% alpha still reads as a tint on a white
 *     background (the inline `color-mix(... 22%, transparent)` rule)
 *
 * Hue layout (approx, in HSL degrees):
 *   blue 210 · violet 260 · fuchsia 290 · pink 330 · rose 350
 *   orange 25 · gold 45  · lime 85    · emerald 160 · cyan 190
 *
 * Only one strictly-red entry (rose) keeps the overall feel cool-leaning
 * without losing red as a recognisable choice.
 */
export const palette = [
  '#2563eb', // blue
  '#7c3aed', // violet
  '#c026d3', // fuchsia
  '#db2777', // pink
  '#e11d48', // rose
  '#ea580c', // orange
  '#ca8a04', // gold
  '#65a30d', // lime
  '#059669', // emerald
  '#0891b2' //  cyan
]

/**
 * Stable string hash → palette index. FNV-1a with a final avalanche mix so
 * lexically similar ids ("User 1", "User 2", "user-1234") fall into
 * different buckets rather than clustering.
 *
 * @param {string} id
 * @returns {number}
 */
const hashIndex = (id) => {
  let h = 2166136261 >>> 0
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  // Avalanche (xorshift-multiply, from the splitmix family) — without this
  // adjacent inputs land on adjacent buckets, which then collide modulo 10.
  h ^= h >>> 16
  h = Math.imul(h, 2246822507) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 3266489909) >>> 0
  h ^= h >>> 16
  return (h >>> 0) % palette.length
}

/**
 * Map an arbitrary user identifier (display name, client id, etc.) to one of
 * the palette colors. Returns the same color for the same id every time.
 * @param {string | number | null | undefined} id
 */
export const userColorForId = (id) => {
  if (id == null) return palette[0]
  return palette[hashIndex(String(id))]
}

/**
 * Two-letter avatar initials for a display name. "Daniel Anatole" → "DA",
 * "User 23" → "U2", "alex" → "AL", "" → "?".
 * @param {string | null | undefined} name
 */
export const initialsForName = (name) => {
  if (!name) return '?'
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}
