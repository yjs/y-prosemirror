import * as t from 'lib0/testing'
import * as YPM from '@y/prosemirror'
import * as basicSchema from 'prosemirror-schema-basic'
import * as Y from '@y/y'
import { EditorState, Plugin, PluginKey } from 'prosemirror-state'
import { Fragment, Schema, Slice } from 'prosemirror-model'
import * as delta from 'lib0/delta'
import { findWrapping, ReplaceAroundStep } from 'prosemirror-transform'
import { EditorView } from 'prosemirror-view'
import { uuidv4 } from 'lib0/random'

const schema = new Schema({
  nodes: basicSchema.nodes,
  marks: basicSchema.marks
})

/**
 * @param {Y.Type} ytype
 * @param {Y.AbstractAttributionManager} attributionManager
 */
const createProsemirrorView = (ytype, attributionManager = Y.noAttributionsManager) => {
  const view = new EditorView({ mount: document.createElement('div') }, {
    state: EditorState.create({
      schema,
      plugins: [YPM.syncPlugin()]
    })
  })
  YPM.configureYProsemirror({ ytype, attributionManager })(view.state, view.dispatch)
  return view
}

/**
 * @param {EditorView} pm
 */
const validate = pm => {
  const ycontent = YPM.ySyncPluginKey.getState(pm.state)?.ytype?.toDeltaDeep()
  const pcontent = YPM.docToDelta(pm.state.doc)
  const ycontentJson = JSON.stringify(ycontent?.toJSON(), null, 2)
  const pcontentJson = JSON.stringify(pcontent.toJSON(), null, 2)
  console.log('\n=== VALIDATION ===')
  console.log('Y content:', ycontentJson)
  console.log('P content:', pcontentJson)
  console.log('Are they equal?', ycontentJson === pcontentJson)
  t.compare(ycontent, pcontent.done(false))
}

/**
 * @typedef {object} YPMTestConf
 * @property {import('prosemirror-state').Transaction} YPMTest.tr
 * @property {EditorView} YPMTest.view
 * @property {Y.Type} YPMTest.ytype
 * @property {import('prosemirror-state').Transaction} YPMTest.tr2
 * @property {EditorView} YPMTest.view2
 * @property {Y.Type} YPMTest.ytype2
 */

/**
 * @param {Array<(opts:YPMTestConf)=>(delta.DeltaAny|import('prosemirror-state').Transaction|null)>} changes
 */
const testHelper = changes => {
  // sync two ydocs
  const ydoc = new Y.Doc()
  const ydoc2 = new Y.Doc()
  ydoc.on('update', update => {
    Y.applyUpdate(ydoc2, update)
  })
  ydoc2.on('update', update => {
    Y.applyUpdate(ydoc, update)
  })
  const ytype = ydoc.get('prosemirror')
  // never change this structure!
  // <heading>[1]Hello World![13]</heading>[14]<paragraph>[15]Lorem [21]ipsum..[28]</paragraph>[29]
  ytype.applyDelta(delta.create().insert([delta.create('heading', { level: 1 }, 'Hello World!'), delta.create('paragraph', {}, 'Lorem ipsum..')]).done())
  const view = createProsemirrorView(ytype)
  const view2 = createProsemirrorView(ydoc2.get('prosemirror'))

  for (const change of changes) {
    const ytype = YPM.ySyncPluginKey.getState(view.state)?.ytype || null
    const ytype2 = YPM.ySyncPluginKey.getState(view2.state)?.ytype || null
    t.assert(ytype)
    t.assert(ytype2)
    const tr = change({
      tr: view.state.tr,
      view,
      ytype,
      tr2: view2.state.tr,
      view2,
      ytype2
    })
    if (delta.$deltaAny.check(tr)) {
      ytype.applyDelta(tr)
    } else if (tr != null) {
      view.dispatch(tr)
    }
    validate(view)
    validate(view2)
    t.compare(ytype.toDeltaDeep(), ytype2.toDeltaDeep())
  }
  console.log('final pm document:', JSON.stringify(view.state.doc.toJSON(), null, 2))
}

export const testBase = () => {
  testHelper([])
}

export const testDeleteRangeOverPartialNodes = () => {
  testHelper([
    ({ tr }) => tr.insert(0, schema.node('paragraph', undefined, schema.text('789'))).insert(0, schema.node('paragraph', undefined, schema.text('456'))).insert(0, schema.node('paragraph', undefined, schema.text('123'))),
    ({ tr }) => tr.delete(2, 12)
  ])
}

export const testDeleteRangeOverPartialNodes2 = () => {
  testHelper([
    () => delta.create(null, {}, [delta.create('paragraph', {}, '123'), delta.create('paragraph', {}, '456'), delta.create('paragraph', {}, '789')]),
    ({ tr }) => tr.delete(2, 12)
  ])
}

export const testFormatting = () => {
  testHelper([
    ({ tr }) => tr.addMark(7, 12, schema.mark('strong'))
  ])
}

export const testBaseInsert = () => {
  testHelper([
    ({ tr }) => tr.insert(16, schema.text('XXX'))
  ])
}

export const testReplaceAround = () => {
  testHelper([
    ({ tr }) => tr.step(new ReplaceAroundStep(14, 29, 14, 29, new Slice(Fragment.from(schema.nodes.blockquote.create()), 0, 0), 1, true))
  ])
}

export const testAttrStep = () => {
  testHelper([
    ({ tr }) => tr.setNodeAttribute(0, 'level', 2)
  ])
}

export const testMultipleSimpleSteps = () => {
  testHelper([
    ({ tr }) => {
      tr.insertText('abc', 15)

      tr.insertText('def', 13)
      return tr
    }
  ])
}

export const testWrapping = () => {
  testHelper([
    ({ tr }) => {
      const blockRange = tr.doc.resolve(15).blockRange(tr.doc.resolve(28))
      t.assert(blockRange)
      const wrapping = findWrapping(blockRange, schema.nodes.blockquote)
      t.assert(wrapping)
      tr.wrap(blockRange, wrapping)
      return tr
    }
  ])
}

export const testMultipleComplexSteps = () => {
  testHelper([
    ({ tr }) => {
      tr.insertText('abc', 16)

      const blockRange = tr.doc.resolve(15).blockRange(tr.doc.resolve(28))
      t.assert(blockRange)
      const wrapping = findWrapping(blockRange, schema.nodes.blockquote)
      t.assert(wrapping)
      tr.wrap(blockRange, wrapping)
      return tr
    }
  ])
}

// Test appendTransaction plugins that modify the document (assigning node attributes, adding marks)
// sync correctly across multiple clients via y-prosemirror.

// Schema with blockId attribute for testing unique ID assignment
const blockIdSchema = new Schema({
  nodes: {
    ...basicSchema.nodes,
    paragraph: {
      ...basicSchema.nodes.paragraph,
      attrs: { blockId: { default: null } }
    },
    heading: {
      ...basicSchema.nodes.heading,
      attrs: {
        ...(basicSchema.nodes.heading.attrs || {}),
        blockId: { default: null }
      }
    }
  },
  marks: basicSchema.marks
})

// Plugin that auto-assigns unique IDs to paragraphs/headings without them
const uniqueIdPlugin = () =>
  new Plugin({
    key: new PluginKey('unique-id'),
    appendTransaction (_transactions, _oldState, newState) {
      const { tr } = newState
      let modified = false
      newState.doc.descendants((node, pos) => {
        if ((node.type.name === 'paragraph' || node.type.name === 'heading') && !node.attrs.blockId) {
          tr.setNodeAttribute(pos, 'blockId', uuidv4())
          modified = true
        }
      })
      return modified ? tr : null
    }
  })

// Test: appendTransaction assigns blockId when user types, syncs correctly to second client
export const testAppendTransactionBasicSync = () => {
  const ydoc1 = new Y.Doc()
  const ydoc2 = new Y.Doc()

  // Initialize with empty paragraph
  ydoc1.get('prosemirror').applyDelta(
    delta.create().insert([delta.create('paragraph', {}, '')]).done()
  )

  // Sync initial state and set up bidirectional updates
  Y.applyUpdate(ydoc2, Y.encodeStateAsUpdate(ydoc1))
  ydoc1.on('update', update => Y.applyUpdate(ydoc2, update))
  ydoc2.on('update', update => Y.applyUpdate(ydoc1, update))

  // Create views with sync and unique ID plugins
  const createView = (/** @type {any} */ ytype) => {
    const view = new EditorView({ mount: document.createElement('div') }, {
      state: EditorState.create({
        schema: blockIdSchema,
        plugins: [YPM.syncPlugin(), uniqueIdPlugin()]
      })
    })
    YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
    return view
  }

  const view1 = createView(ydoc1.get('prosemirror'))
  const view2 = createView(ydoc2.get('prosemirror'))

  // Client 1 types text (triggers appendTransaction to assign blockId)
  view1.dispatch(view1.state.tr.insertText('Hello'))

  // Both clients should have same blockId on the paragraph
  const id1 = /** @type {any} */ (view1.state.doc.firstChild).attrs.blockId
  const id2 = /** @type {any} */ (view2.state.doc.firstChild).attrs.blockId

  t.assert(id1 != null, 'client 1 paragraph should have blockId')
  t.assert(id1 === id2, `blockIds should match: "${id1}" vs "${id2}"`)
}

// Test: inserting new paragraph gets unique blockId, different from existing paragraph
export const testAppendTransactionNewParagraph = () => {
  const ydoc1 = new Y.Doc()
  const ydoc2 = new Y.Doc()

  ydoc1.get('prosemirror').applyDelta(
    delta.create().insert([delta.create('paragraph', {}, '')]).done()
  )

  Y.applyUpdate(ydoc2, Y.encodeStateAsUpdate(ydoc1))
  ydoc1.on('update', update => Y.applyUpdate(ydoc2, update))
  ydoc2.on('update', update => Y.applyUpdate(ydoc1, update))

  const createView = (/** @type {any} */ ytype) => {
    const view = new EditorView({ mount: document.createElement('div') }, {
      state: EditorState.create({
        schema: blockIdSchema,
        plugins: [YPM.syncPlugin(), uniqueIdPlugin()]
      })
    })
    YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
    return view
  }

  const view1 = createView(ydoc1.get('prosemirror'))
  const view2 = createView(ydoc2.get('prosemirror'))

  view1.dispatch(view1.state.tr.insertText('First line'))

  // Insert second paragraph
  const endPos = /** @type {any} */ (view1.state.doc.content.firstChild).nodeSize
  view1.dispatch(
    view1.state.tr.insert(endPos, blockIdSchema.node('paragraph', {}, blockIdSchema.text('Second line')))
  )

  // Get blockIds from both paragraphs
  /** @type {any[]} */
  const paragraphs1 = []
  view1.state.doc.descendants(node => {
    if (node.type.name === 'paragraph') paragraphs1.push(node.attrs.blockId)
  })

  /** @type {any[]} */
  const paragraphs2 = []
  view2.state.doc.descendants(node => {
    if (node.type.name === 'paragraph') paragraphs2.push(node.attrs.blockId)
  })

  t.assert(paragraphs1.length === 2, 'should have 2 paragraphs')
  t.assert(paragraphs1[0] != null && paragraphs1[1] != null, 'both paragraphs should have blockIds')
  t.assert(paragraphs1[0] !== paragraphs1[1], 'paragraphs should have different blockIds')
  t.assert(paragraphs1[0] === paragraphs2[0] && paragraphs1[1] === paragraphs2[1],
    'blockIds should match across clients')
}

// Test: ephemeral state.apply() creates throwaway appendTransaction results that don't affect sync
// This reproduces the prosemirror-inputrules bug where speculative state.apply() calls
// would trigger appendTransaction with side effects (UUID generation), then discard the state.
export const testEphemeralStateDoesNotAffectSync = () => {
  const ydoc1 = new Y.Doc()
  const ydoc2 = new Y.Doc()

  ydoc1.get('prosemirror').applyDelta(
    delta.create().insert([delta.create('paragraph', {}, '')]).done()
  )

  Y.applyUpdate(ydoc2, Y.encodeStateAsUpdate(ydoc1))
  ydoc1.on('update', update => Y.applyUpdate(ydoc2, update))
  ydoc2.on('update', update => Y.applyUpdate(ydoc1, update))

  const createView = (/** @type {any} */ ytype) => {
    const view = new EditorView({ mount: document.createElement('div') }, {
      state: EditorState.create({
        schema: blockIdSchema,
        plugins: [YPM.syncPlugin(), uniqueIdPlugin()]
      })
    })
    YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
    return view
  }

  const view1 = createView(ydoc1.get('prosemirror'))
  const view2 = createView(ydoc2.get('prosemirror'))

  // Simulate input-rules pattern: create ephemeral state (triggers appendTransaction), discard it
  view1.state.apply(view1.state.tr.insertText('x'))

  // Dispatch different text on the real state
  view1.dispatch(view1.state.tr.insertText('Hello'))

  // Both clients should converge despite the ephemeral apply
  const id1 = /** @type {any} */ (view1.state.doc.firstChild).attrs.blockId
  const id2 = /** @type {any} */ (view2.state.doc.firstChild).attrs.blockId

  t.assert(id1 != null, 'paragraph should have blockId')
  t.assert(id1 === id2, `blockIds should match after ephemeral apply: "${id1}" vs "${id2}"`)
  t.assert(view1.state.doc.textContent === 'Hello', 'should have real text, not ephemeral')
  t.assert(view2.state.doc.textContent === 'Hello', 'client 2 should sync real text')
}

// Test: repeated ephemeral state.apply() calls (like typing with input-rules checking each keystroke)
export const testRepeatedEphemeralStateApply = () => {
  const ydoc1 = new Y.Doc()
  const ydoc2 = new Y.Doc()

  ydoc1.get('prosemirror').applyDelta(
    delta.create().insert([delta.create('paragraph', {}, '')]).done()
  )

  Y.applyUpdate(ydoc2, Y.encodeStateAsUpdate(ydoc1))
  ydoc1.on('update', update => Y.applyUpdate(ydoc2, update))
  ydoc2.on('update', update => Y.applyUpdate(ydoc1, update))

  const createView = (/** @type {any} */ ytype) => {
    const view = new EditorView({ mount: document.createElement('div') }, {
      state: EditorState.create({
        schema: blockIdSchema,
        plugins: [YPM.syncPlugin(), uniqueIdPlugin()]
      })
    })
    YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
    return view
  }

  const view1 = createView(ydoc1.get('prosemirror'))
  const view2 = createView(ydoc2.get('prosemirror'))

  // Simulate typing 'abc' with ephemeral check before each character
  for (const char of 'abc') {
    view1.state.apply(view1.state.tr.insertText(char)) // ephemeral
    view1.dispatch(view1.state.tr.insertText(char)) // real
  }

  const id1 = /** @type {any} */ (view1.state.doc.firstChild).attrs.blockId
  const id2 = /** @type {any} */ (view2.state.doc.firstChild).attrs.blockId

  t.assert(id1 === id2, 'blockIds should match after repeated ephemeral applies')
  t.assert(view2.state.doc.textContent === 'abc', 'should have all typed characters')
}

// Test: filterTransaction plugin allows sync transactions but can block user transactions
export const testFilterTransactionAllowsSync = () => {
  const ydoc1 = new Y.Doc()
  const ydoc2 = new Y.Doc()

  ydoc1.get('prosemirror').applyDelta(
    delta.create().insert([delta.create('paragraph', {}, '')]).done()
  )

  Y.applyUpdate(ydoc2, Y.encodeStateAsUpdate(ydoc1))
  ydoc1.on('update', update => Y.applyUpdate(ydoc2, update))
  ydoc2.on('update', update => Y.applyUpdate(ydoc1, update))

  // Filter that only allows doc-changing or sync transactions
  const filterPlugin = new Plugin({
    filterTransaction: (tr) => tr.docChanged || tr.getMeta('y-sync-transaction') != null
  })

  const createView = (/** @type {any} */ ytype) => {
    const view = new EditorView({ mount: document.createElement('div') }, {
      state: EditorState.create({
        schema: blockIdSchema,
        plugins: [YPM.syncPlugin(), uniqueIdPlugin(), filterPlugin]
      })
    })
    YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
    return view
  }

  const view1 = createView(ydoc1.get('prosemirror'))
  const view2 = createView(ydoc2.get('prosemirror'))

  view1.dispatch(view1.state.tr.insertText('Hello'))

  // Sync should work despite filterTransaction
  t.assert(view2.state.doc.textContent === 'Hello', 'sync should pass filter')
  t.assert(/** @type {any} */ (view1.state.doc.firstChild).attrs.blockId === /** @type {any} */ (view2.state.doc.firstChild).attrs.blockId,
    'blockIds should sync')
}

// Test: "read-only" client can receive synced changes but blocks local user edits
export const testReadOnlyClientReceivesSync = () => {
  const ydoc1 = new Y.Doc()
  const ydoc2 = new Y.Doc()

  ydoc1.get('prosemirror').applyDelta(
    delta.create().insert([delta.create('paragraph', {}, '')]).done()
  )

  Y.applyUpdate(ydoc2, Y.encodeStateAsUpdate(ydoc1))
  ydoc1.on('update', update => Y.applyUpdate(ydoc2, update))
  ydoc2.on('update', update => Y.applyUpdate(ydoc1, update))

  // Read-only plugin that blocks user transactions but allows sync and appendTransactions
  // It uses a meta flag to distinguish user transactions from appendTransactions
  const readOnlyPlugin = new Plugin({
    filterTransaction: (tr) => {
      // Allow sync transactions
      if (tr.getMeta(YPM.ySyncPluginKey) != null) return true
      // Allow appendTransaction results (they don't have the user-action meta)
      if (!tr.getMeta('user-action')) return true
      // Block user actions
      return false
    }
  })

  const createNormalView = (/** @type {any} */ ytype) => {
    const view = new EditorView({ mount: document.createElement('div') }, {
      state: EditorState.create({
        schema: blockIdSchema,
        plugins: [YPM.syncPlugin(), uniqueIdPlugin()]
      })
    })
    YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
    return view
  }

  const createReadOnlyView = (/** @type {any} */ ytype) => {
    const view = new EditorView({ mount: document.createElement('div') }, {
      state: EditorState.create({
        schema: blockIdSchema,
        plugins: [YPM.syncPlugin(), uniqueIdPlugin(), readOnlyPlugin]
      })
    })
    YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
    return view
  }

  const view1 = createNormalView(ydoc1.get('prosemirror'))
  const view2 = createReadOnlyView(ydoc2.get('prosemirror'))

  view1.dispatch(view1.state.tr.insertText('From client 1').setMeta('user-action', true))

  t.assert(view2.state.doc.textContent === 'From client 1', 'read-only client receives sync')
  t.assert(/** @type {any} */ (view1.state.doc.firstChild).attrs.blockId === /** @type {any} */ (view2.state.doc.firstChild).attrs.blockId,
    'blockIds sync to read-only client')
}

// Test: appendTransaction that adds marks (not just node attributes) syncs correctly
export const testAppendTransactionMarkSync = () => {
  const ydoc1 = new Y.Doc()
  const ydoc2 = new Y.Doc()

  ydoc1.get('prosemirror').applyDelta(
    delta.create().insert([delta.create('paragraph', {}, '')]).done()
  )

  Y.applyUpdate(ydoc2, Y.encodeStateAsUpdate(ydoc1))
  ydoc1.on('update', update => Y.applyUpdate(ydoc2, update))
  ydoc2.on('update', update => Y.applyUpdate(ydoc1, update))

  // Plugin that auto-links URLs
  const autoLinkPlugin = new Plugin({
    appendTransaction: (_transactions, _oldState, newState) => {
      const { tr } = newState
      let modified = false
      newState.doc.descendants((node, pos) => {
        if (!node.isText || node.text == null) return
        const urlRegex = /https?:\/\/[^\s]+/g
        let match
        while ((match = urlRegex.exec(node.text)) !== null) {
          const url = /** @type {string} */ (match[0])
          const from = pos + match.index
          const to = from + url.length
          const linkMark = newState.schema.marks.link.create({ href: url })
          if (!linkMark.isInSet(newState.doc.resolve(from + 1).marks())) {
            tr.addMark(from, to, linkMark)
            modified = true
          }
        }
      })
      return modified ? tr : null
    }
  })

  const createView = (/** @type {any} */ ytype) => {
    const view = new EditorView({ mount: document.createElement('div') }, {
      state: EditorState.create({
        schema: blockIdSchema,
        plugins: [YPM.syncPlugin(), uniqueIdPlugin(), autoLinkPlugin]
      })
    })
    YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
    return view
  }

  const view1 = createView(ydoc1.get('prosemirror'))
  const view2 = createView(ydoc2.get('prosemirror'))

  view1.dispatch(view1.state.tr.insertText('visit https://example.com'))

  // Check both clients have link mark
  const hasLinkMark = (/** @type {any} */ doc) => {
    let found = false
    doc.descendants((/** @type {any} */ node) => {
      if (node.isText && node.marks.some((/** @type {any} */ m) => m.type.name === 'link' && m.attrs.href === 'https://example.com')) {
        found = true
      }
    })
    return found
  }

  t.assert(hasLinkMark(view1.state.doc), 'client 1 should have link mark')
  t.assert(hasLinkMark(view2.state.doc), 'client 2 should have synced link mark')
  t.assert(view2.state.doc.textContent === view1.state.doc.textContent, 'text content should match')
}

// Test: chained appendTransaction plugins (plugin B depends on plugin A's output)
export const testChainedAppendTransactions = () => {
  const ydoc1 = new Y.Doc()
  const ydoc2 = new Y.Doc()

  // Schema with two related attributes: blockId and blockIdHash (derived from blockId)
  const chainedSchema = new Schema({
    nodes: {
      ...basicSchema.nodes,
      paragraph: {
        ...basicSchema.nodes.paragraph,
        attrs: {
          blockId: { default: null },
          blockIdHash: { default: null }
        }
      }
    },
    marks: basicSchema.marks
  })

  ydoc1.get('prosemirror').applyDelta(
    delta.create().insert([delta.create('paragraph', {}, '')]).done()
  )

  Y.applyUpdate(ydoc2, Y.encodeStateAsUpdate(ydoc1))
  ydoc1.on('update', update => Y.applyUpdate(ydoc2, update))
  ydoc2.on('update', update => Y.applyUpdate(ydoc1, update))

  // Plugin A: assigns blockId
  const idPlugin = new Plugin({
    appendTransaction: (_transactions, _oldState, newState) => {
      const { tr } = newState
      let modified = false
      newState.doc.descendants((node, pos) => {
        if (node.type.name === 'paragraph' && !node.attrs.blockId) {
          tr.setNodeAttribute(pos, 'blockId', uuidv4())
          modified = true
        }
      })
      return modified ? tr : null
    }
  })

  // Plugin B: derives blockIdHash from blockId (first 8 chars)
  const hashPlugin = new Plugin({
    appendTransaction: (_transactions, _oldState, newState) => {
      const { tr } = newState
      let modified = false
      newState.doc.descendants((node, pos) => {
        if (node.type.name === 'paragraph' && node.attrs.blockId && !node.attrs.blockIdHash) {
          tr.setNodeAttribute(pos, 'blockIdHash', node.attrs.blockId.slice(0, 8))
          modified = true
        }
      })
      return modified ? tr : null
    }
  })

  const createView = (/** @type {any} */ ytype) => {
    const view = new EditorView({ mount: document.createElement('div') }, {
      state: EditorState.create({
        schema: chainedSchema,
        plugins: [YPM.syncPlugin(), idPlugin, hashPlugin] // order matters
      })
    })
    YPM.configureYProsemirror({ ytype })(view.state, view.dispatch)
    return view
  }

  const view1 = createView(ydoc1.get('prosemirror'))
  const view2 = createView(ydoc2.get('prosemirror'))

  view1.dispatch(view1.state.tr.insertText('Test'))

  const para1 = /** @type {any} */ (view1.state.doc.firstChild)
  const para2 = /** @type {any} */ (view2.state.doc.firstChild)

  t.assert(para1.attrs.blockId != null, 'plugin A should assign blockId')
  t.assert(para1.attrs.blockIdHash != null, 'plugin B should assign blockIdHash')
  t.assert(para1.attrs.blockIdHash === para1.attrs.blockId.slice(0, 8),
    'blockIdHash should be derived from blockId')
  t.assert(para1.attrs.blockId === para2.attrs.blockId, 'blockId should sync')
  t.assert(para1.attrs.blockIdHash === para2.attrs.blockIdHash, 'blockIdHash should sync')
}
