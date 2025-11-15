// import * as prosemirror from './y-prosemirror.test.js'
import * as tr from './tr.test.js'

import { runTests } from 'lib0/testing'
import { isBrowser, isNode } from 'lib0/environment'
import * as log from 'lib0/logging.js'

if (isBrowser) {
  log.createVConsole(document.body)
}
runTests({
  tr
}).then(success => {
  /* istanbul ignore next */
  if (isNode) {
    // @ts-ignore
    process.exit(success ? 0 : 1)
  }
})
