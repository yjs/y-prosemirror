/**
 * Render a `DiffSet` as ProseMirror decorations over the *displayed* (final)
 * document. The document is never mutated.
 *
 *  - inline-insert / inline-update -> Decoration.inline
 *  - block-insert  / block-update  -> Decoration.node  (per top-level node)
 *  - inline-delete / block-delete  -> Decoration.widget showing the removed
 *      content, reconstructed by serializing the removed Fragment to HTML.
 *
 * Each decoration carries its `diff` in the decoration `spec` so future
 * node-views / attribute-change extraction can read it back. Decorations
 * also expose `data-diff-type` and `data-diff-user-id` attributes for CSS.
 */
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view'
import { Plugin, EditorState } from 'prosemirror-state'
import { DOMSerializer, Fragment } from 'prosemirror-model'
import { suggestionDiffPluginKey } from './keys.js'

/**
 * @typedef {import('./y-attribution-to-diffset.js').Diff} Diff
 * @typedef {import('./y-attribution-to-diffset.js').DiffSet} DiffSet
 * @typedef {import('./y-attribution-to-diffset.js').DiffType} DiffType
 * @typedef {import('./y-attribution-to-diffset.js').Attribution} Attribution
 */

/**
 * Arguments passed to a `mapDiffToDecorations` callback.
 *
 * @typedef {{
 *   diff: Diff,
 *   doc: import('prosemirror-model').Node,
 *   schema: import('prosemirror-model').Schema,
 *   index: number,
 *   color?: string,
 *   attributes?: import('prosemirror-view').DecorationAttrs,
 *   defaultMapDiffToDecorations?: MapDiffToDecorations
 * }} MapDiffArgs
 */

/**
 * Callback that converts a single `Diff` to decoration(s).
 * Return a `Decoration`, an array of them, or `null` to skip.
 *
 * @callback MapDiffToDecorations
 * @param {MapDiffArgs} args
 * @returns {import('prosemirror-view').Decoration | import('prosemirror-view').Decoration[] | null}
 */

/**
 * Options shared by `buildDiffDecorationSet` and `ySuggestionDecorationPlugin`.
 *
 * @typedef {{
 *   colorForAuthors?: (authorIds: string[]) => (string | undefined),
 *   mapDiffToDecorations?: MapDiffToDecorations
 * }} SuggestionDecorationOptions
 */

/**
 * Reconstruct removed content as a non-editable DOM node by serializing the
 * Fragment to HTML. Works for inline text and for whole block nodes alike.
 *
 * @param {import('prosemirror-model').Fragment} fragment
 * @param {import('prosemirror-model').Schema} schema
 * @param {{ authorIds?: string[], color?: string, title?: string }} [opts]
 * @returns {HTMLElement}
 */
export const renderDeletedContent = (fragment, schema, opts = {}) => {
  const serializer = DOMSerializer.fromSchema(schema)
  const isBlock = fragment?.firstChild?.isBlock ?? false
  const container = document.createElement(isBlock ? 'div' : 'span')
  container.className = 'pm-suggest pm-suggest--delete'
  container.setAttribute('data-diff-type', isBlock ? 'block-delete' : 'inline-delete')
  if (opts.authorIds?.length) {
    container.setAttribute('data-diff-user-id', opts.authorIds.join(','))
  }
  if (opts.color) {
    container.style.setProperty('--author-color', opts.color)
  }
  if (opts.title) {
    container.setAttribute('title', opts.title)
  }
  container.contentEditable = 'false'
  if (fragment) {
    container.appendChild(serializer.serializeFragment(fragment, { document }))
  }
  return container
}

/**
 * Build a human-readable hover title from diff attribution.
 *
 * @param {Diff} diff
 * @returns {string}
 */
const hoverTitle = (diff) => {
  const parts = []
  const authorIds = diff.attribution.authorIds
  if (authorIds.length) {
    parts.push(authorIds.join(', '))
  }
  if (diff.attribution.timestamp) {
    parts.push(new Date(diff.attribution.timestamp).toLocaleString())
  }
  const typeLabel = diff.type.replace('-', ' ')
  if (parts.length) return `${typeLabel}: ${parts.join(' — ')}`
  return typeLabel
}

/**
 * Build a summary string for a block-update diff showing what changed
 * (e.g. "level: 1 → 2").
 *
 * @param {Diff} diff
 * @returns {string}
 */
const blockUpdateSummary = (diff) => {
  if (diff.type !== 'block-update') return ''
  const attrs = diff.attributes
  const prev = diff.previousAttributes
  if (!attrs) return ''
  const parts = []
  for (const key of Object.keys(attrs)) {
    const newVal = attrs[key]
    const oldVal = prev?.[key]
    if (oldVal !== undefined && oldVal !== newVal) {
      parts.push(`${key}: ${oldVal} → ${newVal}`)
    } else {
      parts.push(`${key}: ${newVal}`)
    }
  }
  return parts.join(', ')
}

/**
 * @param {Diff} diff
 * @param {{ authorIds: string[], color?: string }} ctx
 * @returns {import('prosemirror-view').DecorationAttrs}
 */
const decorationAttrs = (diff, { authorIds, color }) => {
  /** @type {import('prosemirror-view').DecorationAttrs} */
  const attrs = {
    class: `pm-suggest pm-suggest--${diff.type}`,
    'data-diff-type': diff.type
  }
  if (authorIds.length) attrs['data-diff-user-id'] = authorIds.join(',')
  if (color) attrs.style = `--author-color: ${color}`
  // Hover metadata: show author(s), timestamp, and attribute changes
  let title = hoverTitle(diff)
  const summary = blockUpdateSummary(diff)
  if (summary) title += ` (${summary})`
  attrs.title = title
  return attrs
}

/**
 * Check whether any node in a fragment has a registered node view.
 *
 * @param {Fragment} fragment
 * @param {Record<string, any>} nodeViews
 * @returns {boolean}
 */
const fragmentHasNodeView = (fragment, nodeViews) => {
  let found = false
  fragment.forEach(node => {
    if (found) return
    if (nodeViews[node.type.name]) { found = true; return }
    if (node.content.size > 0 && fragmentHasNodeView(node.content, nodeViews)) found = true
  })
  return found
}

/**
 * Default mapping from a single `Diff` to decoration(s). Returns a `Decoration`,
 * an array of them, or `null` to skip.
 *
 * @type {MapDiffToDecorations}
 */
export const defaultMapDiffToDecorations = ({ diff, doc, schema, index, color, attributes = {} }) => {
  const authorIds = diff.attribution.authorIds
  const attrs = { ...decorationAttrs(diff, { authorIds, color }), ...attributes }
  const spec = { diff }

  switch (diff.type) {
    case 'inline-insert':
    case 'inline-update':
      return Decoration.inline(diff.from, diff.to, attrs, { ...spec, inclusiveStart: false, inclusiveEnd: true })

    case 'block-update':
      return Decoration.node(diff.from, diff.to, attrs, spec)

    case 'block-insert': {
      const $from = doc.resolve(diff.from)
      const after = $from.nodeAfter
      if (after && diff.from + after.nodeSize === diff.to) {
        return Decoration.node(diff.from, diff.to, attrs, spec)
      }
      /** @type {Decoration[]} */
      const decos = []
      doc.nodesBetween(diff.from, diff.to, (node, pos) => {
        if (pos >= diff.from && pos + node.nodeSize <= diff.to && node.isBlock) {
          decos.push(Decoration.node(pos, pos + node.nodeSize, attrs, spec))
          return false
        }
        return undefined
      })
      if (!decos.length) {
        decos.push(Decoration.inline(diff.from, diff.to, attrs, spec))
      }
      return decos
    }

    case 'inline-delete':
      return Decoration.widget(
        diff.from,
        () => renderDeletedContent(diff.content ?? Fragment.empty, schema, { authorIds, color, title: hoverTitle(diff) }),
        { side: 1, key: `diff-del-${index}-${diff.content?.size ?? 0}`, diff }
      )

    case 'block-delete': {
      const fragment = diff.content ?? Fragment.empty
      /** @type {EditorView | null} */
      let ghostView = null
      return Decoration.widget(
        diff.from,
        (view) => {
          const container = document.createElement('div')
          container.className = 'pm-suggest pm-suggest--delete'
          container.setAttribute('data-diff-type', 'block-delete')
          if (authorIds.length) container.setAttribute('data-diff-user-id', authorIds.join(','))
          if (color) container.style.setProperty('--author-color', color)
          container.setAttribute('title', hoverTitle(diff))
          container.contentEditable = 'false'
          if (fragment.size > 0 && view.props.nodeViews && fragmentHasNodeView(fragment, view.props.nodeViews)) {
            const ghostDoc = schema.nodes.doc.create(null, fragment)
            const mountEl = document.createElement('div')
            container.appendChild(mountEl)
            ghostView = new EditorView(
              { mount: mountEl },
              {
                state: EditorState.create({ doc: ghostDoc, schema }),
                editable: () => false
              }
            )
          } else if (fragment.size > 0) {
            const serializer = DOMSerializer.fromSchema(schema)
            container.appendChild(serializer.serializeFragment(fragment, { document }))
          }
          return container
        },
        {
          side: 1,
          key: `diff-del-${index}-${fragment.size}`,
          diff,
          destroy: () => { ghostView?.destroy(); ghostView = null }
        }
      )
    }

    default:
      return null
  }
}

/**
 * Build a `DecorationSet` for `diffs` over `doc`. Pure - does not touch the doc.
 *
 * @param {import('prosemirror-model').Node} doc
 * @param {DiffSet} diffs
 * @param {import('prosemirror-model').Schema} schema
 * @param {SuggestionDecorationOptions} [opts]
 * @returns {DecorationSet}
 */
export const buildDiffDecorationSet = (doc, diffs, schema, opts = {}) => {
  const map = opts.mapDiffToDecorations ?? defaultMapDiffToDecorations
  /** @type {Decoration[]} */
  const decorations = []
  diffs.forEach((diff, index) => {
    const color = opts.colorForAuthors?.(diff.attribution.authorIds)
    const result = map({ diff, doc, schema, index, color, defaultMapDiffToDecorations })
    if (Array.isArray(result)) decorations.push(...result.filter(Boolean))
    else if (result) decorations.push(result)
  })
  return DecorationSet.create(doc, decorations)
}

/**
 * ProseMirror plugin that overlays a `DiffSet` as decorations.
 *
 * Update the diffs at runtime by dispatching
 * `tr.setMeta(suggestionDiffPluginKey, { diffs })`.
 *
 * @param {SuggestionDecorationOptions & { diffs?: DiffSet }} [config]
 * @returns {Plugin<DecorationSet>}
 */
export const suggestionDiffPlugin = ({ diffs = [], mapDiffToDecorations, colorForAuthors } = {}) =>
  new Plugin({
    key: suggestionDiffPluginKey,
    state: {
      init: (_config, state) =>
        buildDiffDecorationSet(state.doc, diffs, state.schema, { mapDiffToDecorations, colorForAuthors }),
      apply: (tr, prev, _old, newState) => {
        const meta = tr.getMeta(suggestionDiffPluginKey)
        if (meta?.diffs) {
          return buildDiffDecorationSet(newState.doc, meta.diffs, newState.schema, { mapDiffToDecorations, colorForAuthors })
        }
        return prev.map(tr.mapping, tr.doc)
      }
    },
    props: {
      decorations: (state) => suggestionDiffPluginKey.getState(state)
    }
  })
