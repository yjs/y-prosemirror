import { useState } from 'react'
import { navigate } from './router.js'
import { formatRelative } from './utils.js'

export function DocumentList ({ index, workspaceId, activeDocId }) {
  const [editingId, setEditingId] = useState(null)
  const [editingValue, setEditingValue] = useState('')

  const startEdit = (doc) => {
    setEditingId(doc.id)
    setEditingValue(doc.title)
  }
  const commitEdit = () => {
    if (editingId) {
      index.rename(editingId, editingValue.trim() || 'Untitled')
    }
    setEditingId(null)
    setEditingValue('')
  }
  const cancelEdit = () => {
    setEditingId(null)
    setEditingValue('')
  }

  const onCreate = () => {
    const id = index.create()
    if (id) navigate(`/w/${workspaceId}/${id}`)
  }

  const onOpen = (id) => {
    navigate(`/w/${workspaceId}/${id}`)
  }

  const onDelete = (id, title) => {
    if (window.confirm(`Delete "${title}"? This can't be undone in the demo.`)) {
      index.remove(id)
      if (activeDocId === id) navigate(`/w/${workspaceId}`)
    }
  }

  return (
    <aside className='doc-list'>
      <div className='doc-list-header'>
        <span className='doc-list-label'>Documents</span>
        <button className='btn btn-primary btn-sm' onClick={onCreate}>
          + New
        </button>
      </div>
      {index.docs.length === 0 && (
        <div className='doc-list-empty'>
          No documents yet.
          <br />
          Create one to start.
        </div>
      )}
      <ul className='doc-list-items'>
        {index.docs.map((doc) => (
          <li
            key={doc.id}
            className={'doc-list-item' + (activeDocId === doc.id ? ' active' : '')}
          >
            {editingId === doc.id
              ? (
                <input
                  className='doc-list-item-input'
                  value={editingValue}
                  autoFocus
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit()
                    if (e.key === 'Escape') cancelEdit()
                  }}
                />
                )
              : (
                <button
                  className='doc-list-item-open'
                  onClick={() => onOpen(doc.id)}
                  onDoubleClick={() => startEdit(doc)}
                  title='Double-click to rename'
                >
                  <span className='doc-list-item-title'>{doc.title}</span>
                  <span className='doc-list-item-meta'>{formatRelative(doc.updatedAt)}</span>
                </button>
                )}
            <div className='doc-list-item-actions'>
              <button
                className='btn-icon'
                onClick={() => startEdit(doc)}
                title='Rename'
                aria-label='Rename'
              >
                ✎
              </button>
              <button
                className='btn-icon btn-icon-danger'
                onClick={() => onDelete(doc.id, doc.title)}
                title='Delete'
                aria-label='Delete'
              >
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  )
}
