import { useCreateBlockNote } from '@blocknote/react'
import { createExtension } from '@blocknote/core'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import { syncPlugin, yCursorPlugin } from '@y/prosemirror'
import { useEffect } from 'react'
import { yhub, mapAttributionToMark } from './yhub.js'
import { blockMatchNodes } from './blockMatchNodes.js'

const YSyncExtension = createExtension(() => ({
  key: 'ySync',
  // `matchNodes` raises the diff boundary to the whole `blockContainer` when its
  // block-content type changes, so a type-change suggestion becomes two sibling
  // containers (deleted + inserted) instead of two block-contents in one. No
  // storage transform and no schema change - BlockNote's `blockContainer`
  // already whitelists the `y-attributed-*` marks the attributed containers use.
  prosemirrorPlugins: [syncPlugin({ mapAttributionToMark, matchNodes: blockMatchNodes })]
}))

const YCursorExtension = createExtension(() => ({
  key: 'yCursor',
  prosemirrorPlugins: [yCursorPlugin(yhub.provider.awareness)]
}))

export default function Editor () {
  const editor = useCreateBlockNote({
    extensions: [
      YSyncExtension(),
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
