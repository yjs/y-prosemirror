import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: [
      '@y/y',
      'lib0',
      'prosemirror-state',
      'prosemirror-view',
      'prosemirror-model'
    ]
  },
  server: {
    // Allow access via Tailscale Magic-DNS (`*.ts.net`) and the matching
    // numeric Tailnet hostname. Vite 5+ blocks unknown Host headers by default.
    allowedHosts: ['.ts.net', 'localhost']
  },
  build: {
    sourcemap: true
  }
})
