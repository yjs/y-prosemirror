# y-prosemirror

> [ProseMirror](http://prosemirror.net/) Binding for [Yjs](https://github.com/yjs/yjs) - [Demo](https://yjs-demos.now.sh/prosemirror/)

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
        yUndoPlugin(),
        keymap({
          'Mod-z': undo,
          'Mod-y': redo,
          'Mod-Shift-z': redo
        })
      ].concat(exampleSetup({ schema }))
  })
})
```

Also look [here](https://github.com/yjs/yjs-demos/tree/master/prosemirror) for a working example.

#### Remote Cursors

The shared cursors depend on the Awareness instance that is exported by most providers. The Awareness protocol handles non-permanent data like the number of users, their user names, their cursor location, and their colors. You can change the name and color of the user like this:

```js
example.binding.awareness.setLocalStateField('user', { color: '#008833', name: 'My real name' })
```

In order to render cursor information you need to embed custom CSS for the user icon. This is a template that you can use for styling cursor information.

```css
/* this is a rough fix for the first cursor position when the first paragraph is empty */
.ProseMirror > .ProseMirror-yjs-cursor:first-child {
  margin-top: 16px;
}
.ProseMirror p:first-child, .ProseMirror h1:first-child, .ProseMirror h2:first-child, .ProseMirror h3:first-child, .ProseMirror h4:first-child, .ProseMirror h5:first-child, .ProseMirror h6:first-child {
  margin-top: 16px
}
/* This gives the remote user caret. The colors are automatically overwritten*/
.ProseMirror-yjs-cursor {
  position: relative;
  margin-left: -1px;
  margin-right: -1px;
  border-left: 1px solid black;
  border-right: 1px solid black;
  border-color: orange;
  word-break: normal;
  pointer-events: none;
}
/* This renders the username above the caret */
.ProseMirror-yjs-cursor > div {
  position: absolute;
  top: -1.05em;
  left: -1px;
  font-size: 13px;
  background-color: rgb(250, 129, 0);
  font-family: serif;
  font-style: normal;
  font-weight: normal;
  line-height: normal;
  user-select: none;
  color: white;
  padding-left: 2px;
  padding-right: 2px;
  white-space: nowrap;
}
```

You can also overwrite the default Widget dom by specifying a cursor builder in the yCursorPlugin

```js
/**
 * This function receives the remote users "user" awareness state.
 */
export const myCursorBuilder = user => {
  const cursor = document.createElement('span')
  cursor.classList.add('ProseMirror-yjs-cursor')
  cursor.setAttribute('style', `border-color: ${user.color}`)
  const userDiv = document.createElement('div')
  userDiv.setAttribute('style', `background-color: ${user.color}`)
  userDiv.insertBefore(document.createTextNode(user.name), null)
  cursor.insertBefore(userDiv, null)
  return cursor
}

const prosemirrorView = new EditorView(document.querySelector('#editor'), {
  state: EditorState.create({
    schema,
    plugins: [
        ySyncPlugin(type),
        yCursorPlugin(provider.awareness, { cursorBuilder: myCursorBuilder }),
        yUndoPlugin(),
        keymap({
          'Mod-z': undo,
          'Mod-y': redo,
          'Mod-Shift-z': redo
        })
      ].concat(exampleSetup({ schema }))
  })
})
```

### License

[The MIT License](./LICENSE) © Kevin Jahns
