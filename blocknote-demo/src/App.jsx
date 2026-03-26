import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import * as Y from '@y/y'
// import { WebsocketProvider } from '@y/websocket'
import { syncPlugin, configureYProsemirror } from '@y/prosemirror'
import { Extension } from '@tiptap/core'
import { useEffect } from 'react'

const doc = new Y.Doc()
// const provider = new WebsocketProvider('wss://demos.yjs.dev/ws', 'blocknote-y-prosemirror-demo3', doc)
const fragment = doc.get('blocknote')

const YSyncExtension = Extension.create({
  name: 'ySync',
  addProseMirrorPlugins () {
    return [syncPlugin()]
  }
})

export default function App () {
  const editor = useCreateBlockNote({
    _tiptapOptions: {
      extensions: [YSyncExtension]
    }
  })

  useEffect(() => {
    const view = editor._tiptapEditor?.view
    if (view) {
      configureYProsemirror({ ytype: fragment })(view.state, view.dispatch)
    }
  }, [editor])

  return (
    <div style={{ maxWidth: 800, margin: '40px auto' }}>
      <h1 style={{ fontFamily: 'sans-serif', marginBottom: 16 }}>
        BlockNote + @y/prosemirror
      </h1>
      <p style={{ fontFamily: 'sans-serif', color: '#666', marginBottom: 16 }}>
        Open this page in multiple tabs to see real-time collaboration.
      </p>
      <BlockNoteView editor={editor} />
    </div>
  )
}
