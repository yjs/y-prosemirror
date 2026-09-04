# y-prosemirror

> [ProseMirror](http://prosemirror.net/) Binding for [Yjs](https://github.com/yjs/yjs) - [Demo](https://demos.yjs.dev/prosemirror/prosemirror.html)

> [!NOTE]
> The `main` branch of this repository is the development branch for the unstable
> `@y/prosemirror` release, which adds support for Yjs v14 (`@y/y`). Most users
> should continue to use the stable `y-prosemirror` package with Yjs v13 for now.
> The documentation below applies to the stable `y-prosemirror` release.

This binding maps a Y.XmlFragment to the ProseMirror state.

## Features

* Sync ProseMirror state
* Shared Cursors
* Shared Undo / Redo (each client has its own undo-/redo-history)
* Successfully recovers when concurrents edit result in an invalid document schema

### Example

```js
import { ySyncPlugin, yCursorPlugin, yUndoPlugin, undo, redo, initProseMirrorDoc } from 'y-prosemirror'
import { exampleSetup } from 'prosemirror-example-setup'
import { keymap } from 'prosemirror-keymap'
..

const type = ydocument.get('prosemirror', Y.XmlFragment)
const { doc, mapping } = initProseMirrorDoc(type, schema)

const prosemirrorView = new EditorView(document.querySelector('#editor'), {
  state: EditorState.create({
    doc,
    schema,
    plugins: [
        ySyncPlugin(type, { mapping }),
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

The shared cursors depend on the Awareness instance that is exported by most providers. The [Awareness protocol](https://github.com/yjs/y-protocols#awareness-protocol) handles non-permanent data like the number of users, their user names, their cursor location, and their colors. You can change the name and color of the user like this:

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

#### Utilities

The package includes a number of utility methods for converting back and forth between
a Y.Doc and Prosemirror compatible data structures. These can be useful for persisting
to a datastore or for importing existing documents.

> _Note_: Serializing and deserializing to JSON will not store collaboration history
> steps and as such should not be used as the primary storage. You will still need
> to store the Y.Doc binary update format.

```js
import { prosemirrorToYDoc } from 'y-prosemirror'

// Pass JSON previously output from Prosemirror
const doc = Node.fromJSON(schema, {
  type: "doc",
  content: [...]
})
const ydoc = prosemirrorToYDoc(doc)
```

Because JSON is a common usecase there is an equivalent method that skips the need
to create a Prosemirror Node.

```js
import { prosemirrorJSONToYDoc } from 'y-prosemirror'

// Pass JSON previously output from Prosemirror
const ydoc = prosemirrorJSONToYDoc(schema, {
  type: "doc",
  content: [...]
})
```

```js
import { yDocToProsemirror } from 'y-prosemirror'

// apply binary updates from elsewhere
const ydoc = new Y.Doc()
ydoc.applyUpdate(update)

const node = yDocToProsemirror(schema, ydoc)
```

Because JSON is a common usecase there is an equivalent method that outputs JSON
directly, this method does not require the Prosemirror schema.

```js
import { yDocToProsemirrorJSON } from 'y-prosemirror'

// apply binary updates from elsewhere
const ydoc = new Y.Doc()
ydoc.applyUpdate(update)

const node = yDocToProsemirrorJSON(ydoc)
```

### Positions

Three position representations exist side by side, and y-prosemirror translates
between them:

- **ProseMirror positions** — integer offsets into the flat document
  (`state.doc.resolve(pos)` yields a `ResolvedPos`). Everything in ProseMirror
  speaks them, but they are only meaningful for one document snapshot: every edit
  shifts them, and two peers generally disagree on them while changes are in flight.
- **Delta positions** (`lib0/delta/position`) — tree paths (`{ path, assoc }`) in
  delta coordinates (one slot per character, one per element child). They express
  the same snapshot-bound location structurally, which is what makes them mappable
  through delta transformers — they are the intermediate format of every
  translation.
- **Relative positions**
  ([Y.RelativePosition](https://docs.yjs.dev/api/relative-positions)) — anchored to
  content *identity* in the Y document rather than to an offset. They are
  JSON-encodable, survive local and remote edits, and are guaranteed to sync up:
  once peers have exchanged their updates, every peer resolves the same relative
  position to the same location.

**Prefer relative positions** for anything that outlives a single transaction or
leaves the local editor — cursors, comments, annotations, stored selections. A
ProseMirror position can only be carried across *local* transactions
(`tr.mapping`); a relative position always updates with remote changes as well.

Translate between them with the view-based converters, which derive the bound
type, the renderer, and the live binding transformer from the editor view. The
converters take the `EditorView` rather than a state on purpose: a ProseMirror
position only maps against the latest document, and that is what is bound to the
view — a held `state` reference can be stale.

```js
import { resolvedPositionToRelativePosition, relativePositionToResolvedPosition } from 'y-prosemirror'

// encode: PM position → relative position (JSON-encodable via Y.relativePositionToJSON)
const rpos = resolvedPositionToRelativePosition(view, view.state.doc.resolve(pos))

// later — possibly after edits, possibly on another peer — decode it again
const resolved = relativePositionToResolvedPosition(view, rpos)
if (resolved != null) {
  console.log('the anchored position now lives at', resolved.pos)
}
```

Every converter returns `null` (and never throws) when a position cannot be
anchored or resolved — e.g. it points into content the other side does not have.
`resolvedPositionsToRelativePositions` / `relativePositionsToResolvedPositions` are
the batched variants (one transformer pass serves many positions). For use without
an editor view (e.g. server-side), compose the delta layer directly:
`resolvedPositionToDeltaPosition` / `deltaPositionToResolvedPosition` together with
yjs's `createRelativePositionFromDeltaPosition` /
`createDeltaPositionFromRelativePosition`.

#### Maintaining positions

Maintaining a relative position in a ProseMirror editor is more involved than it
looks, because translation is bound to the *view* of the document — the document
after the state has been updated. During state transactions (plugin `apply`,
`appendTransaction`) the ProseMirror document and the Y render can be mid-flight,
so positions cannot reliably be translated there.

The pattern: translate the relative position against the view **when you receive
it** — from another peer, or from storage — and then maintain the resulting
ProseMirror position as usual, mapping it through `tr.mapping` like any other
position. The "actual" ProseMirror position can always be reconstructed by
translating against the view again. This is exactly what the cursor plugin does:
it re-renders all positions (relative → ProseMirror) whenever it receives an
update, and lets ProseMirror map the resulting decorations through local
transactions in between.

#### Position store

`relativePositionStore` captures a position and returns a function that finds it
again later — after local and remote edits, or in another editor bound to the same
document:

```js
import { relativePositionStore } from 'y-prosemirror'

const restore = relativePositionStore(view, view.state.doc.resolve(pos))
// … concurrent local & remote edits …
if (restore != null) {
  const resolved = restore(view) // ResolvedPos | null
}
```

It returns `null` when the position cannot be anchored, and the restore function
returns `null` when the stored position can no longer be resolved.
`relativePositionStoreMapping` is the `Mappable`-shaped sibling used by the undo
plugin to carry selection bookmarks across undo/redo. It is transaction-time
machinery and therefore state-based — the undo plugin captures bookmarks inside
its plugin `apply`, where no view exists — and its restore mapping throws instead
of returning null (ProseMirror's `Mappable` contract is number-based and has no
null channel).

#### Deleted content resolves to null, not to a clamped position

ProseMirror's own `tr.mapping` is total: a position inside deleted content maps to
the deletion boundary (with `deleted` flags on `mapResult`). Translated positions
behave differently: a relative position that points into a deleted *node* resolves
to `null` instead of a clamped position — once the anchored identity's container is
gone there is no principled "nearby" location, and silently relocating an
annotation would be worse than reporting that its anchor no longer exists. (If only
the anchored *character* is deleted while its parent nodes survive, the position
still resolves to the deletion gap, matching ProseMirror's clamping.) The live
editor selection is unaffected either way: deletions reach ProseMirror as
transactions, so the selection is still carried by ProseMirror's own clamping
mapping.

### Undo/Redo

The package exports `undo` and `redo` commands which can be used in place of
[prosemirror-history](https://prosemirror.net/docs/ref/#history) by mapping the
mod-Z/Y keys - see [ProseMirror](https://github.com/yjs/yjs-demos/blob/main/prosemirror/prosemirror.js#L29)
and [Tiptap](https://github.com/ueberdosis/tiptap/blob/main/packages/extension-collaboration/src/collaboration.ts)
examples.

Undo and redo are be scoped to the local client, so one peer won't undo another's
changes. See [Y.UndoManager](https://docs.yjs.dev/api/undo-manager) for more details.

Just like prosemirror-history, you can set a transaction's `addToHistory` meta property
to false to prevent that transaction from being rolled back by undo. This can be helpful for programmatic
document changes that aren't initiated by the user.

```js
tr.setMeta("addToHistory", false);
```

### License

[The MIT License](./LICENSE) © Kevin Jahns
