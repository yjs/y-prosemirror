import { useEffect, useRef, useState } from 'react'
import './styles.css'
import { USERS, useCurrentUser, setCurrentUser } from './identity.js'
import { useTheme } from './theme.js'
import { useHashRoute, replaceRoute, navigate } from './router.js'
import { generateRandomId } from './utils.js'
import { LoginScreen } from './LoginScreen.jsx'
import { DocumentList } from './DocumentList.jsx'
import { DocumentEditor } from './DocumentEditor.jsx'
import { useDocIndex } from './docIndex.js'

export default function App () {
  const user = useCurrentUser()
  const segments = useHashRoute()
  const theme = useTheme()

  // Route table:
  //   []                                  → if logged in, ensure workspace; else login
  //   ['login']                           → login screen
  //   ['w', wsId]                         → workspace, no doc selected
  //   ['w', wsId, docId]                  → workspace + doc editor
  const [seg0, seg1, seg2] = segments

  useEffect(() => {
    if (user && seg0 !== 'w') {
      replaceRoute(`/w/${generateRandomId(10)}`)
    }
  }, [user, seg0])

  if (!user) {
    return <LoginScreen redirectTo={window.location.hash.slice(1) || '/'} />
  }

  if (seg0 !== 'w' || !seg1) {
    return <div className='page-loading'>Loading…</div>
  }

  const workspaceId = seg1
  const docId = seg2 || null

  return (
    <Workspace
      user={user}
      workspaceId={workspaceId}
      docId={docId}
      theme={theme}
    />
  )
}

function Workspace ({ user, workspaceId, docId, theme }) {
  const themeName = theme.theme
  const index = useDocIndex(workspaceId, user)
  const activeDoc = docId ? index.docs.find((d) => d.id === docId) : null
  const [copied, setCopied] = useState(false)

  const shareWorkspace = () => {
    const url = window.location.href
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
    const p = navigator.clipboard?.writeText(url)
    if (p && typeof p.then === 'function') {
      p.catch(() => window.prompt('Copy this URL to share the workspace', url))
    } else {
      window.prompt('Copy this URL to share the workspace', url)
    }
  }

  const signOut = () => {
    setCurrentUser(null)
    navigate('/')
  }

  const switchUser = (id) => {
    if (id === user.id) return
    setCurrentUser(id)
  }

  return (
    <div className='app-shell'>
      <header className='app-header'>
        <div className='app-header-left'>
          <span className='workspace-badge' title='Workspace ID'>
            <span className='workspace-badge-dot' />
            {workspaceId}
          </span>
          {activeDoc && (
            <span className='app-header-sep'>/</span>
          )}
          {activeDoc && (
            <span className='app-header-doctitle'>{activeDoc.title}</span>
          )}
        </div>
        <div className='app-header-right'>
          <button
            className='btn btn-sm'
            onClick={shareWorkspace}
            title='Copy workspace URL'
          >
            {copied ? 'Link copied' : 'Share workspace'}
          </button>
          <ThemeToggle theme={theme} />
          <UserMenu user={user} onSwitch={switchUser} onSignOut={signOut} />
        </div>
      </header>
      <div className='app-body'>
        <DocumentList
          index={index}
          workspaceId={workspaceId}
          activeDocId={docId}
        />
        {activeDoc
          ? (
            <DocumentEditor
              key={activeDoc.id}
              workspaceId={workspaceId}
              docId={activeDoc.id}
              user={user}
              docTitle={activeDoc.title}
              onTouch={() => index.touch(activeDoc.id)}
              theme={themeName}
            />
            )
          : (
            <EmptyDocPane
              hasDocs={index.docs.length > 0}
              onCreate={() => {
                const id = index.create()
                if (id) navigate(`/w/${workspaceId}/${id}`)
              }}
            />
            )}
      </div>
      <CaveatsFooter />
    </div>
  )
}

function ThemeToggle ({ theme }) {
  return (
    <button
      className='btn btn-sm'
      onClick={theme.toggle}
      title={theme.override ? 'Theme (click to flip — clearing follows OS)' : 'Theme (click to override OS)'}
    >
      {theme.theme === 'dark' ? '🌙' : '☀️'}
      {theme.override && (
        <span
          className='theme-reset'
          onClick={(e) => {
            e.stopPropagation()
            theme.clearOverride()
          }}
          title='Follow system preference'
        >
          ↺
        </span>
      )}
    </button>
  )
}

function UserMenu ({ user, onSwitch, onSignOut }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDocClick = (e) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (id) => {
    setOpen(false)
    onSwitch(id)
  }

  return (
    <div className='user-menu' ref={rootRef}>
      <button
        className='user-pill'
        onClick={() => setOpen((o) => !o)}
        aria-haspopup='menu'
        aria-expanded={open}
        title='Switch user'
      >
        <span className='user-avatar' style={{ backgroundColor: user.color }}>
          {user.name[0]}
        </span>
        <span className='user-name'>{user.name}</span>
        <span className='user-caret' aria-hidden='true'>▾</span>
      </button>
      {open && (
        <div className='user-menu-panel' role='menu'>
          <div className='user-menu-label'>Switch user</div>
          {USERS.map((u) => {
            const isCurrent = u.id === user.id
            return (
              <button
                key={u.id}
                className='user-menu-item'
                role='menuitemradio'
                aria-checked={isCurrent}
                onClick={() => pick(u.id)}
              >
                <span className='user-avatar' style={{ backgroundColor: u.color }}>
                  {u.name[0]}
                </span>
                <span className='user-menu-item-name'>{u.name}</span>
                {isCurrent && <span className='user-menu-check' aria-hidden='true'>✓</span>}
              </button>
            )
          })}
          <div className='user-menu-divider' />
          <button
            className='user-menu-item user-menu-item-signout'
            role='menuitem'
            onClick={() => { setOpen(false); onSignOut() }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function EmptyDocPane ({ hasDocs, onCreate }) {
  return (
    <section className='doc-empty'>
      <div className='doc-empty-inner'>
        <h2 className='doc-empty-title'>
          {hasDocs ? 'Pick a document from the sidebar' : 'No documents yet'}
        </h2>
        <p className='doc-empty-sub'>
          {hasDocs
            ? 'Or create a new one to start writing.'
            : 'Create your first document to start writing and collaborating.'}
        </p>
        <button className='btn btn-primary' onClick={onCreate}>
          + New document
        </button>
      </div>
    </section>
  )
}

function CaveatsFooter () {
  return (
    <footer className='app-footer'>
      <details>
        <summary>Known demo caveats</summary>
        <ul>
          <li>Attribution rendering is intentionally coarse — single colors per operation type, not per author.</li>
          <li>Concurrent node-splitting edits can diverge across peers.</li>
          <li>Long offline sessions may produce edits that fail schema validation on reconnect and get dropped.</li>
        </ul>
      </details>
    </footer>
  )
}
