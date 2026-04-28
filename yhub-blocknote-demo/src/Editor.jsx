import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import { Extension, Mark } from '@tiptap/core'
import { syncPlugin, yCursorPlugin } from '@y/prosemirror'
import { useEffect } from 'react'
import { yhub, mapAttributionToMark } from './yhub.js'

/**
 * Tiptap mark extensions for the three attribution marks produced by
 * `mapAttributionToMark`. The mark *names* must be exactly these three -
 * y-prosemirror checks them by name. The DOM serialization is local choice;
 * we render them as <y-ins>, <y-del>, <y-fmt> and style them in index.html
 * to mimic BlockNote's built-in suggestion marks.
 */
const YAttributedInsert = Mark.create({
  name: 'y-attributed-insert',
  // Putting this mark in the `insertion` group lets BlockNote nodes that
  // already declare `marks: "insertion modification deletion"` accept it.
  group: 'insertion',
  addAttributes () {
    return {
      userIds: { default: null },
      timestamp: { default: null }
    }
  },
  parseHTML () { return [{ tag: 'y-ins' }] },
  renderHTML ({ HTMLAttributes }) { return ['y-ins', HTMLAttributes, 0] }
})

const YAttributedDelete = Mark.create({
  name: 'y-attributed-delete',
  group: 'deletion',
  addAttributes () {
    return {
      userIds: { default: null },
      timestamp: { default: null }
    }
  },
  parseHTML () { return [{ tag: 'y-del' }] },
  renderHTML ({ HTMLAttributes }) { return ['y-del', HTMLAttributes, 0] }
})

const YAttributedFormat = Mark.create({
  name: 'y-attributed-format',
  group: 'modification',
  addAttributes () {
    return {
      userIdsByAttr: { default: null },
      timestamp: { default: null }
    }
  },
  parseHTML () { return [{ tag: 'y-fmt' }] },
  renderHTML ({ HTMLAttributes }) { return ['y-fmt', HTMLAttributes, 0] }
})

const YSyncExtension = Extension.create({
  name: 'ySync',
  addProseMirrorPlugins () {
    return [syncPlugin({ mapAttributionToMark })]
  }
})

const YCursorExtension = Extension.create({
  name: 'yCursor',
  addProseMirrorPlugins () {
    return [yCursorPlugin(yhub.provider.awareness)]
  }
})

export default function Editor () {
  const editor = useCreateBlockNote({
    _tiptapOptions: {
      extensions: [
        YAttributedInsert,
        YAttributedDelete,
        YAttributedFormat,
        YSyncExtension,
        YCursorExtension
      ]
    }
  })

  useEffect(() => {
    const view = editor?._tiptapEditor?.view
    if (view) {
      yhub.attachView(view)
      // BlockNote (BlockNoteEditor.ts) monkey-patches `doc.createAndFill` to
      // cache and always return the initial empty document. That keeps the
      // initial blockContainer id stable as "initialBlockId" but breaks any
      // later reconstruction (e.g. when configureYProsemirror swaps the
      // bound y-fragment) - createAndFill returns the cached empty doc no
      // matter what content we pass. After the initial sync we delete the
      // instance override so the prototype's createAndFill is used again.
      const docType = view.state.schema.nodes.doc
      if (Object.prototype.hasOwnProperty.call(docType, 'createAndFill')) {
        delete docType.createAndFill
      }
    }
    return () => yhub.detachView()
  }, [editor])

  return <BlockNoteView editor={editor} theme='light' />
}
