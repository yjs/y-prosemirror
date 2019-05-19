# y-prosemirror
> [ProseMirror](http://prosemirror.net/) Binding for [Yjs](https://github.com/y-js/yjs) - [Demo](https://yjs-demos.now.sh/prosemirror/)

This binding maps a Y.XmlFragment to the ProseMirror state.

### Features

* Shared Cursors
* Successfully recovers when concurrents edit result in an invalid document schema

### Example

```js
import { prosemirrorPlugin, cursorPlugin } from 'y-prosemirror'

..

const type = ydocument.get('prosemirror', Y.XmlFragment)

const prosemirrorView = new EditorView(document.querySelector('#editor'), {
  state: EditorState.create({
    schema,
    plugins: exampleSetup({ schema }).concat([prosemirrorPlugin(type), cursorPlugin])
  })
})
```

Also look [here](https://github.com/y-js/yjs-demos/tree/master/prosemirror) for a working example.

### License

[The MIT License](./LICENSE) © Kevin Jahns