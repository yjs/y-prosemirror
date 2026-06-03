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
    // Vite 5+ blocks unknown Host headers by default; allow Tailscale Magic-DNS
    // (`*.ts.net`) and localhost so the demo is reachable over a tailnet.
    allowedHosts: ['.ts.net', 'localhost']
  },
  build: {
    sourcemap: true
  }
})
