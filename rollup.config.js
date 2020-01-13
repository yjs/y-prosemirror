import nodeResolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'

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
    if (importee === 'yjs/tests/testHelper.js') {
      return `${process.cwd()}/../yjs/tests/testHelper.js`
    }
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
    file: 'dist/y-prosemirror.cjs',
    format: 'cjs',
    sourcemap: true,
    paths: path => {
      if (/^lib0\//.test(path)) {
        return `lib0/dist/${path.slice(5, -3)}.cjs`
      }
      if (/^y-protocols\//.test(path)) {
        return `y-protocols/dist/${path.slice(12, -3)}.cjs`
      }
      return path
    }
  }],
  external: id => /^(lib0|y-protocols|prosemirror|yjs)/.test(id)
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
      mainFields: ['module', 'browser', 'main']
    }),
    commonjs()
  ]
}, {
  input: './test/index.node.js',
  output: {
    name: 'test',
    file: 'dist/test.cjs',
    format: 'cjs',
    sourcemap: true,
    paths: path => {
      if (/^lib0\//.test(path)) {
        return `lib0/dist/${path.slice(5, -3)}.cjs`
      }
    }
  },
  plugins: [
    debugResolve,
    nodeResolve({
      mainFields: ['module', 'main']
    })
  ],
  external: id => /^(lib0|prosemirror|fs|path|jsdom|isomorphic)/.test(id)
}]
