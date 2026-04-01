import * as Y from '@y/y'
import * as mux from 'lib0/mutex'
import { Plugin } from 'prosemirror-state'
import {
  defaultMapAttributionToMark,
  deltaAttributionToFormat,
  deltaToPSteps,
  nodeToDelta,
  formattingAttributesToMarks
} from './sync-utils.js'
import { ReplaceStep, AddMarkStep, RemoveMarkStep } from 'prosemirror-transform'
import * as d from 'lib0/delta'
import { ySyncPluginKey } from './keys.js'
import * as s from 'lib0/schema'
import * as object from 'lib0/object'
import * as list from 'lib0/list'
import * as error from 'lib0/error'

/**
 * The y-prosemirror binding is a bi-directional synchronization with the provided Y.Type and the EditorView
 * Any change applied to the EditorView will be applied (via deltas) to the Y.Type, and vice versa.
 */
export const $syncPluginState = s.$object({
  ytype: Y.$ytypeAny.nullable,
  /**
   * If provided, will switch to the given attribution manager instead of the current attribution manager
   */
  attributionManager: Y.$attributionManager.nullable,
  attributionMapper: /** @type {s.Schema<AttributionMapper>} */ (s.$function)
})

export const $syncPluginStateUpdate = s.$object({
  ytype: Y.$ytypeAny.nullable.optional,
  attributionManager: Y.$attributionManager.nullable.optional,
  attributionMapper: /** @type {s.Schema<AttributionMapper>} */ (s.$function).nullable.optional,
  change: /** @type {s.Schema<Y.YEvent<any>>} */ (s.$any).nullable.optional
})
const $maybeSyncPluginStateUpdate = $syncPluginStateUpdate.nullable

// @todo compute this in the plugin state
const attributionMarkNames = [
  'y-attribution-insertion',
  'y-attribution-deletion',
  'y-attribution-format'
]
const attributionDeleteMark = 'y-attribution-deletion'

/**
 * only safe to use on diffed deltas
 *
 * 1. strip formats
 * 2. transform delete-attribution to delete op
 * @param {d.DeltaAny} delta
 */
const stripAttributionFormattingFromDelta = delta => {
  for (const child of delta.children) {
    if (!d.$deleteOp.check(child)) {
      if (child.format?.[attributionDeleteMark] != null) {
        list.replace(delta.children, child, new d.DeleteOp(child.length, null))
        continue
      }
    }
    if (d.$modifyOp.check(child)) {
      stripAttributionFormattingFromDelta(child.value)
    }
    if (d.$insertOp.check(child)) {
      child.insert.forEach(ins => {
        if (d.$deltaAny.check(ins)) {
          stripAttributionFormattingFromDelta(ins)
        }
      })
    }
    if (!d.$deleteOp.check(child) && child.format != null) {
      attributionMarkNames.forEach(n => {
        delete child.format?.[n]
      })
    }
  }
}

/**
 * This Prosemirror {@link Plugin} is responsible for synchronizing the prosemirror {@link EditorState} with a {@link Y.XmlFragment}
 * @param {object} opts
 * @param {Y.Doc} [opts.suggestionDoc] A {@link Y.Doc} to use for suggestion tracking
 * @param {AttributionMapper} [opts.mapAttributionToMark] A function to map the {@link Y.Attribution} to a {@link import('prosemirror-model').Mark}
 * @returns {Plugin}
 */
export function syncPlugin (opts = {}) {
  return new Plugin({
    key: ySyncPluginKey,
    state: {
      init: () => {
        return $syncPluginState.expect({
          ytype: null,
          attributionManager: null,
          attributionMapper: opts.mapAttributionToMark || defaultMapAttributionToMark
        })
      },
      apply: (tr, prevPluginState) => {
        const stateUpdate = $maybeSyncPluginStateUpdate.expect(tr.getMeta(ySyncPluginKey) || null)
        if (!stateUpdate) {
          return prevPluginState
        }
        return object.assign({}, prevPluginState, stateUpdate, stateUpdate.attributionManager == null ? { attributionManager: Y.noAttributionsManager } : {})
      }
    },
    appendTransaction (trs, _oldState, newState) {
      const pluginState = $syncPluginState.cast(ySyncPluginKey.getState(newState))
      if (
        pluginState.ytype == null ||
          pluginState.attributionManager == null ||
          pluginState.attributionManager === Y.noAttributionsManager ||
          trs.some(tr => tr.getMeta('y-sync-transaction') || tr.getMeta(ySyncPluginKey) || tr.getMeta('y-sync-append'))
      ) {
        return null
      }
      // @ts-ignore
      /**
       * Whether to re-insert deletions as text or not
       * @type {boolean}
       */
      const suggestionMode = /** @type {any} */ (pluginState.attributionManager).suggestionMode || false
      const schema = newState.schema
      const attributionMapper = pluginState.attributionMapper
      const deletionFormat = attributionMapper(null, { delete: [] })
      const insertionFormat = attributionMapper(null, { insert: [] })
      const formatFormat = attributionMapper(null, { format: {} })
      if (formatFormat == null || insertionFormat == null || deletionFormat == null) error.unexpectedCase()
      const deletionMarks = formattingAttributesToMarks(deletionFormat, schema)
      const insertionMarks = formattingAttributesToMarks(insertionFormat, schema)
      const formatMarks = formattingAttributesToMarks(formatFormat, schema)
      const tr = newState.tr
      let changed = false

      /**
       * Map a position from a step through all subsequent steps, subsequent
       * transactions, and the appended transaction's own steps.
       * @param {number} pos
       * @param {Transaction} transaction
       * @param {number} stepIndex
       * @return {number}
       */
      const mapPos = (pos, transaction, stepIndex) => {
        for (let j = stepIndex + 1; j < transaction.steps.length; j++) {
          pos = transaction.steps[j].getMap().map(pos)
        }
        const trIndex = trs.indexOf(transaction)
        for (let j = trIndex + 1; j < trs.length; j++) {
          pos = trs[j].mapping.map(pos)
        }
        pos = tr.mapping.map(pos)
        return pos
      }

      for (const transaction of trs) {
        for (let i = 0; i < transaction.steps.length; i++) {
          const step = transaction.steps[i]
          if (step instanceof ReplaceStep) {
            const deleted = transaction.docs[i].slice(step.from, step.to)
            const insertedSize = step.slice.content.size
            // Map position before any modifications to our tr
            const pos = mapPos(step.from, transaction, i)
            // Handle deletions:
            // - Content with y-attribution-insertion mark: actually delete (revert the suggestion)
            // - Other content: re-insert with deletion marks
            let reinsertedSize = 0
            if (deleted.content.size > 0) {
              const insertionMarkType = schema.marks['y-attribution-insertion']
              deleted.content.forEach((node) => {
                if (insertionMarkType && node.marks.some(m => m.type === insertionMarkType)) {
                  // Suggested insertion — let it stay deleted
                } else if (suggestionMode) {
                  // Non-attributed content — re-insert with deletion mark
                  const insertAt = pos + reinsertedSize
                  tr.insert(insertAt, node)
                  for (const mark of deletionMarks) {
                    tr.addMark(insertAt, insertAt + node.nodeSize, mark)
                  }
                  reinsertedSize += node.nodeSize
                }
              })
              if (reinsertedSize > 0) changed = true
            }
            // Handle insertions: add insertion marks to inserted content
            // After re-inserting deleted content, inserted content is shifted by reinserted size
            if (insertedSize > 0 && suggestionMode) {
              const insertPos = pos + reinsertedSize
              for (const mark of insertionMarks) {
                tr.addMark(insertPos, insertPos + insertedSize, mark)
              }
              // Also add marks to nodes themselves (addMark only affects inline content)
              tr.doc.nodesBetween(insertPos, insertPos + insertedSize, (node, nodePos) => {
                if (node.isBlock && insertPos <= nodePos && nodePos <= insertPos + insertedSize) {
                  for (const mark of insertionMarks) {
                    if (node.type.allowsMarkType(mark.type)) {
                      tr.addNodeMark(nodePos, mark)
                    }
                  }
                }
              })
              changed = true
            }
          } else if (suggestionMode && (step instanceof AddMarkStep || step instanceof RemoveMarkStep) && !step.mark.type.name.startsWith('y-attribution-')) {
            // Handle mark changes: add format marks to the affected range
            const from = mapPos(step.from, transaction, i)
            const to = mapPos(step.to, transaction, i)
            for (const mark of formatMarks) {
              tr.addMark(from, to, mark)
            }
            changed = true
          }
        }
      }

      if (!changed) return null
      tr.setMeta('y-sync-append', true)
      tr.setMeta('addToHistory', false)
      return tr
    },
    view () {
      const mutex = mux.createMutex()
      // Store the current subscription unsubscribe function
      /** @type {(() => void) | null} */
      let unsubscribeFn = null
      /**
       * Subscribe to ytype changes and apply remote updates to prosemirror
       * @param {object} opts
       * @param {import('prosemirror-view').EditorView} opts.view
       * @param {Y.Type?} opts.ytype
       * @param {Y.AbstractAttributionManager?} opts.attributionManager
       * @param {AttributionMapper} opts.attributionMapper
       */
      function subscribeToYType ({ view, ytype, attributionManager, attributionMapper }) {
        // Unsubscribe from previous subscription if it exists
        unsubscribeFn?.()
        if (ytype != null) {
          const yTypeCb = ytype.observeDeep(change => {
            if (!view || view.isDestroyed) {
              return unsubscribeFn?.()
            }
            mutex(() => {
              const d = deltaAttributionToFormat(
                change.getDelta(attributionManager || Y.noAttributionsManager, { deep: true }),
                attributionMapper
              ).done()
              const ptr = deltaToPSteps(view.state.tr, d)
              ptr.setMeta('addToHistory', false)
              ptr.setMeta('y-sync-transaction', $syncPluginStateUpdate.expect({
                change,
                attributionManager,
                attributionMapper,
                ytype
              }))
              view.dispatch(ptr)
            })
          })
          unsubscribeFn = () => {
            ytype.unobserveDeep(yTypeCb)
            unsubscribeFn = null
          }
        }
      }
      return {
        update (view, prevState) {
          const pluginState = $syncPluginState.cast(ySyncPluginKey.getState(view.state))
          const prevPluginState = ySyncPluginKey.getState(prevState)
          const ytype = pluginState.ytype
          const attributionManager = pluginState.attributionManager
          const prevYtype = prevPluginState?.ytype
          const prevAttributionManager = prevPluginState?.attributionManager
          const ytypeChanged = prevYtype !== ytype
          const attributionManagerChanged = prevAttributionManager !== attributionManager
          if (ytypeChanged || attributionManagerChanged) {
            // Subscribe to the new ytype/attributionManager
            // (subscribeToYType will automatically unsubscribe from previous if needed)
            subscribeToYType({
              view,
              ytype,
              attributionManager,
              attributionMapper: pluginState.attributionMapper
            })
          }
          if (ytype != null) {
            mutex(() => {
              /**
               * @type {ProsemirrorDelta}
               */
              const ycontent = ytype.toDeltaDeep(attributionManager || Y.noAttributionsManager)
              const pcontent = nodeToDelta(view.state.doc)
              const diff = d.diff(ycontent.done(), pcontent.done())
              if (attributionManager != null && attributionManager !== Y.noAttributionsManager) { stripAttributionFormattingFromDelta(diff) }
              ytype.applyDelta(diff, attributionManager || Y.noAttributionsManager)
            })
          }
        },
        destroy () {
          unsubscribeFn?.()
        }
      }
    }
  })
}

// if (attributionManager != null) {
//   // sync "attributed content" to prosemirror editor
//   const ycontent = deltaAttributionToFormat(ytype.toDeltaDeep(attributionManager), pluginState.attributionMapper)
//   const pcontent = nodeToDelta(tr.doc)
//   const diff = d.diff(pcontent.done(), ycontent.done())
//   deltaToPSteps(tr, diff)
// }
