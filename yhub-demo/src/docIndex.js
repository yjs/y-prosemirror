import { useEffect, useMemo, useRef, useState } from 'react'
import * as Y from '@y/y'
import { WebsocketProvider } from '@y/websocket'
import { wsUrl, wsParamsForUser } from './yhub.js'
import { generateRandomId, generateDocTitle } from './utils.js'

const ROOT_KEY = 'documents'

const readDocs = (root) => {
  const out = []
  for (let i = 0; i < root.length; i++) {
    const entry = root.get(i)
    if (!entry || !entry.getAttr) continue
    const deletedAt = entry.getAttr('deletedAt')
    if (deletedAt) continue
    out.push({
      id: entry.getAttr('id'),
      title: entry.getAttr('title') || 'Untitled',
      creatorId: entry.getAttr('creatorId') || null,
      createdAt: entry.getAttr('createdAt') || 0,
      updatedAt: entry.getAttr('updatedAt') || 0
    })
  }
  out.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  return out.filter((d) => d.id)
}

const findEntryById = (root, id) => {
  for (let i = 0; i < root.length; i++) {
    const entry = root.get(i)
    if (entry && entry.getAttr && entry.getAttr('id') === id) return entry
  }
  return null
}

export const useDocIndex = (workspaceId, user) => {
  const [docs, setDocs] = useState([])
  const [status, setStatus] = useState('connecting')
  const ydocRef = useRef(null)
  const providerRef = useRef(null)

  const userId = user?.id || null
  useEffect(() => {
    if (!workspaceId) return
    const ydoc = new Y.Doc()
    const docid = `ws-${workspaceId}.index`
    // Tag every update on the index doc (create/rename/delete/touch) with the
    // current user's id via yhub's WS `customAttributions` query param. Re-run
    // when userId changes so a reconnect picks up the new tag.
    const userForParams = userId ? { id: userId } : null
    const provider = new WebsocketProvider(wsUrl, docid, ydoc, {
      params: wsParamsForUser(userForParams, { gc: 'false' })
    })
    ydocRef.current = ydoc
    providerRef.current = provider

    const root = ydoc.get(ROOT_KEY)
    const refresh = () => setDocs(readDocs(root))
    root.observeDeep(refresh)
    refresh()

    const onStatus = (e) => setStatus(e.status)
    provider.on('status', onStatus)

    return () => {
      root.unobserveDeep(refresh)
      provider.off('status', onStatus)
      provider.destroy()
      ydoc.destroy()
      ydocRef.current = null
      providerRef.current = null
    }
  }, [workspaceId, userId])

  const create = (title = generateDocTitle()) => {
    const ydoc = ydocRef.current
    if (!ydoc) return null
    const id = generateRandomId(6)
    const now = Date.now()
    const root = ydoc.get(ROOT_KEY)
    ydoc.transact(() => {
      const entry = new Y.Type('document')
      root.push([entry])
      entry.setAttr('id', id)
      entry.setAttr('title', title)
      entry.setAttr('creatorId', user?.id || null)
      entry.setAttr('createdAt', now)
      entry.setAttr('updatedAt', now)
    })
    return id
  }

  const rename = (id, title) => {
    const ydoc = ydocRef.current
    if (!ydoc) return
    const root = ydoc.get(ROOT_KEY)
    const entry = findEntryById(root, id)
    if (!entry) return
    ydoc.transact(() => {
      entry.setAttr('title', title)
      entry.setAttr('updatedAt', Date.now())
    })
  }

  const touch = (id) => {
    const ydoc = ydocRef.current
    if (!ydoc) return
    const root = ydoc.get(ROOT_KEY)
    const entry = findEntryById(root, id)
    if (!entry) return
    entry.setAttr('updatedAt', Date.now())
  }

  const remove = (id) => {
    const ydoc = ydocRef.current
    if (!ydoc) return
    const root = ydoc.get(ROOT_KEY)
    const entry = findEntryById(root, id)
    if (!entry) return
    entry.setAttr('deletedAt', Date.now())
  }

  return useMemo(
    () => ({ docs, status, create, rename, remove, touch }),
    [docs, status]
  )
}
