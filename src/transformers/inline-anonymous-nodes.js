import * as dt from 'lib0/delta/transformer'

/**
 * # `inlineAnonymousNodes` — render old-representation documents through the flat binding
 *
 * Old y-prosemirror stored inline text as a NESTED anonymous text container
 * (`doc > paragraph > <name:null>"text"</>`; a legacy `YXmlText` decodes to a
 * `YNode` with `name === null`). The new binding assumes the flat model - text
 * as string inserts directly in the element's delta children. This recursive
 * template splices every anonymous node's children into its parent, at every
 * depth, in both directions:
 *
 * - **A-side (Y -> view)**: nested anonymous containers are flattened, so old
 *   documents render correctly.
 * - **B-side (view -> Y)**: edits strictly inside a flattened container route
 *   back INTO the nested node (as `modify` ops), preserving the old
 *   representation; newly inserted nodes and inserts at a container's start
 *   land flat - new content is written in the new representation. Mixed
 *   documents are fine.
 *
 * Per level this is `pipe(inline([null]), children(recurse))` - a uniform
 * variant of the recursive recipe in lib0's `children` docs that also inlines
 * anonymous direct children of the level it is applied to. Both stages
 * fast-path to passthrough on documents without anonymous nodes. The
 * `children` handler always returns the recursive template (never `null`):
 * opting out is permanent per positional child, and any element could later
 * receive an anonymous child from an old client.
 *
 * Caveats: an anonymous container's OWN format/attribution (the wrapper, not
 * its content) has no home in the flattened parent and is dropped; position
 * mapping (`src/positions.js`) and the `fragmentToPm`/`pmToFragment`
 * utilities do not flatten.
 *
 * @param {import('lib0/schema').Schema<import('lib0/delta').DeltaAny>} $d
 * @return {dt.Template<any, any>}
 */
export const inlineAnonymousNodes = ($d) => dt.pipe(
  $d,
  ($d1) => dt.inline($d1, [null]),
  ($d2) => dt.children($d2, (_child, $c) => inlineAnonymousNodes($c))
)
