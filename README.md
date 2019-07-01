# y-prosemirror

> [ProseMirror](http://prosemirror.net/) Binding for [Yjs](https://github.com/y-js/yjs) - [Demo](https://yjs-demos.now.sh/prosemirror/)

This binding maps a Y.XmlFragment to the ProseMirror state.

## Features

* Sync ProseMirror state
* Shared Cursors
* Shared Undo / Redo (each client has its own undo-/redo-history)
* Successfully recovers when concurrents edit result in an invalid document schema

### Example

```js
import { ySyncPlugin, yCursorPlugin, yUndoPlugin, undo, redo } from 'y-prosemirror'
import { exampleSetup } from 'prosemirror-example-setup'
import { keymap } from 'prosemirror-keymap'
..

const type = ydocument.get('prosemirror', Y.XmlFragment)

const prosemirrorView = new EditorView(document.querySelector('#editor'), {
  state: EditorState.create({
    schema,
    plugins: [
        ySyncPlugin(type),
        yCursorPlugin(provider.awareness),
        yUndoPlugin,
        keymap({
          'Mod-z': undo,
          'Mod-y': redo,
          'Mod-Shift-z': redo
        })
      ].concat(exampleSetup({ schema }))
  })
})
```

Also look [here](https://github.com/y-js/yjs-demos/tree/master/prosemirror) for a working example.

### License

[The MIT License](./LICENSE) © Kevin Jahns
