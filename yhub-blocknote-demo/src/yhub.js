/* eslint-env browser */
import * as Y from '@y/y'
import { mapAttributionToMark } from '@blocknote/core/y'
import { configureYProsemirror, ySyncPluginKey } from '@y/prosemirror'
import { attributionMapperToConf, deltaAttributionToFormat, deltaToPNode } from '../../src/sync-utils.js'
import * as delta from 'lib0/delta'
import { WebsocketProvider } from '@y/websocket'
import * as random from 'lib0/random'
import * as buffer from 'lib0/buffer'

/**
 * Walk a delta and log its shape. Helps detect cases where iteration
 * via `.children.map` differs from what the toJSON output suggests.
 * @param {any} d
 * @param {string} indent
 */
function debugWalk (d, indent = '') {
  console.log(indent + 'delta name=' + (d.name ?? '<no-name>') + ' children.len=' + (d.children?.len ?? '?'))
  let i = 0
  d.children?.forEach((c) => {
    const isInsert = delta.$insertOp.check(c)
    const isText = delta.$textOp.check(c)
    const insertLen = isInsert ? (Array.isArray(c.insert) ? c.insert.length : 'NOT-ARRAY:' + typeof c.insert) : null
    console.log(indent + '  child[' + i + '] type=' + (c.type ?? '?') +
      ' $insertOp=' + isInsert + ' $textOp=' + isText +
      (isInsert ? ' insert.length=' + insertLen : '') +
      (isText ? ' text=' + JSON.stringify(c.insert) : ''))
    if (isInsert && Array.isArray(c.insert)) {
      c.insert.forEach((cn, j) => {
        if (cn && cn.children) {
          debugWalk(cn, indent + '    [' + j + '] ')
        } else {
          console.log(indent + '    [' + j + '] non-delta:', cn)
        }
      })
    }
    i++
  })
}

const usercolors = [
  { color: '#30bced', light: '#30bced33' },
  { color: '#6eeb83', light: '#6eeb8333' },
  { color: '#ffbc42', light: '#ffbc4233' },
  { color: '#ee6352', light: '#ee635233' },
  { color: '#9ac2c9', light: '#9ac2c933' },
  { color: '#8acb88', light: '#8acb8833' },
  { color: '#1be7ff', light: '#1be7ff33' }
]

/**
 * BlockNote now maintains the attribution mapper alongside its
 * `y-attributed-*` mark schema (both live in `@blocknote/core/y`), so the
 * mapper and the mark attrs stay in lockstep by construction. The marks
 * themselves are registered on the editor via `YAttributionMarksExtension`
 * (see Editor.jsx).
 */
export { mapAttributionToMark }

const userColor = usercolors[random.uint32() % usercolors.length]
const org = 'yhub-blocknote-demo'

let roomName = location.hash.slice(1)
if (!roomName) {
  roomName = random.uint32().toString(16).padStart(6, '0').slice(0, 6)
  location.hash = roomName
}
const docid = roomName

const yhubApiUrl = 'https://yhub-standalone-x9kss.ondigitalocean.app'

const ydoc = new Y.Doc()
const wsUrl = yhubApiUrl + '/api/ws/v1/' + org
const provider = new WebsocketProvider(wsUrl, docid, ydoc, { params: { gc: false } })
const yxmlFragment = ydoc.get('blocknote')

provider.awareness.setLocalStateField('user', {
  name: 'User ' + Math.floor(Math.random() * 100),
  color: userColor.color,
  colorLight: userColor.light
})

const suggestionDoc = new Y.Doc({ gc: false, isSuggestionDoc: true })
const suggestionProvider = new WebsocketProvider(wsUrl, docid + '--suggestions', suggestionDoc, { params: { gc: false } })
let suggestionOtherClientID = random.uint53()

console.log({ suggestionDoc, suggestionProvider })

const suggestionRenderer = Y.createDiffRenderer(ydoc, suggestionDoc, { attributions: Y.createContentMap() })

const elemSelectSuggestionMode = /** @type {HTMLSelectElement} */ (document.querySelector('#select-suggestion-mode'))
const btnAcceptChanges = /** @type {HTMLButtonElement} */ (document.querySelector('#btn-accept-changes'))
const btnRejectChanges = /** @type {HTMLButtonElement} */ (document.querySelector('#btn-reject-changes'))
const btnAcceptAll = /** @type {HTMLButtonElement} */ (document.querySelector('#btn-accept-all'))
const btnRejectAll = /** @type {HTMLButtonElement} */ (document.querySelector('#btn-reject-all'))

let previousMode = 'off'

/** @type {import('prosemirror-view').EditorView | null} */
let currentView = null
let isViewingVersion = false

const updateSuggestionButtons = () => {
  const mode = elemSelectSuggestionMode.value
  const show = mode === 'view' || mode === 'edit'
  btnAcceptChanges.style.display = show ? 'inline-block' : 'none'
  btnRejectChanges.style.display = show ? 'inline-block' : 'none'
  btnAcceptAll.style.display = show ? 'inline-block' : 'none'
  btnRejectAll.style.display = show ? 'inline-block' : 'none'
}

elemSelectSuggestionMode.addEventListener('change', () => {
  const mode = elemSelectSuggestionMode.value
  if (!currentView) return

  if (mode === 'edit' && previousMode !== 'edit') {
    const nextClientId = suggestionOtherClientID
    suggestionOtherClientID = suggestionDoc.clientID
    suggestionDoc.clientID = nextClientId
    provider.awareness.setLocalStateField('user', {
      name: 'Suggesting ' + Math.floor(Math.random() * 100),
      color: userColor.color,
      colorLight: userColor.light
    })
  }

  if (mode === 'off') {
    configureYProsemirror({
      ytype: yxmlFragment,
      renderer: null
    })(currentView.state, currentView.dispatch)
  } else {
    suggestionRenderer.suggestionMode = mode === 'edit'
    const ytype = suggestionDoc.get('blocknote')
    try {
      const rawDelta = ytype.toDeltaDeep({ renderer: suggestionRenderer })
      console.log('[debug] === walking RAW delta ===')
      debugWalk(rawDelta)
      const ycontent = deltaAttributionToFormat(rawDelta, attributionMapperToConf(mapAttributionToMark))
      console.log('[debug] === walking FORMATTED delta ===')
      debugWalk(ycontent)
      const node = deltaToPNode(ycontent, currentView.state.schema, null)
      console.log('[debug] deltaToPNode produced:\n' + JSON.stringify(node.toJSON(), null, 2))
    } catch (e) {
      console.error('[debug] error preparing diagnostic node:', e)
    }
    configureYProsemirror({
      ytype,
      renderer: suggestionRenderer
    })(currentView.state, currentView.dispatch)
  }
  previousMode = mode
  updateSuggestionButtons()
})

btnAcceptChanges.addEventListener('click', () => {
  if (!currentView) return
  const pluginState = ySyncPluginKey.getState(currentView.state)
  if (!pluginState) return
  const { from, to } = currentView.state.selection
  try {
    /** @type {any} */ (pluginState).acceptChanges(from, to)
  } catch (e) {
    console.error('Error accepting changes:', e)
  }
})

btnRejectChanges.addEventListener('click', () => {
  if (!currentView) return
  const pluginState = ySyncPluginKey.getState(currentView.state)
  if (!pluginState) return
  const { from, to } = currentView.state.selection
  try {
    /** @type {any} */ (pluginState).rejectChanges(from, to)
  } catch (e) {
    console.error('Error rejecting changes:', e)
  }
})

btnAcceptAll.addEventListener('click', () => {
  if (!currentView) return
  const pluginState = ySyncPluginKey.getState(currentView.state)
  if (!pluginState) return
  try {
    /** @type {any} */ (pluginState).acceptAllChanges()
  } catch (e) {
    console.error('Error accepting all changes:', e)
  }
})

btnRejectAll.addEventListener('click', () => {
  if (!currentView) return
  const pluginState = ySyncPluginKey.getState(currentView.state)
  if (!pluginState) return
  try {
    /** @type {any} */ (pluginState).rejectAllChanges()
  } catch (e) {
    console.error('Error rejecting all changes:', e)
  }
})

const initLiveEditor = () => {
  if (!currentView) return
  isViewingVersion = false
  const mode = elemSelectSuggestionMode.value
  if (mode === 'off') {
    configureYProsemirror({
      ytype: yxmlFragment,
      renderer: null
    })(currentView.state, currentView.dispatch)
  } else {
    suggestionRenderer.suggestionMode = mode === 'edit'
    configureYProsemirror({
      ytype: suggestionDoc.get('blocknote'),
      renderer: suggestionRenderer
    })(currentView.state, currentView.dispatch)
  }
  if (versionDoc !== null) {
    versionDoc.destroy()
    versionDoc = null
  }
  updateSuggestionButtons()
}

/**
 * The doc currently shown in version-diff view; destroyed when the view is
 * replaced or closed.
 * @type {Y.Doc | null}
 */
let versionDoc = null

/**
 * Renders a historical diff from a /changeset response: `doc` is the document
 * as it was at the range's `to` (partially gc'd, deletes in range restorable),
 * so overlaying the `attributions` alone renders the diff. The attributions
 * carry who/when authored each change, so downstream mark tooltips show real
 * users and timestamps.
 * @param {Y.Doc} doc
 * @param {Y.ContentMap} attributions
 */
const initVersionDiffEditor = (doc, attributions) => {
  if (!currentView) return
  isViewingVersion = true
  const renderer = Y.createAttributionsRenderer(attributions)
  configureYProsemirror({
    ytype: doc.get('blocknote'),
    renderer
  })(currentView.state, currentView.dispatch)
  if (versionDoc !== null) versionDoc.destroy()
  versionDoc = doc
}

const statusEl = /** @type {HTMLElement} */ (document.querySelector('#status'))
provider.on('status', (/** @type {{ status: string }} */ event) => {
  statusEl.textContent = event.status
  statusEl.className = 'status ' + event.status
})

const openTabBtn = document.createElement('button')
openTabBtn.textContent = 'Open in another tab'
openTabBtn.style.cssText = 'padding:4px 10px;font-size:12px;font-weight:500;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;background:white;'
openTabBtn.addEventListener('click', () => { window.open(location.href, '_blank') })
const headerRight = /** @type {HTMLElement} */ (document.querySelector('.header-right'))
headerRight.insertBefore(openTabBtn, headerRight.firstChild)

const activityListEl = /** @type {HTMLElement} */ (document.querySelector('#activity-list'))
const rollbackBtn = /** @type {HTMLButtonElement} */ (document.querySelector('#rollback-btn'))

/** @type {Array<{ from: number, to: number, by: string, delta?: any, customAttributions?: any[] }>} */
let activityData = []

/** @type {number | null} */
let selectionStart = null
/** @type {number | null} */
let selectionEnd = null
let isSelecting = false

/** @param {number} ts */
const formatTime = (ts) => {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/**
 * @param {any} d
 * @returns {{ inserted: number, deleted: number }}
 */
const countDelta = (d) => {
  let inserted = 0
  let deleted = 0
  // The delta is the whole document as a nested tree (yhub >= 0.3): the
  // entry's changes are insert ops carrying attribution metadata (deleted
  // content shows up as inserts attributed `delete`), nested arbitrarily
  // deep inside block nodes. Walk recursively and count attributed chars.
  /** @param {any} delta */
  const walk = (delta) => {
    for (const op of delta?.children ?? []) {
      if (op.insert == null) continue
      if (op.attribution?.insert != null) {
        inserted += op.insert.length
      } else if (op.attribution?.delete != null) {
        deleted += op.insert.length
      }
      if (Array.isArray(op.insert)) op.insert.forEach(walk)
    }
  }
  walk(d)
  return { inserted, deleted }
}

/**
 * @param {any} act
 * @param {number} index
 * @returns {HTMLElement}
 */
const renderActivityItem = (act, index) => {
  const div = document.createElement('div')
  div.className = 'activity-item'
  div.dataset.index = String(index)

  if (selectionStart !== null && selectionEnd !== null) {
    const minIdx = Math.min(selectionStart, selectionEnd)
    const maxIdx = Math.max(selectionStart, selectionEnd)
    if (index >= minIdx && index <= maxIdx) {
      div.classList.add('selected')
    }
  }

  const meta = document.createElement('div')
  meta.className = 'activity-meta'

  const user = document.createElement('span')
  user.className = 'activity-user'
  user.textContent = act.by || 'unknown'
  meta.appendChild(user)

  const time = document.createElement('span')
  time.className = 'activity-time'
  time.textContent = formatTime(act.from)
  meta.appendChild(time)

  div.appendChild(meta)

  if (act.delta) {
    const { inserted, deleted } = countDelta(act.delta)
    const deltaEl = document.createElement('div')
    deltaEl.className = 'activity-delta'
    if (inserted > 0) {
      const ins = document.createElement('span')
      ins.className = 'delta-insert'
      ins.textContent = '+' + inserted
      deltaEl.appendChild(ins)
    }
    if (inserted > 0 && deleted > 0) {
      deltaEl.appendChild(document.createTextNode(' '))
    }
    if (deleted > 0) {
      const del = document.createElement('span')
      del.className = 'delta-delete'
      del.textContent = '-' + deleted
      deltaEl.appendChild(del)
    }
    if (inserted === 0 && deleted === 0) {
      deltaEl.textContent = '(no changes)'
    }
    div.appendChild(deltaEl)
  }

  if (act.customAttributions) {
    const promptAttr = act.customAttributions.find(/** @param {any} a */ a => a.k === 'prompt')
    if (promptAttr) {
      const promptEl = document.createElement('div')
      promptEl.className = 'activity-prompt'
      promptEl.textContent = promptAttr.v
      div.appendChild(promptEl)
    }
    const rollbackAttrs = act.customAttributions.filter(/** @param {any} a */ a => a.k === 'rollback')
    if (rollbackAttrs.length > 0) {
      const rollbackEl = document.createElement('div')
      rollbackEl.className = 'activity-rollback'
      const prompts = rollbackAttrs.filter(/** @param {any} a */ a => a.v !== 'true').map(/** @param {any} a */ a => a.v)
      rollbackEl.textContent = prompts.length > 0 ? 'Rollback: ' + prompts.join(', ') : 'Rollback'
      div.appendChild(rollbackEl)
    }
  }

  return div
}

const renderActivityList = () => {
  activityListEl.innerHTML = ''
  if (activityData.length === 0) {
    activityListEl.innerHTML = '<div class="activity-empty">No activity yet</div>'
    return
  }
  for (let i = 0; i < activityData.length; i++) {
    activityListEl.appendChild(renderActivityItem(activityData[i], i))
  }
  rollbackBtn.style.display = (selectionStart !== null && selectionEnd !== null) ? 'inline-block' : 'none'
}

const fetchActivity = async () => {
  try {
    const response = await fetch(`${yhubApiUrl}/api/activity/v1/${org}/${docid}?delta=true&order=desc&limit=50&customAttributions=true&group=true`)
    if (!response.ok) return
    const arrayBuffer = await response.arrayBuffer()
    // /activity responds with `{ activity, ydoc? }` (yhub >= 0.3)
    const data = buffer.decodeAny(new Uint8Array(arrayBuffer))
    if (!Array.isArray(data?.activity)) return
    activityData = data.activity
    renderActivityList()
  } catch (e) {
    console.error('Failed to fetch activity:', e)
  }
}

/**
 * @param {HTMLElement} target
 * @returns {number | null}
 */
const getItemIndex = (target) => {
  const item = target.closest('.activity-item')
  if (!item || !(item instanceof HTMLElement)) return null
  const idx = item.dataset.index
  return idx != null ? parseInt(idx, 10) : null
}

/**
 * @param {number} from
 * @param {number} to
 */
const renderVersions = async (from, to) => {
  try {
    const response = await fetch(`${yhubApiUrl}/api/changeset/v1/${org}/${docid}?from=${from}&to=${to}&ydoc=true&attributions=true`)
    if (!response.ok) return
    const arrayBuffer = await response.arrayBuffer()
    // /changeset responds with `{ ydoc?, attributions?, delta? }` (yhub >= 0.3):
    // a single doc at `to` plus the attributions to overlay, instead of the
    // old `{ prevDoc, nextDoc }` pair.
    const history = buffer.decodeAny(new Uint8Array(arrayBuffer))
    // gc must stay off so deleted content in the diff range can be rendered
    const doc = new Y.Doc({ gc: false })
    Y.applyUpdate(doc, history.ydoc)
    const attrs = Y.decodeContentMap(history.attributions)
    initVersionDiffEditor(doc, attrs)
  } catch (e) {
    console.error('Failed to fetch changeset:', e)
  }
}

const exitVersionView = () => {
  selectionStart = null
  selectionEnd = null
  renderActivityList()
  initLiveEditor()
}

activityListEl.addEventListener('mousedown', (e) => {
  const idx = getItemIndex(/** @type {HTMLElement} */ (e.target))
  if (idx === null) return
  if (isViewingVersion && selectionStart !== null && selectionEnd !== null) {
    const minIdx = Math.min(selectionStart, selectionEnd)
    const maxIdx = Math.max(selectionStart, selectionEnd)
    if (idx >= minIdx && idx <= maxIdx) {
      exitVersionView()
      e.preventDefault()
      return
    }
  }
  isSelecting = true
  selectionStart = idx
  selectionEnd = idx
  renderActivityList()
  e.preventDefault()
})

activityListEl.addEventListener('mousemove', (e) => {
  if (!isSelecting) return
  const idx = getItemIndex(/** @type {HTMLElement} */ (e.target))
  if (idx === null) return
  selectionEnd = idx
  renderActivityList()
})

document.addEventListener('mouseup', () => {
  if (isSelecting && selectionStart !== null && selectionEnd !== null) {
    isSelecting = false
    const minIdx = Math.min(selectionStart, selectionEnd)
    const maxIdx = Math.max(selectionStart, selectionEnd)
    const from = activityData[maxIdx].from
    const to = activityData[minIdx].to
    renderVersions(from, to)
  }
  isSelecting = false
})

const rollback = async () => {
  if (selectionStart === null || selectionEnd === null) return
  const minIdx = Math.min(selectionStart, selectionEnd)
  const maxIdx = Math.max(selectionStart, selectionEnd)
  const from = activityData[maxIdx].from
  const to = activityData[minIdx].to
  /** @type {Array<{ k: string, v: string }>} */
  const customAttributions = [{ k: 'rollback', v: 'true' }]
  for (let i = minIdx; i <= maxIdx; i++) {
    const act = activityData[i]
    if (act.customAttributions) {
      const promptAttr = act.customAttributions.find(/** @param {any} a */ a => a.k === 'prompt')
      if (promptAttr) {
        customAttributions.push({ k: 'rollback', v: promptAttr.v })
      }
    }
  }
  try {
    const response = await fetch(`${yhubApiUrl}/api/rollback/v1/${org}/${docid}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      // @ts-ignore
      body: buffer.encodeAny({ from, to, customAttributions })
    })
    if (response.ok) {
      console.log('Rollback successful')
      exitVersionView()
      fetchActivity()
    } else {
      console.error('Rollback failed:', await response.text())
    }
  } catch (e) {
    console.error('Failed to rollback:', e)
  }
}

rollbackBtn.addEventListener('click', rollback)

fetchActivity()
setInterval(fetchActivity, 5000)

export const yhub = {
  ydoc,
  provider,
  yxmlFragment,
  /** @param {import('prosemirror-view').EditorView} view */
  attachView (view) {
    currentView = view
    initLiveEditor()
  },
  detachView () {
    currentView = null
  }
}
