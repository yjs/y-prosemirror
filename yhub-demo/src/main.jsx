import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// StrictMode is intentionally omitted: DocumentEditor maintains module-level
// Y.Doc/WebsocketProvider singletons that don't tolerate StrictMode's double-
// invoked dev effects — the second mount would tear down the providers the
// first mount just connected.
ReactDOM.createRoot(document.getElementById('root')).render(<App />)
