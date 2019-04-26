import nodeResolve from 'rollup-plugin-node-resolve'
import commonjs from 'rollup-plugin-commonjs'

const customModules = new Set([
  'y-websocket',
  'y-codemirror',
  'y-ace',
  'y-textarea',
  'y-quill',
  'y-dom',
  'y-prosemirror'
])
/**
 * @type {Set<any>}
 */
const customLibModules = new Set([
  'lib0',
  'y-protocols'
])
const debugResolve = {
  resolveId (importee) {
    if (importee === 'yjs') {
      return `${process.cwd()}/../yjs/src/index.js`
    }
    if (customModules.has(importee.split('/')[0])) {
      return `${process.cwd()}/../${importee}/src/${importee}.js`
    }
    if (customLibModules.has(importee.split('/')[0])) {
      return `${process.cwd()}/../${importee}`
    }
    return null
  }
}

export default [{
  input: './src/y-prosemirror.js',
  output: [{
    name: 'Y',
    file: 'dist/y-prosemirror.js',
    format: 'cjs',
    sourcemap: true,
    paths: path => {
      if (/^lib0\//.test(path)) {
        return `lib0/dist/${path.slice(5)}`
      }
      return path
    }
  }, {
    name: 'Y',
    file: 'dist/yjs.mjs',
    format: 'es',
    sourcemap: true
  }],
  external: id => /^lib0\//.test(id)
}, {
  input: './test/index.js',
  output: {
    name: 'test',
    file: 'dist/test.js',
    format: 'iife',
    sourcemap: true
  },
  plugins: [
    debugResolve,
    nodeResolve({
      module: true,
      browser: true
    }),
    commonjs()
  ]
}]
