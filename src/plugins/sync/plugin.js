import * as Y from '@y/y'
import * as delta from 'lib0/delta'
import * as error from 'lib0/error'
import * as mux from 'lib0/mutex'
import { Plugin } from 'prosemirror-state'
import { Transform } from 'prosemirror-transform'
import {
  defaultMapAttributionToMark,
  deltaAttributionToFormat,
  deltaToPSteps,
  docDiffToDelta,
  fragmentToTr,
  nodeToDelta,
  pmToFragment,
  trToDelta
} from '../../sync/index.js'
import { ySyncPluginKey } from '../keys.js'

/**
 * @typedef {import('./types.js').SyncPluginState} SyncPluginState
 * @typedef {import('./types.js').SyncPluginTransactionMeta} SyncPluginTransactionMeta
 */

// This is a pure function of the transaction and the previous plugin state
/** @type {import('prosemirror-state').StateField<SyncPluginState>['apply']} */
function apply (tr, prevPluginState) {
  /** @type {SyncPluginTransactionMeta | undefined} */
  const trMeta = tr.getMeta(ySyncPluginKey)

  // Capture document-changing transactions (only in synced mode, and not sync plugin meta transactions)
  if (tr.docChanged && !trMeta && prevPluginState.type === 'synced') {
    return {
      ...prevPluginState,
      capturedTransactions: prevPluginState.capturedTransactions.concat(tr)
    }
  }

  // Handle sync plugin meta transactions
  if (trMeta) {
    switch (trMeta.type) {
      case 'pause-mode': {
        if (prevPluginState.type === 'paused') {
          // already paused, no-op
          return prevPluginState
        }
        return {
          type: 'paused',
          previousState: prevPluginState,
          capturedTransactions: []
        }
      }
      case 'sync-mode': {
        // When switching to sync mode from paused, get ytype and attributionManager from previousState or meta
        // Also allow switching ytype/attributionManager when already synced
        const nextYtype = trMeta.ytype ?? (prevPluginState.type === 'paused' ? prevPluginState.previousState?.ytype : prevPluginState.ytype)
        const nextAttributionManager = trMeta.attributionManager ?? (prevPluginState.type === 'paused' ? prevPluginState.previousState?.attributionManager : prevPluginState.attributionManager)

        if (!nextYtype) {
          throw new Error('[y/prosemirror]: sync-mode meta.ytype is required')
        }

        // If already synced and nothing changed, no-op
        if (prevPluginState.type === 'synced' &&
            prevPluginState.ytype === nextYtype &&
            prevPluginState.attributionManager === nextAttributionManager) {
          return prevPluginState
        }

        return {
          type: 'synced',
          ytype: nextYtype,
          attributionManager: nextAttributionManager || null,
          capturedTransactions: []
        }
      }
      case 'remote-update': {
        // no-op for state, this is for other plugins
        return prevPluginState
      }
      case 'initialized': {
        // no-op for state
        return prevPluginState
      }
      default: {
        error.unexpectedCase()
      }
    }
  }

  // No meta and not a document-changing transaction, return unchanged
  return prevPluginState
}

/**
 * This Prosemirror {@link Plugin} is responsible for synchronizing the prosemirror {@link EditorState} with a {@link Y.XmlFragment}
 * @param {Y.Type} ytype
 * @param {object} opts
 * @param {Y.AbstractAttributionManager} [opts.attributionManager] An {@link Y.AbstractAttributionManager} to use for attribution tracking
 * @param {Y.Doc} [opts.suggestionDoc] A {@link Y.Doc} to use for suggestion tracking
 * @param {typeof defaultMapAttributionToMark} [opts.mapAttributionToMark] A function to map the {@link Y.Attribution} to a {@link import('prosemirror-model').Mark}
 * @param {()=>void} [opts.onFirstRender] This callback is called on first render
 * @returns {Plugin}
 */
export function syncPlugin (ytype, {
  attributionManager = Y.noAttributionsManager,
  mapAttributionToMark = defaultMapAttributionToMark,
  onFirstRender = () => {}
} = {}) {
  const mutex = mux.createMutex()
  // Store the current subscription unsubscribe function
  /** @type {(() => void) | null} */
  let unsubscribeFn = null

  /**
   * Subscribe to ytype changes and apply remote updates to prosemirror
   * @param {object} opts
   * @param {import('prosemirror-view').EditorView} opts.view
   * @param {Y.Type} opts.ytype
   * @param {Y.AbstractAttributionManager} opts.attributionManager
   * @param {typeof defaultMapAttributionToMark} opts.mapAttributionToMark
   */
  function subscribeToYType ({ view, ytype, attributionManager, mapAttributionToMark }) {
    // Unsubscribe from previous subscription if it exists
    if (unsubscribeFn) {
      unsubscribeFn()
      unsubscribeFn = null
    }

    // Track if ytype has been initialized
    let isYTypeInitialized = !!ytype.length

    const yTypeCb = ytype.observeDeep((change, tr) => {
      if (!view || view.isDestroyed) {
        // View is destroyed, clean up
        if (unsubscribeFn) {
          unsubscribeFn()
          unsubscribeFn = null
        }
        return
      }

      // Get latest plugin state
      const pluginState = ySyncPluginKey.getState(view.state)
      if (!pluginState) {
        return
      }

      // Only process if in synced mode
      if (pluginState.type !== 'synced') {
        return
      }

      mutex(() => {
        let d = deltaAttributionToFormat(
          change.getDelta(attributionManager, { deep: true }),
          mapAttributionToMark
        ).done()

        if (!isYTypeInitialized) {
          // First update: need to diff with current prosemirror doc to avoid duplication
          d = delta.diff(nodeToDelta(view.state.doc).done(), d)
        }

        const ptr = deltaToPSteps(view.state.tr, d)
        ptr.setMeta(ySyncPluginKey, {
          type: 'remote-update',
          change,
          ytype
        })
        ptr.setMeta('addToHistory', false)
        view.dispatch(ptr)

        isYTypeInitialized = true
      })
    })

    unsubscribeFn = () => {
      ytype.unobserveDeep(yTypeCb)
      unsubscribeFn = null
    }
  }

  /**
   * Unsubscribe from ytype changes
   */
  function unsubscribeFromYType () {
    if (unsubscribeFn) {
      unsubscribeFn()
      unsubscribeFn = null
    }
  }

  return /** @type {Plugin<import('./types.js').SyncPluginState>} */ (new Plugin({
    key: ySyncPluginKey,
    state: {
      init: () => {
        return {
          type: 'synced',
          ytype,
          attributionManager,
          capturedTransactions: []
        }
      },
      apply
    },
    view (view) {
      const pluginState = ySyncPluginKey.getState(view.state)

      if (!pluginState) {
        throw new Error('[y/prosemirror]: plugin state not found in view.state')
      }

      // initialize the prosemirror state with what is in the ydoc
      // we wait a tick, because in some cases, the view can be immediately destroyed
      const initializationTimeoutId = setTimeout(() => {
        if (view.isDestroyed) {
          return
        }

        const currentPluginState = ySyncPluginKey.getState(view.state)
        if (!currentPluginState) {
          return
        }

        // ydoc content should always "win" over pm doc content
        if (ytype.length === 0) {
          // ytype is empty, render prosemirror doc to ytype if it has content
          const pmHasContent = view.state.doc.content.findDiffStart(
            view.state.doc.type.createAndFill().content
          ) !== null

          if (pmHasContent) {
            // Apply prosemirror content to ytype
            ytype.doc.transact(() => {
              pmToFragment(view.state.doc, ytype, { attributionManager })
            }, ySyncPluginKey)
          }
        } else {
          // ytype has content, render it to prosemirror
          const tr = fragmentToTr(ytype, view.state.tr, {
            attributionManager,
            mapAttributionToMark
          })

          /** @type {SyncPluginTransactionMeta} */
          const pluginMeta = {
            type: 'initialized',
            ytype,
            attributionManager
          }
          tr.setMeta(ySyncPluginKey, pluginMeta)
          tr.setMeta('addToHistory', false)
          view.dispatch(tr)
        }

        // Call onFirstRender callback
        onFirstRender()

        // subscribe to the ydoc changes, after initialization is complete
        subscribeToYType({
          view,
          ytype,
          attributionManager,
          mapAttributionToMark
        })
      }, 0)

      return {
        update (view, prevState) {
          const pluginState = ySyncPluginKey.getState(view.state)
          const prevPluginState = ySyncPluginKey.getState(prevState)

          if (!pluginState) {
            error.unexpectedCase()
            return
          }

          if (pluginState.type === 'synced') {
            // Handle mode transition from paused to synced, or switching ytype/attributionManager
            const prevYtype = prevPluginState?.type === 'synced' ? prevPluginState.ytype : (prevPluginState?.type === 'paused' ? prevPluginState.previousState?.ytype : undefined)
            const prevAttributionManager = prevPluginState?.type === 'synced' ? prevPluginState.attributionManager : (prevPluginState?.type === 'paused' ? prevPluginState.previousState?.attributionManager : undefined)

            const ytypeChanged = prevYtype !== pluginState.ytype
            const attributionManagerChanged = prevAttributionManager !== pluginState.attributionManager
            const wasPaused = prevPluginState?.type === 'paused'

            if (wasPaused || ytypeChanged || attributionManagerChanged) {
              // Subscribe to the new ytype/attributionManager
              // (subscribeToYType will automatically unsubscribe from previous if needed)
              subscribeToYType({
                view,
                ytype: pluginState.ytype,
                attributionManager: pluginState.attributionManager,
                mapAttributionToMark
              })
            }

            // Process captured transactions and apply to ytype
            if (pluginState.capturedTransactions.length > 0) {
              mutex(() => {
                const captured = pluginState.capturedTransactions

                // Build Transform from captured transactions
                const transform = new Transform(captured[0].before)
                let stepFailed = false

                for (let i = 0; i < captured.length; i++) {
                  for (let j = 0; j < captured[i].steps.length; j++) {
                    const success = transform.maybeStep(captured[i].steps[j])
                    if (success.failed) {
                      stepFailed = true
                      break
                    }
                  }
                  if (stepFailed) break
                }

                let deltaToApply
                if (stepFailed) {
                  // Fallback to full diff
                  console.error('[y/prosemirror]: step failed to apply, falling back to a full diff')
                  deltaToApply = docDiffToDelta(captured[0].before, captured[captured.length - 1].after)
                } else {
                  // Convert transform to delta
                  deltaToApply = trToDelta(transform)
                }

                // Apply delta to ytype
                pluginState.ytype.doc.transact(() => {
                  // If ytype has not yet been initialized, apply the previous prosemirror document first
                  if (pluginState.ytype.length === 0) {
                    pmToFragment(prevState.doc, pluginState.ytype, {
                      attributionManager: pluginState.attributionManager
                    })
                  }
                  pluginState.ytype.applyDelta(deltaToApply, pluginState.attributionManager)
                }, ySyncPluginKey)

                pluginState.capturedTransactions = []
              })
            }
          } else if (pluginState.type === 'paused') {
            // Handle mode transition from synced to paused
            if (prevPluginState?.type === 'synced') {
              // Unsubscribe from the ydoc changes
              unsubscribeFromYType()
            }
            // Skip applying transactions to ytype when paused
          } else {
            error.unexpectedCase()
          }
        },
        destroy () {
          clearTimeout(initializationTimeoutId)
          unsubscribeFromYType()
        }
      }
    }
  }))
}
