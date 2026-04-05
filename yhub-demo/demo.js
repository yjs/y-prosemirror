/* eslint-env browser */
import * as Y from '@y/y'
import { syncPlugin, ySyncPluginKey, configureYProsemirror, defaultMapAttributionToMark } from '../src/index.js'
import { WebsocketProvider } from '@y/websocket'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { exampleSetup } from 'prosemirror-example-setup'
import { schema } from '../demo/schema.js'
import * as random from 'lib0/random'
import * as buffer from 'lib0/buffer'

const usercolors = [
  { color: '#30bced', light: '#30bced33' },
  { color: '#6eeb83', light: '#6eeb8333' },
  { color: '#ffbc42', light: '#ffbc4233' },
  { color: '#ee6352', light: '#ee635233' },
  { color: '#9ac2c9', light: '#9ac2c933' },
  { color: '#8acb88', light: '#8acb8833' },
  { color: '#1be7ff', light: '#1be7ff33' }
]

const userColor = usercolors[random.uint32() % usercolors.length]
const org = 'yhub-pro-demo'
const docid = 'prosemirror-demo3'
const yhubApiUrl = 'https://yhub-standalone-x9kss.ondigitalocean.app' // 'http://localhost:3002'

const ydoc = new Y.Doc()
const wsUrl = yhubApiUrl + '/ws/' + org
const provider = new WebsocketProvider(wsUrl, docid, ydoc)
const yxmlFragment = ydoc.get('prosemirror')

provider.awareness.setLocalStateField('user', {
  name: 'User ' + Math.floor(Math.random() * 100),
  color: userColor.color,
  colorLight: userColor.light
})

const editorParent = /** @type {HTMLElement} */ (document.querySelector('#editor'))

/**
 * @type {EditorView}
 */
const currentView = new EditorView(editorParent, {
  state: EditorState.create({
    schema,
    plugins: /** @type {any[]} */ ([]).concat(
      exampleSetup({ schema, history: false }),
      syncPlugin({ mapAttributionToMark: defaultMapAttributionToMark })
    )
  })
})

/**
 * @type {boolean}
 */
let isViewingVersion = false

// ── Suggestion Mode ──

const suggestionDoc = new Y.Doc({ gc: false, isSuggestionDoc: true })
const suggestionProvider = new WebsocketProvider(wsUrl, docid + '--suggestions', suggestionDoc, { params: { gc: false } })
let suggestionOtherClientID = random.uint53()

console.log({ suggestionDoc, suggestionProvider })

const am = /** @type {any} */ (Y).createAttributionManagerFromDiff(ydoc, suggestionDoc, {
  attrs: [Y.createContentAttribute('insert', ['User'])]
})

const elemSelectSuggestionMode = /** @type {HTMLSelectElement} */ (document.querySelector('#select-suggestion-mode'))
const btnAcceptChanges = /** @type {HTMLButtonElement} */ (document.querySelector('#btn-accept-changes'))
const btnRejectChanges = /** @type {HTMLButtonElement} */ (document.querySelector('#btn-reject-changes'))
const btnAcceptAll = /** @type {HTMLButtonElement} */ (document.querySelector('#btn-accept-all'))
const btnRejectAll = /** @type {HTMLButtonElement} */ (document.querySelector('#btn-reject-all'))

let previousMode = 'off'

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
      attributionManager: null
    })(currentView.state, currentView.dispatch)
  } else {
    am.suggestionMode = mode === 'edit'
    configureYProsemirror({
      ytype: suggestionDoc.get('prosemirror'),
      attributionManager: am
    })(currentView.state, currentView.dispatch)
  }
  previousMode = mode
  updateSuggestionButtons()
})

btnAcceptChanges.addEventListener('click', () => {
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
  const pluginState = ySyncPluginKey.getState(currentView.state)
  if (!pluginState) return
  try {
    /** @type {any} */ (pluginState).acceptAllChanges()
  } catch (e) {
    console.error('Error accepting all changes:', e)
  }
})

btnRejectAll.addEventListener('click', () => {
  const pluginState = ySyncPluginKey.getState(currentView.state)
  if (!pluginState) return
  try {
    /** @type {any} */ (pluginState).rejectAllChanges()
  } catch (e) {
    console.error('Error rejecting all changes:', e)
  }
})

// ── Editor Init ──

const initLiveEditor = () => {
  isViewingVersion = false
  const mode = elemSelectSuggestionMode.value
  if (mode === 'off') {
    configureYProsemirror({
      ytype: yxmlFragment,
      attributionManager: null
    })(currentView.state, currentView.dispatch)
  } else {
    am.suggestionMode = mode === 'edit'
    configureYProsemirror({
      ytype: suggestionDoc.get('prosemirror'),
      attributionManager: am
    })(currentView.state, currentView.dispatch)
  }
  updateSuggestionButtons()
}

/**
 * @param {Y.Doc} prev
 * @param {Y.Doc} next
 * @param {Y.ContentMap} attributions
 */
const initVersionDiffEditor = (prev, next, attributions) => {
  isViewingVersion = true
  const diffAM = Y.createAttributionManagerFromDiff(prev, next /* { attrs: attributions } */)
  const versionFragment = next.get('prosemirror')
  configureYProsemirror({
    ytype: versionFragment,
    attributionManager: diffAM
  })(currentView.state, currentView.dispatch)
}

initLiveEditor()

// ── Connection Status ──

const statusEl = /** @type {HTMLElement} */ (document.querySelector('#status'))
provider.on('status', (/** @type {{ status: string }} */ event) => {
  statusEl.textContent = event.status
  statusEl.className = 'status ' + event.status
})

// ── Activity Panel ──

const activityListEl = /** @type {HTMLElement} */ (document.querySelector('#activity-list'))
const rollbackBtn = /** @type {HTMLButtonElement} */ (document.querySelector('#rollback-btn'))

/**
 * @type {Array<{ from: number, to: number, by: string, delta?: any, customAttributions?: any[] }>}
 */
let activityData = []

/**
 * @type {number | null}
 */
let selectionStart = null

/**
 * @type {number | null}
 */
let selectionEnd = null

/**
 * @type {boolean}
 */
let isSelecting = false

/**
 * @param {number} ts
 */
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
  for (const op of d.children) {
    if (op.attribution?.insert != null) {
      inserted += op.insert.length
    } else if (op.attribution?.delete != null) {
      deleted += op.insert.length
    }
  }
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
    const response = await fetch(`${yhubApiUrl}/activity/${org}/${docid}?delta=true&order=desc&limit=50&customAttributions=true&group=true`)
    if (!response.ok) return
    const arrayBuffer = await response.arrayBuffer()
    const data = buffer.decodeAny(new Uint8Array(arrayBuffer))
    if (!Array.isArray(data)) return
    activityData = data
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
    const response = await fetch(`${yhubApiUrl}/changeset/${org}/${docid}?from=${from}&to=${to}&ydoc=true&attributions=true`)
    if (!response.ok) return
    const arrayBuffer = await response.arrayBuffer()
    const history = buffer.decodeAny(new Uint8Array(arrayBuffer))
    const prev = Y.createDocFromUpdate(history.prevDoc)
    const next = Y.createDocFromUpdate(history.nextDoc)
    const attrs = Y.decodeContentMap(history.attributions)
    initVersionDiffEditor(prev, next, attrs)
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
    const response = await fetch(`${yhubApiUrl}/rollback/${org}/${docid}`, {
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
