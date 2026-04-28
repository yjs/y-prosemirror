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
  },
  build: {
    sourcemap: true
  }
})
