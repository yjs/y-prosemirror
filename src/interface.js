// eslint-disable-next-line
import { Node, Schema } from 'prosemirror-model'
import flatten from 'lodash.flatten'
import { updateYFragment } from './lib.js'
import * as Y from 'yjs'

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

  return updateYFragment(type.doc, type, doc, new Map())
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
 * @param {Y.Doc} ydoc
 * @param {string} xmlFragment
 * @return {Record<string, any>}
 */
export function yDocToProsemirrorJSON (
  ydoc,
  xmlFragment = 'prosemirror'
) {
  const items = ydoc.getXmlFragment(xmlFragment).toArray()

  function serialize (item) {
    /**
     * @type {Object} NodeObject
     * @property {string} NodeObject.type
     * @property {Record<string, string>=} NodeObject.attrs
     * @property {Array<NodeObject>=} NodeObject.content
     */
    let response

    // TODO: Must be a better way to detect text nodes than this
    if (!item.nodeName) {
      const delta = item.toDelta()
      response = delta.map((d) => {
        const text = {
          type: 'text',
          text: d.insert
        }

        if (d.attributes) {
          text.marks = Object.keys(d.attributes).map((type) => {
            const attrs = d.attributes[type]
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
    } else {
      response = {
        type: item.nodeName
      }

      const attrs = item.getAttributes()
      if (Object.keys(attrs).length) {
        response.attrs = attrs
      }

      const children = item.toArray()
      if (children.length) {
        response.content = flatten(children.map(serialize))
      }
    }

    return response
  }

  return items.map(serialize)
}
