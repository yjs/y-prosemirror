import { useCreateBlockNote } from '@blocknote/react'
import { createExtension } from '@blocknote/core'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import { syncPlugin, yCursorPlugin, ySuggestionDecorationPlugin } from '@y/prosemirror'
import { useEffect } from 'react'
import { yhub } from './yhub.js'

const YSyncExtension = createExtension(() => ({
  key: 'ySync',
  prosemirrorPlugins: [syncPlugin({ decorationMode: true })]
}))

const YSuggestionDecorationExtension = createExtension(() => ({
  key: 'ySuggestionDecoration',
  prosemirrorPlugins: [ySuggestionDecorationPlugin()]
}))

const YCursorExtension = createExtension(() => ({
  key: 'yCursor',
  prosemirrorPlugins: [yCursorPlugin(yhub.provider.awareness)]
}))

export default function Editor () {
  const editor = useCreateBlockNote({
    extensions: [
      YSyncExtension(),
      YSuggestionDecorationExtension(),
      YCursorExtension()
    ]
  })

  useEffect(() => {
    const view = editor?._tiptapEditor?.view
    if (view) {
      yhub.attachView(view)
    }
    return () => yhub.detachView()
  }, [editor])

  return <BlockNoteView editor={editor} theme='light' />
}
