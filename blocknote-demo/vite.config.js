import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: [
      '@y/y',
      'prosemirror-state',
      'prosemirror-view',
      'prosemirror-model'
    ]
    // For local linking:
    // alias: {
    //   "@y/y": path.resolve(__dirname, "../../yjs/src/index.js"),
    // },
  },
  build: {
    sourcemap: true
  }
  // For local linking:
  // optimizeDeps: {
  //   exclude: ["@y/y", "@y/websocket", "@y/prosemirror"],
  // },
})
