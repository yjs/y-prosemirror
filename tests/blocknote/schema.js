import { Schema } from 'prosemirror-model'

/**
 * BlockNote-like ProseMirror schema.
 * Replicated from the actual BlockNote schema to test sync/suggestions
 * in isolation without depending on @blocknote/core.
 *
 * Key structure: doc → blockGroup → blockContainer(blockContent blockGroup?)
 */
const attributionMarkNames = 'insertion deletion modification'

export const schema = new Schema({
  nodes: {
    doc: {
      content: 'blockGroup',
      marks: attributionMarkNames,
      toDOM () {
        return ['div', { 'data-node-type': 'doc' }, 0]
      }
    },
    blockGroup: {
      content: 'blockContainer+',
      group: 'childContainer',
      marks: attributionMarkNames,
      toDOM () {
        return ['div', { 'data-node-type': 'blockGroup' }, 0]
      }
    },
    blockContainer: {
      content: 'blockContent blockGroup?',
      group: 'blockGroupChild bnBlock',
      defining: true,
      marks: attributionMarkNames,
      attrs: { id: { default: null } },
      toDOM () {
        return ['div', { 'data-node-type': 'blockContainer' }, 0]
      }
    },
    paragraph: {
      content: 'inline*',
      group: 'blockContent',
      defining: true,
      attrs: {
        backgroundColor: { default: 'default' },
        textAlignment: { default: 'left' },
        textColor: { default: 'default' }
      },
      toDOM () {
        return ['p', 0]
      }
    },
    heading: {
      content: 'inline*',
      group: 'blockContent',
      defining: true,
      attrs: {
        backgroundColor: { default: 'default' },
        level: { default: 1 },
        textAlignment: { default: 'left' },
        textColor: { default: 'default' }
      },
      toDOM (node) {
        return ['h' + node.attrs.level, 0]
      }
    },
    bulletListItem: {
      content: 'inline*',
      group: 'blockContent',
      defining: true,
      attrs: {
        backgroundColor: { default: 'default' },
        textAlignment: { default: 'left' },
        textColor: { default: 'default' }
      },
      toDOM () {
        return ['li', 0]
      }
    },
    numberedListItem: {
      content: 'inline*',
      group: 'blockContent',
      defining: true,
      attrs: {
        backgroundColor: { default: 'default' },
        start: { default: null },
        textAlignment: { default: 'left' },
        textColor: { default: 'default' }
      },
      toDOM () {
        return ['li', 0]
      }
    },
    checkListItem: {
      content: 'inline*',
      group: 'blockContent',
      defining: true,
      attrs: {
        backgroundColor: { default: 'default' },
        checked: { default: false },
        textAlignment: { default: 'left' },
        textColor: { default: 'default' }
      },
      toDOM () {
        return ['li', 0]
      }
    },
    codeBlock: {
      content: 'inline*',
      group: 'blockContent',
      defining: true,
      attrs: {
        language: { default: 'text' }
      },
      toDOM () {
        return ['pre', ['code', 0]]
      }
    },
    text: { group: 'inline' },
    hardBreak: {
      inline: true,
      group: 'inline',
      selectable: false,
      toDOM () {
        return ['br']
      }
    }
  },
  marks: {
    bold: {
      toDOM () {
        return ['strong', 0]
      }
    },
    italic: {
      toDOM () {
        return ['em', 0]
      }
    },
    underline: {
      toDOM () {
        return ['u', 0]
      }
    },
    strike: {
      toDOM () {
        return ['s', 0]
      }
    },
    code: {
      excludes: '_',
      toDOM () {
        return ['code', 0]
      }
    },
    link: {
      attrs: {
        href: { default: null },
        target: { default: '_blank' },
        rel: { default: 'noopener noreferrer nofollow' },
        class: { default: null },
        title: { default: null }
      },
      inclusive: false,
      toDOM (node) {
        return ['a', node.attrs, 0]
      }
    },
    textColor: {
      attrs: { stringValue: { default: null } },
      toDOM () {
        return ['span', 0]
      }
    },
    backgroundColor: {
      attrs: { stringValue: { default: null } },
      toDOM () {
        return ['span', 0]
      }
    },
    insertion: {
      attrs: { id: { default: null } },
      excludes: 'deletion modification insertion',
      inclusive: false,
      toDOM () {
        return ['ins', 0]
      }
    },
    deletion: {
      attrs: { id: { default: null } },
      excludes: 'insertion modification deletion',
      inclusive: false,
      toDOM () {
        return ['del', 0]
      }
    },
    modification: {
      attrs: {
        id: { default: null },
        type: { default: 'format' },
        attrName: { default: null },
        previousValue: { default: null },
        newValue: { default: null }
      },
      excludes: 'deletion insertion',
      inclusive: false,
      toDOM () {
        return ['span', 0]
      }
    }
  }
})

/**
 * BlockNote-style attribution mapper.
 * Maps Y.js attributions to BlockNote's insertion/deletion/modification marks.
 */
export const mapAttributionToMark = (format, attribution) => {
  let mergeWith = null
  if (attribution.insert) {
    mergeWith = { insertion: { id: 1 } }
  } else if (attribution.delete) {
    mergeWith = { deletion: { id: 1 } }
  } else if (attribution.format) {
    mergeWith = {
      modification: {
        id: 1,
        type: 'format',
        attrName: null,
        previousValue: null,
        newValue: null
      }
    }
  }
  return Object.assign({}, format, mergeWith)
}

/**
 * Helper to build a BlockNote doc JSON with paragraph blocks.
 * @param {...(string|null)} texts - text content per block (null = empty paragraph)
 */
export const bnDoc = (...texts) => ({
  type: 'doc',
  content: [
    {
      type: 'blockGroup',
      content: texts.map((text) => ({
        type: 'blockContainer',
        attrs: { id: null },
        content: [
          {
            type: 'paragraph',
            attrs: {
              backgroundColor: 'default',
              textAlignment: 'left',
              textColor: 'default'
            },
            ...(text ? { content: [{ type: 'text', text }] } : {})
          }
        ]
      }))
    }
  ]
})

/**
 * Find the text insertion position inside the first blockContent node.
 */
export function findFirstTextPosition (doc) {
  let pos = 0
  doc.descendants((node, nodePos) => {
    if (
      pos === 0 &&
      node.type.spec.group &&
      node.type.spec.group.includes('blockContent')
    ) {
      pos = nodePos + 1
      return false
    }
    return true
  })
  return pos
}

/**
 * Find the position right after the first blockContainer closes.
 */
export function findEndOfFirstBlockContainer (doc) {
  let pos = 0
  doc.descendants((node, nodePos) => {
    if (pos === 0 && node.type.name === 'blockContainer') {
      pos = nodePos + node.nodeSize
      return false
    }
    return true
  })
  return pos
}
