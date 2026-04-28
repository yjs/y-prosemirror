import React from 'react'
import ReactDOM from 'react-dom/client'
import Editor from './Editor.jsx'

const editorEl = document.getElementById('editor')
ReactDOM.createRoot(editorEl).render(
  <React.StrictMode>
    <Editor />
  </React.StrictMode>
)
