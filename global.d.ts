
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
declare type SyncPluginState = import('lib0/schema').Unwrap<typeof import('@y/prosemirror').$syncPluginState>
declare type SyncPluginStateUpdate = import('lib0/schema').Unwrap<typeof import('@y/prosemirror').$syncPluginStateUpdate>
declare type ProsemirrorDelta = import('lib0/schema').Unwrap<typeof import('@y/prosemirror').$prosemirrorDelta>
