/* eslint-env browser */

/**
 * Palette of ~10 user colors. Picked so that initials in white render legibly
 * on the solid swatch and so that the same colors at ~22% alpha still read as
 * a tint on a white background.
 */
export const palette = [
  '#6c5ce7', // violet
  '#e17055', // burnt orange
  '#0984e3', // blue
  '#00b894', // emerald
  '#d63031', // red
  '#f0a93b', // amber
  '#e84393', // pink
  '#00cec9', // teal
  '#6ab04c', // grass
  '#a55eea' //  purple
]

/**
 * Stable string hash → palette index.
 * @param {string} id
 * @returns {number}
 */
const hashIndex = (id) => {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0
  }
  return Math.abs(h) % palette.length
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
