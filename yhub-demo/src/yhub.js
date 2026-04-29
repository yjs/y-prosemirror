import * as buffer from 'lib0/buffer'

const params = new URLSearchParams(window.location.search)
export const yhubApiUrl =
  params.get('yhub') || 'https://yhub-standalone-x9kss.ondigitalocean.app'
export const org = 'yhub-pro-demo'
export const wsUrl = yhubApiUrl + '/ws/' + org

// yhub's WebSocket endpoint accepts `customAttributions` as a comma-separated
// `key:value` string query param. Every update that flows through that
// connection gets tagged with those attributions server-side (see yhub API.md
// > WebSocket). The public standalone yhub instance uses open auth, so the
// per-user `by` field from the auth plugin is not available — we instead tag
// each edit with `user:<id>` and read it back on the client.
//
// Returns a params object suitable for `new WebsocketProvider(..., { params })`.
// Callers merge their own params (e.g. `gc: 'false'`) on top.
export const wsParamsForUser = (user, extra = {}) => {
  const out = { ...extra }
  if (user?.id) {
    out.customAttributions = 'user:' + user.id
  }
  return out
}

// Extract the user id that was attached to an activity entry via the WS
// `customAttributions` query param. Falls back to `null` if not present.
export const userIdFromActivity = (act) => {
  if (!Array.isArray(act?.customAttributions)) return null
  const hit = act.customAttributions.find((a) => a.k === 'user')
  return hit ? hit.v : null
}

export const getActivity = async (docid) => {
  const url = `${yhubApiUrl}/activity/${org}/${encodeURIComponent(docid)}?delta=true&order=desc&limit=50&customAttributions=true&group=true`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`getActivity failed: ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  const data = buffer.decodeAny(bytes)
  return Array.isArray(data) ? data : []
}

export const getChangeset = async (docid, from, to) => {
  const url = `${yhubApiUrl}/changeset/${org}/${encodeURIComponent(docid)}?from=${from}&to=${to}&ydoc=true&attributions=true`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`getChangeset failed: ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  return buffer.decodeAny(bytes)
}

export const postRollback = async (docid, from, to, customAttributions) => {
  const body = buffer.encodeAny({ from, to, customAttributions })
  const res = await fetch(`${yhubApiUrl}/rollback/${org}/${encodeURIComponent(docid)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body
  })
  if (!res.ok) throw new Error(`postRollback failed: ${res.status} ${await res.text()}`)
}
