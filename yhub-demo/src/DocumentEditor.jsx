import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import { configureYProsemirror, docToDelta } from '@y/prosemirror'
import * as Y from '@y/y'
import { WebsocketProvider } from '@y/websocket'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { wsUrl, wsParamsForUser } from './yhub.js'
import { YSyncExtension } from './extensions.js'
import { ActivitySidebar } from './ActivitySidebar.jsx'

const MODE_VIEWING = 'viewing'
const MODE_SUGGESTING = 'suggesting'
const MODE_READONLY = 'readonly'

const FRAGMENT_KEY = 'doc'

// ── Module-level globals (yhub-demo/demo.js style) ──
// One DocumentEditor mounts at a time (App keys it by docId, so switching docs
// unmounts + remounts). Plain globals give stable references; all Y/provider
// subscriptions live in initDoc (not useEffect), bridged to React via
// useSyncExternalStore.
let ydoc = null
let suggestionDoc = null
let provider = null
let suggestionProvider = null
let am = null
let suggestionOtherClientID = null
let activeKey = null

// Reactive fields — mutated by subscribers in initDoc, read directly in render.
let connStatus = 'connecting'
let ready = false
let hasSuggestions = false
let touchCb = null

// Throttle local-edit "touch" notifications so a fast typist doesn't spam
// `updatedAt` round-trips on the workspace index doc once per keystroke.
const TOUCH_THROTTLE_MS = 5000
let lastTouchAt = 0
let pendingTouchTimer = null
const scheduleTouch = () => {
  const now = Date.now()
  const since = now - lastTouchAt
  if (since >= TOUCH_THROTTLE_MS) {
    lastTouchAt = now
    touchCb?.()
  } else if (!pendingTouchTimer) {
    pendingTouchTimer = setTimeout(() => {
      pendingTouchTimer = null
      lastTouchAt = Date.now()
      touchCb?.()
    }, TOUCH_THROTTLE_MS - since)
  }
}

// Pub/sub plumbing for useSyncExternalStore. Any Y-side change that should
// trigger a re-render calls bumpStore().
let storeVersion = 0
const storeSubscribers = new Set()
const storeSubscribe = (cb) => { storeSubscribers.add(cb); return () => { storeSubscribers.delete(cb) } }
const storeSnapshot = () => storeVersion
const bumpStore = () => { storeVersion++; storeSubscribers.forEach((fn) => fn()) }

const keyFor = (workspaceId, docId, userId) =>
  workspaceId + '|' + docId + '|' + (userId || '')

const initDoc = (workspaceId, docId, user) => {
  const key = keyFor(workspaceId, docId, user?.id || null)
  if (activeKey === key) return
  teardownDoc()
  const userForParams = user?.id ? { id: user.id } : null
  ydoc = new Y.Doc()
  suggestionDoc = new Y.Doc({ isSuggestionDoc: true })
  const docid = `ws-${workspaceId}.doc-${docId}`
  provider = new WebsocketProvider(wsUrl, docid, ydoc, {
    params: wsParamsForUser(userForParams, { gc: 'false' })
  })
  suggestionProvider = new WebsocketProvider(
    wsUrl,
    docid + '--suggestions',
    suggestionDoc,
    { params: wsParamsForUser(userForParams, { gc: 'false' }) }
  )
  am = Y.createAttributionManagerFromDiff(ydoc, suggestionDoc, {
    attrs: new Y.Attributions()
  })
  am.suggestionMode = false

  const setAwareness = () => {
    if (!user) return
    provider.awareness.setLocalStateField('user', {
      name: user.name,
      color: user.color,
      colorLight: user.colorLight
    })
  }
  setAwareness()

  connStatus = provider.wsconnected ? 'connected' : 'connecting'
  ready = provider.synced && suggestionProvider.synced
  hasSuggestions = false

  // All subscriptions live here; provider.destroy() in teardownDoc cleans them up.
  provider.on('status', (e) => {
    connStatus = e.status
    if (e.status === 'connected') setAwareness() // re-assert presence on reconnect
    bumpStore()
  })
  const onSync = () => {
    const r = provider.synced && suggestionProvider.synced
    if (r !== ready) { ready = r; bumpStore() }
  }
  provider.on('sync', onSync)
  suggestionProvider.on('sync', onSync)
  am.on('change', () => {
    const h = !(am.inserts.isEmpty() && am.deletes.isEmpty())
    if (h !== hasSuggestions) { hasSuggestions = h; bumpStore() }
  })
  const onDocUpdate = (_u, _origin, _doc, tr) => { if (tr.local) scheduleTouch() }
  ydoc.on('update', onDocUpdate)
  suggestionDoc.on('update', onDocUpdate)

  if (typeof window !== 'undefined') {
    window.__provider = provider
    window.__awareness = provider.awareness
  }

  activeKey = key
}

const teardownDoc = () => {
  provider?.destroy()
  suggestionProvider?.destroy()
  ydoc?.destroy()
  suggestionDoc?.destroy()
  ydoc = suggestionDoc = provider = suggestionProvider = am = null
  suggestionOtherClientID = null
  activeKey = null
  if (pendingTouchTimer) {
    clearTimeout(pendingTouchTimer)
    pendingTouchTimer = null
  }
  lastTouchAt = 0
}

// Entering Suggesting mode: swap the suggestion doc's clientID so suggestions
// are attributable distinctly from accepted edits by the same user.
const enterSuggestingMode = () => {
  const next = suggestionOtherClientID ?? Math.floor(Math.random() * 2 ** 32)
  suggestionOtherClientID = suggestionDoc.clientID
  suggestionDoc.clientID = next
  am.suggestionMode = true
}

// BlockNote's schema requires `doc > blockGroup > blockContainer+` content, so
// `deltaToPNode` crashes on an empty ytype (createAndFill can't fabricate IDs
// for the required `blockContainer` nodes). Seed the ytype from the editor's
// current doc — that gives us a valid empty BlockNote document to start from.
const seedYTypeIfEmpty = (ytype, pmDoc) => {
  try {
    if (ytype.length === 0) ytype.applyDelta(docToDelta(pmDoc).done())
  } catch (e) {
    console.warn('seedYType failed', e)
  }
}

export function DocumentEditor ({ workspaceId, docId, user, docTitle, onTouch, theme }) {
  initDoc(workspaceId, docId, user)
  touchCb = onTouch
  const myKey = keyFor(workspaceId, docId, user?.id || null)

  // Subscribes once; re-renders when any Y/provider event calls bumpStore().
  useSyncExternalStore(storeSubscribe, storeSnapshot)

  const [mode, setMode] = useState(MODE_VIEWING)
  const [diffView, setDiffView] = useState(null) // { prev, next, attrs, key } | null

  // Only tear down on unmount if this instance is still the active owner.
  // Otherwise a doc-switch (A→B) would tear down B's globals during A's
  // unmount cleanup (which runs AFTER B's initDoc has already taken over).
  useEffect(() => () => {
    if (activeKey === myKey) teardownDoc()
  }, [])

  const changeMode = (next) => {
    if (next === mode) return
    if (next === MODE_SUGGESTING && mode !== MODE_SUGGESTING) enterSuggestingMode()
    else am.suggestionMode = false
    setMode(next)
  }

  const enterDiffView = (prev, next, attrs) => {
    // Unique key so sequential diff views remount a fresh editor (avoids the
    // "Unexpected case" crash from reconfiguring a live PM view).
    setDiffView({ prev, next, attrs, key: Date.now().toString(36) })
  }
  const exitDiffView = () => setDiffView(null)

  const doAcceptAll = () => {
    try { am.acceptAllChanges() } catch (e) { console.error('acceptAll failed', e) }
  }
  const doRejectAll = () => {
    try { am.rejectAllChanges() } catch (e) { console.error('rejectAll failed', e) }
  }

  const showAcceptReject = !diffView && mode !== MODE_READONLY && hasSuggestions
  const isEditable = !diffView && mode !== MODE_READONLY

  return (
    <div className='doc-workspace'>
      <section className='doc-main'>
        <header className='doc-main-header'>
          <div className='doc-main-title-row'>
            <h2 className='doc-main-title'>{docTitle || 'Untitled'}</h2>
            {!diffView && (
              <select
                className='mode-select'
                value={mode}
                onChange={(e) => changeMode(e.target.value)}
                aria-label='Editor mode'
              >
                <option value={MODE_VIEWING}>Viewing</option>
                <option value={MODE_SUGGESTING}>Suggesting</option>
                <option value={MODE_READONLY}>Read-only</option>
              </select>
            )}
          </div>
          <span className={'doc-status doc-status-' + connStatus}>{connStatus}</span>
          {!diffView && showAcceptReject && (
            <div className='accept-reject'>
              <button className='btn btn-sm' onClick={doAcceptAll}>Accept all</button>
              <button className='btn btn-sm' onClick={doRejectAll}>Reject all</button>
            </div>
          )}
          {diffView && <DiffViewBanner onExit={exitDiffView} />}
        </header>
        <div className={'doc-main-editor' + (mode === MODE_READONLY ? ' doc-main-editor-hide-marks' : '')}>
          {ready && (
            <EditorSurface
              key={diffView ? `diff-${diffView.key}` : 'live'}
              diffView={diffView}
              isEditable={isEditable}
              theme={theme}
            />
          )}
          {!ready && <div className='page-loading'>Loading document…</div>}
        </div>
      </section>
      <ActivitySidebar
        workspaceId={workspaceId}
        docId={docId}
        user={user}
        diffView={diffView}
        onEnterDiffView={enterDiffView}
        onExitDiffView={exitDiffView}
      />
    </div>
  )
}

// A fresh EditorSurface mounts on every diff-view transition (keyed above), so
// we only call configureYProsemirror once per mount — avoiding the lib0
// "Unexpected case" crash from reconfiguring a live PM view. Mode changes
// within the live editor flip am.suggestionMode directly via changeMode().
function EditorSurface ({ diffView, isEditable, theme }) {
  const editor = useCreateBlockNote({
    extensions: [
      YSyncExtension({ awareness: diffView ? null : provider.awareness })
    ]
  })

  useEffect(() => {
    const view = editor?.prosemirrorView
    if (!view) return
    if (diffView) {
      const diffAM = Y.createAttributionManagerFromDiff(diffView.prev, diffView.next)
      seedYTypeIfEmpty(diffView.next.get(FRAGMENT_KEY), view.state.doc)
      configureYProsemirror({
        ytype: diffView.next.get(FRAGMENT_KEY),
        attributionManager: diffAM
      })(view.state, view.dispatch)
    } else {
      seedYTypeIfEmpty(suggestionDoc.get(FRAGMENT_KEY), view.state.doc)
      configureYProsemirror({
        ytype: suggestionDoc.get(FRAGMENT_KEY),
        attributionManager: am
      })(view.state, view.dispatch)
    }
  }, [editor])

  return <BlockNoteView editor={editor} editable={isEditable} theme={theme} />
}

function DiffViewBanner ({ onExit }) {
  return (
    <div className='diff-banner'>
      <span className='diff-banner-label'>
        Viewing historical version — editing is disabled
      </span>
      <button className='btn btn-sm' onClick={onExit}>
        Return to latest
      </button>
    </div>
  )
}
