import { useEffect, useMemo, useRef, useState } from 'react'
import * as Y from '@y/y'
import { getActivity, getChangeset, postRollback, userIdFromActivity } from './yhub.js'
import { USERS } from './identity.js'
import { formatRelative } from './utils.js'

const POLL_INTERVAL = 5000

// yhub returns deltas as a nested tree: block deltas contain `children`, and
// `insert` ops can carry either a string (leaf text) or an array of nested
// delta objects. Attribution only tags leaf text ops. Walk the tree and sum
// character counts for attributed inserts/deletes.
const countDelta = (d) => {
  let inserted = 0
  let deleted = 0
  const walk = (node) => {
    if (!node) return
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    if (node.type === 'insert') {
      if (typeof node.insert === 'string') {
        const len = node.insert.length
        if (node.attribution?.insert != null) inserted += len
        else if (node.attribution?.delete != null) deleted += len
      } else if (Array.isArray(node.insert)) {
        walk(node.insert)
      }
      return
    }
    if (node.type === 'delta' || node.children) {
      walk(node.children)
    }
  }
  walk(d)
  return { inserted, deleted }
}

const userById = (id) => USERS.find((u) => u.id === id) || null

// The public standalone yhub uses open auth, which means the server-assigned
// `by` field is an anonymous id (e.g. "Garfield"). We tag each edit with a
// `user:<id>` customAttribution from the WS provider (see yhub.js /
// DocumentEditor.jsx) so we can recover the real author on the client. Prefer
// that tag; fall back to `by` (useful if the backend is ever swapped for one
// with real auth).
const resolveActorId = (act) => userIdFromActivity(act) || act.by || null

const actorLabel = (act) => {
  const id = resolveActorId(act)
  if (!id) return 'Unknown'
  const user = userById(id)
  return user ? user.name : id
}

const actorColor = (act) => {
  const id = resolveActorId(act)
  const user = id ? userById(id) : null
  return user ? user.color : '#9aa0a6'
}

const wasRollback = (act) =>
  Array.isArray(act.customAttributions) &&
  act.customAttributions.some((a) => a.k === 'rollback')

const sameActivity = (a, b) => {
  if (a === b) return true
  if (a.length !== b.length) return false
  if (a.length === 0) return true
  return a[0].from === b[0].from && a[a.length - 1].from === b[b.length - 1].from
}

export function ActivitySidebar ({
  workspaceId,
  docId,
  user,
  diffView,
  onEnterDiffView,
  onExitDiffView
}) {
  const [activity, setActivity] = useState([])
  const [selectionStart, setSelectionStart] = useState(null)
  const [selectionEnd, setSelectionEnd] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [freshIds, setFreshIds] = useState(new Set())
  const [rollbackInFlight, setRollbackInFlight] = useState(false)
  const prevIdsRef = useRef(new Set())
  const activityRef = useRef(activity)
  activityRef.current = activity

  const docid = `ws-${workspaceId}.doc-${docId}`

  useEffect(() => {
    let cancelled = false
    let timer = null
    const freshTimers = []
    const tick = async () => {
      try {
        const data = await getActivity(docid)
        if (cancelled) return
        // Activity entries are immutable; a length + boundary-id check is
        // enough to detect a real change and avoid re-rendering every 5s.
        setActivity((prev) => sameActivity(prev, data) ? prev : data)
        const nowIds = new Set(data.map((a) => a.from))
        const newArrivals = []
        for (const id of nowIds) {
          if (!prevIdsRef.current.has(id)) newArrivals.push(id)
        }
        prevIdsRef.current = nowIds
        if (newArrivals.length > 0) {
          setFreshIds((prev) => {
            const next = new Set(prev)
            newArrivals.forEach((id) => next.add(id))
            return next
          })
          newArrivals.forEach((id) => {
            const t = setTimeout(() => {
              setFreshIds((prev) => {
                const next = new Set(prev)
                next.delete(id)
                return next
              })
            }, 2500)
            freshTimers.push(t)
          })
        }
      } catch (e) {
        if (!cancelled) console.error('activity poll failed', e)
      }
      if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL)
    }
    tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      freshTimers.forEach(clearTimeout)
    }
  }, [docid, user])

  const deltaCounts = useMemo(() => activity.map((a) => countDelta(a.delta)), [activity])

  const selection = useMemo(() => {
    if (selectionStart === null || selectionEnd === null) return null
    return {
      minIdx: Math.min(selectionStart, selectionEnd),
      maxIdx: Math.max(selectionStart, selectionEnd)
    }
  }, [selectionStart, selectionEnd])

  const loadDiffFor = async (minIdx, maxIdx) => {
    const list = activityRef.current
    if (minIdx < 0 || maxIdx >= list.length) return
    const from = list[maxIdx].from
    const to = list[minIdx].to
    try {
      const history = await getChangeset(docid, from, to)
      const prev = Y.createDocFromUpdate(history.prevDoc)
      const next = Y.createDocFromUpdate(history.nextDoc)
      const attrs = history.attributions ? Y.decodeContentMap(history.attributions) : null
      onEnterDiffView(prev, next, attrs)
    } catch (e) {
      console.error('changeset load failed', e)
    }
  }

  const onItemMouseDown = (e, idx) => {
    // Clicking inside a live diff range on the same range → exit diff view
    if (diffView && selection && idx >= selection.minIdx && idx <= selection.maxIdx) {
      clearSelection()
      onExitDiffView()
      e.preventDefault()
      return
    }
    setIsDragging(true)
    setSelectionStart(idx)
    setSelectionEnd(idx)
    e.preventDefault()
  }

  const onItemMouseEnter = (idx) => {
    if (!isDragging) return
    setSelectionEnd(idx)
  }

  useEffect(() => {
    const onUp = () => {
      if (!isDragging) return
      setIsDragging(false)
      if (selectionStart !== null && selectionEnd !== null) {
        const minIdx = Math.min(selectionStart, selectionEnd)
        const maxIdx = Math.max(selectionStart, selectionEnd)
        loadDiffFor(minIdx, maxIdx)
      }
    }
    document.addEventListener('mouseup', onUp)
    return () => document.removeEventListener('mouseup', onUp)
  }, [isDragging, selectionStart, selectionEnd])

  const clearSelection = () => {
    setSelectionStart(null)
    setSelectionEnd(null)
  }

  const onReturnToLatest = () => {
    clearSelection()
    onExitDiffView()
  }

  const onRestoreVersion = async () => {
    if (!selection || rollbackInFlight) return
    const from = activity[selection.maxIdx].from
    const to = activity[selection.minIdx].to
    // Tag the rollback itself with the current user so the resulting activity
    // entry is attributed to whoever clicked "Restore this version". The HTTP
    // rollback path doesn't go through the WS `customAttributions` param, so
    // we have to include the `user` tag in the POST body.
    const customAttributions = [{ k: 'rollback', v: 'true' }]
    if (user?.id) customAttributions.push({ k: 'user', v: user.id })
    setRollbackInFlight(true)
    try {
      await postRollback(docid, from, to, customAttributions)
      clearSelection()
      onExitDiffView()
    } catch (e) {
      console.error('rollback failed', e)
      window.alert('Restore failed: ' + e.message)
    } finally {
      setRollbackInFlight(false)
    }
  }

  return (
    <aside className='activity-sidebar'>
      <div className='activity-header'>
        <span className='activity-title'>Activity</span>
      </div>
      {diffView && (
        <div className='activity-diff-banner'>
          <span className='activity-diff-label'>Viewing historical version</span>
          <div className='activity-diff-actions'>
            <button
              className='btn btn-sm'
              onClick={onReturnToLatest}
            >
              Return to latest
            </button>
            <button
              className='btn btn-sm btn-primary'
              onClick={onRestoreVersion}
              disabled={rollbackInFlight}
            >
              {rollbackInFlight ? 'Restoring…' : 'Restore this version'}
            </button>
          </div>
        </div>
      )}
      {activity.length === 0 && (
        <div className='activity-empty'>No activity yet.</div>
      )}
      <ul className='activity-items'>
        {activity.map((act, idx) => {
          const { inserted, deleted } = deltaCounts[idx]
          const selected =
            selection && idx >= selection.minIdx && idx <= selection.maxIdx
          const fresh = freshIds.has(act.from)
          const rollback = wasRollback(act)
          return (
            <li
              key={act.from + '-' + idx}
              className={
                'activity-item' +
                (selected ? ' selected' : '') +
                (fresh ? ' fresh' : '') +
                (rollback ? ' rollback' : '')
              }
              onMouseDown={(e) => onItemMouseDown(e, idx)}
              onMouseEnter={() => onItemMouseEnter(idx)}
            >
              <div className='activity-item-row1'>
                <span
                  className='activity-avatar'
                  style={{ backgroundColor: actorColor(act) }}
                >
                  {actorLabel(act)[0]?.toUpperCase() || '?'}
                </span>
                <span className='activity-actor'>{actorLabel(act)}</span>
                <span className='activity-time'>{formatRelative(act.from, { justNowMs: 45_000 })}</span>
              </div>
              <div className='activity-item-row2'>
                {rollback && <span className='activity-badge'>rollback</span>}
                {inserted > 0 && (
                  <span className='activity-delta activity-delta-insert'>+{inserted}</span>
                )}
                {deleted > 0 && (
                  <span className='activity-delta activity-delta-delete'>-{deleted}</span>
                )}
                {inserted === 0 && deleted === 0 && !rollback && (
                  <span className='activity-delta activity-delta-none'>no changes</span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
