// @ts-nocheck
import fs from 'fs'
import jsdom from 'jsdom'
import path, { dirname } from 'path'

// import * as prosemirror from './y-prosemirror.test.js'
import * as blocknotesuggestions from './blocknote/suggestions.test.js'
import * as blocknoteSchema from './blocknote/schema.test.js'
import * as blocknotesync from './blocknote/sync.test.js'
import * as delta from './delta.test.js'
import * as suggestions from './suggestions/suggestions.test.js'
import * as suggestionsSchema from './suggestions/schema.test.js'
// import * as tr from './tr.test.js'

import { isBrowser, isNode } from 'lib0/environment'
import * as log from 'lib0/logging'
import { runTests } from 'lib0/testing'
import { fileURLToPath } from 'url'

// eslint-disable-next-line
const __dirname = dirname(fileURLToPath(import.meta.url)); // eslint-disable-line
const documentContent = fs.readFileSync(path.join(__dirname, '../test.html'))
const { window } = new jsdom.JSDOM(documentContent)

global.window = window
global.document = window.document
global.innerHeight = 0
document.getSelection = () => ({})

document.createRange = () => ({
  setStart () {},
  setEnd () {},
  getClientRects () {
    return {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0
    }
  },
  getBoundingClientRect () {
    return {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0
    }
  }
})

if (isBrowser) {
  log.createVConsole(document.body)
}
runTests({
  delta,
  suggestions,
  suggestionsSchema,
  blocknoteSchema,
  blocknotesync,
  blocknotesuggestions
  // prosemirror,
  // tr
}).then((success) => {
  /* istanbul ignore next */
  if (isNode) {
    process.exit(success ? 0 : 1)
  }
})
