// import * as prosemirror from './y-prosemirror.test.js'
import * as cursor from './cursor.test.js'
import * as delta from './delta.test.js'
import * as positions from './positions.test.js'
import * as suggestions from './suggestions.test.js'
import * as suggestionSimulation from './suggestion-simulation.test.js'
import * as nestedNodeSuggestions from './nested-node-suggestions.test.js'
import * as yAttributionToDiffSet from './y-attribution-to-diffset.test.js'
import * as suggestionDecorationPlugin from './suggestion-decoration-plugin.test.js'
// import * as tr from './tr.test.js'

import { runTests } from 'lib0/testing'
import { isBrowser, isNode } from 'lib0/environment'
import * as log from 'lib0/logging'

if (isBrowser) {
  log.createVConsole(document.body)
}
runTests({
  cursor,
  delta,
  positions,
  suggestions,
  suggestionSimulation,
  nestedNodeSuggestions,
  yAttributionToDiffSet,
  suggestionDecorationPlugin
  // prosemirror,
  // tr
}).then(success => {
  /* istanbul ignore next */
  if (isNode) {
    // @ts-ignore
    process.exit(success ? 0 : 1)
  }
})
