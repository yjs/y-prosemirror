/* eslint-env browser */

// ── Toolbar ──────────────────────────────────────────────────────────────────
// Tiptap ships no built-in toolbar for the vanilla (non-React) build: you wire
// your own buttons to editor commands and reflect active state from
// `editor.isActive(...)`. We build the buttons here and refresh them on every
// transaction / selection change (those events fire because main.js wraps —
// rather than replaces — Tiptap's dispatchTransaction).

/**
 * @typedef {object} ToolbarButton
 * @property {string} label
 * @property {string} [title]
 * @property {string} [style]              extra inline CSS for the label
 * @property {(e: import('@tiptap/core').Editor) => boolean} [isActive]
 * @property {(c: any, e: import('@tiptap/core').Editor) => any} run  receives a focused chain
 * @property {boolean} [tableOnly]         only enabled/visible inside a table
 */

/** @returns {ToolbarButton[][]} groups of buttons, separated visually */
const buttonGroups = () => [
  [
    { label: 'B', title: 'Bold', style: 'font-weight:700', isActive: e => e.isActive('bold'), run: c => c.toggleBold() },
    { label: 'I', title: 'Italic', style: 'font-style:italic', isActive: e => e.isActive('italic'), run: c => c.toggleItalic() },
    { label: 'S', title: 'Strikethrough', style: 'text-decoration:line-through', isActive: e => e.isActive('strike'), run: c => c.toggleStrike() },
    { label: '</>', title: 'Inline code', isActive: e => e.isActive('code'), run: c => c.toggleCode() }
  ],
  [
    { label: 'H1', title: 'Heading 1', isActive: e => e.isActive('heading', { level: 1 }), run: c => c.toggleHeading({ level: 1 }) },
    { label: 'H2', title: 'Heading 2', isActive: e => e.isActive('heading', { level: 2 }), run: c => c.toggleHeading({ level: 2 }) },
    { label: 'H3', title: 'Heading 3', isActive: e => e.isActive('heading', { level: 3 }), run: c => c.toggleHeading({ level: 3 }) },
    { label: '¶', title: 'Paragraph', isActive: e => e.isActive('paragraph'), run: c => c.setParagraph() }
  ],
  [
    { label: '• List', title: 'Bullet list', isActive: e => e.isActive('bulletList'), run: c => c.toggleBulletList() },
    { label: '1. List', title: 'Ordered list', isActive: e => e.isActive('orderedList'), run: c => c.toggleOrderedList() }
  ],
  [
    { label: '❝', title: 'Blockquote', isActive: e => e.isActive('blockquote'), run: c => c.toggleBlockquote() },
    { label: '{ }', title: 'Code block', isActive: e => e.isActive('codeBlock'), run: c => c.toggleCodeBlock() },
    { label: '―', title: 'Horizontal rule', run: c => c.setHorizontalRule() }
  ],
  [
    { label: '🖼 Image', title: 'Insert image by URL', run: (c) => insertImage(c) },
    { label: '▦ Table', title: 'Insert 3×3 table', run: c => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }) }
  ],
  [
    { label: '+Col', title: 'Add column after', tableOnly: true, run: c => c.addColumnAfter() },
    { label: '+Row', title: 'Add row after', tableOnly: true, run: c => c.addRowAfter() },
    { label: '−Col', title: 'Delete column', tableOnly: true, run: c => c.deleteColumn() },
    { label: '−Row', title: 'Delete row', tableOnly: true, run: c => c.deleteRow() },
    { label: '⌫ Table', title: 'Delete table', tableOnly: true, run: c => c.deleteTable() }
  ]
]

/**
 * @param {any} chain - a focused command chain
 * @returns {any}
 */
const insertImage = (chain) => {
  // window.prompt is the conventional Tiptap-demo way to grab an image URL.
  const url = window.prompt('Image URL', 'https://picsum.photos/seed/yhub/480/280')
  if (!url) return chain // no-op chain; .run() is harmless
  return chain.setImage({ src: url })
}

/**
 * @param {import('@tiptap/core').Editor} editor
 */
export const setupToolbar = (editor) => {
  const el = /** @type {HTMLElement} */ (document.querySelector('#toolbar'))
  if (!el) return

  /** @type {Array<{ btn: HTMLButtonElement, cfg: ToolbarButton }>} */
  const registry = []

  for (const group of buttonGroups()) {
    const groupEl = document.createElement('div')
    groupEl.className = 'tb-group'
    for (const cfg of group) {
      const btn = document.createElement('button')
      btn.className = 'tb-btn' + (cfg.tableOnly ? ' tb-table-only' : '')
      btn.type = 'button'
      btn.title = cfg.title ?? cfg.label
      btn.textContent = cfg.label
      if (cfg.style) btn.style.cssText = cfg.style
      // mousedown + preventDefault keeps the editor selection (so commands act
      // on the user's selection, not on a cleared one after the button steals focus).
      btn.addEventListener('mousedown', (e) => e.preventDefault())
      btn.addEventListener('click', () => {
        if (!editor.isEditable) return
        cfg.run(editor.chain().focus(), editor).run()
      })
      groupEl.appendChild(btn)
      registry.push({ btn, cfg })
    }
    el.appendChild(groupEl)
  }

  const update = () => {
    const editable = editor.isEditable
    const inTable = editor.isActive('table')
    el.classList.toggle('disabled', !editable)
    for (const { btn, cfg } of registry) {
      if (cfg.isActive) btn.classList.toggle('active', cfg.isActive(editor))
      if (cfg.tableOnly) btn.disabled = !inTable || !editable
      else btn.disabled = !editable
    }
  }

  editor.on('transaction', update)
  editor.on('selectionUpdate', update)
  // `setEditable` (live <-> version-diff) emits 'update'; refresh enabled state.
  editor.on('update', update)
  update()
}
