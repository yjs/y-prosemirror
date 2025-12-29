import * as delta from 'lib0/delta'
import * as math from 'lib0/math'
import * as mux from 'lib0/mutex'
import * as Y from '@y/y'
import * as s from 'lib0/schema'
import * as object from 'lib0/object'
import * as error from 'lib0/error'
import * as set from 'lib0/set'
import * as map from 'lib0/map'

import { Node } from 'prosemirror-model'
import { AddMarkStep, RemoveMarkStep, AttrStep, AddNodeMarkStep, ReplaceStep, ReplaceAroundStep, RemoveNodeMarkStep, DocAttrStep, Transform } from 'prosemirror-transform'
import { ySyncPluginKey } from './plugins/keys.js'
import { Plugin } from 'prosemirror-state'
import { findTypeInOtherYdoc } from './utils.js'

const $prosemirrorDelta = delta.$delta({ name: s.$string, attrs: s.$record(s.$string, s.$any), text: true, recursive: true })

/**
 * @typedef {s.Unwrap<$prosemirrorDelta>} ProsemirrorDelta
 */

// y-attribution-deletion & y-attribution-insertion & y-attribution-format (or mod?)
// add attributes (userId: string[], timestamp: number) (see `YAttribution` (ask Kevin))
// define how an insertion mark works on a node
// situations like deleted node, yet has inserted content (handle nested content)
// insertion within a node that was inserted + another user inserted more content into that node (hovers per user likely)

/**
 * @template {import('lib0/delta').Attribution} T
 * @param {Record<string, unknown> | null} format
 * @param {T} attribution
 * @returns {Record<string, unknown> | null}
 */
const attributionToFormat = (format, attribution) => {
  /**
   * @type {Record<string, unknown> | null}
   */
  let mergeWith = null
  if (attribution.insert) {
    mergeWith = {
      'y-attribution-insertion': {
        userIds: attribution.insert ? attribution.insert : null,
        timestamp: attribution.insertAt ? attribution.insertAt : null
      }
    }
  } else if (attribution.delete) {
    mergeWith = {
      'y-attribution-deletion': {
        userIds: attribution.delete ? attribution.delete : null,
        timestamp: attribution.deleteAt ? attribution.deleteAt : null
      }
    }
  } else if (attribution.format) {
    mergeWith = {
      'y-attribution-format': {
        userIdsByAttr: attribution.format ? attribution.format : null,
        timestamp: attribution.formatAt ? attribution.formatAt : null
      }
    }
  }
  return object.assign({}, format, mergeWith)
}

/**
 * Transform delta with attributions to delta with formats (marks).
 */
const deltaAttributionToFormat = s.match(s.$function)
  .if(delta.$deltaAny, (d, func) => {
    const r = delta.create(d.name)
    for (const attr of d.attrs) {
      r.attrs[attr.key] = attr.clone()
    }
    for (const child of d.children) {
      const format = child.attribution ? func(child.format, child.attribution) : child.format
      if (delta.$insertOp.check(child)) {
        r.insert(child.insert.map(c => delta.$deltaAny.check(c) ? deltaAttributionToFormat(c, func) : c), format)
      } else if (delta.$textOp.check(child)) {
        r.insert(child.insert.slice(), format)
      } else if (delta.$deleteOp.check(child)) {
        r.delete(child.delete)
      } else if (delta.$retainOp.check(child)) {
        r.retain(child.retain, format)
      } else if (delta.$modifyOp.check(child)) {
        r.modify(deltaAttributionToFormat(child.value, func), format)
      } else {
        error.unexpectedCase()
      }
    }
    return r
  }).done()

/**
  * @typedef {{fragment: Y.XmlFragment, snapshot?: Y.Snapshot}} SnapshotItem If just a fragment, then we compare the latest fragment with the other fragment. If a snapshot is provided, then we compare the fragment at that snapshot with the other snapshot.
  */

/**
 * @typedef {{type: 'initialized', ytype: Y.XmlFragment} | { type: 'local-update', capturedTransactions: import('prosemirror-state').Transaction[] } | { type: 'remote-update', events: Array<Y.YEvent<Y.XmlFragment>>, ytype: Y.XmlFragment; attributionFix?: true } | { type: 'render-snapshot', snapshot: SnapshotItem, prevSnapshot: SnapshotItem } | {type: 'pause-sync'} | {type: 'resume-sync'}} YSyncPluginMeta
 */

/**
 * This class is the state of the sync plugin, it is essentially the public API for the sync plugin
 */
export class SyncPluginState {
  /**
   * @type {Y.XmlFragment}
   */
  ytype

  /**
   * @type {Y.AbstractAttributionManager}
   */
  #attributionManager

  /**
   * @type {typeof attributionToFormat}
   */
  #mapAttributionToMark

  /**
   * @type {import('prosemirror-view').EditorView | null}
   */
  #view = null

  /**
   * This is the subscription to the ydoc changes
   * @type {null | (() => void)}
   */
  #subscription = null

  /**
   * Get the view that the sync plugin is attached to
   * @returns {import('prosemirror-view').EditorView}
   * @private
   */
  get view () {
    if (!this.#view) {
      throw new Error('[y/prosemirror]: view not set')
    }
    return this.#view
  }

  #mutex = mux.createMutex()

  /**
   * @type {{type: 'sync', pendingDelta: ProsemirrorDelta | null} | {type:'paused', pendingDelta: ProsemirrorDelta | null, snapshot: Y.Snapshot} | {type:'snapshot', snapshot: SnapshotItem, prevSnapshot: SnapshotItem}}
   */
  #state = { type: 'sync', pendingDelta: null }

  /**
   * @param {object} ctx
   * @param {Y.XmlFragment} ctx.ytype
   * @param {Y.AbstractAttributionManager} [ctx.attributionManager]
   * @param {typeof attributionToFormat} [ctx.mapAttributionToMark]
   */
  constructor ({ ytype, attributionManager, mapAttributionToMark }) {
    if (!ytype) {
      throw new Error('[y/prosemirror]: ytype not provided')
    }
    this.ytype = ytype
    this.#attributionManager = attributionManager || Y.noAttributionsManager
    this.#mapAttributionToMark = mapAttributionToMark || attributionToFormat
  }

  /**
   * This takes a prosemirror transaction and attempts to update the internal plugin state
   * @param {import('prosemirror-state').Transaction} tr
   * @returns {SyncPluginState}
   * @private
   */
  onApplyTr (tr) {
    /** @type {YSyncPluginMeta | undefined} */
    const pluginMeta = tr.getMeta(ySyncPluginKey)
    if (!pluginMeta) {
      return this
    }

    const nextState = this.clone()
    switch (pluginMeta.type) {
      /**
       * For an ideal prosemirror binding, we should only commit the state once the view has been updated to the new editor state
       * Technically, there can be a number of editor state transitions between, but we only care about the state that gets committed to the view
       * So:
       *  1. we capture the transactions that are local-updates, in `appendTransaction`
       *  2. when state.apply(tr) is called, we generate a delta of the changes that we captured (merging any other states we found between such as additional appendTransaction plugins)
       *  3. when view.updateState(state) is called, we then synchronize that delta back to the ytype to sync the changes to peers
       *
       * This allows the sync plugin to be in any order within the prosemirror plugins array, since it will be committed once the view's state has been applied
       */
      case 'local-update':{
        if (this.#state.type !== 'sync' && this.#state.type !== 'paused') {
          // No-op since we are not in sync mode
          return this
        }

        const { capturedTransactions } = pluginMeta

        // We queue up local-updates by merging all of the transactions that have been captured
        const transform = new Transform(capturedTransactions[0].before)

        for (let i = 0; i < capturedTransactions.length; i++) {
          for (let j = 0; j < capturedTransactions[i].steps.length; j++) {
            const success = transform.maybeStep(capturedTransactions[i].steps[j])
            if (success.failed) {
              // step failed, fallback to full diff
              console.error('[y/prosemirror]: step failed to apply, falling back to a full diff')

              const nextDelta = docDiffToDelta(capturedTransactions[0].before, capturedTransactions[capturedTransactions.length - 1].after)
              // TODO what should the right behavior here be?
              nextState.#state = object.assign({}, this.#state, {
                type: this.#state.type,
                pendingDelta: this.#state.pendingDelta ? this.#state.pendingDelta.apply(nextDelta) : nextDelta
              })
              return nextState
            }
          }
        }
        // Then trying to derive the delta that they represent
        const nextDelta = trToDelta(transform)

        // And, either applying that delta to the already pendingDelta, or promoting that delta to being the next pending delta
        nextState.#state = object.assign({}, this.#state, {
          type: this.#state.type,
          pendingDelta: this.#state.pendingDelta ? this.#state.pendingDelta.apply(nextDelta) : nextDelta
        })
        return nextState
      }
      case 'render-snapshot':{
        nextState.#state = {
          type: 'snapshot',
          snapshot: pluginMeta.snapshot,
          prevSnapshot: pluginMeta.prevSnapshot
        }
        return nextState
      }
      case 'resume-sync': {
        // Move back to sync mode
        nextState.#state = { type: 'sync' }
        return nextState
      }
      case 'pause-sync':{
        // Move to paused mode
        nextState.#state = { type: 'paused', pendingDelta: null, snapshot: Y.snapshot(this.ytype.doc) }

        return nextState
      }
    }

    return this
  }

  /**
   * This will be `true` if the plugin state is initialized and the view is not destroyed
   */
  get initialized () {
    return this.#view && !this.#view.isDestroyed
  }

  /**
   * Apply any pending diffs to the ytype
   * @param {import('prosemirror-state').EditorState} prevState
   * @private
   */
  onViewUpdate (prevState) {
    if (!this.initialized) {
      return
    }
    const prevPluginState = ySyncPluginKey.getState(prevState)
    switch (this.#state.type) {
      case 'snapshot':{
        if (prevPluginState.#state.type === 'snapshot') {
          // Already in snapshot mode, so we don't need to do anything
          return
        }
        // Just transitioned from another mode, so we need to actually apply the snapshot mode

        // Stop observing the ydoc changes, since we are looking at a snapshot in time
        prevPluginState.destroy()
        return
      }
      case 'sync':{
        if (prevPluginState.#state.type === 'paused' || prevPluginState.#state.type === 'snapshot') {
          // was just paused, so we need to resume sync

          // Restart the observer for two-way sync again
          this.#subscribe()
          return
        }
        if (!this.#state.pendingDelta) {
          return
        }
        this.#mutex(() => {
          const d = this.#state.pendingDelta
          // clear the delta so that we don't accidentally apply it again
          this.#state.pendingDelta = null

          this.ytype.doc.transact(() => {
            this.ytype.applyDelta(d, this.#attributionManager)
          }, ySyncPluginKey)
        })

        return undefined
      }
    }
  }

  /**
   * @type {ReturnType<typeof setTimeout> | undefined}
   */
  #initializationTimeoutId = undefined

  /**
   * Initialize the prosemirror state with what is in the ydoc or vice versa
   */
  #syncDocs () {
    // TODO ydoc.on('sync') ? we could use this to indicate that the ydoc is ready or not
    if (this.ytype.length === 0) {
      console.log('ytype is empty, applying initial prosemirror state to ydoc')
      // TODO likely want to compare the empty initial doc with the ydoc and apply changes the ydoc if there are any
      // initialize the ydoc with the initial prosemirror state
      this.ytype.doc.transact(() => {
        pmToFragment(this.view.state.doc, this.ytype)
      }, ySyncPluginKey)
    } else {
      console.log('ytype is not empty, applying initial ydoc content to prosemirror state')
      // Initialize the prosemirror state with what is in the ydoc
      const tr = fragmentToTr(this.ytype, this.tr, {
        attributionManager: this.#attributionManager,
        mapAttributionToMark: this.#mapAttributionToMark
      })

      /** @type {YSyncPluginMeta} */
      const pluginMeta = {
        type: 'initialized',
        ytype: this.ytype
      }
      tr.setMeta(ySyncPluginKey, pluginMeta)
      this.view.dispatch(tr)
    }
  }

  /**
   * Initialize the plugin state with the view
   * @note this will start the synchronization of the prosemirror state with the ydoc
   * @param {import('prosemirror-view').EditorView} view
   * @private
   */
  init (view) {
    // initialize the prosemirror state with what is in the ydoc
    // we wait a tick, because in some cases, the view can be immediately destroyed
    this.#initializationTimeoutId = setTimeout(() => {
      // clear the timeout id
      this.#initializationTimeoutId = undefined
      // Only set the view if we've passed a tick
      // This gates the initialization of the plugin state until the view is ready
      this.#view = view
      this.#syncDocs()

      // subscribe to the ydoc changes, after initialization is complete
      this.#subscribe()
    }, 0)
  }

  /**
   * Subscribe to the ydoc changes, and register a cleanup function to unsubscribe when the view is destroyed
   * @private
   */
  #subscribe () {
    if (!this.#view) {
      throw new Error('[y/prosemirror]: view not set')
    }

    if (this.#subscription) {
      // re-use the existing subscription, since it operates on the latest plugin state
      return
    }
    // This is the callback that we will subscribe & unsubscribe to the ydoc changes
    const cb = (...args) => {
      if (!this.#view || this.#view.isDestroyed) {
        // view is destroyed, just clean up the subscription, and no-op
        this.#subscription()
        return
      }

      // fetch the latest plugin state
      const pluginState = ySyncPluginKey.getState(this.#view.state)
      if (!pluginState) {
        throw new Error('[y/prosemirror]: plugin state not found in view.state')
      }

      // call the onYTypeEvent handler on that instance
      pluginState.#onYTypeEvent(...args)
    }

    this.ytype.observeDeep(cb)

    this.#subscription = () => {
      this.#subscription = null
      this.ytype.unobserveDeep(cb)
    }
  }

  /**
   * Destroy the plugin state
   * @note this will stop the synchronization of the prosemirror state with the ydoc
   * @private
   */
  destroy () {
    // clear the initialization timeout
    clearTimeout(this.#initializationTimeoutId)
    if (this.#subscription) {
      // unsubscribe from the ydoc changes
      this.#subscription()
      this.#subscription = null
    }
  }

  /**
   * This is the event handler for when the ytype changes, applying remote changes to the editor content
   * @note this must be a stable reference to be unobserved later
   * @param {Array<Y.YEvent<Y.XmlFragment>>} events
   * @param {Y.Transaction} tr
   */
  #onYTypeEvent (events, tr) {
    // bail if: the view is destroyed OR it was us that made the change OR we are not in "sync" mode
    if (!this.initialized || tr.origin === ySyncPluginKey || this.#state.type !== 'sync') {
      return
    }

    this.#mutex(() => {
      /**
       * @type {Y.YEvent<Y.XmlFragment>}
       */
      const event = events.find(event => event.target === this.ytype) || new Y.YEvent(this.ytype, tr, new Set(null))
      const d = this.#attributionManager === Y.noAttributionsManager
        ? event.deltaDeep
        : deltaAttributionToFormat(event.getDelta(this.#attributionManager, { deep: true }), this.#mapAttributionToMark)
      const ptr = deltaToPSteps(this.#view.state.tr, d)
      // console.log('ytype emitted event', d.toJSON(), 'and applied changes to pm', ptr.steps)
      ptr.setMeta(ySyncPluginKey, { ytypeEvent: true })
      this.#view.dispatch(ptr)
    }, () => {
      if (this.#attributionManager === Y.noAttributionsManager) {
        // no attribution fixup needed
        return
      }
      const itemsToRender = Y.mergeIdSets([tr.insertSet, tr.deleteSet])
      /**
         * @todo this could be automatically be calculated in getContent/getDelta when
         * itemsToRender is provided
         * @type {Map<Y.AbstractType, Set<string|null>>}
         */
      const modified = new Map()
      Y.iterateStructsByIdSet(tr, itemsToRender, item => {
        while (item instanceof Y.Item) {
          const parent = /** @type {Y.AbstractType} */ (item.parent)
          const conf = map.setIfUndefined(modified, parent, set.create)
          if (conf.has(item.parentSub)) break // has already been marked as modified
          conf.add(item.parentSub)
          item = parent._item
        }
      })

      if (modified.has(this.ytype)) {
        setTimeout(() => {
          this.#mutex(() => {
            const d = deltaAttributionToFormat(this.ytype.getContent(this.#attributionManager, {
              itemsToRender,
              retainInserts: true,
              deep: true,
              modified
            }), this.#mapAttributionToMark)
            const ptr = deltaToPSteps(this.tr, d)
            console.log('attribution fix event: ', d.toJSON(), 'and applied changes to pm', ptr.steps)

            /** @type {YSyncPluginMeta} */
            const pluginMeta = {
              type: 'remote-update',
              events,
              ytype: this.ytype,
              attributionFix: true
            }
            ptr.setMeta(ySyncPluginKey, pluginMeta)
            this.view.dispatch(ptr)
          })
        }, 0)
      }
    })
  }

  /**
   * Create a transaction for changing the prosemirror state.
   * @private
   */
  get tr () {
    return this.view.state.tr.setMeta('addToHistory', false)
  }

  /**
   * Pause the synchronization of the prosemirror state with the ydoc
   */
  pauseSync () {
    /** @type {YSyncPluginMeta} */
    const pluginMeta = {
      type: 'pause-sync'
    }
    this.view.dispatch(this.tr.setMeta(ySyncPluginKey, pluginMeta))
  }

  /**
   * Resume the synchronization of the prosemirror state with the ydoc
   * @param {object} [opts]
   * @param {boolean} [opts.keepChanges]
   */
  resumeSync ({ keepChanges = false } = {}) {
    if (this.#state.type === 'sync') {
      // Already in sync mode, so we don't need to do anything
      return
    }

    // This will apply the changes that were made while paused to the ytype
    if (keepChanges && this.#state.type === 'paused' && this.#state.pendingDelta) {
      // We use a snapshot to get the document state at the point in time when the sync was paused (it may have accrued updates since then)
      // A nice property of using only a snapshot like this is that it is relatively cheap to create, and a copy is only needed if we actually want to keep the changes
      const docAtSnapshotTime = Y.createDocFromSnapshot(this.ytype.doc, this.#state.snapshot)
      const ytypeAtSnapshotTime = findTypeInOtherYdoc(this.ytype, docAtSnapshotTime)
      // We setup a listener to apply any updates which occur to the snapshot doc, to the main ydoc
      docAtSnapshotTime.on('updateV2', (update) => {
        // Apply that diff as an update to the main ydoc
        Y.applyUpdateV2(this.ytype.doc, update, ySyncPluginKey)
      })
      // Actually apply the changes accrued while paused to the ytype
      ytypeAtSnapshotTime.applyDelta(this.#state.pendingDelta, this.#attributionManager)
      docAtSnapshotTime.destroy()
    }

    // Take whatever is in the ytype now, and make that the new document state
    const tr = fragmentToTr(this.ytype, this.tr, {
      attributionManager: this.#attributionManager,
      mapAttributionToMark: this.#mapAttributionToMark
    })
    /** @type {YSyncPluginMeta} */
    const pluginMeta = {
      type: 'resume-sync'
    }
    tr.setMeta(ySyncPluginKey, pluginMeta)
    this.view.dispatch(tr)
  }

  /**
   * Get the mode that the sync plugin is in
   */
  get mode () {
    return this.#state.type
  }

  /**
   * @param {SnapshotItem} snapshot
   * @param {SnapshotItem} [prevSnapshot]
   */
  renderSnapshot (snapshot, prevSnapshot) {
    if (!prevSnapshot) {
      prevSnapshot = { fragment: snapshot.fragment }
    }
    /** @type {YSyncPluginMeta} */
    const pluginMeta = {
      type: 'render-snapshot',
      snapshot,
      prevSnapshot
    }
    const snapshotDoc = snapshot.snapshot ? Y.createDocFromSnapshot(snapshot.fragment.doc, snapshot.snapshot) : snapshot.fragment.doc
    const prevSnapshotDoc = prevSnapshot.snapshot ? Y.createDocFromSnapshot(prevSnapshot.fragment.doc, prevSnapshot.snapshot) : prevSnapshot.fragment.doc
    const tr = this.tr.setMeta(ySyncPluginKey, pluginMeta)
    const am = Y.createAttributionManagerFromDiff(prevSnapshotDoc, snapshotDoc, { attrs: [Y.createAttributionItem('insert', ['unknown'])] })
    fragmentToTr(findTypeInOtherYdoc(snapshot.fragment, snapshotDoc), tr, {
      attributionManager: am,
      mapAttributionToMark: this.#mapAttributionToMark
    })
    this.view.dispatch(tr)
  }

  /**
   * Clone the {@link SyncPluginState} instance, this allows us to compare the current state with the previous state without mutating the current state
   * @private
   */
  clone () {
    const pluginState = new SyncPluginState({
      ytype: this.ytype,
      attributionManager: this.#attributionManager,
      mapAttributionToMark: this.#mapAttributionToMark
    })

    pluginState.#state = this.#state
    pluginState.#mutex = this.#mutex
    pluginState.#view = this.#view
    pluginState.#initializationTimeoutId = this.#initializationTimeoutId
    // We can safely clone the subscription, because it will always operate on the latest plugin state, rather than being bound to the one that created it
    pluginState.#subscription = this.#subscription

    return pluginState
  }
}

/**
 * This Prosemirror {@link Plugin} is responsible for synchronizing the prosemirror {@link EditorState} with a {@link Y.XmlFragment}
 * @param {Y.XmlFragment} ytype
 * @param {object} opts
 * @param {Y.AbstractAttributionManager} [opts.attributionManager] An {@link Y.AbstractAttributionManager} to use for attribution tracking
 * @param {typeof attributionToFormat} [opts.mapAttributionToMark] A function to map the {@link Y.Attribution} to a {@link import('prosemirror-model').Mark}
 * @returns {Plugin}
 */
export function syncPlugin (ytype, { attributionManager = Y.noAttributionsManager, mapAttributionToMark = attributionToFormat } = {}) {
  return new Plugin({
    key: ySyncPluginKey,
    props: {
      editable: (state) => {
        const pluginState = ySyncPluginKey.getState(state)
        return pluginState?.mode !== 'snapshot'
      }
    },
    state: {
      init () {
        return new SyncPluginState({ ytype, attributionManager, mapAttributionToMark })
      },
      apply (tr, value) {
        return value.onApplyTr(tr)
      }
    },
    view (view) {
      const pluginState = ySyncPluginKey.getState(view.state)

      if (!pluginState) {
        throw new Error('[y/prosemirror]: plugin state not found in view.state')
      }

      pluginState.init(view)

      return {
        update (view, prevState) {
          const pluginState = ySyncPluginKey.getState(view.state)
          if (!pluginState) {
            throw new Error('[y/prosemirror]: plugin state not found in view.state')
          }
          pluginState.onViewUpdate(prevState)
        },
        destroy () {
          const pluginState = ySyncPluginKey.getState(view.state)
          if (!pluginState) {
            throw new Error('[y/prosemirror]: plugin state not found in view.state')
          }
          pluginState.destroy()
        }
      }
    },
    // Capture any local updates to the prosemirror state, later we will use them to generate a delta to apply to the ydoc
    appendTransaction (transactions, _oldState, newState) {
      transactions = transactions.filter(tr => tr.docChanged && !tr.getMeta(ySyncPluginKey))
      if (transactions.length === 0) return undefined

      /** @type {YSyncPluginMeta} */
      const pluginMeta = {
        type: 'local-update',
        capturedTransactions: transactions
      }
      return newState.tr.setMeta(ySyncPluginKey, pluginMeta).setMeta('addToHistory', false)
    }
  })
}

/**
 * @param {readonly import('prosemirror-model').Mark[]} marks
 */
const marksToFormattingAttributes = marks => {
  if (marks.length === 0) return null
  /**
   * @type {{[key:string]:any}}
   */
  const formatting = {}
  marks.forEach(mark => {
    formatting[mark.type.name] = mark.attrs
  })
  return formatting
}

/**
 * @param {{[key:string]:any}} formatting
 * @param {import('prosemirror-model').Schema} schema
 */
const formattingAttributesToMarks = (formatting, schema) => object.map(formatting, (v, k) => schema.mark(k, v))

/**
 * @param {Array<Node>} ns
 */
export const nodesToDelta = ns => {
  /**
   * @type {delta.DeltaBuilderAny}
   */
  const d = delta.create($prosemirrorDelta)
  ns.forEach(n => {
    d.insert(n.isText ? n.text : [nodeToDelta(n)], marksToFormattingAttributes(n.marks))
  })
  return d
}

/**
 * Transforms a {@link Node} into a {@link Y.XmlFragment}
 * @param {Node} node
 * @param {Y.XmlFragment} [fragment]
 * @returns {Y.XmlFragment}
 */
export function pmToFragment (node, fragment = new Y.XmlFragment()) {
  const initialPDelta = nodeToDelta(node).done()
  fragment.applyDelta(initialPDelta)

  return fragment
}

/**
 * Applies a {@link Y.XmlFragment}'s content as a ProseMirror {@link Transaction}
 * @param {Y.XmlFragment} fragment
 * @param {import('prosemirror-state').Transaction} tr
 * @param {object} [ctx]
 * @param {Y.AbstractAttributionManager} [ctx.attributionManager]
 * @param {typeof attributionToFormat} [ctx.mapAttributionToMark]
 * @returns {import('prosemirror-state').Transaction}
 */
export function fragmentToTr (fragment, tr, {
  attributionManager = Y.noAttributionsManager,
  mapAttributionToMark = attributionToFormat
}) {
  const fragmentContent = deltaAttributionToFormat(
    fragment.getContent(attributionManager, { deep: true }),
    mapAttributionToMark
  )
  const initialPDelta = nodeToDelta(tr.doc).done()
  const deltaBetweenPmAndFragment = delta.diff(initialPDelta, fragmentContent).done()

  return deltaToPSteps(tr, deltaBetweenPmAndFragment).setMeta('y-sync-hydration', {
    delta: deltaBetweenPmAndFragment
  })
}

/**
 * Transforms a {@link Y.XmlFragment} into a {@link Node}
 * @param {Y.XmlFragment} fragment
 * @param {import('prosemirror-state').Transaction}
 * @returns {Node}
 */
export function fragmentToPm (fragment, tr) {
  return fragmentToTr(fragment, tr).doc
}

/**
 * @param {Node} n
 */
export const nodeToDelta = n => {
  /**
   * @type {delta.DeltaBuilderAny}
   */
  const d = delta.create(n.type.name, $prosemirrorDelta)
  d.setMany(n.attrs)
  n.content.content.forEach(c => {
    d.insert(c.isText ? c.text : [nodeToDelta(c)], marksToFormattingAttributes(c.marks))
  })
  return d
}

/**
 * @param {import('prosemirror-state').Transaction} tr
 * @param {ProsemirrorDelta} d
 * @param {Node} pnode
 * @param {{ i: number }} currPos
 * @return {import('prosemirror-state').Transaction}
 */
export const deltaToPSteps = (tr, d, pnode = tr.doc, currPos = { i: 0 }) => {
  const schema = tr.doc.type.schema
  let currParentIndex = 0
  let nOffset = 0
  const pchildren = pnode.children
  for (const attr of d.attrs) {
    tr.setNodeAttribute(currPos.i - 1, attr.key, attr.value)
  }
  d.children.forEach(op => {
    if (delta.$retainOp.check(op)) {
      // skip over i children
      let i = op.retain
      while (i > 0) {
        const pc = pchildren[currParentIndex]
        if (pc === undefined) {
          throw new Error('[y/prosemirror]: retain operation is out of bounds')
        }
        if (pc.isText) {
          if (op.format != null) {
            const from = currPos.i
            const to = currPos.i + math.min(pc.nodeSize - nOffset, i)
            object.forEach(op.format, (v, k) => {
              if (v == null) {
                tr.removeMark(from, to, schema.marks[k])
              } else {
                tr.addMark(from, to, schema.mark(k, v))
              }
            })
          }
          if (i + nOffset < pc.nodeSize) {
            nOffset += i
            currPos.i += i
            i = 0
          } else {
            currParentIndex++
            i -= pc.nodeSize - nOffset
            currPos.i += pc.nodeSize - nOffset
            nOffset = 0
          }
        } else {
          object.forEach(op.format, (v, k) => {
            if (v == null) {
              tr.removeNodeMark(currPos.i, schema.marks[k])
            } else {
              tr.addNodeMark(currPos.i, schema.mark(k, v))
            }
          })
          currParentIndex++
          currPos.i += pc.nodeSize
          i--
        }
      }
    } else if (delta.$modifyOp.check(op)) {
      currPos.i++
      deltaToPSteps(tr, op.value, pchildren[currParentIndex++], currPos)
      currPos.i++
    } else if (delta.$insertOp.check(op)) {
      const newPChildren = op.insert.map(ins => deltaToPNode(ins, schema, op.format))
      tr.insert(currPos.i, newPChildren)
      currPos.i += newPChildren.reduce((s, c) => c.nodeSize + s, 0)
    } else if (delta.$textOp.check(op)) {
      tr.insert(currPos.i, schema.text(op.insert, formattingAttributesToMarks(op.format, schema)))
      currPos.i += op.length
    } else if (delta.$deleteOp.check(op)) {
      for (let remainingDelLen = op.delete; remainingDelLen > 0;) {
        const pc = pchildren[currParentIndex]
        if (pc === undefined) {
          throw new Error('[y/prosemirror]: delete operation is out of bounds')
        }
        if (pc.isText) {
          const delLen = math.min(pc.nodeSize - nOffset, remainingDelLen)
          tr.delete(currPos.i, currPos.i + delLen)
          nOffset += delLen
          if (nOffset === pc.nodeSize) {
            // TODO this can't actually "jump out" of the current node
            // jump to next node
            nOffset = 0
            currParentIndex++
          }
          remainingDelLen -= delLen
        } else {
          tr.delete(currPos.i, currPos.i + pc.nodeSize)
          currParentIndex++
          remainingDelLen--
        }
      }
    }
  })
  return tr
}

/**
 * @param {ProsemirrorDelta} d
 * @param {import('prosemirror-model').Schema} schema
 * @param {delta.FormattingAttributes} dformat
 * @return {Node}
 */
const deltaToPNode = (d, schema, dformat) => {
  const attrs = {}
  for (const attr of d.attrs) {
    attrs[attr.key] = attr.value
  }
  const dc = d.children.map(c => delta.$insertOp.check(c) ? c.insert.map(cn => deltaToPNode(cn, schema, c.format)) : (delta.$textOp.check(c) ? [schema.text(c.insert, formattingAttributesToMarks(c.format, schema))] : []))
  return schema.node(d.name, attrs, dc.flat(1), formattingAttributesToMarks(dformat, schema))
}

/**
 * @param {Node} beforeDoc
 * @param {Node} afterDoc
 */
export const docDiffToDelta = (beforeDoc, afterDoc) => {
  const initialDelta = nodeToDelta(beforeDoc)
  const finalDelta = nodeToDelta(afterDoc)

  return delta.diff(initialDelta.done(), finalDelta.done())
}

/**
 * @param {Transform} tr
 */
export const trToDelta = (tr) => {
  // const d = delta.create($prosemirrorDelta)
  // tr.steps.forEach((step, i) => {
  //   const stepDelta = stepToDelta(step, tr.docs[i])
  //   console.log('stepDelta', JSON.stringify(stepDelta.toJSON(), null, 2))
  //   console.log('d', JSON.stringify(d.toJSON(), null, 2))
  //   d.apply(stepDelta)
  // })
  // return d.done()
  // Calculate delta from initial and final document states to avoid composition issues with delete operations
  // This is more reliable than composing step-by-step, which can lose delete operations and cause "Unexpected case" errors
  // after lib0 upgrades that change delta composition behavior
  const initialDelta = nodeToDelta(tr.before)
  const finalDelta = nodeToDelta(tr.doc)
  const resultDelta = delta.diff(initialDelta.done(), finalDelta.done())
  return resultDelta
}

const _stepToDelta = s.match({ beforeDoc: Node, afterDoc: Node })
  .if([ReplaceStep, ReplaceAroundStep], (step, { beforeDoc, afterDoc }) => {
    const oldStart = beforeDoc.resolve(step.from)
    const oldEnd = beforeDoc.resolve(step.to)
    const newStart = afterDoc.resolve(step.from)

    const newEnd = afterDoc.resolve(step instanceof ReplaceAroundStep ? step.getMap().map(step.to) : step.from + step.slice.size)

    const oldBlockRange = oldStart.blockRange(oldEnd)
    const newBlockRange = newStart.blockRange(newEnd)
    const oldDelta = deltaForBlockRange(oldBlockRange)
    const newDelta = deltaForBlockRange(newBlockRange)
    const diffD = delta.diff(oldDelta, newDelta)
    const stepDelta = deltaModifyNodeAt(beforeDoc, oldBlockRange?.start || newBlockRange?.start || 0, d => { d.append(diffD) })
    return stepDelta
  })
  .if(AddMarkStep, (step, { beforeDoc }) =>
    deltaModifyNodeAt(beforeDoc, step.from, d => { d.retain(step.to - step.from, marksToFormattingAttributes([step.mark])) })
  )
  .if(AddNodeMarkStep, (step, { beforeDoc }) =>
    deltaModifyNodeAt(beforeDoc, step.pos, d => { d.retain(1, marksToFormattingAttributes([step.mark])) })
  )
  .if(RemoveMarkStep, (step, { beforeDoc }) =>
    deltaModifyNodeAt(beforeDoc, step.from, d => { d.retain(step.to - step.from, { [step.mark.type.name]: null }) })
  )
  .if(RemoveNodeMarkStep, (step, { beforeDoc }) =>
    deltaModifyNodeAt(beforeDoc, step.pos, d => { d.retain(1, { [step.mark.type.name]: null }) })
  )
  .if(AttrStep, (step, { beforeDoc }) =>
    deltaModifyNodeAt(beforeDoc, step.pos, d => { d.modify(delta.create().set(step.attr, step.value)) })
  )
  .if(DocAttrStep, step =>
    delta.create().set(step.attr, step.value)
  )
  .else(_step => {
    // unknown step kind
    error.unexpectedCase()
  })
  .done()

/**
 * @param {import('prosemirror-transform').Step} step
 * @param {import('prosemirror-model').Node} beforeDoc
 * @return {ProsemirrorDelta}
 */
export const stepToDelta = (step, beforeDoc) => {
  const stepResult = step.apply(beforeDoc)
  if (stepResult.failed) {
    throw new Error('[y/prosemirror]: step failed to apply')
  }
  return _stepToDelta(step, { beforeDoc, afterDoc: stepResult.doc })
}

/**
 *
 * @param {import('prosemirror-model').NodeRange | null} blockRange
 */
function deltaForBlockRange (blockRange) {
  if (blockRange === null) {
    return delta.create()
  }
  const { startIndex, endIndex, parent } = blockRange
  return nodesToDelta(parent.content.content.slice(startIndex, endIndex))
}

/**
 * This function is used to find the delta offset for a given prosemirror offset in a node.
 * Given the following document:
 * <doc><p>Hello world</p><blockquote><p>Hello world!</p></blockquote></doc>
 * The delta structure would look like this:
 *  0: p
 *   - 0: text("Hello world")
 *  1: blockquote
 *   - 0: p
 *     - 0: text("Hello world!")
 * So the prosemirror position 10 would be within the delta offset path: 0, 0 and have an offset into the text node of 9 (since it is the 9th character in the text node).
 *
 * So the return value would be [0, 9], which is the path of: p, text("Hello wor")
 *
 * @param {Node} node
 * @param {number} searchPmOffset The p offset to find the delta offset for
 * @return {number[]} The delta offset path for the search pm offset
 */
export function pmToDeltaPath (node, searchPmOffset = 0) {
  if (searchPmOffset === 0) {
    // base case
    return [0]
  }

  const resolvedOffset = node.resolve(searchPmOffset)
  const depth = resolvedOffset.depth
  const path = []
  if (depth === 0) {
    // if the offset is at the root node, return the index of the node
    return [resolvedOffset.index(0)]
  }
  // otherwise, add the index of each parent node to the path
  for (let d = 0; d < depth; d++) {
    path.push(resolvedOffset.index(d))
  }

  // add any offset into the parent node to the path
  path.push(resolvedOffset.parentOffset)

  return path
}

/**
 * Inverse of {@link pmToDeltaPath}
 * @param {number[]} deltaPath
 * @param {Node} node
 * @return {number} The prosemirror offset for the delta path
 */
export function deltaPathToPm (deltaPath, node) {
  let pmOffset = 0
  let curNode = node

  // Special case: if path has only one element, it's a child index at depth 0
  if (deltaPath.length === 1) {
    const childIndex = deltaPath[0]
    // Add sizes of all children before the target index
    for (let j = 0; j < childIndex; j++) {
      pmOffset += curNode.children[j].nodeSize
    }
    return pmOffset
  }

  // Handle all elements except the last (which is an offset)
  for (let i = 0; i < deltaPath.length - 1; i++) {
    const childIndex = deltaPath[i]
    // Add sizes of all children before the target child
    for (let j = 0; j < childIndex; j++) {
      pmOffset += curNode.children[j].nodeSize
    }
    // Add 1 for the opening tag of the target child, then navigate into it
    pmOffset += 1
    curNode = curNode.children[childIndex]
  }

  // Last element is an offset within the current node
  pmOffset += deltaPath[deltaPath.length - 1]

  return pmOffset
}

/**
 * @param {Node} node
 * @param {number} pmOffset
 * @param {(d:delta.DeltaBuilderAny)=>any} mod
 * @return {ProsemirrorDelta}
 */
export const deltaModifyNodeAt = (node, pmOffset, mod) => {
  const dpath = pmToDeltaPath(node, pmOffset)
  let currentOp = delta.create($prosemirrorDelta)
  const lastIndex = dpath.length - 1
  currentOp.retain(lastIndex >= 0 ? dpath[lastIndex] : 0)
  mod(currentOp)
  for (let i = lastIndex - 1; i >= 0; i--) {
    currentOp = /** @type {delta.DeltaBuilderAny} */ (delta.create($prosemirrorDelta).retain(dpath[i]).modify(currentOp))
  }
  return currentOp
}
