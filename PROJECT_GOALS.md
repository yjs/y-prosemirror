# `@y/prosemirror` Rewrite

We are working on a new version of the y-prosemirror package, and aim to address some architectural issues that have been raised in the past. So, we are looking for feedback on the approach we are taking here to make this a good binding between Yjs and Prosemirror.

## Goals

- Apply minimal diffs to the Prosemirror state from Y.js updates, avoiding issues with decorations and anything which relies on position mapping
- Support for pausing the sync process, and resuming it again to allow local only editing
- Support for rendering content that is not actually within the Prosemirror document, like rendering the changes between two document snapshots as a diff, or suggestions from another document
- A more "prosemirror-native" API, with a simple core API and a set of commands for more complex operations
- Better capture of prosemirror changes, by [capturing only transactions which have been applied to the `EditorView`](https://github.com/handlewithcarecollective/prosemirror-inputrules/issues/2)

## APIs

Here is a high level overview of the APIs that we are considering for the `@y/prosemirror` package.

### Deltas (`lib0/delta`)

Deltas are the core unit of change within the package, they are an OT-like data structure which represents documents as changesets ([similar to Quill's deltas](https://quilljs.com/docs/guides/designing-the-delta-format)). With Deltas, we have a CRDT agnostic representation of changes between documents. The current document state can be described as the delta between an empty document and the current document state. Deltas can be re-based, diffed, and applied to documents. So, the core goal of the package is to provide a binding between Deltas & Prosemirror. To see more information on deltas, see [this test file](https://github.com/dmonad/lib0/blob/main/src/delta/delta.test.js) for more of a walkthrough of how they work internally (sorry that we have not gotten around to proper documentation yet).

One of the core premises of deltas is that we are describing the document as a sequence of changes rather than a final data structure. This allows for a unified API for describing changes between documents, and for applying changes to documents.

This is a quick primer on deltas, what they are, and how they work.

```ts
/**
 * Delta is a versatile format enabling you to efficiently describe changes. It is part of lib0, so
 * that non-yjs applications can use it without consuming the full Yjs package. It is well suited
 * for efficiently describing state & changesets.
 *
 * Assume we start with the text "hello world". Now we want to delete " world" and add an
 * exclamation mark. The final content should be "hello!" ("hello world" => "hello!")
 *
 * In most editors, you would describe the necessary changes as replace operations using indexes.
 * However, this might become ambiguous when many changes are involved.
 *
 * - delete range 5-11
 * - insert "!" at position 11
 *
 * Using the delta format, you can describe the changes similar to what you would do in an text editor.
 * The "|" describes the current cursor position.
 *
 * - d.retain(5) - "|hello world" => "hello| world" - jump over the next five characters
 * - d.delete(6) - "hello| world" => "hello|" - delete the next 6 characters
 * - d.insert('!') - "hello!|" - insert "!" at the current position
 * => compact form: d.retain(5).delete(6).insert('!')
 *
 * You can also apply the changes in two distinct steps and then rebase the op so that you can apply
 * them in two distinct steps.
 * - delete " world":              d1 = delta.create().retain(5).delete(6)
 * - insert "!":                   d2 = delta.create().retain(11).insert('!')
 * - rebase d2 on-top of d1:       d2.rebase(d1)    == delta.create().retain(5).insert('!')
 * - merge into a single change:   d1.apply(d2)     == delta.create().retain(5).delete(6).insert(!)
 **/

const d1 = delta.create().insert('hello world!')
const d2 = delta.create().insert('hello ').insert('world', { bold: true }).insert('!')
const diff = delta.diff(d1, d2)

t.compare(diff, delta.create().retain(6).retain(5, { bold: true }))
```

### Content Renderer (`@y/y`)

One of the core features we are introducing in `@y/prosemirror` is the concept of a "content renderer". A content renderer is responsible for the injection of additional content into the Prosemirror document, such as suggestions, diffs, etc. This content renderer is able to keep track of the source of the additional content, and can differentiate changes to the original document content from changes to the additional content. This is particularly useful for "suggestion mode", where we want to still show the original document content, but also being able to edit the suggestions independently.

### PM -> Delta

```ts
/**
 * Converts a Prosemirror document node to a lib0 delta.
 * @returns {Delta} The returned delta is a diff between an empty node and the document node (i.e. insertions only).
 */
function nodeToDelta(doc: Node): Delta;

/**
 * Converts a Prosemirror transform to a lib0 delta.
 * @returns {Delta} The returned delta is a diff between {@link tr.before} and {@link tr.doc} document states.
 */
function trToDelta(tr: Transform): Delta;
```

With this, we can directly map either a ProseMirror document node or a ProseMirror transform into a lib0 delta. This is because a delta is a list of inserts, deletes, and retains, allowing us to represent each step of the transform as a delta operation. We hope to be able to map each step of the transform to a delta operation, but in some cases, we may need to fall back to diffing the document to see what the transform intended the change to be.

### Delta -> PM

```ts
/**
 * Applies a lib0 delta to a Prosemirror document node.
 * @returns {Transform | null} The returned transform is a transform that can be applied to the document node to apply the delta. Or null if the delta is not applicable to the document.
 */
function applyDelta(doc: Node, delta: Delta): Transform | null;

// function deltaToNode(delta: Delta): Node {
//   return applyDelta(emptyDoc, delta).doc
// }
```

In the other direction, we can apply a lib0 delta to a ProseMirror document node, which will return the series of steps that need to be applied to the document to result in the transformation that the delta represents. We hope to make this as efficient as possible, by creating minimal diffs and compressing operations where possible. Y.js will emit it's changes as deltas, meaning that in ProseMirror, we should see minimal changes being applied to the document.

### Delta Sync Plugin

The goal of this plugin is to coordinate syncing the Prosemirror document with a Y.js, through the use of deltas.

```ts
function ySyncPlugin(opts: {
    /**
     * The Y.js type to sync with.
     **/
    yType: Y.YType;
    /**
     * A content renderer is responsible for rendering any additional content that is not part of the main Prosemirror document (e.g. suggestions, diffs, etc).
     **/
    contentRenderer: Y.ContentRenderer;
    /**
     * This will take Y.js attributions and allow you to map them into Prosemirror marks.
     **/
    mapAttributionToMark?: (attribution: Y.Attribution) => Mark;
}): Plugin<PluginState<{
  /**
   * The current active Y.js type that is being synced with.
   */
  yType: Y.YType | null;
  /**
   * The current active content renderer that is being used to render additional content.
   */
  contentRenderer: Y.ContentRenderer | null;
  /**
   * Captured transactions are the transactions that have occurred since the last sync to the Y.js type.
   */
  capturedTransactions: Transaction[];
}>>;
```

One issue we have with the structure of this plugin is the `capturedTransactions` field. The problem is that we need a way to capture changes to the editor, but are really only interested in the changes which have actually been committed to the view. Ideally, we'd have a 1:1 mapping of a prosemirror transaction to a Y.js delta (though we understand that this may not always be possible). Given this, it seems like the best approach is to capture the transactions that have occurred between `view.update` invocations, which we can then sync back to the Y.js type. If there is a better approach to this, we would be happy to get rid of this.

### Position Mapping

There is a difference between positions within a Prosemirror document, and positions within a Y.js document.

A Prosemirror position is an _absolute_ position, meaning it is only valid within the current Prosemirror document, and when the document is updated, that position may change. Prosemirror positions are transformed through position mappings [as discussed here](https://prosemirror.net/docs/guide/#Mapping), while this works for Prosemirror, for a single user, it is not good at handling collaboratively edited documents, since changes may come in at any time, invalidating the mapping.

Y.js has the concept of a _relative_ position, meaning it is a position that is relative to a specific Y.js type (e.g. the current text node within the document). This is more robust to changes, since changes to the document will not invalidate the relative position.

For smoothing over this difference, we can create a mapping between Prosemirror positions & Y.js relative positions which can be used to transform positions between the two. We have two symmetric functions for this:

```ts
/**
 * Given a Prosemirror absolute position, the ytype, and the prosemirror document, return the corresponding Y.js relative position.
 **/
function absolutePositionToRelativePosition(pos: number, type: Y.XmlFragment, pmDoc: Node): Y.RelativePosition;
/**
 * Given a Y.js relative position, the ytype, and the prosemirror document, return the corresponding Prosemirror absolute position.
 **/
function relativePositionToAbsolutePosition(relPos: Y.RelativePosition, type: Y.XmlFragment, pmDoc: Node): number;
```

We also can leverage Prosemirror's [`Mappable` interface](https://prosemirror.net/docs/ref/#transform.Mappable) to create a mapping between Prosemirror positions & Y.js relative positions.

First we capture the mapping of the current positions, and then later we can restore the mapping to the original positions.

```ts
function capturePositionMapping(pmDoc: Node, type: Y.XmlFragment): {
  captureMapping: (clear?: boolean)=> Mappable;
  restoreMapping: (type: Y.XmlFragment, pmDoc: Node) => Mappable;
};

const { captureMapping, restoreMapping } = capturePositionMapping(pmDoc, type);

const bookmark = view.state.selection.getBookmark();
// record the current positions of the bookmark (in-memory as a Y.RelativePosition)
bookmark.map(captureMapping())

// later, after possible document edits, we can restore the mapping to the original positions
const resolvedBookmark = bookmark.map(restoreMapping(pmDoc, type))
```

### Commands

We are adding a set of commands to the `@y/prosemirror` package to enable more complex operations.

```ts
/**
 * This command will pause the synchronization between the Prosemirror document and the Y.js type. Allowing for local only editing.
 **/
function pauseSync(): Command;

/**
 * This command will resume the synchronization between the Prosemirror document and the provided Y.js type.
 **/
function resumeSync(ctx: {
  /**
   * The Y.js type to sync with.
   **/
  yType: Y.YType;
  /**
   * The content renderer to use for rendering additional content.
   **/
  contentRenderer: Y.ContentRenderer | null;
}): Command;

/**
 * This command will render a snapshot of the provided Y.js fragment at the given snapshot point in time. This is useful for rendering changes between two document snapshots as a diff.
 **/
function renderSnapshot(snapshot: {
  /**
   * The Y.js fragment to render.
   **/
  fragment: Y.XmlFragment;
  /**
   * The snapshot point in time to render.
   **/
  snapshot: Y.Snapshot;
}, prevSnapshot?: {
  /**
   * The Y.js fragment to render.
   **/
  fragment: Y.XmlFragment;
  /**
   * The snapshot point in time to render.
   **/
  snapshot: Y.Snapshot;
}): Command;

/**
 * This command will enter suggestion mode. In suggestion mode, the content renderer will be used to render additional content, such as suggestions, diffs, etc.
 **/
function suggestionMode(doc: Y.YType, suggestionDoc: Y.YType): Command;
```

These commands are not finalized, but we hope they should get across the idea of the commands that we are considering for the `@y/prosemirror` package.

### Questions

- What sorts of things should we consider in a prosemirror binding like this? What makes a good prosemirror binding?
- From our understanding, not all operations guarantee a "minimal edit", meaning while we could do a mapping of each transaction's steps to a lib0 delta, some steps can result in changes that are larger than necessary, or otherwise un-representable in Y.js (e.g. ReplaceAroundStep). So, while we can _sometimes_ directly map a prosemirror step to a lib0 delta operation, we cannot _always_ rely on it, and must [fall back to diffing the document](https://github.com/yjs/y-prosemirror/blob/9d67b63bfae3eaaddb4fe653251ea9c3bfe5921b/src/sync/delta-sync.js#L336-L350) (ideally minimally) to see what it was the prosemirror intended the change to be. Does this sound correct? Or are we missing something here?
- What is the best way to track changes to the prosemirror document, to then apply to something external (e.g. Y.js)? Our current approach is the `capturedTransactions` field in the `ySyncPlugin` state, but this feels like a workaround.
- Does the `Mappable` interface make sense for this mapping? Or is this just abuse of the API? Is there a better way to do this?
- What is the recommendation around invalid node schemas? In Y.js we can have two changes that are individually valid, but when applied together, they are invalid.
  
### Questions for us to figure out

- How should undo/redo work when sync is paused? explore prosemirror-history plugin for this
  - This might be weird with the suggestion mode, since prosemirror-history won't have context on the suggestions and instead see them as normal changes
