import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['prosemirror-state', 'prosemirror-view', 'prosemirror-model']
  },
  build: {
    sourcemap: true
  }
})
