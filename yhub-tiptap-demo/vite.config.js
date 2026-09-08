import { defineConfig } from 'vite'

// Tiptap pulls ProseMirror in via `@tiptap/pm`, while `@y/prosemirror` imports
// the bare `prosemirror-*` packages. They MUST resolve to a single physical
// copy each, otherwise plugin keys and `instanceof` checks fail across the
// Tiptap <-> y-prosemirror boundary (a remote cursor / sync plugin that never
// fires is the typical symptom). Dedupe the shared deps. Same idea as the
// BlockNote demo's vite config, extended for the prosemirror packages Tiptap
// also imports directly (prosemirror-transform) and lib0.
export default defineConfig({
  resolve: {
    dedupe: [
      '@y/y',
      'lib0',
      'prosemirror-state',
      'prosemirror-view',
      'prosemirror-model',
      'prosemirror-transform'
    ]
  },
  server: {
    // The public yhub instance enforces an origin allowlist: only
    // `http://localhost:8000` / `http://127.0.0.1:8000` are accepted (anything
    // else gets HTTP 403 on the REST API and "Unexpected response code: 403" on
    // the websocket handshake). Vite defaults to 5173, so without this the demo
    // looks broken for reasons that have nothing to do with the code.
    // `strictPort` matters just as much: a silent fallback to 8001 produces an
    // empty activity panel and no explanation.
    port: 8000,
    strictPort: true,
    // Vite 5+ blocks unknown Host headers by default; allow Tailscale Magic-DNS
    // (`*.ts.net`) and localhost so the demo is reachable over a tailnet.
    allowedHosts: ['.ts.net', 'localhost']
  },
  build: {
    sourcemap: true
  }
})
