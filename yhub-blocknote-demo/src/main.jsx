import ReactDOM from 'react-dom/client'
import Editor from './Editor.jsx'

const editorEl = document.getElementById('editor')
// NOTE: Not using React.StrictMode here. StrictMode double-invokes effects in
// dev, which causes BlockNote's editor (and the y-prosemirror sync/cursor
// plugins) to be created twice. The first instance's view function attaches an
// `awareness.on('change', ...)` listener that dispatches to a dead EditorState
// (the one without our sync plugin field). The result: remote cursors never
// render because the wrong state is queried inside the cursor plugin.
ReactDOM.createRoot(editorEl).render(<Editor />)
