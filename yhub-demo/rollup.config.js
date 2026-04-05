import nodeResolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import path from 'path'

export default [{
  input: './demo.js',
  output: {
    file: 'dist/demo.js',
    format: 'iife',
    sourcemap: true
  },
  plugins: [
    nodeResolve({
      mainFields: ['module', 'browser', 'main'],
      rootDir: path.resolve('.'),
      dedupe: ['@y/y', '@y/protocols', 'lib0', 'prosemirror-state', 'prosemirror-view', 'prosemirror-model', 'prosemirror-transform']
    }),
    commonjs()
  ]
}]
