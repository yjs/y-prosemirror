/* eslint-env browser */
//
// Diagnostics that make "suggestion mode + versioning are fully supported" an
// observable claim rather than an assertion.
//
// Three independent signals, in the order you should trust them:
//
//   1. The SCHEMA audit - static, runs before any editing, and tells you
//      exactly which node types would silently swallow attribution.
//   2. `doc.check()` - live, catches a document the schema does not permit.
//      Exactly one failure is legitimate and is reported as such; see below.
//   3. `onInternalError` + mirrored library warnings - the things the binding
//      deliberately does not throw, because throwing would unwind into a Yjs
//      transaction's event delivery.
//
import { ySyncPluginKey } from '@y/prosemirror'
import { ATTRIBUTION_MARK_NAMES, auditAttributionMarks } from './schema.js'

// ── Banner stack ─────────────────────────────────────────────────────────────

/** @type {Map<string, { el: HTMLElement, count: number }>} */
const liveToasts = new Map()

/**
 * @param {{ kind: 'error'|'warn'|'info', title: string, detail?: string, sticky?: boolean }} o
 */
export const showToast = ({ kind, title, detail = '', sticky = false }) => {
  const stack = document.querySelector('#toast-stack')
  if (stack == null) return
  // Dedupe: a looping error must produce a rising counter, not 500 banners -
  // and the counter is itself the diagnostic (a reconcile loop is visible as a
  // number climbing with no user input).
  const key = kind + '|' + title + '|' + detail
  const existing = liveToasts.get(key)
  if (existing != null) {
    existing.count++
    const badge = /** @type {HTMLElement} */ (existing.el.querySelector('.toast-count'))
    badge.textContent = '×' + existing.count
    badge.style.display = 'inline-block'
    return
  }
  const el = document.createElement('div')
  el.className = 'toast toast-' + kind
  const head = document.createElement('div')
  head.className = 'toast-head'
  const titleEl = document.createElement('span')
  titleEl.className = 'toast-title'
  titleEl.textContent = title
  const count = document.createElement('span')
  count.className = 'toast-count'
  count.style.display = 'none'
  const close = document.createElement('button')
  close.className = 'toast-close'
  close.textContent = '✕'
  close.addEventListener('click', () => { el.remove(); liveToasts.delete(key) })
  head.append(titleEl, count, close)
  el.appendChild(head)
  if (detail !== '') {
    const pre = document.createElement('pre')
    pre.className = 'toast-detail'
    pre.textContent = detail
    el.appendChild(pre)
  }
  stack.appendChild(el)
  liveToasts.set(key, { el, count: 1 })
  if (!sticky) setTimeout(() => { el.remove(); liveToasts.delete(key) }, 12000)
}

const ERR_CODES = /** @type {Record<number, string>} */ ({
  0: 'Y-side write failed (ytype.applyDelta threw)',
  1: 'Y-side fix diff failed',
  2: 'View-side reconcile diff failed'
})

/**
 * `onInternalError` handler for `syncPlugin`. These are errors the binding
 * deliberately swallows, so without surfacing them a broken run just looks
 * "a bit weird". Sticky and red on purpose: any of them means the run is no
 * longer trustworthy.
 *
 * @param {Error} err
 * @param {number} code
 */
export const reportInternalError = (err, code) => {
  console.error('[y/prosemirror] internal error', code, err)
  showToast({
    kind: 'error',
    sticky: true,
    title: `y-prosemirror internal error #${code} - ${ERR_CODES[code] ?? 'unknown'}`,
    detail: (err && err.stack) || String(err)
  })
}

/**
 * Mirror the library's own console warnings into the banner stack. The
 * bind-time schema audit and the swallow warning are console-only, and a viewer
 * who never opens devtools would otherwise see a green demo that is quietly
 * dropping attribution.
 *
 * Must be installed BEFORE the editor is constructed - the schema audit fires
 * the first time a renderer is configured.
 */
export const captureLibraryWarnings = () => {
  const origWarn = console.warn.bind(console)
  console.warn = (...args) => {
    origWarn(...args)
    if (typeof args[0] === 'string' && args[0].startsWith('[y/prosemirror]')) {
      showToast({ kind: 'warn', sticky: true, title: 'y-prosemirror warning', detail: args.map(String).join(' ') })
    }
  }
  window.addEventListener('error', e =>
    showToast({ kind: 'error', sticky: true, title: 'Uncaught error', detail: String(e.error?.stack ?? e.message) }))
  window.addEventListener('unhandledrejection', e =>
    showToast({ kind: 'error', sticky: true, title: 'Unhandled rejection', detail: String(e.reason?.stack ?? e.reason) }))
}

// ── Schema health ────────────────────────────────────────────────────────────

/** Exactly what `defaultMapAttributionToMark` / `defaultMapAttrAttribution` emit. */
const EXPECTED_ATTRS = /** @type {Record<string, Array<string>>} */ ({
  'y-attributed-insert': ['userIds', 'timestamp'],
  'y-attributed-delete': ['userIds', 'timestamp'],
  'y-attributed-format': ['userIds', 'userIdsByAttr', 'timestamp'],
  'y-attributed-attrs': ['changes']
})

const ATTRIBUTED_SUFFIX = '--attributed'

/**
 * The binding's own audit plus the three checks it cannot make: mark exclusion
 * (ATTRIBUTION §3), attr coverage (§4), and `--attributed` variant parity.
 *
 * @param {import('@tiptap/pm/model').Schema} schema
 */
export const auditSchema = (schema) => {
  /** @type {Array<{ name: string, status: 'pass'|'fail', note: string }>} */
  const rows = []

  // (1) the binding's audit, reused verbatim from schema.js
  const offenders = auditAttributionMarks(schema)
  for (const name in schema.nodes) {
    if (schema.nodes[name].isLeaf) continue
    const offender = offenders.find(o => o.name === name)
    rows.push({
      name: 'node ' + name,
      status: offender ? 'fail' : 'pass',
      note: offender ? 'does not allow: ' + offender.missing.join(', ') : 'marks ok'
    })
  }

  /** @type {Array<{ name: string, status: 'pass'|'fail', note: string }>} */
  const rules = []
  for (const n of ATTRIBUTION_MARK_NAMES) {
    if (schema.marks[n] == null) {
      rules.push({ name: n, status: 'fail', note: 'mark not declared - this attribution kind can never render' })
    }
  }
  const ins = schema.marks['y-attributed-insert']
  const del = schema.marks['y-attributed-delete']
  const fmt = schema.marks['y-attributed-format']
  const atr = schema.marks['y-attributed-attrs']
  if (ins && del && fmt) {
    /** @type {Array<string>} */
    const bad = []
    for (const a of [ins, del, fmt]) {
      for (const b of [ins, del, fmt]) if (a.excludes(b)) bad.push(`${a.name} excludes ${b.name}`)
    }
    rules.push({
      name: "excludes: '' on insert/delete/format",
      status: bad.length === 0 ? 'pass' : 'fail',
      note: bad.length === 0 ? 'fully composable' : bad.join('; ')
    })
  }
  if (atr != null) {
    // The odd one out: its `changes` payload differs between renders, so a
    // re-render must REPLACE the mark rather than stack a second instance.
    rules.push({
      name: 'y-attributed-attrs keeps default excludes',
      status: atr.excludes(atr) ? 'pass' : 'fail',
      note: atr.excludes(atr) ? 're-render replaces the mark' : 'renders will stack instances'
    })
  }
  for (const n of ATTRIBUTION_MARK_NAMES) {
    const mt = schema.marks[n]
    if (mt == null) continue
    const declared = Object.keys(mt.spec.attrs ?? {})
    const missing = EXPECTED_ATTRS[n].filter(k => !declared.includes(k))
    rules.push({
      name: n + ' attrs',
      status: missing.length === 0 ? 'pass' : 'fail',
      note: missing.length === 0 ? declared.join(', ') : 'missing (mapper emits them): ' + missing.join(', ')
    })
  }

  // (3) variant parity. The variant is EXPECTED to have a wider `content` -
  // that is the entire point - so content is displayed, never asserted.
  /** @type {Array<{ name: string, status: 'pass'|'fail', note: string }>} */
  const variants = []
  for (const name in schema.nodes) {
    if (!name.endsWith(ATTRIBUTED_SUFFIX)) continue
    const variant = schema.nodes[name]
    const canonical = schema.nodes[name.slice(0, -ATTRIBUTED_SUFFIX.length)]
    /** @type {Array<string>} */
    const problems = []
    if (canonical == null) {
      problems.push('no canonical sibling')
    } else {
      if ((canonical.spec.group ?? '') !== (variant.spec.group ?? '')) problems.push('group differs')
      if (canonical.isTextblock !== variant.isTextblock) problems.push('isTextblock differs')
      // The binding injects a render-only `y-attributed` attr on every variant
      // node, so a COMPLIANT variant has exactly one extra attr. Subtract it
      // before comparing, or every correct variant reads as a mismatch.
      const ca = Object.keys(canonical.spec.attrs ?? {}).sort().join(',')
      const va = Object.keys(variant.spec.attrs ?? {}).filter(k => k !== 'y-attributed').sort().join(',')
      if (ca !== va) problems.push(`attrs differ (canonical: ${ca || '-'} / variant: ${va || '-'})`)
      if (!Object.prototype.hasOwnProperty.call(variant.spec.attrs ?? {}, 'y-attributed')) {
        problems.push('missing the injected `y-attributed` attr')
      }
    }
    const markTypes = ATTRIBUTION_MARK_NAMES.map(n => schema.marks[n]).filter(m => m != null)
    const missing = markTypes.filter(m => !variant.allowsMarkType(m)).map(m => m.name)
    if (missing.length > 0) problems.push('does not allow ' + missing.join(', '))
    variants.push({
      name,
      status: problems.length === 0 ? 'pass' : 'fail',
      note: problems.length === 0
        ? `${canonical.spec.content ?? '-'}  →  ${variant.spec.content ?? '-'}`
        : problems.join('; ')
    })
  }
  const all = [...rows, ...rules, ...variants]
  return { rows, rules, variants, failed: all.filter(r => r.status === 'fail').length, total: all.length }
}

/**
 * @param {import('@tiptap/pm/model').Schema} schema
 */
export const mountSchemaHealth = (schema) => {
  const chip = document.querySelector('#schema-chip')
  const body = document.querySelector('#diag-schema')
  if (chip == null || body == null) return
  const res = auditSchema(schema)
  chip.textContent = res.failed === 0 ? `Schema ✓ ${res.total}` : `Schema ✗ ${res.failed}`
  chip.className = 'chip ' + (res.failed === 0 ? 'chip-ok' : 'chip-bad')
  body.innerHTML = ''
  /** @param {string} label @param {Array<{name:string,status:string,note:string}>} items */
  const section = (label, items) => {
    if (items.length === 0) return
    const h = document.createElement('div')
    h.className = 'diag-h'
    h.textContent = label
    body.appendChild(h)
    for (const it of items) {
      const row = document.createElement('div')
      row.className = 'diag-row diag-' + it.status
      row.innerHTML = '<span class="diag-name"></span><span class="diag-note"></span>'
      ;(/** @type {HTMLElement} */ (row.querySelector('.diag-name'))).textContent =
        (it.status === 'pass' ? '✓ ' : '✗ ') + it.name
      ;(/** @type {HTMLElement} */ (row.querySelector('.diag-note'))).textContent = it.note
      body.appendChild(row)
    }
  }
  section('Attribution marks allowed on every non-leaf node', res.rows)
  section('Mark contract', res.rules)
  section('--attributed variants', res.variants)
  if (res.failed > 0) {
    showToast({
      kind: 'warn',
      sticky: true,
      title: `Schema audit: ${res.failed} problem(s)`,
      detail: [...res.rows, ...res.rules, ...res.variants].filter(r => r.status === 'fail').map(r => r.name + ': ' + r.note).join('\n')
    })
  }
}

// ── Live document validity + binding state ───────────────────────────────────

/**
 * `Node.check()` validates content expressions and attrs. It does NOT check
 * that a parent *allows* a mark - that axis is the schema panel's
 * `allowsMarkType` audit, which is why both indicators exist.
 *
 * One failure is EXPECTED and must not be shown as a defect: a node that is a
 * pending delete and has lost its required content is rendered as-is, because
 * deleting it would be re-inserted by Y and filling it would be reverted
 * (CAVEATS.md "Schema mismatches in suggestion mode"). A relaxed
 * `--attributed` variant is precisely the fix, so with the variants in place
 * this indicator should stay GREEN even in that state - which makes it the
 * pass/fail signal for the whole hardening exercise.
 *
 * @param {import('@tiptap/pm/view').EditorView} view
 */
export const docValidity = (view) => {
  /** @type {Error | null} */
  let err = null
  try { view.state.doc.check() } catch (e) { err = /** @type {Error} */ (e) }
  if (err == null) return { level: 'ok', text: 'doc ✓', detail: '' }
  let pendingDelete = false
  let sawVariant = false
  view.state.doc.descendants(node => {
    if (node.type.name.endsWith(ATTRIBUTED_SUFFIX)) sawVariant = true
    if (!node.isText && node.marks.some(m => m.type.name === 'y-attributed-delete')) pendingDelete = true
    return true
  })
  if (pendingDelete) {
    return {
      level: 'expected',
      text: 'doc ✗ (transient)',
      detail: err.message +
        '\n\nA node that is a pending delete and lost its required content is rendered as-is: ' +
        'it cannot be dropped (Y re-inserts it) or filled (Y reverts the fill). It resolves as ' +
        'soon as the deletion is accepted/rejected. See CAVEATS.md "Schema mismatches in ' +
        'suggestion mode".\n' +
        (sawVariant
          ? 'A --attributed variant IS present, so this node type still needs one of its own.'
          : 'Define a relaxed <name>--attributed variant to make this state schema-valid.')
    }
  }
  return { level: 'bad', text: 'doc ✗', detail: err.message }
}

/**
 * A dead binding is otherwise indistinguishable from "nothing is happening",
 * so print what the sync plugin is actually bound to.
 *
 * @param {import('@tiptap/pm/view').EditorView} view
 * @param {(ytype: any) => string} describeYtype
 */
export const renderBindingState = (view, describeYtype) => {
  const el = document.querySelector('#diag-binding')
  if (el == null) return
  const st = ySyncPluginKey.getState(view.state)
  if (st == null) { el.textContent = 'binding: sync plugin not installed'; return }
  const renderer = st.renderer
  el.textContent =
    `ytype: ${describeYtype(st.ytype)}  ·  renderer: ${renderer == null ? 'null' : renderer.constructor.name}` +
    (renderer != null && 'suggestionMode' in renderer ? ` (suggestionMode: ${renderer.suggestionMode})` : '') +
    `  ·  binding: ${st.binding == null ? 'NONE' : 'ok'}`
}

/**
 * Wire the live indicators to the editor. Throttled through rAF so a burst of
 * reconcile transactions costs one check, not one per transaction.
 *
 * @param {import('@tiptap/core').Editor} editor
 * @param {(ytype: any) => string} describeYtype
 */
export const mountLiveDiagnostics = (editor, describeYtype) => {
  const chip = document.querySelector('#valid-chip')
  let queued = false
  const refresh = () => {
    queued = false
    const v = docValidity(editor.view)
    if (chip != null) {
      chip.textContent = v.text
      chip.className = 'chip chip-' + (v.level === 'ok' ? 'ok' : v.level === 'expected' ? 'warn' : 'bad')
      ;(/** @type {HTMLElement} */ (chip)).title = v.detail
    }
    if (v.level === 'bad') {
      showToast({ kind: 'error', sticky: true, title: 'Document is schema-invalid', detail: v.detail })
    }
    renderBindingState(editor.view, describeYtype)
  }
  editor.on('transaction', () => {
    if (queued) return
    queued = true
    requestAnimationFrame(refresh)
  })
  refresh()
}
