import '@blocknote/core/fonts/inter.css'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import { useCreateBlockNote } from '@blocknote/react'
import { Extension } from '@tiptap/core'
import { configureYProsemirror, syncPlugin } from '@y/prosemirror'
import { Awareness } from '@y/protocols/awareness'
import * as Y from '@y/y'
import { useEffect } from 'react'

// Map Y.js attributions to BlockNote's built-in suggestion marks
const mapAttributionToMark = (format, attribution) => {
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

const YSyncExtension = Extension.create({
  name: 'ySync',
  addProseMirrorPlugins () {
    return [syncPlugin({ mapAttributionToMark })]
  }
})

const doc = new Y.Doc()
const provider = {
  awareness: new Awareness(doc)
}

const doc2 = new Y.Doc()
const provider2 = {
  awareness: new Awareness(doc2)
}

const attrs = new Y.Attributions()

const suggestingDoc = new Y.Doc({ isSuggestionDoc: true })
const suggestingProvider = {
  awareness: new Awareness(suggestingDoc)
}
const suggestingAttributionManager = Y.createAttributionManagerFromDiff(
  doc,
  suggestingDoc,
  { attrs }
)
suggestingAttributionManager.suggestionMode = false

const suggestionModeDoc = new Y.Doc({ isSuggestionDoc: true })
const suggestionModeProvider = {
  awareness: new Awareness(suggestionModeDoc)
}
const suggestionModeAttributionManager = Y.createAttributionManagerFromDiff(
  doc,
  suggestionModeDoc,
  { attrs }
)
suggestionModeAttributionManager.suggestionMode = true

// Function to sync two documents
function syncDocs (sourceDoc, targetDoc) {
  const update = Y.encodeStateAsUpdate(sourceDoc)
  Y.applyUpdate(targetDoc, update)
}

// Set up two-way sync
function setupTwoWaySync (doc1, doc2) {
  syncDocs(doc1, doc2)
  syncDocs(doc2, doc1)

  doc1.on('update', (update) => {
    Y.applyUpdate(doc2, update)
  })

  doc2.on('update', (update) => {
    Y.applyUpdate(doc1, update)
  })
}

setupTwoWaySync(doc, doc2)
setupTwoWaySync(suggestingDoc, suggestionModeDoc)

// === DEBUG LOGGING ===
doc.on('update', (update, origin, _doc, tr) => {
  console.log('[DEBUG] doc updated', { origin: origin?.constructor?.name, local: tr.local, text: doc.get('doc').toString().slice(0, 100) })
})
suggestingDoc.on('update', (update, origin, _doc, tr) => {
  console.log('[DEBUG] suggestingDoc updated', { origin: origin?.constructor?.name, local: tr.local, text: suggestingDoc.get('doc').toString().slice(0, 100) })
})
suggestionModeDoc.on('update', (update, origin, _doc, tr) => {
  console.log('[DEBUG] suggestionModeDoc updated', { origin: origin?.constructor?.name, local: tr.local, text: suggestionModeDoc.get('doc').toString().slice(0, 100) })
})

// Observe the suggestingDoc fragment directly to see if Y.js events fire
suggestingDoc.get('doc').observeDeep((events) => {
  console.log("[DEBUG] suggestingDoc.get('doc') observeDeep fired!", events.length, 'events')
  try {
    const d = events.getDelta(suggestingAttributionManager, { deep: true })
    console.log('[DEBUG] suggestingDoc delta:', JSON.stringify(d?.toJSON?.() ?? d))
  } catch (e) {
    console.error('[DEBUG] Error getting delta from suggestingDoc observer:', e)
  }
})

suggestionModeDoc.get('doc').observeDeep((events) => {
  console.log("[DEBUG] suggestionModeDoc.get('doc') observeDeep fired!", events.length, 'events')
})

// Catch any errors that might be swallowed
window.addEventListener('error', (e) => {
  console.error('[DEBUG] Uncaught error:', e.error)
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('[DEBUG] Unhandled rejection:', e.reason)
})

function Editor ({ fragment, provider, attributionManager }) {
  const editor = useCreateBlockNote({
    _tiptapOptions: {
      extensions: [YSyncExtension]
    }
  })

  useEffect(() => {
    const view = editor._tiptapEditor?.view
    if (view) {
      // const doc2 = new Y.Doc();
      // const provider2 = {
      //   awareness: new Awareness(doc2),
      // };

      configureYProsemirror({
        ytype: fragment,
        attributionManager
      })(view.state, view.dispatch)
    }
  }, [editor])

  return <BlockNoteView editor={editor} />
}

export default function App () {
  // Renders the editor instance using a React component.
  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: '10px',
          margin: '10px'
        }}
      >
        <div style={{ flex: 1 }}>
          Client A
          <Editor fragment={doc.get('doc')} provider={provider} />
        </div>
        <div style={{ flex: 1 }}>
          Client B
          <Editor fragment={doc2.get('doc')} provider={provider2} />
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: '10px',
          margin: '10px'
        }}
      >
        <div style={{ flex: 1 }}>
          View Suggestions Mode
          <Editor
            fragment={suggestingDoc.get('doc')}
            provider={suggestingProvider}
            attributionManager={suggestingAttributionManager}
          />
        </div>
        <div style={{ flex: 1 }}>
          Suggestion Mode
          <Editor
            fragment={suggestionModeDoc.get('doc')}
            provider={suggestionModeProvider}
            attributionManager={suggestionModeAttributionManager}
          />
        </div>
      </div>
    </div>
  )
}
