import * as Y from '@y/y'
import * as YPM from '@y/prosemirror'
import * as d from 'lib0/delta'
import * as t from 'lib0/testing'
import * as promise from 'lib0/promise'
import { EditorState, Plugin } from 'prosemirror-state'
import { schema } from 'prosemirror-schema-basic'
import { EditorView } from 'prosemirror-view'

/**
 * @param {EditorState} state
 */
const createView = state => new EditorView({ mount: document.createElement('div') }, { state })

export const testSyncSurvivesViewRemountWithRetainedState = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  ytype.applyDelta(d.create().insert([d.create('paragraph', {}, 'before')]).done())

  const first = createView(EditorState.create({ schema, plugins: [YPM.syncPlugin()] }))
  YPM.configureYProsemirror({ ytype })(first.state, first.dispatch)
  const retainedState = first.state
  first.destroy()

  const second = createView(retainedState)
  try {
    second.dispatch(second.state.tr.insertText('!'))
    t.compare(second.state.doc.textContent, 'before!')
    t.compare(ytype.toDeltaDeep(), YPM.docToDelta(second.state.doc).done(false))

    // No configuration change follows remount. The new view must still
    // receive subsequent Y updates.
    ytype.applyDelta(d.create().delete(1).insert([d.create('paragraph', {}, 'remote')]).done())
    t.compare(second.state.doc.textContent, 'remote')
  } finally {
    second.destroy()
    ydoc.destroy()
  }
}

export const testRemountHydratesMissedYChanges = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  ytype.applyDelta(d.create().insert([d.create('paragraph', {}, 'before')]).done())
  const first = createView(EditorState.create({ schema, plugins: [YPM.syncPlugin()] }))
  YPM.configureYProsemirror({ ytype })(first.state, first.dispatch)
  const retainedState = first.state
  first.destroy()

  ytype.applyDelta(d.create().delete(1).insert([d.create('paragraph', {}, 'after')]).done())
  const second = createView(retainedState)
  try {
    t.compare(second.state.doc.textContent, 'after')
    t.compare(ytype.toDeltaDeep(), YPM.docToDelta(second.state.doc).done(false))
  } finally {
    second.destroy()
    ydoc.destroy()
  }
}

export const testPausedSyncStaysPausedAcrossViewRemount = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  ytype.applyDelta(d.create().insert([d.create('paragraph', {}, 'shared')]).done())
  const first = createView(EditorState.create({ schema, plugins: [YPM.syncPlugin()] }))
  YPM.configureYProsemirror({ ytype })(first.state, first.dispatch)
  YPM.pauseSync(first.state, first.dispatch)
  const retainedState = first.state
  first.destroy()

  ytype.applyDelta(d.create().delete(1).insert([d.create('paragraph', {}, 'remote')]).done())
  const second = createView(retainedState)
  try {
    t.compare(second.state.doc.textContent, 'shared')
    second.dispatch(second.state.tr.insertText('local'))
    t.compare(ytype.toDeltaDeep().toJSON(), d.create().insert([d.create('paragraph', {}, 'remote')]).done().toJSON())

    YPM.configureYProsemirror({ ytype })(second.state, second.dispatch)
    t.compare(second.state.doc.textContent, 'remote')
    second.dispatch(second.state.tr.insertText('!'))
    t.compare(ytype.toDeltaDeep(), YPM.docToDelta(second.state.doc).done(false))
  } finally {
    second.destroy()
    ydoc.destroy()
  }
}

export const testReconfigureKeepsBinding = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  ytype.applyDelta(d.create().insert([d.create('paragraph', {}, 'shared')]).done())
  const view = createView(EditorState.create({ schema, plugins: [YPM.syncPlugin()] }))
  try {
    YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
    const binding = YPM.ySyncPluginKey.getState(view.state)?.binding
    t.assert(binding != null)
    // A plugin-list change recreates every plugin view (e.g. Tiptap's / BlockNote's
    // registerPlugin). The binding must survive it instead of re-running the
    // O(document) initial sync.
    view.updateState(view.state.reconfigure({ plugins: [...view.state.plugins, new Plugin({})] }))
    t.assert(YPM.ySyncPluginKey.getState(view.state)?.binding === binding)
    ytype.applyDelta(d.create().delete(1).insert([d.create('paragraph', {}, 'remote')]).done())
    t.compare(view.state.doc.textContent, 'remote')
    view.dispatch(view.state.tr.insertText('!'))
    t.compare(ytype.toDeltaDeep(), YPM.docToDelta(view.state.doc).done(false))
  } finally {
    view.destroy()
    ydoc.destroy()
  }
}

export const testReconfigureWithDocChangeSyncsToY = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  ytype.applyDelta(d.create().insert([d.create('paragraph', {}, 'shared')]).done())
  const view = createView(EditorState.create({ schema, plugins: [YPM.syncPlugin()] }))
  try {
    YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
    // `updateState` with a changed doc *and* a changed plugin list does not call
    // `update` on the (recreated) plugin views - the change must still reach Y.
    const changed = view.state.apply(view.state.tr.insertText('!', 1))
    view.updateState(changed.reconfigure({ plugins: [...changed.plugins, new Plugin({})] }))
    t.compare(view.state.doc.textContent, '!shared')
    t.compare(ytype.toDeltaDeep(), YPM.docToDelta(view.state.doc).done(false))
  } finally {
    view.destroy()
    ydoc.destroy()
  }
}

export const testRetainedStateDoesNotExposeDestroyedBinding = async () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  ytype.applyDelta(d.create().insert([d.create('paragraph', {}, 'shared')]).done())
  const view = createView(EditorState.create({ schema, plugins: [YPM.syncPlugin()] }))
  YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
  const retainedState = view.state
  t.assert(YPM.usableTransformer(YPM.ySyncPluginKey.getState(retainedState)) != null)
  view.destroy()
  // Y keeps changing after the view is gone; the dead binding must neither
  // write into the destroyed view nor be used for position mapping.
  ytype.applyDelta(d.create().delete(1).insert([d.create('paragraph', {}, 'remote')]).done())
  await promise.wait(0)
  t.assert(YPM.usableTransformer(YPM.ySyncPluginKey.getState(retainedState)) == null)
  ydoc.destroy()
}

export const testRemovedSyncPluginStopsWritingToView = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  ytype.applyDelta(d.create().insert([d.create('paragraph', {}, 'shared')]).done())
  const syncPlugin = YPM.syncPlugin()
  const view = createView(EditorState.create({ schema, plugins: [syncPlugin] }))
  try {
    YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
    view.updateState(view.state.reconfigure({ plugins: view.state.plugins.filter(p => p !== syncPlugin) }))
    // same tick - the removed plugin's binding is not torn down yet
    ytype.applyDelta(d.create().delete(1).insert([d.create('paragraph', {}, 'remote')]).done())
    t.compare(view.state.doc.textContent, 'shared')
  } finally {
    view.destroy()
    ydoc.destroy()
  }
}

export const testYChangeDuringReconfigureIsNotLost = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  ytype.applyDelta(d.create().insert([d.create('paragraph', {}, 'shared')]).done())
  let writeOnMount = false
  // created before the sync plugin's view: writes to Y between the sync plugin
  // view's destroy and its recreation
  const writer = new Plugin({
    view: () => {
      if (writeOnMount) {
        writeOnMount = false
        ytype.applyDelta(d.create().delete(1).insert([d.create('paragraph', {}, 'remote')]).done())
      }
      return {}
    }
  })
  const view = createView(EditorState.create({ schema, plugins: [writer, YPM.syncPlugin()] }))
  try {
    YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
    writeOnMount = true
    view.updateState(view.state.reconfigure({ plugins: [...view.state.plugins, new Plugin({})] }))
    t.compare(view.state.doc.textContent, 'remote')
    view.dispatch(view.state.tr.insertText('!'))
    t.compare(ytype.toDeltaDeep(), YPM.docToDelta(view.state.doc).done(false))
  } finally {
    view.destroy()
    ydoc.destroy()
  }
}

/**
 * @param {() => void} f
 * @return {Array<string>} the `console.warn` lines `f` produced
 */
const captureWarnings = f => {
  /** @type {Array<string>} */
  const lines = []
  const original = console.warn
  console.warn = (/** @type {any} */ ...args) => { lines.push(args.join(' ')) }
  try {
    f()
  } finally {
    console.warn = original
  }
  return lines.filter(line => line.includes('more than one live EditorView'))
}

export const testWarnsWhenStateMountedInTwoLiveViews = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  ytype.applyDelta(d.create().insert([d.create('paragraph', {}, 'shared')]).done())
  const first = createView(EditorState.create({ schema, plugins: [YPM.syncPlugin()] }))
  YPM.configureYProsemirror({ ytype })(first.state, first.dispatch)
  const retainedState = first.state
  first.destroy()
  /** @type {Array<EditorView>} */
  const views = []
  const warnings = captureWarnings(() => {
    views.push(createView(retainedState), createView(retainedState), createView(retainedState))
  })
  t.compare(warnings.length, 1)
  views.forEach(view => view.destroy())
  ydoc.destroy()
}

export const testWarnsForSharedPluginInstanceAcrossStates = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  const plugin = YPM.syncPlugin()
  const a = createView(EditorState.create({ schema, plugins: [plugin] }))
  const b = createView(EditorState.create({ schema, plugins: [plugin] }))
  const warnings = captureWarnings(() => {
    YPM.configureYProsemirror({ ytype })(a.state, a.dispatch)
    YPM.configureYProsemirror({ ytype })(b.state, b.dispatch)
  })
  t.compare(warnings.length, 1)
  a.destroy()
  b.destroy()
  ydoc.destroy()
}

export const testNoWarningForSequentialRemount = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  ytype.applyDelta(d.create().insert([d.create('paragraph', {}, 'shared')]).done())
  /** @type {Array<EditorView>} */
  const views = []
  const warnings = captureWarnings(() => {
    const first = createView(EditorState.create({ schema, plugins: [YPM.syncPlugin()] }))
    YPM.configureYProsemirror({ ytype })(first.state, first.dispatch)
    first.updateState(first.state.reconfigure({ plugins: [...first.state.plugins, new Plugin({})] }))
    const retainedState = first.state
    // same tick - the first view's binding is parked, not live
    first.destroy()
    views.push(createView(retainedState))
  })
  t.compare(warnings, [])
  views.forEach(view => view.destroy())
  ydoc.destroy()
}

export const testNoWarningForSeparatePluginInstances = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  ytype.applyDelta(d.create().insert([d.create('paragraph', {}, 'shared')]).done())
  const a = createView(EditorState.create({ schema, plugins: [YPM.syncPlugin()] }))
  const b = createView(EditorState.create({ schema, plugins: [YPM.syncPlugin()] }))
  try {
    const warnings = captureWarnings(() => {
      YPM.configureYProsemirror({ ytype })(a.state, a.dispatch)
      YPM.configureYProsemirror({ ytype })(b.state, b.dispatch)
    })
    t.compare(warnings, [])
    a.dispatch(a.state.tr.insertText('!', 1))
    t.compare(b.state.doc.textContent, '!shared')
  } finally {
    a.destroy()
    b.destroy()
    ydoc.destroy()
  }
}

/**
 * Forces full GCs and reports how many of the referenced objects survived.
 * Skips the test where no forced GC is available (browsers).
 *
 * Retries a few rounds: a stale stack slot or a pending task can briefly keep
 * an object alive, while a real leak survives every round.
 *
 * @param {Array<WeakRef<object>>} refs
 */
const countAliveAfterGc = async refs => {
  const gc = /** @type {any} */ (globalThis).gc
  t.skip(typeof gc !== 'function')
  let alive = refs.length
  for (let round = 0; round < 5 && alive > 0; round++) {
    // let parked handoffs (torn down in a microtask) settle first
    await promise.wait(10)
    gc()
    alive = refs.filter(ref => ref.deref() != null).length
  }
  return alive
}

/**
 * Reconfiguring the editor (e.g. opening one version preview after another)
 * must release the previously bound document. The new binding's meta closure
 * used to capture the whole plugin state - including the previous binding -
 * which chained every past binding (and its snapshot doc) together.
 */
export const testReconfigureReleasesPreviousYDoc = async () => {
  const view = createView(EditorState.create({ schema, plugins: [YPM.syncPlugin()] }))
  /** @type {Array<WeakRef<Y.Doc>>} */
  const refs = []
  for (let i = 0; i < 10; i++) {
    const ydoc = new Y.Doc()
    ydoc.get('prosemirror').applyDelta(d.create().insert([d.create('paragraph', {}, `version ${i}`)]).done())
    refs.push(new WeakRef(ydoc))
    YPM.configureYProsemirror({ ytype: ydoc.get('prosemirror') })(view.state, view.dispatch)
  }
  t.compare(view.state.doc.textContent, 'version 9')
  t.compare(await countAliveAfterGc(refs), 1, 'only the currently bound ydoc is alive')
  view.destroy()
}

/**
 * Toggling the renderer (e.g. suggestion mode on/off) rebuilds the binding
 * and must release the previous renderer (and its suggestion doc).
 */
export const testRendererToggleReleasesPreviousRenderer = async () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  ytype.applyDelta(d.create().insert([d.create('paragraph', {}, 'base')]).done())
  const view = createView(EditorState.create({ schema, plugins: [YPM.syncPlugin()] }))
  /** @type {Array<WeakRef<object>>} */
  const refs = []
  /**
   * A separate (synchronous) function, so no stack slot of this async test
   * keeps the last renderer alive.
   */
  const toggleSuggestionMode = () => {
    const suggestionDoc = new Y.Doc({ isSuggestionDoc: true, gc: false })
    const renderer = Y.createDiffRenderer(ydoc, suggestionDoc, { attributions: Y.createContentMap() })
    renderer.suggestionMode = true
    refs.push(new WeakRef(renderer), new WeakRef(suggestionDoc))
    YPM.configureYProsemirror({ ytype, renderer })(view.state, view.dispatch)
    YPM.configureYProsemirror({ ytype, renderer: null })(view.state, view.dispatch)
    // the renderer observes the base doc until the integrator destroys it
    renderer.destroy()
  }
  const originalWarn = console.warn
  // the basic schema lacks the attribution marks - silence that audit warning
  console.warn = () => {}
  try {
    for (let i = 0; i < 10; i++) toggleSuggestionMode()
  } finally {
    console.warn = originalWarn
  }
  t.compare(await countAliveAfterGc(refs), 0, 'no previous renderer (or suggestion doc) is alive')
  view.destroy()
  ydoc.destroy()
}

/**
 * A retained EditorState keeps its (destroyed) binding alive. The destroyed
 * RDTs must not keep the bound ytype, renderer or documents alive with it.
 */
export const testDestroyedRdtsDropReferences = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get('prosemirror')
  ytype.applyDelta(d.create().insert([d.create('paragraph', {}, 'retained')]).done())
  const view = createView(EditorState.create({ schema, plugins: [YPM.syncPlugin()] }))
  YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
  const retainedState = view.state
  const binding = /** @type {any} */ (YPM.ySyncPluginKey.getState(retainedState)).binding
  YPM.configureYProsemirror({ ytype: new Y.Doc().get('prosemirror') })(view.state, view.dispatch)
  t.assert(binding.a.destroyed)
  t.assert(binding.a.ytype === null && binding.a.renderer === null, 'destroyed YSyncRdt drops the ytype and renderer')
  t.assert(binding.b.destroyed)
  t.assert(binding.b._state === null && binding.b._pmstate === null, 'destroyed ProsemirrorRdt drops its document state')
  t.assert(YPM.usableTransformer(YPM.ySyncPluginKey.getState(retainedState)) === null, 'the retained state maps nothing through the destroyed binding')
  view.destroy()
  ydoc.destroy()
}
