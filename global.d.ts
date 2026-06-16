
declare type YType = import('@y/y').Type
declare type AttributionManager = import('@y/y').AbstractAttributionManager
declare type EditorState = import('prosemirror-state').EditorState
declare type Transaction = import('prosemirror-state').Transaction
declare type EditorView = import('prosemirror-view').EditorView
declare type CommandDispatch = (tr: Transaction) => void

/**
 * Maps attributions to prosemirror marks
 */
declare type AttributionMapper = (format: Record<string,unknown> | null, attribution: import('lib0/delta').Attribution) => Record<string, unknown> | null
/**
 * Decides whether an attributed node renders under its `{nodeName}--attributed`
 * variant node type. `kinds` reflects which attribution kinds are present on the
 * node. Must be deterministic in `(nodeName, kinds)`.
 */
declare type AttributedNodesPredicate = (nodeName: string, kinds: { insert?: boolean, delete?: boolean, format?: boolean }) => boolean
/**
 * Custom pairing predicate that shifts y-prosemirror's *diffing boundary*.
 *
 * To sync, y-prosemirror diffs the ProseMirror doc against the Y document as
 * `lib0/delta` trees. lib0's `diff` decides, for each pair of candidate nodes,
 * whether to pair them — diffing them *in place* via a `modify` op — or to treat
 * them as unrelated and **replace the old subtree wholesale** (delete + insert).
 * By default a pair is matched purely on node name (`a.name === b.name`).
 *
 * `customCompare` overrides that decision so integrators can move the boundary:
 * make it *stricter* (e.g. a `blockContainer` only pairs when its first child type
 * also matches, so changing the first child replaces the whole container instead of
 * editing it in place) or looser. Receives the raw `lib0/delta` nodes
 * `(fromNode, toNode)` — each exposing `.name`, `.attrs`, and `.children` — and is
 * forwarded to lib0 `diff` as its `compare` option (applied recursively down the
 * tree). Return `true` to pair, `false` to replace wholesale. The predicate should
 * generally still include the `a.name === b.name` check; omit the option entirely to
 * keep lib0's name-only default.
 */
declare type NodeCompare = (a: import('lib0/delta').DeltaAny, b: import('lib0/delta').DeltaAny) => boolean
declare type SyncPluginState = import('lib0/schema').Unwrap<typeof import('@y/prosemirror').$syncPluginState>
declare type SyncPluginStateUpdate = import('lib0/schema').Unwrap<typeof import('@y/prosemirror').$syncPluginStateUpdate>
declare type ProsemirrorDelta = import('lib0/schema').Unwrap<typeof import('@y/prosemirror').$prosemirrorDelta>
