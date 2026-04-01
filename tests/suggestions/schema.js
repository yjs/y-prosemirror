import { Schema } from 'prosemirror-model'
import * as basicSchema from 'prosemirror-schema-basic'
// === Schema with attribution marks ===

// AddNodeMarkStep validates marks against the parent node's markSet.
// PM defaults markSet to [] for nodes without inline content, so container
// nodes that hold marked children need attribution marks in their spec.
const attributionMarkNames =
  'y-attribution-insertion y-attribution-deletion y-attribution-format'
const nodes = Object.assign({}, basicSchema.nodes, {
  doc: Object.assign({}, basicSchema.nodes.doc, {
    marks: attributionMarkNames
  }),
  blockquote: Object.assign({}, basicSchema.nodes.blockquote, {
    marks: attributionMarkNames
  })
})

export const schema = new Schema({
  nodes,
  marks: Object.assign({}, basicSchema.marks, {
    'y-attribution-insertion': {
      attrs: { userIds: { default: null }, timestamp: { default: null } },
      excludes: '',
      parseDOM: [{ tag: 'y-ins' }],
      toDOM () {
        return /** @type {const} */ (['y-ins', 0])
      }
    },
    'y-attribution-deletion': {
      attrs: { userIds: { default: null }, timestamp: { default: null } },
      excludes: '',
      parseDOM: [{ tag: 'y-del' }],
      toDOM () {
        return /** @type {const} */ (['y-del', 0])
      }
    },
    'y-attribution-format': {
      attrs: { userIdsByAttr: { default: null }, timestamp: { default: null } },
      excludes: '',
      parseDOM: [{ tag: 'y-fmt' }],
      toDOM () {
        return /** @type {const} */ (['y-fmt', 0])
      }
    }
  })
})
