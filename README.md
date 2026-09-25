# y-prosemirror

> [ProseMirror](http://prosemirror.net/) Binding for [Yjs](https://github.com/yjs/yjs) - [Demo](https://demos.yjs.dev/prosemirror/prosemirror.html)

> [!NOTE]
> The `main` branch of this repository is the development branch for the unstable
> `@y/prosemirror` release, which adds support for Yjs v14 (`@y/y`). This README
> documents `@y/prosemirror`. Most users should continue to use the stable
> `y-prosemirror` package with Yjs v13 for now - its documentation is in the
> [v1.3.7 README](https://github.com/yjs/y-prosemirror/tree/v1.3.7#readme).
> Migrating from `y-prosemirror` 1.x: see the migration table in
> [`CHANGELOG.md`](./CHANGELOG.md) ("Loading documents written by y-prosemirror 1.x");
> the `pmToFragment` / `fragmentToPm` it names are now `pmnodeToDelta` /
> `ynodeToPmnode` (see [Utilities](#utilities)).
>
> See also [`ARCHITECTURE.md`](./ARCHITECTURE.md) (how the two sides are synced),
> [`ATTRIBUTION.md`](./ATTRIBUTION.md) (suggestion mode, version diffs, and how to
> harden an existing editor schema for them), and [`CAVEATS.md`](./CAVEATS.md)
> (known limits and design tradeoffs). Working demos are listed under
> [Demos](#demos) below.

This binding keeps a Yjs type (a `Y.Node`, e.g. `ydoc.get('prosemirror')`) and the
ProseMirror state in sync.

## Features

* Sync ProseMirror state
* Shared Cursors
* Shared Undo / Redo (each client has its own undo-/redo-history)
* Successfully recovers when concurrents edit result in an invalid document schema
* Suggestion mode and version diffs, rendered as attribution marks

### Example

```sh
npm install @y/prosemirror @y/y
```

```js
import * as Y from '@y/y'
import { syncPlugin, configureYProsemirror, yCursorPlugin, yUndoPlugin, undoCommand, redoCommand } from '@y/prosemirror'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { exampleSetup } from 'prosemirror-example-setup'
import { keymap } from 'prosemirror-keymap'
..

const ytype = ydocument.get('prosemirror')
// `new Set()`: the undo plugin tracks the sync plugin's own edits, so only the
// edits made through this editor end up in its history
const undoManager = new Y.UndoManager(ytype, { trackedOrigins: new Set() })

const view = new EditorView(document.querySelector('#editor'), {
  state: EditorState.create({
    schema,
    plugins: [
      syncPlugin(),
      yCursorPlugin(provider.awareness),
      yUndoPlugin(undoManager),
      keymap({
        'Mod-z': undoCommand,
        'Mod-y': redoCommand,
        'Mod-Shift-z': redoCommand
      })
    ].concat(exampleSetup({ schema }))
  })
})

// Bind the editor to the Yjs type. The Yjs type is the source of truth: its
// content replaces the editor's content synchronously, before this returns.
configureYProsemirror({ ytype })(view.state, view.dispatch)
```

`configureYProsemirror` switches the bound type or renderer at any time, e.g. to
show suggestions (`{ ytype, renderer }`, see [`ATTRIBUTION.md`](./ATTRIBUTION.md))
or to pause syncing (`{ ytype: null }`). To give a new document initial content,
write it into the Yjs type (see [Utilities](#utilities)) rather than into the editor
state - see [`CAVEATS.md`](./CAVEATS.md) ("Initial content").

`syncPlugin(opts)` options: `mapAttributionToMark` and `attributedNodes` (how
attribution renders), `customCompare` (the diffing boundary), `transformers`
(custom pipeline stages) and `onInternalError`. See the JSDoc in
[`src/sync-plugin.js`](./src/sync-plugin.js).

Create one `syncPlugin()` per editor - a plugin instance (or an `EditorState`)
must not be mounted in two live views at once. Remounting a retained state after
destroying its view is supported; see [`CAVEATS.md`](./CAVEATS.md) ("One sync
plugin instance per live editor").

#### Remote Cursors

The shared cursors depend on the Awareness instance that is exported by most providers. The [Awareness protocol](https://github.com/yjs/y-protocols#awareness-protocol) handles non-permanent data like the number of users, their user names, their cursor location, and their colors. You can change the name and color of the user like this:

```js
provider.awareness.setLocalStateField('user', { color: '#008833', name: 'My real name' })
```

In order to render cursor information you need to embed custom CSS for the user icon. This is a template that you can use for styling cursor information. The user's color is available as the `--user-color` CSS variable.

```css
/* this is a rough fix for the first cursor position when the first paragraph is empty */
.ProseMirror > .ProseMirror-yjs-cursor:first-child {
  margin-top: 16px;
}
.ProseMirror p:first-child, .ProseMirror h1:first-child, .ProseMirror h2:first-child, .ProseMirror h3:first-child, .ProseMirror h4:first-child, .ProseMirror h5:first-child, .ProseMirror h6:first-child {
  margin-top: 16px
}
/* This gives the remote user caret */
.ProseMirror-yjs-cursor {
  position: relative;
  margin-left: -1px;
  margin-right: -1px;
  border-left: 1px solid black;
  border-right: 1px solid black;
  border-color: var(--user-color, orange);
  word-break: normal;
  pointer-events: none;
}
/* This renders the username above the caret */
.ProseMirror-yjs-cursor > div {
  position: absolute;
  top: -1.05em;
  left: -1px;
  font-size: 13px;
  background-color: var(--user-color, rgb(250, 129, 0));
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
/* This highlights the remote user's selection */
.ProseMirror-yjs-selection {
  background-color: var(--user-color, orange);
  opacity: 0.3;
}
```

You can also overwrite the default Widget dom by specifying a cursor builder in the yCursorPlugin

```js
/**
 * This function receives the remote user's "user" awareness state and client id.
 */
export const myCursorBuilder = (user, clientId) => {
  const cursor = document.createElement('span')
  cursor.classList.add('ProseMirror-yjs-cursor')
  cursor.style.setProperty('--user-color', user.color)
  const userDiv = document.createElement('div')
  userDiv.insertBefore(document.createTextNode(user.name), null)
  cursor.insertBefore(userDiv, null)
  return cursor
}

yCursorPlugin(provider.awareness, { cursorBuilder: myCursorBuilder })
```

`selectionBuilder` customizes the selection decoration the same way, and
`awarenessStateFilter`, `resolveLocalCursorState` and `cursorStateField` control
which cursors are rendered and published (see the JSDoc in
[`src/cursor-plugin.js`](./src/cursor-plugin.js)).

#### Utilities

Two functions convert between a Yjs type and ProseMirror content without an
editor, e.g. for persisting to a datastore or importing existing documents. They
map through the same transformer pipeline the binding uses, so their output
matches what a bound editor shows and writes.

> _Note_: Serializing and deserializing to JSON will not store collaboration history
> steps and as such should not be used as the primary storage. You will still need
> to store the Y.Doc binary update format.

```js
import * as Y from '@y/y'
import { pmnodeToDelta, ynodeToPmnode } from '@y/prosemirror'

// ProseMirror → Yjs: write a document (e.g. built from JSON) into a Yjs type
const ydoc = new Y.Doc()
const ytype = ydoc.get('prosemirror')
ytype.applyDelta(pmnodeToDelta(schema.nodeFromJSON({ type: 'doc', content: [...] })))

// Yjs → ProseMirror: render a Yjs type as a ProseMirror node
const node = ynodeToPmnode(ytype, schema)
const json = node.toJSON()
```

- `ynodeToPmnode(ynode, schema, { renderer, transformer, attributedNodes })`
  renders like a bound view: documents written by `y-prosemirror` 1.x are
  flattened, and with a `renderer` (e.g. a `DiffRenderer`) attribution becomes
  `y-attributed-*` marks. The content must fit the schema: invalid descendants are
  dropped as in the binding, and a `ynode` that does not fit the schema itself
  throws.
- `pmnodeToDelta(pmnode, { transformer })` returns the delta the binding would
  write. Pass the renderer when writing it:
  `ytype.applyDelta(pmnodeToDelta(pmnode), null, { renderer })`. Only use it on
  documents rendered without a renderer: the attribution projection is stripped,
  so a suggestion-rendered document would be written as plain content.
- If your `syncPlugin` uses `mapAttributionToMark` or custom `transformers`, pass
  `transformer: defaultTransformer({ mapAttributionToMark, transformers })` so
  the conversion matches the editor.

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
import { resolvedPositionToRelativePosition, relativePositionToResolvedPosition } from '@y/prosemirror'

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
import { relativePositionStore } from '@y/prosemirror'

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

`yUndoPlugin(undoManager)` together with the `undoCommand` and `redoCommand`
commands replaces [prosemirror-history](https://prosemirror.net/docs/ref/#history):
map them to the mod-Z/Y keys as in the [example](#example). Create the
`Y.UndoManager` for the bound type with `trackedOrigins: new Set()`; the plugin
adds the sync plugin's origin, so exactly the edits made through this editor are
tracked. A `Y.UndoManager` is bound to one document - when you bind the editor to
a different document (e.g. a suggestion document), use a separate manager for it.

Undo and redo are scoped to the local client, so one peer won't undo another's
changes. See [Y.UndoManager](https://docs.yjs.dev/api/undo-manager) for more details.

Just like prosemirror-history, you can set a transaction's `addToHistory` meta property
to false to prevent that transaction from being rolled back by undo. This can be helpful for programmatic
document changes that aren't initiated by the user.

```js
tr.setMeta('addToHistory', false)
```

## Demos

All demos live in this repository and run against a [yhub](https://github.com/yjs/yhub)
backend.

> [!IMPORTANT]
> The public yhub instance the demos point at enforces an origin allowlist: the
> dev server **must** be reachable at `http://localhost:8000`. On any other port
> the REST API answers 403 and the websocket handshake fails, which looks like a
> broken demo but is not one.

| demo | what it shows |
| --- | --- |
| [`yhub-tiptap-demo/`](./yhub-tiptap-demo/) | **The flagship.** Tiptap 3 with a hardened schema: suggestion mode (off / view / edit), accept & reject, version diffs over an activity timeline, rollback, shared cursors, Yjs-backed undo, tables, images - plus a schema-health panel that shows the attribution audit passing. `npm install && npm run dev`. |
| [`yhub-demo/`](./yhub-demo/) | The same feature set on plain ProseMirror, without an editor framework. |
| [`demo/`](./demo/) | A minimal ProseMirror setup, no backend. |

If you are integrating suggestion mode into an existing editor, read
[`ATTRIBUTION.md`](./ATTRIBUTION.md) ("Hardening an existing editor schema")
alongside `yhub-tiptap-demo/src/schema.js` - a stock editor schema will not
survive attributed rendering unchanged.

### License

[The MIT License](./LICENSE) © Kevin Jahns
