import * as YPM from "@y/prosemirror";
import * as Y from "@y/y";
import * as delta from "lib0/delta";
import * as promise from "lib0/promise";
import * as t from "lib0/testing";
import { Schema } from "prosemirror-model";
import * as basicSchema from "prosemirror-schema-basic";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

// === Schema with attribution marks ===

// AddNodeMarkStep validates marks against the parent node's markSet.
// PM defaults markSet to [] for nodes without inline content, so container
// nodes that hold marked children need attribution marks in their spec.
const attributionMarkNames =
  "y-attribution-insertion y-attribution-deletion y-attribution-format";
const nodes = Object.assign({}, basicSchema.nodes, {
  doc: Object.assign({}, basicSchema.nodes.doc, {
    marks: attributionMarkNames,
  }),
  blockquote: Object.assign({}, basicSchema.nodes.blockquote, {
    marks: attributionMarkNames,
  }),
});

const schema = new Schema({
  nodes,
  marks: Object.assign({}, basicSchema.marks, {
    "y-attribution-insertion": {
      attrs: { userIds: { default: null }, timestamp: { default: null } },
      excludes: "",
      parseDOM: [{ tag: "y-ins" }],
      toDOM() {
        return ["y-ins", 0];
      },
    },
    "y-attribution-deletion": {
      attrs: { userIds: { default: null }, timestamp: { default: null } },
      excludes: "",
      parseDOM: [{ tag: "y-del" }],
      toDOM() {
        return ["y-del", 0];
      },
    },
    "y-attribution-format": {
      attrs: { userIdsByAttr: { default: null }, timestamp: { default: null } },
      excludes: "",
      parseDOM: [{ tag: "y-fmt" }],
      toDOM() {
        return ["y-fmt", 0];
      },
    },
  }),
});

// === Helpers ===

/**
 * Create a ProseMirror EditorView backed by a Y.js type.
 * @param {Y.Type} ytype
 * @param {Y.AbstractAttributionManager} [attributionManager]
 */
async function createPMView(
  ytype,
  attributionManager = Y.noAttributionsManager,
) {
  const view = new EditorView(
    { mount: document.createElement("div") },
    {
      state: EditorState.create({
        schema,
        plugins: [YPM.syncPlugin()],
      }),
    },
  );
  YPM.configureYProsemirror({ ytype, attributionManager })(
    view.state,
    view.dispatch,
  );
  await promise.wait(1);
  return view;
}

/**
 * Set up two-way sync between two Y.Docs.
 * @param {Y.Doc} doc1
 * @param {Y.Doc} doc2
 */
function setupTwoWaySync(doc1, doc2) {
  // Initial state sync
  Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));
  Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));
  // Live sync
  doc1.on("update", (update) => {
    Y.applyUpdate(doc2, update);
  });
  doc2.on("update", (update) => {
    Y.applyUpdate(doc1, update);
  });
}

/**
 * Assert that a PM doc's JSON matches the expected structure.
 * @param {import('prosemirror-model').Node} doc
 * @param {object} expected
 * @param {string} message
 */
function assertDocJSON(doc, expected, message) {
  // PM creates mark attrs with Object.create(null) (null prototype), but t.compare
  // checks constructors and fails when comparing null-prototype vs regular objects.
  // JSON round-trip normalizes all objects to have Object prototype.
  t.compare(JSON.parse(JSON.stringify(doc.toJSON())), expected, message);
}

/**
 * Set up the suggestion architecture:
 *   doc (base)
 *   suggestionDoc (view suggestions, suggestionMode=false) ↔ suggestionModeDoc (edit suggestions, suggestionMode=true)
 *
 * @param {object} [opts]
 * @param {string} [opts.baseContent] - initial paragraph text content
 */
async function createSuggestionSetup(opts = {}) {
  const { baseContent } = opts;

  const doc = new Y.Doc();

  // "suggestion" = show suggestions, but edit "main document" (if possible)
  // "suggestionMode" = show suggestions and behave like suggesting user (edits always go to sugestion doc)
  const suggestionDoc = new Y.Doc({ isSuggestionDoc: true });
  const suggestionModeDoc = new Y.Doc({ isSuggestionDoc: true });

  const attrs = new Y.Attributions();
  const suggestionAM = Y.createAttributionManagerFromDiff(doc, suggestionDoc, {
    attrs,
  });
  suggestionAM.suggestionMode = false;

  const suggestionModeAM = Y.createAttributionManagerFromDiff(
    doc,
    suggestionModeDoc,
    { attrs },
  );
  suggestionModeAM.suggestionMode = true;

  // Sync suggestion docs
  setupTwoWaySync(suggestionDoc, suggestionModeDoc);

  const viewA = await createPMView(doc.get("prosemirror"));
  const viewSuggestion = await createPMView(
    suggestionDoc.get("prosemirror"),
    suggestionAM,
  );
  const viewSuggestionMode = await createPMView(
    suggestionModeDoc.get("prosemirror"),
    suggestionModeAM,
  );

  if (baseContent) {
    doc.get("prosemirror").applyDelta(
      delta
        .create()
        .insert([delta.create("paragraph", {}, baseContent)])
        .done(),
    );
    await promise.wait(1);
  }

  return {
    doc,
    suggestionDoc,
    suggestionModeDoc,
    attrs,
    suggestionAM,
    suggestionModeAM,
    viewA,
    viewSuggestion,
    viewSuggestionMode,
  };
}

/** Insertion mark as it appears in PM doc JSON */
const insertionMark = {
  type: "y-attribution-insertion",
  attrs: { userIds: [], timestamp: null },
};

// === Tests ===

/**
 * Content sync + marks: base doc content flows to suggestion views without marks,
 * suggestion mode edits are isolated from base and show insertion marks in View Suggestions.
 */
export const testSuggestionSyncAndMarks = async () => {
  const { viewA, viewSuggestion, viewSuggestionMode } =
    await createSuggestionSetup({ baseContent: "hello" });

  const helloDoc = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "hello" }] },
      { type: "paragraph" },
    ],
  };

  // Base content appears everywhere without marks
  assertDocJSON(viewA.state.doc, helloDoc, "Client A has hello");
  assertDocJSON(
    viewSuggestion.state.doc,
    helloDoc,
    "View Suggestions has hello, no marks",
  );
  assertDocJSON(
    viewSuggestionMode.state.doc,
    helloDoc,
    "Suggestion Mode has hello, no marks",
  );

  // Type in Suggestion Mode → isolated from base, marks in View Suggestions
  viewSuggestionMode.dispatch(
    viewSuggestionMode.state.tr.insertText(" world", 6),
  );
  await promise.wait(1);

  assertDocJSON(viewA.state.doc, helloDoc, "Client A unchanged");

  const helloWorldDoc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "hello" },
          { type: "text", text: " world", marks: [insertionMark] },
        ],
      },
      { type: "paragraph" },
    ],
  };
  assertDocJSON(
    viewSuggestion.state.doc,
    helloWorldDoc,
    "View Suggestions: ' world' has insertion mark",
  );

  // TODO: "viewSuggestionMode" doc fails
  assertDocJSON(
    viewSuggestionMode.state.doc,
    helloWorldDoc,
    "Suggestion Mode: ' world' has insertion mark",
  );
};

/**
 * Sequential typing: both characters should have marks in View Suggestions.
 * Reproduces: "when adding 2 characters in right editor, left editor only shows marks on the second char"
 */
export const testSequentialTypingMarks = async () => {
  const { viewSuggestion, viewSuggestionMode } = await createSuggestionSetup({
    baseContent: "hello",
  });

  // Type 'a' then 'b' as separate dispatches (like real typing)
  viewSuggestionMode.dispatch(viewSuggestionMode.state.tr.insertText("a", 6));
  await promise.wait(1);

  // TODO: RangeError: Maximum call stack size exceeded
  viewSuggestionMode.dispatch(viewSuggestionMode.state.tr.insertText("b", 7));
  await promise.wait(1);

  const abDoc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "hello" },
          { type: "text", text: "ab", marks: [insertionMark] },
        ],
      },
      { type: "paragraph" },
    ],
  };

  // BOTH 'a' and 'b' should have insertion marks
  assertDocJSON(
    viewSuggestion.state.doc,
    abDoc,
    "View Suggestions: both 'a' and 'b' have insertion marks",
  );

  assertDocJSON(
    viewSuggestionMode.state.doc,
    abDoc,
    "Suggestion Mode: both 'a' and 'b' have insertion marks",
  );
};

/**
 * Block-level insertion: inserting a new paragraph in suggestion mode
 * should show insertion marks on the new block's text content.
 * (Paragraph nodes themselves don't support marks in prosemirror-schema-basic.)
 */
export const testBlockInsertionMarks = async () => {
  const { viewA, viewSuggestion, viewSuggestionMode } =
    await createSuggestionSetup({ baseContent: "hello" });

  // Insert a new paragraph with text at the end of the document (before trailing empty paragraph)
  const { tr } = viewSuggestionMode.state;
  const insertPos = tr.doc.content.size - 2; // before the last empty paragraph's close
  viewSuggestionMode.dispatch(
    tr.insert(
      insertPos,
      schema.nodes.paragraph.create(null, schema.text("new block")),
    ),
  );
  await promise.wait(1);

  const helloDoc = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "hello" }] },
      { type: "paragraph" },
    ],
  };

  // Base doc unchanged
  assertDocJSON(
    viewA.state.doc,
    helloDoc,
    "Client A unchanged after block insert",
  );

  const expectedDoc = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "hello" }] },
      {
        type: "paragraph",
        marks: [insertionMark], // TODO: this fails because it's not in output. AddNodeMarkStep never called?
        content: [{ type: "text", text: "new block", marks: [insertionMark] }],
      },
      { type: "paragraph" },
    ],
  };

  assertDocJSON(
    viewSuggestion.state.doc,
    expectedDoc,
    "View Suggestions: new paragraph node and text have insertion marks",
  );

  assertDocJSON(
    viewSuggestionMode.state.doc,
    expectedDoc,
    "Suggestion Mode: new paragraph node and text have insertion marks",
  );
};

/**
 * Inline image insertion: inserting an image node in suggestion mode
 * should show insertion marks on the image.
 */
export const testImageInsertionMarks = async () => {
  const { viewA, viewSuggestion, viewSuggestionMode } =
    await createSuggestionSetup({ baseContent: "hello" });

  // Insert an image after "hello"
  viewSuggestionMode.dispatch(
    viewSuggestionMode.state.tr.insert(
      6,
      schema.nodes.image.create({ src: "test.png", alt: "test" }),
    ),
  );
  await promise.wait(1);

  const helloDoc = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "hello" }] },
      { type: "paragraph" },
    ],
  };

  // Base doc unchanged
  assertDocJSON(
    viewA.state.doc,
    helloDoc,
    "Client A unchanged after image insert",
  );

  const expectedDoc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "hello" },
          {
            type: "image",
            attrs: { src: "test.png", alt: "test", title: null },
            marks: [insertionMark],
          },
        ],
      },
      { type: "paragraph" },
    ],
  };

  assertDocJSON(
    viewSuggestion.state.doc,
    expectedDoc,
    "View Suggestions: image has insertion mark",
  );

  // TODO: "viewSuggestionMode" doc fails
  assertDocJSON(
    viewSuggestionMode.state.doc,
    expectedDoc,
    "Suggestion Mode: image has insertion mark",
  );
};

// === PM Schema validation tests ===
// Verify that addNodeMark works for the node types we care about.

/**
 * Schema: paragraph in doc can have an insertion node mark (doc allows attribution marks).
 */
export const testSchemaParaInDocNodeMark = () => {
  const state = EditorState.create({ schema });
  const tr = state.tr;
  const mark = schema.marks["y-attribution-insertion"].create({
    userIds: [],
    timestamp: null,
  });
  // pos 0 = the default paragraph
  tr.addNodeMark(0, mark);
  t.assert(
    tr.doc.firstChild?.marks.some(
      (m) => m.type.name === "y-attribution-insertion",
    ),
    "paragraph in doc has insertion mark",
  );
};

/**
 * Schema: paragraph in blockquote can have an insertion node mark.
 */
export const testSchemaParaInBlockquoteNodeMark = () => {
  const state = EditorState.create({ schema });
  const tr = state.tr;
  // Replace doc content with blockquote > paragraph
  tr.replaceWith(
    0,
    tr.doc.content.size,
    schema.nodes.blockquote.create(
      null,
      schema.nodes.paragraph.create(null, schema.text("quoted")),
    ),
  );
  const mark = schema.marks["y-attribution-insertion"].create({
    userIds: [],
    timestamp: null,
  });
  // pos 1 = the paragraph inside the blockquote
  tr.addNodeMark(1, mark);
  const bq = tr.doc.firstChild;
  t.assert(bq?.type.name === "blockquote", "first child is blockquote");
  const para = bq?.firstChild;
  t.assert(
    para?.marks.some((m) => m.type.name === "y-attribution-insertion"),
    "paragraph in blockquote has insertion mark",
  );
};

/**
 * Schema: image in paragraph can have an insertion node mark.
 */
export const testSchemaImageInParaNodeMark = () => {
  const state = EditorState.create({ schema });
  const tr = state.tr;
  // Insert image into the default paragraph
  tr.insert(1, schema.nodes.image.create({ src: "test.png" }));
  const mark = schema.marks["y-attribution-insertion"].create({
    userIds: [],
    timestamp: null,
  });
  // pos 1 = the image node
  tr.addNodeMark(1, mark);
  const img = tr.doc.firstChild?.firstChild;
  t.assert(img?.type.name === "image", "first inline child is image");
  t.assert(
    img?.marks.some((m) => m.type.name === "y-attribution-insertion"),
    "image in paragraph has insertion mark",
  );
};
