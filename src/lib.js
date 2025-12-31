import { updateYFragment, createNodeFromYElement, yattr2markname, createEmptyMeta } from './plugins/sync-plugin.js' // eslint-disable-line
import { ySyncPluginKey } from './plugins/keys.js'
import * as Y from '@y/y'
import { EditorView } from 'prosemirror-view' // eslint-disable-line
import { Node, Schema, Fragment } from 'prosemirror-model' // eslint-disable-line
import * as error from 'lib0/error'
import * as map from 'lib0/map'
import * as eventloop from 'lib0/eventloop'

/**
 * Either a node if type is YXmlElement or an Array of text nodes if YXmlText
 * @typedef {Map<Y.AbstractType, Node | Array<Node>>} ProsemirrorMapping
 */

/**
 * Is null if no timeout is in progress.
 * Is defined if a timeout is in progress.
 * Maps from view
 * @type {Map<EditorView, Map<any, any>>|null}
 */
let viewsToUpdate = null

const updateMetas = () => {
  const ups = /** @type {Map<EditorView, Map<any, any>>} */ (viewsToUpdate)
  viewsToUpdate = null
  ups.forEach((metas, view) => {
    const tr = view.state.tr
    const syncState = ySyncPluginKey.getState(view.state)
    if (syncState && syncState.binding && !syncState.binding.isDestroyed) {
      metas.forEach((val, key) => {
        tr.setMeta(key, val)
      })
      view.dispatch(tr)
    }
  })
}

export const setMeta = (view, key, value) => {
  if (!viewsToUpdate) {
    viewsToUpdate = new Map()
    eventloop.timeout(0, updateMetas)
  }
  map.setIfUndefined(viewsToUpdate, view, map.create).set(key, value)
}

/**
 * Transforms a Prosemirror based absolute position to a Yjs Cursor (relative position in the Yjs model).
 *
 * @param {number} pos
 * @param {Y.XmlFragment} type
 * @param {Node} pmDoc
 * @param {AbstractAttributionManager} am
 * @return {any} relative position
 */
export const absolutePositionToRelativePosition = (pos, type, pmDoc, am = Y.noAttributionsManager) => {
  if (pos === 0) {
    // if the type is later populated, we want to retain the 0 position (hence assoc=-1)
    return Y.createRelativePositionFromTypeIndex(type, 0, type.length === 0 ? -1 : 0, am)
  }
  const resolvedPos = pmDoc.resolve(pos)
  const depth = resolvedPos.depth
  // Navigate through the Y.js structure using the path from ResolvedPos
  let currentYType = type
  for (let d = 0; d < depth; d++) {
    const childIndex = resolvedPos.index(d)
    currentYType = currentYType.get(childIndex, am) // @todo get method should support attribution manager
  }
  // Use the parent offset as the position within the target Y.js type
  const offset = resolvedPos.parentOffset
  return Y.createRelativePositionFromTypeIndex(currentYType, offset, 0, am)
}

/**
 * @param {Y.Doc} y
 * @param {Y.XmlFragment} documentType Top level type that is bound to pView
 * @param {any} relPos Encoded Yjs based relative position
 * @param {Node} pmDoc
 * @return {null|number}
 */
export const relativePositionToAbsolutePosition = (y, documentType, relPos, pmDoc) => {
  // (1) decodedPos.index is the absolute position starting at the referred  prosemirror node.
  const decodedPos = Y.createAbsolutePositionFromRelativePosition(relPos, y)
  if (decodedPos === null || (decodedPos.type !== documentType && !Y.isParentOf(documentType, decodedPos.type._item))) {
    return null
  }
  /*
   * Now, we need to compute the nested position.
   * - Compute the path of the targeted type Y.getPathTo(decodedPos.type).
   * - (2) Use that path to calculate the absolute prosemirror position based on the prosemirror state.
   * result = (1) + (2)
   */
  const path = Y.getPathTo(documentType, decodedPos.type)
  let pos = 1 // Start inside the document
  let currentNode = pmDoc
  // Traverse the path to find the nested position
  for (let i = 0; i < path.length; i++) {
    const childIndex = path[i]
    // Add sizes of all previous siblings
    for (let j = 0; j < childIndex; j++) {
      pos += currentNode.child(j).nodeSize
    }
    // enter node
    pos += 1
    currentNode = currentNode.child(childIndex)
  }
  // Add the offset within the target node
  return pos + decodedPos.index
}

/**
 * Utility function for converting an Y.Fragment to a ProseMirror fragment.
 *
 * @param {Y.XmlFragment} yXmlFragment
 * @param {Schema} schema
 */
export const yXmlFragmentToProseMirrorFragment = (yXmlFragment, schema) => {
  const fragmentContent = yXmlFragment.toArray().map((t) =>
    createNodeFromYElement(
      /** @type {Y.XmlElement} */ (t),
      schema,
      createEmptyMeta()
    )
  ).filter((n) => n !== null)
  return Fragment.fromArray(fragmentContent)
}

/**
 * Utility function for converting an Y.Fragment to a ProseMirror node.
 *
 * @param {Y.XmlFragment} yXmlFragment
 * @param {Schema} schema
 */
export const yXmlFragmentToProseMirrorRootNode = (yXmlFragment, schema) =>
  schema.topNodeType.create(null, yXmlFragmentToProseMirrorFragment(yXmlFragment, schema))

/**
 * The initial ProseMirror content should be supplied by Yjs. This function transforms a Y.Fragment
 * to a ProseMirror Doc node and creates a mapping that is used by the sync plugin.
 *
 * @param {Y.XmlFragment} yXmlFragment
 * @param {Schema} schema
 *
 * @todo deprecate mapping property
 */
export const initProseMirrorDoc = (yXmlFragment, schema) => {
  const meta = createEmptyMeta()
  const fragmentContent = yXmlFragment.toArray().map((t) =>
    createNodeFromYElement(
      /** @type {Y.XmlElement} */ (t),
      schema,
      meta
    )
  ).filter((n) => n !== null)
  const doc = schema.topNodeType.create(null, Fragment.fromArray(fragmentContent))
  return { doc, meta, mapping: meta.mapping }
}

/**
 * Utility method to convert a Prosemirror Doc Node into a Y.Doc.
 *
 * This can be used when importing existing content to Y.Doc for the first time,
 * note that this should not be used to rehydrate a Y.Doc from a database once
 * collaboration has begun as all history will be lost
 *
 * @param {Node} doc
 * @param {string} xmlFragment
 * @return {Y.Doc}
 */
export function prosemirrorToYDoc (doc, xmlFragment = 'prosemirror') {
  const ydoc = new Y.Doc()
  const type = /** @type {Y.XmlFragment} */ (ydoc.get(xmlFragment, Y.XmlFragment))
  if (!type.doc) {
    return ydoc
  }

  prosemirrorToYXmlFragment(doc, type)
  return type.doc
}

/**
 * Utility method to update an empty Y.XmlFragment with content from a Prosemirror Doc Node.
 *
 * This can be used when importing existing content to Y.Doc for the first time,
 * note that this should not be used to rehydrate a Y.Doc from a database once
 * collaboration has begun as all history will be lost
 *
 * Note: The Y.XmlFragment does not need to be part of a Y.Doc document at the time that this
 * method is called, but it must be added before any other operations are performed on it.
 *
 * @param {Node} doc prosemirror document.
 * @param {Y.XmlFragment} [xmlFragment] If supplied, an xml fragment to be
 *   populated from the prosemirror state; otherwise a new XmlFragment will be created.
 * @return {Y.XmlFragment}
 */
export function prosemirrorToYXmlFragment (doc, xmlFragment) {
  const type = xmlFragment || new Y.XmlFragment()
  const ydoc = type.doc ? type.doc : { transact: (transaction) => transaction(undefined) }
  updateYFragment(ydoc, type, doc, { mapping: new Map(), isOMark: new Map() })
  return type
}

/**
 * Utility method to convert Prosemirror compatible JSON into a Y.Doc.
 *
 * This can be used when importing existing content to Y.Doc for the first time,
 * note that this should not be used to rehydrate a Y.Doc from a database once
 * collaboration has begun as all history will be lost
 *
 * @param {Schema} schema
 * @param {any} state
 * @param {string} xmlFragment
 * @return {Y.Doc}
 */
export function prosemirrorJSONToYDoc (schema, state, xmlFragment = 'prosemirror') {
  const doc = Node.fromJSON(schema, state)
  return prosemirrorToYDoc(doc, xmlFragment)
}

/**
 * Utility method to convert Prosemirror compatible JSON to a Y.XmlFragment
 *
 * This can be used when importing existing content to Y.Doc for the first time,
 * note that this should not be used to rehydrate a Y.Doc from a database once
 * collaboration has begun as all history will be lost
 *
 * @param {Schema} schema
 * @param {any} state
 * @param {Y.XmlFragment} [xmlFragment] If supplied, an xml fragment to be
 *   populated from the prosemirror state; otherwise a new XmlFragment will be created.
 * @return {Y.XmlFragment}
 */
export function prosemirrorJSONToYXmlFragment (schema, state, xmlFragment) {
  const doc = Node.fromJSON(schema, state)
  return prosemirrorToYXmlFragment(doc, xmlFragment)
}

/**
 * @deprecated Use `yXmlFragmentToProseMirrorRootNode` instead
 *
 * Utility method to convert a Y.Doc to a Prosemirror Doc node.
 *
 * @param {Schema} schema
 * @param {Y.Doc} ydoc
 * @return {Node}
 */
export function yDocToProsemirror (schema, ydoc) {
  const state = yDocToProsemirrorJSON(ydoc)
  return Node.fromJSON(schema, state)
}

/**
 *
 * @deprecated Use `yXmlFragmentToProseMirrorRootNode` instead
 *
 * Utility method to convert a Y.XmlFragment to a Prosemirror Doc node.
 *
 * @param {Schema} schema
 * @param {Y.XmlFragment} xmlFragment
 * @return {Node}
 */
export function yXmlFragmentToProsemirror (schema, xmlFragment) {
  const state = yXmlFragmentToProsemirrorJSON(xmlFragment)
  return Node.fromJSON(schema, state)
}

/**
 *
 * @deprecated Use `yXmlFragmentToProseMirrorRootNode` instead
 *
 * Utility method to convert a Y.Doc to Prosemirror compatible JSON.
 *
 * @param {Y.Doc} ydoc
 * @param {string} xmlFragment
 * @return {Record<string, any>}
 */
export function yDocToProsemirrorJSON (
  ydoc,
  xmlFragment = 'prosemirror'
) {
  return yXmlFragmentToProsemirrorJSON(ydoc.getXmlFragment(xmlFragment))
}

/**
 * @deprecated Use `yXmlFragmentToProseMirrorRootNode` instead
 *
 * Utility method to convert a Y.Doc to Prosemirror compatible JSON.
 *
 * @param {Y.XmlFragment} xmlFragment The fragment, which must be part of a Y.Doc.
 * @return {Record<string, any>}
 */
export function yXmlFragmentToProsemirrorJSON (xmlFragment) {
  const items = xmlFragment.toArray()

  /**
   * @param {Y.AbstractType} item
   */
  const serialize = item => {
    /**
     * @type {Object} NodeObject
     * @property {string} NodeObject.type
     * @property {Record<string, string>=} NodeObject.attrs
     * @property {Array<NodeObject>=} NodeObject.content
     */
    let response

    // TODO: Must be a better way to detect text nodes than this
    if (item instanceof Y.XmlText) {
      const delta = item.toDelta()
      response = delta.map(/** @param {any} d */ (d) => {
        const text = {
          type: 'text',
          text: d.insert
        }
        if (d.attributes) {
          text.marks = Object.keys(d.attributes).map((type_) => {
            const attrs = d.attributes[type_]
            const type = yattr2markname(type_)
            const mark = {
              type
            }
            if (Object.keys(attrs)) {
              mark.attrs = attrs
            }
            return mark
          })
        }
        return text
      })
    } else if (item instanceof Y.XmlElement) {
      response = {
        type: item.nodeName
      }

      const attrs = item.getAttributes()
      if (Object.keys(attrs).length) {
        response.attrs = attrs
      }

      const children = item.toArray()
      if (children.length) {
        response.content = children.map(serialize).flat()
      }
    } else {
      // expected either Y.XmlElement or Y.XmlText
      error.unexpectedCase()
    }

    return response
  }

  return {
    type: 'doc',
    content: items.map(serialize)
  }
}
