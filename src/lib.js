import { updateYFragment} from './plugins/sync-plugin.js' // eslint-disable-line
import * as Y from 'yjs'
import { EditorView } from 'prosemirror-view' // eslint-disable-line
import { Node, Schema } from 'prosemirror-model' // eslint-disable-line
import * as error from 'lib0/error.js'
import * as map from 'lib0/map.js'
import * as eventloop from 'lib0/eventloop.js'
import { flatten } from 'lib0/array.js'

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
    metas.forEach((val, key) => {
      tr.setMeta(key, val)
    })
    view.dispatch(tr)
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
 * @param {ProsemirrorMapping} mapping
 * @return {any} relative position
 */
export const absolutePositionToRelativePosition = (pos, type, mapping) => {
  if (pos === 0) {
    return Y.createRelativePositionFromTypeIndex(type, 0)
  }
  let n = type._first === null ? null : /** @type {Y.ContentType} */ (type._first.content).type
  while (n !== null && type !== n) {
    if (n.constructor === Y.XmlText) {
      if (n._length >= pos) {
        return Y.createRelativePositionFromTypeIndex(n, pos)
      } else {
        pos -= n._length
      }
      if (n._item !== null && n._item.next !== null) {
        n = /** @type {Y.ContentType} */ (n._item.next.content).type
      } else {
        do {
          n = n._item === null ? null : n._item.parent
          pos--
        } while (n !== type && n !== null && n._item !== null && n._item.next === null)
        if (n !== null && n !== type) {
          // @ts-gnore we know that n.next !== null because of above loop conditition
          n = n._item === null ? null : /** @type {Y.ContentType} */ (/** @type Y.Item */ (n._item.next).content).type
        }
      }
    } else {
      const pNodeSize = /** @type {any} */ (mapping.get(n) || { nodeSize: 0 }).nodeSize
      if (n._first !== null && pos < pNodeSize) {
        n = /** @type {Y.ContentType} */ (n._first.content).type
        pos--
      } else {
        if (pos === 1 && n._length === 0 && pNodeSize > 1) {
          // edge case, should end in this paragraph
          return new Y.RelativePosition(n._item === null ? null : n._item.id, n._item === null ? Y.findRootTypeKey(n) : null, null)
        }
        pos -= pNodeSize
        if (n._item !== null && n._item.next !== null) {
          n = /** @type {Y.ContentType} */ (n._item.next.content).type
        } else {
          if (pos === 0) {
            // set to end of n.parent
            n = n._item === null ? n : n._item.parent
            return new Y.RelativePosition(n._item === null ? null : n._item.id, n._item === null ? Y.findRootTypeKey(n) : null, null)
          }
          do {
            n = /** @type {Y.Item} */ (n._item).parent
            pos--
          } while (n !== type && /** @type {Y.Item} */ (n._item).next === null)
          // if n is null at this point, we have an unexpected case
          if (n !== type) {
            // We know that n._item.next is defined because of above loop condition
            n = /** @type {Y.ContentType} */ (/** @type {Y.Item} */ (/** @type {Y.Item} */ (n._item).next).content).type
          }
        }
      }
    }
    if (n === null) {
      throw error.unexpectedCase()
    }
    if (pos === 0 && n.constructor !== Y.XmlText && n !== type) { // TODO: set to <= 0
      return createRelativePosition(n._item.parent, n._item)
    }
  }
  return Y.createRelativePositionFromTypeIndex(type, type._length)
}

const createRelativePosition = (type, item) => {
  let typeid = null
  let tname = null
  if (type._item === null) {
    tname = Y.findRootTypeKey(type)
  } else {
    typeid = Y.createID(type._item.id.client, type._item.id.clock)
  }
  return new Y.RelativePosition(typeid, tname, item.id)
}

/**
 * @param {Y.Doc} y
 * @param {Y.XmlFragment} documentType Top level type that is bound to pView
 * @param {any} relPos Encoded Yjs based relative position
 * @param {ProsemirrorMapping} mapping
 * @return {null|number}
 */
export const relativePositionToAbsolutePosition = (y, documentType, relPos, mapping) => {
  const decodedPos = Y.createAbsolutePositionFromRelativePosition(relPos, y)
  if (decodedPos === null || (decodedPos.type !== documentType && !Y.isParentOf(documentType, decodedPos.type._item))) {
    return null
  }
  let type = decodedPos.type
  let pos = 0
  if (type.constructor === Y.XmlText) {
    pos = decodedPos.index
  } else if (type._item === null || !type._item.deleted) {
    let n = type._first
    let i = 0
    while (i < type._length && i < decodedPos.index && n !== null) {
      if (!n.deleted) {
        const t = /** @type {Y.ContentType} */ (n.content).type
        i++
        if (t.constructor === Y.XmlText) {
          pos += t._length
        } else {
          pos += /** @type {any} */ (mapping.get(t)).nodeSize
        }
      }
      n = /** @type {Y.Item} */ (n.right)
    }
    pos += 1 // increase because we go out of n
  }
  while (type !== documentType && type._item !== null) {
    // @ts-ignore
    const parent = type._item.parent
    // @ts-ignore
    if (parent._item === null || !parent._item.deleted) {
      pos += 1 // the start tag
      let n = parent._first
      // now iterate until we found type
      while (n !== null) {
        const contentType = /** @type {Y.ContentType} */ (n.content).type
        if (contentType === type) {
          break
        }
        if (!n.deleted) {
          if (contentType.constructor === Y.XmlText) {
            pos += contentType._length
          } else {
            pos += /** @type {any} */ (mapping.get(contentType)).nodeSize
          }
        }
        n = n.right
      }
    }
    type = parent
  }
  return pos - 1 // we don't count the most outer tag, because it is a fragment
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
  const type = ydoc.get(xmlFragment, Y.XmlFragment)
  if (!type.doc) {
    return ydoc
  }
  updateYFragment(type.doc, type, doc, new Map())
  return type.doc
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
 * Utility method to convert a Y.Doc to Prosemirror compatible JSON.
 *
 * @param {Schema} schema
 * @param {Y.Doc} ydoc
 * @param {string} xmlFragment
 * @return {Record<string, any>}
 */
export function yDocToProsemirrorJSON (ydoc, xmlFragment = 'prosemirror') {
  const items = ydoc.getXmlFragment(xmlFragment).toArray()
  return {
    type: 'doc',
    content: flatten(items.map(typeToProseMirrorJSON))
  }
}

/**
 * @typedef {Object} YXmlTextProsemirrorJSON 
 * @property {string} YXmlTextProsemirrorJSON.type
 * @property {string} YXmlTextProsemirrorJSON.text
 * @property {Array<{type: string, attrs: string}>=} YXmlTextProsemirrorJSON.marks
 */

/**
 * @typedef {Object} YXmlElementProsemirrorJSON
 * @property {string} YXmlElementProsemirrorJSON.type
 * @property {Record<string, string>=} YXmlElementProsemirrorJSON.attrs
 * @property {Array<{type: string, attrs: string}>=} YXmlElementProsemirrorJSON.marks
 * @property {Array<YXmlTextProsemirrorJSON|YXmlElementProsemirrorJSON>=} YXmlElementProsemirrorJSON.content
 */

/**
 * @param {Y.XmlElement|Y.XmlText} type
 * @return {Array<YXmlTextProsemirrorJSON>|YXmlElementProsemirrorJSON}
 */
 export const typeToProseMirrorJSON = (type) => type.constructor === Y.XmlText ? YXmlTextToProsemirrorJSON(type) : YXmlElementToProsemirrorJSON(type)

/**
 * Utility method to convert Y.XmlText to Prosemirror compatible JSON.
 *
 * @param {Y.XmlText} type
 * @return {Array<YXmlTextProsemirrorJSON>}
 */
export function YXmlTextToProsemirrorJSON (type) {
  const nodes = []
  const deltas = type.toDelta()
  for (let i = 0; i < deltas.length; i++) {
    const delta = deltas[i]
    const marks = []
    for (const markName in delta.attributes) {
      marks.push({type: markName, attrs: delta.attributes[markName]})
    }
    const text = {type: 'text', text: delta.insert}
    if (marks.length) { 
      text.marks = marks 
    }
    nodes.push(text)
  }
  return nodes
}

/**
 * Utility method to convert a Y.XmlElement to Prosemirror compatible JSON.
 *
 * @param {Y.XmlElement} type 
 * @return {YXmlElementProsemirrorJSON}
 */
export function YXmlElementToProsemirrorJSON (type) {
  const node = {type: type.nodeName}
  let attrs = type.getAttributes()
  let marks = attrs.marks
  if (marks) {
    node.marks = marks
    delete attrs.marks
  }
  if (Object.keys(attrs).length) {
    node.attrs = attrs
  }
  const children = type.toArray()
  if (children.length) {
    node.content = flatten(children.map(typeToProseMirrorJSON))
  }
  return node
}