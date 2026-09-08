/* eslint-env browser */
import * as Y from '@y/y'
import {
  configureYProsemirror, acceptChanges, rejectChanges, acceptAllChanges, rejectAllChanges,
  yUndoPluginKey, ySyncPluginKey
} from '@y/prosemirror'
import { WebsocketProvider } from '@y/websocket'
import { Editor } from '@tiptap/core'
import { createEditorExtensions, attributedNodes, strictListItemCompare } from './schema.js'
import { createYSyncExtension, createYCursorExtension, createYUndoExtension, BlockAttributionExtension } from './extensions.js'
import {
  captureLibraryWarnings, reportInternalError, mountSchemaHealth, mountLiveDiagnostics, showToast
} from './diagnostics.js'
import { setupToolbar } from './toolbar.js'
import { userColorForId } from './user-colors.js'
import * as random from 'lib0/random'
import * as buffer from 'lib0/buffer'

// Surface the library's console-only diagnostics in the UI. Must run BEFORE the
// editor is built: the bind-time schema audit fires the first time a renderer
// is configured, which happens in initLiveEditor() below.
captureLibraryWarnings()

const params = new URLSearchParams(location.search)
const userColor = { color: userColorForId('user-' + random.uint32()), light: '' }
const org = params.get('org') ?? 'yhub-pro-demo'

// Derive room name from URL hash, or generate a random 6-char hex
let roomName = location.hash.slice(1)
if (!roomName) {
  roomName = random.uint32().toString(16).padStart(6, '0').slice(0, 6)
  location.hash = roomName
}
const docid = roomName

// Override with `?api=http://localhost:4400` to point at a local yhub.
// NOTE: the public instance enforces an origin allowlist - the dev server must
// be on http://localhost:8000 (see vite.config.js).
const yhubApiUrl = params.get('api') ?? 'https://yhub-standalone-x9kss.ondigitalocean.app'

const ydoc = new Y.Doc()
const wsUrl = yhubApiUrl + '/api/ws/v1/' + org
const provider = new WebsocketProvider(wsUrl, docid, ydoc, { params: { gc: false } })
const yxmlFragment = ydoc.get('prosemirror')

provider.awareness.setLocalStateField('user', {
  name: 'User ' + Math.floor(Math.random() * 100),
  color: userColor.color,
  colorLight: userColor.light
})

const editorParent = /** @type {HTMLElement} */ (document.querySelector('#editor'))

// ── Suggestion documents ─────────────────────────────────────────────────────
// Declared before the editor because the UndoManagers below need them, and the
// editor needs an UndoManager.

const suggestionDoc = new Y.Doc({ gc: false, isSuggestionDoc: true })
const suggestionProvider = new WebsocketProvider(wsUrl, docid + '--suggestions', suggestionDoc, { params: { gc: false } })
let suggestionOtherClientID = random.uint53()

const suggestionRenderer = Y.createDiffRenderer(ydoc, suggestionDoc, { attributions: Y.createContentMap() })

// ── Undo ─────────────────────────────────────────────────────────────────────
//
// One UndoManager PER BOUND DOC. `Y.UndoManager` hooks
// `doc.on('afterTransaction')` and its scope cannot span documents, and this
// demo binds three: the live doc, the suggestion doc, and (in version view) a
// historical doc. `rebind()` swaps the manager along with the ytype.
//
// `trackedOrigins: new Set()` is deliberate - NOT the default `new Set([null])`.
// The only origin worth tracking is the sync plugin instance, which
// `yUndoPlugin`'s bind adds for us; that is exactly "the edits this user made
// through the editor", and it keeps renderer-driven writes (accept/reject) and
// provider writes out of the history.
/** @param {any} ytype */
const mkUndoManager = (ytype) => new Y.UndoManager(ytype, { trackedOrigins: new Set() })

const liveUndoManager = mkUndoManager(yxmlFragment)
const suggestionUndoManager = mkUndoManager(suggestionDoc.get('prosemirror'))

// ── Tiptap editor ────────────────────────────────────────────────────────────
//
// We wire y-prosemirror's syncPlugin / yCursorPlugin / yUndoPlugin and the
// block-attribution gutter directly as Tiptap extensions (NOT via
// @tiptap/extension-collaboration, which targets the old binding).
//
// The schema comes from ./schema.js, which relaxes the content expressions that
// are not concurrency-safe, declares the four reserved attribution marks on
// every node that can hold attributable content, and adds the relaxed
// `--attributed` variants. See that file for the full rationale.
const editor = new Editor({
  element: editorParent,
  extensions: [
    ...createEditorExtensions(),
    createYSyncExtension({
      attributedNodes,
      // Off by default: after the relaxation in schema.js, rendering the old
      // block next to the new one is better suggestion UX than replacing the
      // container wholesale. `?compare=strict` demonstrates the alternative.
      customCompare: params.get('compare') === 'strict' ? strictListItemCompare : null,
      onInternalError: reportInternalError
    }),
    createYCursorExtension(provider.awareness),
    createYUndoExtension(liveUndoManager),
    BlockAttributionExtension
  ],
  content: '',
  editable: true
})

const view = editor.view

// The attribution marks are now whitelisted IN THE SCHEMA (see schema.js), so
// the runtime `nodeType.markSet` patch this demo used to carry here is gone.
// That patch worked, but it also masked the very thing the schema panel is
// meant to prove - it made a non-compliant schema look compliant at runtime
// while the bind-time audit still reported the truth.
mountSchemaHealth(editor.schema)

// Tiptap owns `dispatchTransaction`, so the plain-PM demo's try/catch around
// updateState can't be set via the constructor. Override it on the view after
// construction, *wrapping* Tiptap's own dispatch (captured below) so Tiptap's
// transaction / selection events still fire — the toolbar listens to them to
// refresh its active states. The yCursorPlugin throws a RangeError when an
// awareness cursor references a position that doesn't exist in the current doc
// (typical after swapping to a historical doc in version-diff view); we swallow
// that specific failure so the view stays usable.
const tiptapDispatch = view.props.dispatchTransaction
view.setProps({
  dispatchTransaction (tr) {
    try {
      if (tiptapDispatch) tiptapDispatch(tr)
      else view.updateState(view.state.apply(tr))
    } catch (e) {
      if (e instanceof RangeError) {
        console.debug('ignored RangeError during dispatch:', e.message)
        showToast({ kind: 'warn', title: 'Ignored RangeError during dispatch', detail: e.message })
      } else {
        throw e
      }
    }
  }
})

// Formatting / block-insert toolbar above the editor.
setupToolbar(editor)

// ── Suggestion Mode ──
// (suggestionDoc / suggestionProvider / suggestionRenderer are declared above,
// because the UndoManagers and the editor depend on them.)

const elemSelectSuggestionMode = /** @type {HTMLSelectElement} */ (document.querySelector('#select-suggestion-mode'))
const btnAcceptChanges = /** @type {HTMLButtonElement} */ (document.querySelector('#btn-accept-changes'))
const btnRejectChanges = /** @type {HTMLButtonElement} */ (document.querySelector('#btn-reject-changes'))
const btnAcceptAll = /** @type {HTMLButtonElement} */ (document.querySelector('#btn-accept-all'))
const btnRejectAll = /** @type {HTMLButtonElement} */ (document.querySelector('#btn-reject-all'))

let previousMode = 'off'

/**
 * Point the yUndoPlugin at a different UndoManager.
 *
 * An UndoManager is bound to one Y.Doc, so switching the bound ytype must
 * switch the manager too. `yUndoPlugin`'s `view().update` hook implements the
 * rebind (unhook the old manager's stack handlers and drop the sync plugin from
 * its trackedOrigins, then bind the new one); the `yUndoPluginKey` meta is what
 * reaches it.
 *
 * @param {import('@y/y').UndoManager} next
 */
const setUndoManager = (next) => {
  if (yUndoPluginKey.getState(view.state)?.undoManager === next) return
  view.dispatch(view.state.tr.setMeta(yUndoPluginKey, { undoManager: next }))
  // Don't let post-switch edits merge into a stack item captured before it.
  next.stopCapturing()
}

/**
 * Bind the editor to a (ytype, renderer, undoManager) triple.
 *
 * Re-binding re-renders the whole document, and any schema normalization the
 * view performs on the way is written back to Y with the sync plugin as origin.
 * Without suspending capture that would land on the OUTGOING manager's stack as
 * one giant stack item, so the origin is dropped for the duration of the swap.
 *
 * @param {{ ytype: any, renderer: any, undoManager: import('@y/y').UndoManager, editable: boolean }} target
 */
const rebind = (target) => {
  const syncPluginInstance = ySyncPluginKey.get(view.state)
  const current = yUndoPluginKey.getState(view.state)?.undoManager
  if (current != null && syncPluginInstance != null) {
    current.trackedOrigins.delete(syncPluginInstance)
  }
  editor.setEditable(target.editable)
  configureYProsemirror({ ytype: target.ytype, renderer: target.renderer })(view.state, view.dispatch)
  setUndoManager(target.undoManager)
  target.undoManager.stopCapturing()
}

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

  applyMode()
  previousMode = mode
})

btnAcceptChanges.addEventListener('click', () => {
  const { from, to } = view.state.selection
  acceptChanges(from, to)(view.state, view.dispatch)
})

btnRejectChanges.addEventListener('click', () => {
  const { from, to } = view.state.selection
  rejectChanges(from, to)(view.state, view.dispatch)
})

btnAcceptAll.addEventListener('click', () => {
  acceptAllChanges()(view.state, view.dispatch)
})

btnRejectAll.addEventListener('click', () => {
  rejectAllChanges()(view.state, view.dispatch)
})

// ── Editor Init ──

/**
 * Bind whichever live document the suggestion selector currently names.
 *
 * Note that `view` -> `edit` keeps BOTH the same ytype and the same renderer
 * object (only `renderer.suggestionMode` changes), so `configureYProsemirror`
 * correctly decides there is nothing to re-bind and dispatches nothing.
 *
 * Suggestion `view` mode stays EDITABLE on purpose: with
 * `suggestionMode === false` the DiffRenderer bridges local edits into the base
 * document, which is the "edit the real document while seeing other people's
 * suggestions" mode.
 */
const applyMode = () => {
  const mode = elemSelectSuggestionMode.value
  if (mode === 'off') {
    rebind({ ytype: yxmlFragment, renderer: null, undoManager: liveUndoManager, editable: true })
  } else {
    suggestionRenderer.suggestionMode = mode === 'edit'
    rebind({
      ytype: suggestionDoc.get('prosemirror'),
      renderer: suggestionRenderer,
      undoManager: suggestionUndoManager,
      editable: true
    })
  }
  updateSuggestionButtons()
}

const initLiveEditor = () => {
  applyMode()
  if (versionDoc !== null) {
    versionDoc.destroy()
    versionDoc = null
  }
  versionUndoManager = null
}

/**
 * The doc currently shown in version-diff view; destroyed when the view is
 * replaced or closed.
 * @type {Y.Doc | null}
 */
let versionDoc = null

/** @type {import('@y/y').UndoManager | null} */
let versionUndoManager = null

/**
 * Renders a historical diff from a /changeset response: `doc` is the document
 * as it was at the range's `to` (partially gc'd, deletes in range restorable),
 * so overlaying the `attributions` alone renders the diff.
 * @param {Y.Doc} doc
 * @param {Y.ContentMap} attributions
 */
const initVersionDiffEditor = (doc, attributions) => {
  const renderer = Y.createAttributionsRenderer(attributions)
  // A fresh manager for the historical doc. Its stack starts empty, so Mod-Z in
  // version view is a no-op rather than a mutation of a document the user is
  // only reading. No explicit destroy is needed - `Y.UndoManager` registers
  // `doc.on('destroy', ...)` and the previous versionDoc is destroyed below.
  versionUndoManager = mkUndoManager(doc.get('prosemirror'))
  rebind({
    ytype: doc.get('prosemirror'),
    renderer,
    undoManager: versionUndoManager,
    editable: false
  })
  if (versionDoc !== null) versionDoc.destroy()
  versionDoc = doc
}

initLiveEditor()

// Live indicators: doc.check() validity + what the binding is actually bound to.
mountLiveDiagnostics(editor, (ytype) => {
  if (ytype == null) return 'none (paused)'
  if (ytype === yxmlFragment) return 'live'
  if (versionDoc != null && ytype === versionDoc.get('prosemirror')) return 'historical'
  if (ytype === suggestionDoc.get('prosemirror')) return 'suggestion'
  return 'unknown'
})

// A debugging handle. The manual verification script in the README asks you to
// inspect these from the console (e.g. `__demo.view.state.doc.check()`, or
// `JSON.stringify(__demo.view.state.doc.toJSON()).includes('--attributed')`
// after accepting a suggestion).
// @ts-ignore
window.__demo = {
  editor,
  view,
  ydoc,
  yxmlFragment,
  suggestionDoc,
  suggestionRenderer,
  provider,
  suggestionProvider,
  undoManagers: { live: liveUndoManager, suggestion: suggestionUndoManager },
  keys: { ySyncPluginKey, yUndoPluginKey },
  Y
}

// ── Connection Status ──

const statusEl = /** @type {HTMLElement} */ (document.querySelector('#status'))
provider.on('status', (/** @type {{ status: string }} */ event) => {
  statusEl.textContent = event.status
  statusEl.className = 'status ' + event.status
})

// ── Open in Another Tab ──

const openTabBtn = document.createElement('button')
openTabBtn.textContent = 'Open in another tab'
openTabBtn.style.cssText = 'padding:4px 10px;font-size:12px;font-weight:500;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;background:white;'
openTabBtn.addEventListener('click', () => { window.open(location.href, '_blank') })
const headerRight = /** @type {HTMLElement} */ (document.querySelector('.header-right'))
headerRight.insertBefore(openTabBtn, headerRight.firstChild)

// ── Offline toggle ───────────────────────────────────────────────────────────
//
// The concurrency scenarios this schema exists to survive (two peers each
// deleting a different row / list item, so the container ends up empty) are not
// reproducible while both tabs are online: their edits serialize. Disconnect
// BOTH providers - dropping only the main one would still let a "concurrent"
// suggestion sync through the suggestion channel.

let online = true
const connBtn = document.createElement('button')
connBtn.style.cssText = openTabBtn.style.cssText
const renderConn = () => { connBtn.textContent = online ? '🔌 Go offline' : '⚡ Go online' }
connBtn.addEventListener('click', () => {
  online = !online
  for (const p of [provider, suggestionProvider]) {
    if (online) p.connect()
    else p.disconnect()
  }
  renderConn()
  statusEl.textContent = online ? 'connecting' : 'offline (manual)'
  statusEl.className = 'status ' + (online ? 'connecting' : 'disconnected')
})
renderConn()
headerRight.insertBefore(connBtn, headerRight.firstChild)

// ── Activity Panel ──
//
// The user picks two version endpoints explicitly. Clicking an activity item
// makes it "Current". A "Comparing to" pill below shows the other endpoint
// (defaults to "Now (live)") and opens a dropdown to change it. The editor
// renders the diff between the two endpoints, oldest → newest.

const activityListEl = /** @type {HTMLElement} */ (document.querySelector('#activity-list'))
const rollbackBtn = /** @type {HTMLButtonElement} */ (document.querySelector('#rollback-btn'))
const closeVersionBtn = /** @type {HTMLButtonElement} */ (document.querySelector('#close-version-btn'))

/** @typedef {{ from: number, to: number, by: string, delta?: any, customAttributions?: any[] }} ActivityItem */

/** @type {ActivityItem[]} */
let activityData = []

// Selection is a half-open range [from, to) over activityData.
//
// activityData is desc-sorted (idx 0 = newest), so the NEWER endpoint has the
// SMALLER array index.
//
//   - `fromArrayIdx` = newer endpoint (INCLUDED). The user-clicked / drag
//     anchor item. Always a real activity index.
//   - `toArrayIdx`   = older endpoint (EXCLUDED) — the comparison baseline.
//     Can equal `activityData.length` as a sentinel meaning "(empty document)",
//     i.e. the state before any commit.
//
// An item at array index `i` is in the selection iff `fromArrayIdx <= i < toArrayIdx`.
let fromArrayIdx = /** @type {number | null} */ (null)
let toArrayIdx = /** @type {number | null} */ (null)

/** which dropdown is open, if any */
let openDropdown = /** @type {'from' | 'to' | null} */ (null)
/** drag-select state */
let dragAnchorIdx = /** @type {number | null} */ (null)
let isDragging = false
/**
 * When mousedown lands on an already-selected item, we defer any state
 * change: a release without movement clears the selection (toggle off),
 * while a movement promotes it to a drag. Stores the idx mousedowned on.
 */
let pendingClickIdx = /** @type {number | null} */ (null)

/** @param {number} ts */
const formatDateTime = (ts) => {
  const d = new Date(ts)
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) +
    ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * `act.by` may be a single name or a comma-separated list — split into an array.
 * @param {string | undefined | null} by
 */
const namesFromBy = (by) => {
  if (!by) return /** @type {string[]} */ ([])
  return String(by).split(/[,;]/).map(s => s.trim()).filter(Boolean)
}

/** @param {string[]} names */
const renderUsersInline = (names) => {
  const el = document.createElement('div')
  el.className = 'activity-users'
  el.textContent = names.length === 0 ? 'Unknown' : names.join(', ')
  return el
}

/** @param {ActivityItem} act */
const renderPromptAndRollback = (act) => {
  /** @type {HTMLElement[]} */
  const extras = []
  if (!act.customAttributions) return extras
  const promptAttr = act.customAttributions.find(/** @param {any} a */ a => a.k === 'prompt')
  if (promptAttr) {
    const promptEl = document.createElement('div')
    promptEl.className = 'activity-prompt'
    promptEl.textContent = promptAttr.v
    extras.push(promptEl)
  }
  const rollbackAttrs = act.customAttributions.filter(/** @param {any} a */ a => a.k === 'rollback')
  if (rollbackAttrs.length > 0) {
    const rollbackEl = document.createElement('div')
    rollbackEl.className = 'activity-rollback'
    const prompts = rollbackAttrs.filter(/** @param {any} a */ a => a.v !== 'true').map(/** @param {any} a */ a => a.v)
    rollbackEl.textContent = prompts.length > 0 ? 'Rollback: ' + prompts.join(', ') : 'Rollback'
    extras.push(rollbackEl)
  }
  return extras
}

/** @param {number} i */
const isItemSelected = (i) => {
  if (fromArrayIdx === null || toArrayIdx === null) return false
  return i >= fromArrayIdx && i < toArrayIdx
}

/**
 * Translate a drag span (anchor → current pointer) into a half-open
 * [fromArrayIdx, toArrayIdx) range. `from` is the smaller idx (newer), `to`
 * is one past the larger idx (older); when the oldest activity item is
 * included, `to === activityData.length` and the diff baseline is the
 * empty-document sentinel.
 * @param {number} a
 * @param {number} b
 */
const setRangeFromDrag = (a, b) => {
  const minIdx = Math.min(a, b) // smaller array idx = newer item
  const maxIdx = Math.max(a, b) // larger array idx = older item
  fromArrayIdx = minIdx
  toArrayIdx = maxIdx + 1 // === activityData.length when oldest is included
}

/**
 * Build a single dropdown for the "Comparing X to Y" header.
 *
 * Sentinel index `activityData.length` on the `to` side represents
 * "(empty document)" — the state before any commit existed. There is no
 * sentinel on the `from` side; `from` is always a real activity item.
 *
 * @param {'from' | 'to'} kind
 */
const renderDropdown = (kind) => {
  const dd = document.createElement('span')
  dd.className = 'cmp-dropdown ' + kind + (openDropdown === kind ? ' open' : '')
  dd.dataset.dd = kind

  const idx = kind === 'from' ? fromArrayIdx : toArrayIdx
  const labelText = (() => {
    if (kind === 'to' && idx === activityData.length) return '(empty)'
    if (idx === null) return '—'
    return formatDateTime(activityData[idx].from)
  })()
  const label = document.createElement('span')
  label.className = 'cmp-dropdown-label'
  label.textContent = labelText
  dd.appendChild(label)

  const caret = document.createElement('span')
  caret.className = 'cmp-dropdown-caret'
  caret.textContent = ' ▾'
  dd.appendChild(caret)

  const menu = document.createElement('div')
  menu.className = 'pick-menu'

  /** @param {number} optIdx — the empty-doc sentinel is allowed only for 'to' */
  const addOption = (optIdx) => {
    const opt = document.createElement('div')
    opt.className = 'pick-option'
    opt.dataset.pickIdx = String(optIdx)
    // Disable options that would produce an empty or inverted range.
    if (kind === 'from' && toArrayIdx !== null && optIdx >= toArrayIdx) opt.classList.add('disabled')
    if (kind === 'to' && fromArrayIdx !== null && optIdx <= fromArrayIdx) opt.classList.add('disabled')
    const date = document.createElement('div')
    date.className = 'pick-date'
    if (kind === 'to' && optIdx === activityData.length) {
      date.textContent = '(empty document)'
    } else {
      date.textContent = formatDateTime(activityData[optIdx].from)
      const ns = namesFromBy(activityData[optIdx].by)
      if (ns.length > 0) {
        const usersEl = document.createElement('div')
        usersEl.style.color = '#6b7280'
        usersEl.textContent = ns.join(', ')
        date.appendChild(document.createElement('br'))
        date.appendChild(usersEl)
      }
    }
    opt.appendChild(date)
    menu.appendChild(opt)
  }

  for (let i = 0; i < activityData.length; i++) addOption(i)
  if (kind === 'to') addOption(activityData.length) // empty-document sentinel
  dd.appendChild(menu)
  return dd
}

const renderComparingBar = () => {
  // Always render the bar — even with no selection — so the list below
  // doesn't shift up/down as items are picked or cleared. The placeholder
  // state shows a hint instead of dropdowns.
  const bar = document.createElement('div')
  bar.className = 'comparing-bar'
  const hasSelection = fromArrayIdx !== null && toArrayIdx !== null
  if (!hasSelection) {
    bar.classList.add('empty')
    bar.innerHTML = '<span class="cmp-icon">↔️</span> Drag or click an activity to compare versions'
    return bar
  }
  // Top row: label on the left, action buttons on the right.
  const top = document.createElement('div')
  top.className = 'cmp-row cmp-row-top'
  const label = document.createElement('span')
  label.className = 'cmp-label'
  label.innerHTML = '<span class="cmp-icon">↔️</span> Compare'
  top.appendChild(label)
  const actions = document.createElement('span')
  actions.className = 'cmp-actions'
  // appendChild re-parents the persistent buttons — their click listeners
  // (rollback, exit version view) survive across renders.
  actions.appendChild(rollbackBtn)
  actions.appendChild(closeVersionBtn)
  top.appendChild(actions)
  bar.appendChild(top)
  // Bottom row: [from] to [to] dropdowns, side by side.
  const bottom = document.createElement('div')
  bottom.className = 'cmp-row cmp-row-bottom'
  bottom.appendChild(renderDropdown('from'))
  const toLabel = document.createElement('span')
  toLabel.className = 'cmp-to-label'
  toLabel.textContent = ' to '
  bottom.appendChild(toLabel)
  bottom.appendChild(renderDropdown('to'))
  bar.appendChild(bottom)
  return bar
}

/**
 * @param {ActivityItem} act
 * @param {number} index
 */
const renderActivityItem = (act, index) => {
  const div = document.createElement('div')
  div.className = 'activity-item' + (isItemSelected(index) ? ' selected' : '')
  div.dataset.index = String(index)

  const time = document.createElement('div')
  time.className = 'activity-time'
  time.textContent = formatDateTime(act.from)
  div.appendChild(time)

  const names = namesFromBy(act.by)
  div.appendChild(renderUsersInline(names))

  for (const e of renderPromptAndRollback(act)) div.appendChild(e)
  return div
}

const renderActivityList = () => {
  activityListEl.innerHTML = ''
  if (activityData.length === 0) {
    activityListEl.innerHTML = '<div class="activity-empty">No activity yet</div>'
    rollbackBtn.style.display = 'none'
    closeVersionBtn.style.display = 'none'
    return
  }
  // The bar is always rendered (filled or placeholder) so the activity items
  // sit at the same Y-coordinate regardless of whether a selection is active.
  const bar = renderComparingBar()
  activityListEl.appendChild(bar)
  const divider = document.createElement('div')
  divider.className = 'activity-section-divider'
  activityListEl.appendChild(divider)
  for (let i = 0; i < activityData.length; i++) {
    activityListEl.appendChild(renderActivityItem(activityData[i], i))
  }
  const inVersionView = fromArrayIdx !== null && toArrayIdx !== null
  rollbackBtn.style.display = inVersionView ? 'inline-block' : 'none'
  closeVersionBtn.style.display = inVersionView ? 'inline-block' : 'none'
}

const fetchActivity = async () => {
  try {
    // the panel only renders from/by/customAttributions, so don't request the expensive deltas
    const response = await fetch(`${yhubApiUrl}/api/activity/v1/${org}/${docid}?order=desc&limit=50&customAttributions=true&group=true`)
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
 * Translate the half-open selection [fromArrayIdx, toArrayIdx) into the
 * timestamp range we feed to /changeset.
 *
 *   - fromArrayIdx is the NEWER endpoint (smallest array idx in the range).
 *   - toArrayIdx is the OLDER endpoint, exclusive. If it equals
 *     activityData.length the baseline is the empty document (timestamp 0).
 *
 * The diff goes from the OLDER baseline state (just below the range) to the
 * NEWER end-state at fromArrayIdx.
 *
 * Off-by-one note: `/activity` reports `.to` as the timestamp of the LAST
 * Yjs item in the activity group (inclusive). `/changeset?from=T` includes
 * attributions with timestamp >= T in the highlighted window, so an item
 * whose server timestamp equals `acts[N+1].to` would end up *inside* the
 * newer diff. We compensate by passing `+1` for the older boundary so the
 * cutoff falls in the gap between activities.
 */
const resolveDiffRange = () => {
  if (fromArrayIdx === null || toArrayIdx === null) return null
  if (fromArrayIdx >= toArrayIdx) return null
  const newestSelectedIdx = fromArrayIdx
  const newer = activityData[newestSelectedIdx].to
  const older = toArrayIdx >= activityData.length
    ? 0 // empty-document baseline
    : activityData[toArrayIdx].to + 1
  return { from: older, to: newer }
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
    let attrs = Y.decodeContentMap(history.attributions)
    // Content inserted AND deleted inside the window is a net no-op; cancel it
    // out of both sides (insertions' -= deletions, deletions' -= insertions) so
    // changesets from servers without the yhub-side cancellation render the same.
    const contentIds = Y.createContentIdsFromContentMap(attrs)
    const transient = Y.intersectSets(contentIds.inserts, contentIds.deletes)
    if (transient.clients.size > 0) {
      attrs = Y.excludeContentMap(attrs, Y.createContentIds(transient, transient))
    }
    initVersionDiffEditor(doc, attrs)
  } catch (e) {
    console.error('Failed to fetch changeset:', e)
  }
}

const refreshDiffView = () => {
  const range = resolveDiffRange()
  if (range) renderVersions(range.from, range.to)
}

const exitVersionView = () => {
  fromArrayIdx = null
  toArrayIdx = null
  openDropdown = null
  dragAnchorIdx = null
  isDragging = false
  renderActivityList()
  initLiveEditor()
}

closeVersionBtn.addEventListener('click', exitVersionView)

// Drag-select / click-to-toggle behaviour:
//
//   1. mousedown on an UNSELECTED item → immediately set single-item range
//      (live visual feedback) and begin a drag.
//   2. mousedown on an ALREADY-SELECTED item → defer; if the pointer moves
//      to a different item we promote to a drag, otherwise mouseup treats
//      it as a click-to-clear (toggle off the whole selection).
activityListEl.addEventListener('mousedown', (e) => {
  if (!(e.target instanceof Element)) return
  if (e.target.closest('.cmp-dropdown') || e.target.closest('.pick-menu')) return
  const item = e.target.closest('.activity-item')
  if (!(item instanceof HTMLElement) || item.dataset.index == null) return
  const idx = parseInt(item.dataset.index, 10)
  openDropdown = null
  if (isItemSelected(idx)) {
    pendingClickIdx = idx
    // Don't mutate selection yet — wait to see if it's a click or drag.
    e.preventDefault()
    return
  }
  isDragging = true
  dragAnchorIdx = idx
  setRangeFromDrag(idx, idx)
  renderActivityList()
  e.preventDefault()
})

/**
 * Resolve the activity item under a pointer coordinate. `mouseover` only
 * fires when entering a new element, which synthetic drags can skip — so we
 * hit-test with elementFromPoint on every mousemove.
 * @param {number} clientX
 * @param {number} clientY
 */
const activityIdxAtPoint = (clientX, clientY) => {
  const el = document.elementFromPoint(clientX, clientY)
  if (!el) return null
  const item = el.closest('.activity-item')
  if (!(item instanceof HTMLElement) || item.dataset.index == null) return null
  return parseInt(item.dataset.index, 10)
}

document.addEventListener('mousemove', (e) => {
  const idx = activityIdxAtPoint(e.clientX, e.clientY)

  // Promote a pending click-on-selected into a drag once the pointer moves
  // to a different activity item.
  if (pendingClickIdx !== null && idx !== null && idx !== pendingClickIdx) {
    dragAnchorIdx = pendingClickIdx
    isDragging = true
    pendingClickIdx = null
    setRangeFromDrag(dragAnchorIdx, idx)
    renderActivityList()
    return
  }

  if (!isDragging || dragAnchorIdx === null || idx === null) return
  setRangeFromDrag(dragAnchorIdx, idx)
  renderActivityList()
})

document.addEventListener('mouseup', (e) => {
  // Mousedown landed on an already-selected item and no drag started — treat
  // as a click-to-clear.
  if (pendingClickIdx !== null) {
    pendingClickIdx = null
    fromArrayIdx = null
    toArrayIdx = null
    renderActivityList()
    initLiveEditor()
    return
  }
  if (!isDragging) return
  // Pick up the final pointer position in case mousemove was throttled.
  if (dragAnchorIdx !== null) {
    const idx = activityIdxAtPoint(e.clientX, e.clientY)
    if (idx !== null) setRangeFromDrag(dragAnchorIdx, idx)
  }
  isDragging = false
  dragAnchorIdx = null
  renderActivityList()
  refreshDiffView()
})

// Dropdowns + dropdown options.
activityListEl.addEventListener('click', (e) => {
  const target = /** @type {HTMLElement} */ (e.target)

  // Picked an option inside a dropdown menu.
  const pickOption = target.closest('.pick-option')
  if (pickOption instanceof HTMLElement && !pickOption.classList.contains('disabled')) {
    const raw = pickOption.dataset.pickIdx
    if (raw == null || openDropdown === null) return
    const picked = parseInt(raw, 10)
    if (openDropdown === 'from') {
      // `from` must stay strictly < `to`; bump `to` outward when needed.
      fromArrayIdx = picked
      if (toArrayIdx !== null && toArrayIdx <= fromArrayIdx) {
        toArrayIdx = Math.min(fromArrayIdx + 1, activityData.length)
      }
    } else {
      // `to` must stay strictly > `from`; pull `from` inward when needed.
      toArrayIdx = picked
      if (fromArrayIdx !== null && fromArrayIdx >= toArrayIdx) {
        fromArrayIdx = Math.max(toArrayIdx - 1, 0)
      }
    }
    openDropdown = null
    renderActivityList()
    refreshDiffView()
    return
  }

  // Clicked one of the two dropdown chips — toggle that dropdown.
  const dd = target.closest('.cmp-dropdown')
  if (dd instanceof HTMLElement && (dd.dataset.dd === 'from' || dd.dataset.dd === 'to')) {
    const which = /** @type {'from' | 'to'} */ (dd.dataset.dd)
    openDropdown = openDropdown === which ? null : which
    renderActivityList()
  }
})

// Click outside the panel closes the open dropdown.
document.addEventListener('click', (e) => {
  if (!openDropdown) return
  if (!(e.target instanceof Element)) return
  if (e.target.closest('.cmp-dropdown')) return
  openDropdown = null
  renderActivityList()
})

const rollback = async () => {
  const range = resolveDiffRange()
  if (!range || fromArrayIdx === null || toArrayIdx === null) return
  const { from, to } = range
  /** @type {Array<{ k: string, v: string }>} */
  const customAttributions = [{ k: 'rollback', v: 'true' }]
  // Walk the highlighted half-open range [fromArrayIdx, toArrayIdx) and
  // collect any prompt metadata for traceability on the rollback record.
  const walkEnd = Math.min(toArrayIdx, activityData.length)
  for (let i = fromArrayIdx; i < walkEnd; i++) {
    const act = activityData[i]
    if (act.customAttributions) {
      const promptAttr = act.customAttributions.find(/** @param {any} a */ a => a.k === 'prompt')
      if (promptAttr) customAttributions.push({ k: 'rollback', v: promptAttr.v })
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
