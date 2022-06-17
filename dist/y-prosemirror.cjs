'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var Y = require('yjs');
var prosemirrorView = require('prosemirror-view');
var prosemirrorState = require('prosemirror-state');
require('y-protocols/awareness');
var mutex = require('lib0/mutex');
var PModel = require('prosemirror-model');
var math = require('lib0/math');
var object = require('lib0/object');
var set = require('lib0/set');
var diff = require('lib0/diff');
var error = require('lib0/error');
var random = require('lib0/random');
var environment = require('lib0/environment');
var dom = require('lib0/dom');
var eventloop = require('lib0/eventloop');
var map = require('lib0/map');

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n["default"] = e;
  return Object.freeze(n);
}

var Y__namespace = /*#__PURE__*/_interopNamespace(Y);
var PModel__namespace = /*#__PURE__*/_interopNamespace(PModel);
var math__namespace = /*#__PURE__*/_interopNamespace(math);
var object__namespace = /*#__PURE__*/_interopNamespace(object);
var set__namespace = /*#__PURE__*/_interopNamespace(set);
var error__namespace = /*#__PURE__*/_interopNamespace(error);
var random__namespace = /*#__PURE__*/_interopNamespace(random);
var environment__namespace = /*#__PURE__*/_interopNamespace(environment);
var dom__namespace = /*#__PURE__*/_interopNamespace(dom);
var eventloop__namespace = /*#__PURE__*/_interopNamespace(eventloop);
var map__namespace = /*#__PURE__*/_interopNamespace(map);

/**
 * The unique prosemirror plugin key for syncPlugin
 *
 * @public
 */
const ySyncPluginKey = new prosemirrorState.PluginKey('y-sync');

/**
 * The unique prosemirror plugin key for undoPlugin
 *
 * @public
 */
const yUndoPluginKey = new prosemirrorState.PluginKey('y-undo');

/**
 * The unique prosemirror plugin key for cursorPlugin
 *
 * @public
 */
const yCursorPluginKey = new prosemirrorState.PluginKey('yjs-cursor');

/**
 * @module bindings/prosemirror
 */

/**
 * @param {Y.Item} item
 * @param {Y.Snapshot} [snapshot]
 */
const isVisible = (item, snapshot) => snapshot === undefined ? !item.deleted : (snapshot.sv.has(item.id.client) && /** @type {number} */ (snapshot.sv.get(item.id.client)) > item.id.clock && !Y__namespace.isDeleted(snapshot.ds, item.id));

/**
 * Either a node if type is YXmlElement or an Array of text nodes if YXmlText
 * @typedef {Map<Y.AbstractType<any>, PModel.Node | Array<PModel.Node>>} ProsemirrorMapping
 */

/**
 * @typedef {Object} ColorDef
 * @property {string} ColorDef.light
 * @property {string} ColorDef.dark
 */

/**
 * @typedef {Object} YSyncOpts
 * @property {Array<ColorDef>} [YSyncOpts.colors]
 * @property {Map<string,ColorDef>} [YSyncOpts.colorMapping]
 * @property {Y.PermanentUserData|null} [YSyncOpts.permanentUserData]
 * @property {function} [YSyncOpts.onFirstRender] Fired when the content from Yjs is initially rendered to ProseMirror
 */

/**
 * @type {Array<ColorDef>}
 */
const defaultColors = [{ light: '#ecd44433', dark: '#ecd444' }];

/**
 * @param {Map<string,ColorDef>} colorMapping
 * @param {Array<ColorDef>} colors
 * @param {string} user
 * @return {ColorDef}
 */
const getUserColor = (colorMapping, colors, user) => {
  // @todo do not hit the same color twice if possible
  if (!colorMapping.has(user)) {
    if (colorMapping.size < colors.length) {
      const usedColors = set__namespace.create();
      colorMapping.forEach(color => usedColors.add(color));
      colors = colors.filter(color => !usedColors.has(color));
    }
    colorMapping.set(user, random__namespace.oneOf(colors));
  }
  return /** @type {ColorDef} */ (colorMapping.get(user))
};

/**
 * This plugin listens to changes in prosemirror view and keeps yXmlState and view in sync.
 *
 * This plugin also keeps references to the type and the shared document so other plugins can access it.
 * @param {Y.XmlFragment} yXmlFragment
 * @param {YSyncOpts} opts
 * @return {any} Returns a prosemirror plugin that binds to this type
 */
const ySyncPlugin = (yXmlFragment, {
  colors = defaultColors,
  colorMapping = new Map(),
  permanentUserData = null,
  onFirstRender = () => {}
} = {}) => {
  let changedInitialContent = false;
  let rerenderTimeout;
  const plugin = new prosemirrorState.Plugin({
    props: {
      editable: (state) => {
        const syncState = ySyncPluginKey.getState(state);
        return syncState.snapshot == null && syncState.prevSnapshot == null
      }
    },
    key: ySyncPluginKey,
    state: {
      init: (initargs, state) => {
        return {
          type: yXmlFragment,
          doc: yXmlFragment.doc,
          binding: null,
          snapshot: null,
          prevSnapshot: null,
          isChangeOrigin: false,
          addToHistory: true,
          colors,
          colorMapping,
          permanentUserData
        }
      },
      apply: (tr, pluginState) => {
        const change = tr.getMeta(ySyncPluginKey);
        if (change !== undefined) {
          pluginState = Object.assign({}, pluginState);
          for (const key in change) {
            pluginState[key] = change[key];
          }
        }
        pluginState.addToHistory = tr.getMeta('addToHistory') !== false;
        // always set isChangeOrigin. If undefined, this is not change origin.
        pluginState.isChangeOrigin = change !== undefined && !!change.isChangeOrigin;
        if (pluginState.binding !== null) {
          if (change !== undefined && (change.snapshot != null || change.prevSnapshot != null)) {
            // snapshot changed, rerender next
            eventloop__namespace.timeout(0, () => {
              if (pluginState.binding == null || pluginState.binding.isDestroyed) {
                return
              }
              if (change.restore == null) {
                pluginState.binding._renderSnapshot(change.snapshot, change.prevSnapshot, pluginState);
              } else {
                pluginState.binding._renderSnapshot(change.snapshot, change.snapshot, pluginState);
                // reset to current prosemirror state
                delete pluginState.restore;
                delete pluginState.snapshot;
                delete pluginState.prevSnapshot;
                pluginState.binding._prosemirrorChanged(pluginState.binding.prosemirrorView.state.doc);
              }
            });
          }
        }
        return pluginState
      }
    },
    view: view => {
      const binding = new ProsemirrorBinding(yXmlFragment, view);
      if (rerenderTimeout != null) {
        rerenderTimeout.destroy();
      }
      // Make sure this is called in a separate context
      rerenderTimeout = eventloop__namespace.timeout(0, () => {
        binding._forceRerender();
        view.dispatch(view.state.tr.setMeta(ySyncPluginKey, { binding }));
        onFirstRender();
      });
      return {
        update: () => {
          const pluginState = plugin.getState(view.state);
          if (pluginState.snapshot == null && pluginState.prevSnapshot == null) {
            if (changedInitialContent || view.state.doc.content.findDiffStart(view.state.doc.type.createAndFill().content) !== null) {
              changedInitialContent = true;
              if (pluginState.addToHistory === false && !pluginState.isChangeOrigin) {
                const yUndoPluginState = yUndoPluginKey.getState(view.state);
                /**
                 * @type {Y.UndoManager}
                 */
                const um = yUndoPluginState && yUndoPluginState.undoManager;
                if (um) {
                  um.stopCapturing();
                }
              }
              // pluginState.doc.transact(tr => {
              // tr.meta.set('addToHistory', pluginState.addToHistory)
              binding._prosemirrorChanged(view.state.doc);
              // }, ySyncPluginKey)
            }
          }
        },
        destroy: () => {
          rerenderTimeout.destroy();
          binding.destroy();
        }
      }
    }
  });
  return plugin
};

/**
 * @param {any} tr
 * @param {any} relSel
 * @param {ProsemirrorBinding} binding
 */
const restoreRelativeSelection = (tr, relSel, binding) => {
  if (relSel !== null && relSel.anchor !== null && relSel.head !== null) {
    const anchor = relativePositionToAbsolutePosition(binding.doc, binding.type, relSel.anchor, binding.mapping);
    const head = relativePositionToAbsolutePosition(binding.doc, binding.type, relSel.head, binding.mapping);
    if (anchor !== null && head !== null) {
      tr = tr.setSelection(prosemirrorState.TextSelection.create(tr.doc, anchor, head));
    }
  }
};

const getRelativeSelection = (pmbinding, state) => ({
  anchor: absolutePositionToRelativePosition(state.selection.anchor, pmbinding.type, pmbinding.mapping),
  head: absolutePositionToRelativePosition(state.selection.head, pmbinding.type, pmbinding.mapping)
});

/**
 * Binding for prosemirror.
 *
 * @protected
 */
class ProsemirrorBinding {
  /**
   * @param {Y.XmlFragment} yXmlFragment The bind source
   * @param {any} prosemirrorView The target binding
   */
  constructor (yXmlFragment, prosemirrorView) {
    this.type = yXmlFragment;
    this.prosemirrorView = prosemirrorView;
    this.mux = mutex.createMutex();
    this.isDestroyed = false;
    /**
     * @type {ProsemirrorMapping}
     */
    this.mapping = new Map();
    this._observeFunction = this._typeChanged.bind(this);
    /**
     * @type {Y.Doc}
     */
    // @ts-ignore
    this.doc = yXmlFragment.doc;
    /**
     * current selection as relative positions in the Yjs model
     */
    this.beforeTransactionSelection = null;
    this.beforeAllTransactions = () => {
      if (this.beforeTransactionSelection === null) {
        this.beforeTransactionSelection = getRelativeSelection(this, prosemirrorView.state);
      }
    };
    this.afterAllTransactions = () => {
      this.beforeTransactionSelection = null;
    };

    this.doc.on('beforeAllTransactions', this.beforeAllTransactions);
    this.doc.on('afterAllTransactions', this.afterAllTransactions);
    yXmlFragment.observeDeep(this._observeFunction);

    this._domSelectionInView = null;
  }

  /**
   * Create a transaction for changing the prosemirror state.
   *
   * @returns
   */
  get _tr () {
    return this.prosemirrorView.state.tr.setMeta('addToHistory', false)
  }

  _isLocalCursorInView () {
    if (!this.prosemirrorView.hasFocus()) return false
    if (environment__namespace.isBrowser && this._domSelectionInView === null) {
      // Calculate the domSelectionInView and clear by next tick after all events are finished
      eventloop__namespace.timeout(0, () => {
        this._domSelectionInView = null;
      });
      this._domSelectionInView = this._isDomSelectionInView();
    }
    return this._domSelectionInView
  }

  _isDomSelectionInView () {
    const selection = this.prosemirrorView._root.getSelection();

    const range = this.prosemirrorView._root.createRange();
    range.setStart(selection.anchorNode, selection.anchorOffset);
    range.setEnd(selection.focusNode, selection.focusOffset);

    // This is a workaround for an edgecase where getBoundingClientRect will
    // return zero values if the selection is collapsed at the start of a newline
    // see reference here: https://stackoverflow.com/a/59780954
    const rects = range.getClientRects();
    if (rects.length === 0) {
      // probably buggy newline behavior, explicitly select the node contents
      if (range.startContainer && range.collapsed) {
        range.selectNodeContents(range.startContainer);
      }
    }

    const bounding = range.getBoundingClientRect();
    const documentElement = dom__namespace.doc.documentElement;

    return bounding.bottom >= 0 && bounding.right >= 0 &&
      bounding.left <= (window.innerWidth || documentElement.clientWidth || 0) &&
      bounding.top <= (window.innerHeight || documentElement.clientHeight || 0)
  }

  renderSnapshot (snapshot, prevSnapshot) {
    if (!prevSnapshot) {
      prevSnapshot = Y__namespace.createSnapshot(Y__namespace.createDeleteSet(), new Map());
    }
    this.prosemirrorView.dispatch(this._tr.setMeta(ySyncPluginKey, { snapshot, prevSnapshot }));
  }

  unrenderSnapshot () {
    this.mapping = new Map();
    this.mux(() => {
      const fragmentContent = this.type.toArray().map(t => createNodeFromYElement(/** @type {Y.XmlElement} */ (t), this.prosemirrorView.state.schema, this.mapping)).filter(n => n !== null);
      // @ts-ignore
      const tr = this._tr.replace(0, this.prosemirrorView.state.doc.content.size, new PModel__namespace.Slice(new PModel__namespace.Fragment(fragmentContent), 0, 0));
      tr.setMeta(ySyncPluginKey, { snapshot: null, prevSnapshot: null });
      this.prosemirrorView.dispatch(tr);
    });
  }

  _forceRerender () {
    this.mapping = new Map();
    this.mux(() => {
      const fragmentContent = this.type.toArray().map(t => createNodeFromYElement(/** @type {Y.XmlElement} */ (t), this.prosemirrorView.state.schema, this.mapping)).filter(n => n !== null);
      // @ts-ignore
      const tr = this._tr.replace(0, this.prosemirrorView.state.doc.content.size, new PModel__namespace.Slice(new PModel__namespace.Fragment(fragmentContent), 0, 0));
      this.prosemirrorView.dispatch(tr.setMeta(ySyncPluginKey, { isChangeOrigin: true }));
    });
  }

  /**
   * @param {Y.Snapshot} snapshot
   * @param {Y.Snapshot} prevSnapshot
   * @param {Object} pluginState
   */
  _renderSnapshot (snapshot, prevSnapshot, pluginState) {
    if (!snapshot) {
      snapshot = Y__namespace.snapshot(this.doc);
    }
    // clear mapping because we are going to rerender
    this.mapping = new Map();
    this.mux(() => {
      this.doc.transact(transaction => {
        // before rendering, we are going to sanitize ops and split deleted ops
        // if they were deleted by seperate users.
        const pud = pluginState.permanentUserData;
        if (pud) {
          pud.dss.forEach(ds => {
            Y__namespace.iterateDeletedStructs(transaction, ds, item => {});
          });
        }
        const computeYChange = (type, id) => {
          const user = type === 'added' ? pud.getUserByClientId(id.client) : pud.getUserByDeletedId(id);
          return {
            user,
            type,
            color: getUserColor(pluginState.colorMapping, pluginState.colors, user)
          }
        };
        // Create document fragment and render
        const fragmentContent = Y__namespace.typeListToArraySnapshot(this.type, new Y__namespace.Snapshot(prevSnapshot.ds, snapshot.sv)).map(t => {
          if (!t._item.deleted || isVisible(t._item, snapshot) || isVisible(t._item, prevSnapshot)) {
            return createNodeFromYElement(t, this.prosemirrorView.state.schema, new Map(), snapshot, prevSnapshot, computeYChange)
          } else {
            // No need to render elements that are not visible by either snapshot.
            // If a client adds and deletes content in the same snapshot the element is not visible by either snapshot.
            return null
          }
        }).filter(n => n !== null);
        // @ts-ignore
        const tr = this._tr.replace(0, this.prosemirrorView.state.doc.content.size, new PModel__namespace.Slice(new PModel__namespace.Fragment(fragmentContent), 0, 0));
        this.prosemirrorView.dispatch(tr.setMeta(ySyncPluginKey, { isChangeOrigin: true }));
      }, ySyncPluginKey);
    });
  }

  /**
   * @param {Array<Y.YEvent<any>>} events
   * @param {Y.Transaction} transaction
   */
  _typeChanged (events, transaction) {
    const syncState = ySyncPluginKey.getState(this.prosemirrorView.state);
    if (events.length === 0 || syncState.snapshot != null || syncState.prevSnapshot != null) {
      // drop out if snapshot is active
      this.renderSnapshot(syncState.snapshot, syncState.prevSnapshot);
      return
    }
    this.mux(() => {
      /**
       * @param {any} _
       * @param {Y.AbstractType<any>} type
       */
      const delType = (_, type) => this.mapping.delete(type);
      Y__namespace.iterateDeletedStructs(transaction, transaction.deleteSet, struct => struct.constructor === Y__namespace.Item && this.mapping.delete(/** @type {Y.ContentType} */ (/** @type {Y.Item} */ (struct).content).type));
      transaction.changed.forEach(delType);
      transaction.changedParentTypes.forEach(delType);
      const fragmentContent = this.type.toArray().map(t => createNodeIfNotExists(/** @type {Y.XmlElement | Y.XmlHook} */ (t), this.prosemirrorView.state.schema, this.mapping)).filter(n => n !== null);
      // @ts-ignore
      let tr = this._tr.replace(0, this.prosemirrorView.state.doc.content.size, new PModel__namespace.Slice(new PModel__namespace.Fragment(fragmentContent), 0, 0));
      restoreRelativeSelection(tr, this.beforeTransactionSelection, this);
      tr = tr.setMeta(ySyncPluginKey, { isChangeOrigin: true });
      if (this.beforeTransactionSelection !== null && this._isLocalCursorInView()) {
        tr.scrollIntoView();
      }
      this.prosemirrorView.dispatch(tr);
    });
  }

  _prosemirrorChanged (doc) {
    this.mux(() => {
      this.doc.transact(tr => {
        updateYFragment(this.doc, this.type, doc, this.mapping);
        this.beforeTransactionSelection = getRelativeSelection(this, this.prosemirrorView.state);
      }, ySyncPluginKey);
    });
  }

  destroy () {
    this.isDestroyed = true;
    this.type.unobserveDeep(this._observeFunction);
    this.doc.off('beforeAllTransactions', this.beforeAllTransactions);
    this.doc.off('afterAllTransactions', this.afterAllTransactions);
  }
}

/**
 * @private
 * @param {Y.XmlElement | Y.XmlHook} el
 * @param {PModel.Schema} schema
 * @param {ProsemirrorMapping} mapping
 * @param {Y.Snapshot} [snapshot]
 * @param {Y.Snapshot} [prevSnapshot]
 * @param {function('removed' | 'added', Y.ID):any} [computeYChange]
 * @return {PModel.Node | null}
 */
const createNodeIfNotExists = (el, schema, mapping, snapshot, prevSnapshot, computeYChange) => {
  const node = /** @type {PModel.Node} */ (mapping.get(el));
  if (node === undefined) {
    if (el instanceof Y__namespace.XmlElement) {
      return createNodeFromYElement(el, schema, mapping, snapshot, prevSnapshot, computeYChange)
    } else {
      throw error__namespace.methodUnimplemented() // we are currently not handling hooks
    }
  }
  return node
};

/**
 * @private
 * @param {Y.XmlElement} el
 * @param {any} schema
 * @param {ProsemirrorMapping} mapping
 * @param {Y.Snapshot} [snapshot]
 * @param {Y.Snapshot} [prevSnapshot]
 * @param {function('removed' | 'added', Y.ID):any} [computeYChange]
 * @return {PModel.Node | null} Returns node if node could be created. Otherwise it deletes the yjs type and returns null
 */
const createNodeFromYElement = (el, schema, mapping, snapshot, prevSnapshot, computeYChange) => {
  const children = [];
  const createChildren = type => {
    if (type.constructor === Y__namespace.XmlElement) {
      const n = createNodeIfNotExists(type, schema, mapping, snapshot, prevSnapshot, computeYChange);
      if (n !== null) {
        children.push(n);
      }
    } else {
      const ns = createTextNodesFromYText(type, schema, mapping, snapshot, prevSnapshot, computeYChange);
      if (ns !== null) {
        ns.forEach(textchild => {
          if (textchild !== null) {
            children.push(textchild);
          }
        });
      }
    }
  };
  if (snapshot === undefined || prevSnapshot === undefined) {
    el.toArray().forEach(createChildren);
  } else {
    Y__namespace.typeListToArraySnapshot(el, new Y__namespace.Snapshot(prevSnapshot.ds, snapshot.sv)).forEach(createChildren);
  }
  try {
    const attrs = el.getAttributes(snapshot);
    if (snapshot !== undefined) {
      if (!isVisible(/** @type {Y.Item} */ (el._item), snapshot)) {
        attrs.ychange = computeYChange ? computeYChange('removed', /** @type {Y.Item} */ (el._item).id) : { type: 'removed' };
      } else if (!isVisible(/** @type {Y.Item} */ (el._item), prevSnapshot)) {
        attrs.ychange = computeYChange ? computeYChange('added', /** @type {Y.Item} */ (el._item).id) : { type: 'added' };
      }
    }
    const node = schema.node(el.nodeName, attrs, children);
    mapping.set(el, node);
    return node
  } catch (e) {
    // an error occured while creating the node. This is probably a result of a concurrent action.
    /** @type {Y.Doc} */ (el.doc).transact(transaction => {
      /** @type {Y.Item} */ (el._item).delete(transaction);
    }, ySyncPluginKey);
    mapping.delete(el);
    return null
  }
};

/**
 * @private
 * @param {Y.XmlText} text
 * @param {any} schema
 * @param {ProsemirrorMapping} mapping
 * @param {Y.Snapshot} [snapshot]
 * @param {Y.Snapshot} [prevSnapshot]
 * @param {function('removed' | 'added', Y.ID):any} [computeYChange]
 * @return {Array<PModel.Node>|null}
 */
const createTextNodesFromYText = (text, schema, mapping, snapshot, prevSnapshot, computeYChange) => {
  const nodes = [];
  const deltas = text.toDelta(snapshot, prevSnapshot, computeYChange);
  try {
    for (let i = 0; i < deltas.length; i++) {
      const delta = deltas[i];
      const marks = [];
      for (const markName in delta.attributes) {
        marks.push(schema.mark(markName, delta.attributes[markName]));
      }
      nodes.push(schema.text(delta.insert, marks));
    }
  } catch (e) {
    // an error occured while creating the node. This is probably a result of a concurrent action.
    /** @type {Y.Doc} */ (text.doc).transact(transaction => {
      /** @type {Y.Item} */ (text._item).delete(transaction);
    }, ySyncPluginKey);
    return null
  }
  // @ts-ignore
  return nodes
};

/**
 * @private
 * @param {Array<any>} nodes prosemirror node
 * @param {ProsemirrorMapping} mapping
 * @return {Y.XmlText}
 */
const createTypeFromTextNodes = (nodes, mapping) => {
  const type = new Y__namespace.XmlText();
  const delta = nodes.map(node => ({
    // @ts-ignore
    insert: node.text,
    attributes: marksToAttributes(node.marks)
  }));
  type.applyDelta(delta);
  mapping.set(type, nodes);
  return type
};

/**
 * @private
 * @param {any} node prosemirror node
 * @param {ProsemirrorMapping} mapping
 * @return {Y.XmlElement}
 */
const createTypeFromElementNode = (node, mapping) => {
  const type = new Y__namespace.XmlElement(node.type.name);
  for (const key in node.attrs) {
    const val = node.attrs[key];
    if (val !== null && key !== 'ychange') {
      type.setAttribute(key, val);
    }
  }
  type.insert(0, normalizePNodeContent(node).map(n => createTypeFromTextOrElementNode(n, mapping)));
  mapping.set(type, node);
  return type
};

/**
 * @private
 * @param {PModel.Node|Array<PModel.Node>} node prosemirror text node
 * @param {ProsemirrorMapping} mapping
 * @return {Y.XmlElement|Y.XmlText}
 */
const createTypeFromTextOrElementNode = (node, mapping) => node instanceof Array ? createTypeFromTextNodes(node, mapping) : createTypeFromElementNode(node, mapping);

const isObject = (val) => typeof val === 'object' && val !== null;

const equalAttrs = (pattrs, yattrs) => {
  const keys = Object.keys(pattrs).filter(key => pattrs[key] !== null);
  let eq = keys.length === Object.keys(yattrs).filter(key => yattrs[key] !== null).length;
  for (let i = 0; i < keys.length && eq; i++) {
    const key = keys[i];
    const l = pattrs[key];
    const r = yattrs[key];
    eq = key === 'ychange' || l === r || (isObject(l) && isObject(r) && equalAttrs(l, r));
  }
  return eq
};

/**
 * @typedef {Array<Array<PModel.Node>|PModel.Node>} NormalizedPNodeContent
 */

/**
 * @param {any} pnode
 * @return {NormalizedPNodeContent}
 */
const normalizePNodeContent = pnode => {
  const c = pnode.content.content;
  const res = [];
  for (let i = 0; i < c.length; i++) {
    const n = c[i];
    if (n.isText) {
      const textNodes = [];
      for (let tnode = c[i]; i < c.length && tnode.isText; tnode = c[++i]) {
        textNodes.push(tnode);
      }
      i--;
      res.push(textNodes);
    } else {
      res.push(n);
    }
  }
  return res
};

/**
 * @param {Y.XmlText} ytext
 * @param {Array<any>} ptexts
 */
const equalYTextPText = (ytext, ptexts) => {
  const delta = ytext.toDelta();
  return delta.length === ptexts.length && delta.every((d, i) => d.insert === /** @type {any} */ (ptexts[i]).text && object__namespace.keys(d.attributes || {}).length === ptexts[i].marks.length && ptexts[i].marks.every(mark => equalAttrs(d.attributes[mark.type.name] || {}, mark.attrs)))
};

/**
 * @param {Y.XmlElement|Y.XmlText|Y.XmlHook} ytype
 * @param {any|Array<any>} pnode
 */
const equalYTypePNode = (ytype, pnode) => {
  if (ytype instanceof Y__namespace.XmlElement && !(pnode instanceof Array) && matchNodeName(ytype, pnode)) {
    const normalizedContent = normalizePNodeContent(pnode);
    return ytype._length === normalizedContent.length && equalAttrs(ytype.getAttributes(), pnode.attrs) && ytype.toArray().every((ychild, i) => equalYTypePNode(ychild, normalizedContent[i]))
  }
  return ytype instanceof Y__namespace.XmlText && pnode instanceof Array && equalYTextPText(ytype, pnode)
};

/**
 * @param {PModel.Node | Array<PModel.Node> | undefined} mapped
 * @param {PModel.Node | Array<PModel.Node>} pcontent
 */
const mappedIdentity = (mapped, pcontent) => mapped === pcontent || (mapped instanceof Array && pcontent instanceof Array && mapped.length === pcontent.length && mapped.every((a, i) => pcontent[i] === a));

/**
 * @param {Y.XmlElement} ytype
 * @param {PModel.Node} pnode
 * @param {ProsemirrorMapping} mapping
 * @return {{ foundMappedChild: boolean, equalityFactor: number }}
 */
const computeChildEqualityFactor = (ytype, pnode, mapping) => {
  const yChildren = ytype.toArray();
  const pChildren = normalizePNodeContent(pnode);
  const pChildCnt = pChildren.length;
  const yChildCnt = yChildren.length;
  const minCnt = math__namespace.min(yChildCnt, pChildCnt);
  let left = 0;
  let right = 0;
  let foundMappedChild = false;
  for (; left < minCnt; left++) {
    const leftY = yChildren[left];
    const leftP = pChildren[left];
    if (mappedIdentity(mapping.get(leftY), leftP)) {
      foundMappedChild = true;// definite (good) match!
    } else if (!equalYTypePNode(leftY, leftP)) {
      break
    }
  }
  for (; left + right < minCnt; right++) {
    const rightY = yChildren[yChildCnt - right - 1];
    const rightP = pChildren[pChildCnt - right - 1];
    if (mappedIdentity(mapping.get(rightY), rightP)) {
      foundMappedChild = true;
    } else if (!equalYTypePNode(rightY, rightP)) {
      break
    }
  }
  return {
    equalityFactor: left + right,
    foundMappedChild
  }
};

const ytextTrans = ytext => {
  let str = '';
  /**
   * @type {Y.Item|null}
   */
  let n = ytext._start;
  const nAttrs = {};
  while (n !== null) {
    if (!n.deleted) {
      if (n.countable && n.content instanceof Y__namespace.ContentString) {
        str += n.content.str;
      } else if (n.content instanceof Y__namespace.ContentFormat) {
        nAttrs[n.content.key] = null;
      }
    }
    n = n.right;
  }
  return {
    str,
    nAttrs
  }
};

/**
 * @todo test this more
 *
 * @param {Y.Text} ytext
 * @param {Array<any>} ptexts
 * @param {ProsemirrorMapping} mapping
 */
const updateYText = (ytext, ptexts, mapping) => {
  mapping.set(ytext, ptexts);
  const { nAttrs, str } = ytextTrans(ytext);
  const content = ptexts.map(p => ({ insert: /** @type {any} */ (p).text, attributes: Object.assign({}, nAttrs, marksToAttributes(p.marks)) }));
  const { insert, remove, index } = diff.simpleDiff(str, content.map(c => c.insert).join(''));
  ytext.delete(index, remove);
  ytext.insert(index, insert);
  ytext.applyDelta(content.map(c => ({ retain: c.insert.length, attributes: c.attributes })));
};

const marksToAttributes = marks => {
  const pattrs = {};
  marks.forEach(mark => {
    if (mark.type.name !== 'ychange') {
      pattrs[mark.type.name] = mark.attrs;
    }
  });
  return pattrs
};

/**
 * @private
 * @param {{transact: Function}} y
 * @param {Y.XmlFragment} yDomFragment
 * @param {any} pNode
 * @param {ProsemirrorMapping} mapping
 */
const updateYFragment = (y, yDomFragment, pNode, mapping) => {
  if (yDomFragment instanceof Y__namespace.XmlElement && yDomFragment.nodeName !== pNode.type.name) {
    throw new Error('node name mismatch!')
  }
  mapping.set(yDomFragment, pNode);
  // update attributes
  if (yDomFragment instanceof Y__namespace.XmlElement) {
    const yDomAttrs = yDomFragment.getAttributes();
    const pAttrs = pNode.attrs;
    for (const key in pAttrs) {
      if (pAttrs[key] !== null) {
        if (yDomAttrs[key] !== pAttrs[key] && key !== 'ychange') {
          yDomFragment.setAttribute(key, pAttrs[key]);
        }
      } else {
        yDomFragment.removeAttribute(key);
      }
    }
    // remove all keys that are no longer in pAttrs
    for (const key in yDomAttrs) {
      if (pAttrs[key] === undefined) {
        yDomFragment.removeAttribute(key);
      }
    }
  }
  // update children
  const pChildren = normalizePNodeContent(pNode);
  const pChildCnt = pChildren.length;
  const yChildren = yDomFragment.toArray();
  const yChildCnt = yChildren.length;
  const minCnt = math__namespace.min(pChildCnt, yChildCnt);
  let left = 0;
  let right = 0;
  // find number of matching elements from left
  for (;left < minCnt; left++) {
    const leftY = yChildren[left];
    const leftP = pChildren[left];
    if (!mappedIdentity(mapping.get(leftY), leftP)) {
      if (equalYTypePNode(leftY, leftP)) {
        // update mapping
        mapping.set(leftY, leftP);
      } else {
        break
      }
    }
  }
  // find number of matching elements from right
  for (;right + left + 1 < minCnt; right++) {
    const rightY = yChildren[yChildCnt - right - 1];
    const rightP = pChildren[pChildCnt - right - 1];
    if (!mappedIdentity(mapping.get(rightY), rightP)) {
      if (equalYTypePNode(rightY, rightP)) {
        // update mapping
        mapping.set(rightY, rightP);
      } else {
        break
      }
    }
  }
  y.transact(() => {
    // try to compare and update
    while (yChildCnt - left - right > 0 && pChildCnt - left - right > 0) {
      const leftY = yChildren[left];
      const leftP = pChildren[left];
      const rightY = yChildren[yChildCnt - right - 1];
      const rightP = pChildren[pChildCnt - right - 1];
      if (leftY instanceof Y__namespace.XmlText && leftP instanceof Array) {
        if (!equalYTextPText(leftY, leftP)) {
          updateYText(leftY, leftP, mapping);
        }
        left += 1;
      } else {
        let updateLeft = leftY instanceof Y__namespace.XmlElement && matchNodeName(leftY, leftP);
        let updateRight = rightY instanceof Y__namespace.XmlElement && matchNodeName(rightY, rightP);
        if (updateLeft && updateRight) {
          // decide which which element to update
          const equalityLeft = computeChildEqualityFactor(/** @type {Y.XmlElement} */ (leftY), /** @type {PModel.Node} */ (leftP), mapping);
          const equalityRight = computeChildEqualityFactor(/** @type {Y.XmlElement} */ (rightY), /** @type {PModel.Node} */ (rightP), mapping);
          if (equalityLeft.foundMappedChild && !equalityRight.foundMappedChild) {
            updateRight = false;
          } else if (!equalityLeft.foundMappedChild && equalityRight.foundMappedChild) {
            updateLeft = false;
          } else if (equalityLeft.equalityFactor < equalityRight.equalityFactor) {
            updateLeft = false;
          } else {
            updateRight = false;
          }
        }
        if (updateLeft) {
          updateYFragment(y, /** @type {Y.XmlFragment} */ (leftY), /** @type {PModel.Node} */ (leftP), mapping);
          left += 1;
        } else if (updateRight) {
          updateYFragment(y, /** @type {Y.XmlFragment} */ (rightY), /** @type {PModel.Node} */ (rightP), mapping);
          right += 1;
        } else {
          yDomFragment.delete(left, 1);
          yDomFragment.insert(left, [createTypeFromTextOrElementNode(leftP, mapping)]);
          left += 1;
        }
      }
    }
    const yDelLen = yChildCnt - left - right;
    if (yChildCnt === 1 && pChildCnt === 0 && yChildren[0] instanceof Y__namespace.XmlText) {
      // Edge case handling https://github.com/yjs/y-prosemirror/issues/108
      // Only delete the content of the Y.Text to retain remote changes on the same Y.Text object
      yChildren[0].delete(0, yChildren[0].length);
    } else if (yDelLen > 0) {
      yDomFragment.delete(left, yDelLen);
    }
    if (left + right < pChildCnt) {
      const ins = [];
      for (let i = left; i < pChildCnt - right; i++) {
        ins.push(createTypeFromTextOrElementNode(pChildren[i], mapping));
      }
      yDomFragment.insert(left, ins);
    }
  }, ySyncPluginKey);
};

/**
 * @function
 * @param {Y.XmlElement} yElement
 * @param {any} pNode Prosemirror Node
 */
const matchNodeName = (yElement, pNode) => !(pNode instanceof Array) && yElement.nodeName === pNode.type.name;

/**
 * Either a node if type is YXmlElement or an Array of text nodes if YXmlText
 * @typedef {Map<Y.AbstractType, Node | Array<Node>>} ProsemirrorMapping
 */

/**
 * Is null if no timeout is in progress.
 * Is defined if a timeout is in progress.
 * Maps from view
 * @type {Map<EditorView, Map<any, any>>|null}
 */
let viewsToUpdate = null;

const updateMetas = () => {
  const ups = /** @type {Map<EditorView, Map<any, any>>} */ (viewsToUpdate);
  viewsToUpdate = null;
  ups.forEach((metas, view) => {
    const tr = view.state.tr;
    const syncState = ySyncPluginKey.getState(view.state);
    if (syncState && syncState.binding && !syncState.binding.isDestroyed) {
      metas.forEach((val, key) => {
        tr.setMeta(key, val);
      });
      view.dispatch(tr);
    }
  });
};

const setMeta = (view, key, value) => {
  if (!viewsToUpdate) {
    viewsToUpdate = new Map();
    eventloop__namespace.timeout(0, updateMetas);
  }
  map__namespace.setIfUndefined(viewsToUpdate, view, map__namespace.create).set(key, value);
};

/**
 * Transforms a Prosemirror based absolute position to a Yjs Cursor (relative position in the Yjs model).
 *
 * @param {number} pos
 * @param {Y.XmlFragment} type
 * @param {ProsemirrorMapping} mapping
 * @return {any} relative position
 */
const absolutePositionToRelativePosition = (pos, type, mapping) => {
  if (pos === 0) {
    return Y__namespace.createRelativePositionFromTypeIndex(type, 0)
  }
  /**
   * @type {any}
   */
  let n = type._first === null ? null : /** @type {Y.ContentType} */ (type._first.content).type;
  while (n !== null && type !== n) {
    if (n instanceof Y__namespace.XmlText) {
      if (n._length >= pos) {
        return Y__namespace.createRelativePositionFromTypeIndex(n, pos)
      } else {
        pos -= n._length;
      }
      if (n._item !== null && n._item.next !== null) {
        n = /** @type {Y.ContentType} */ (n._item.next.content).type;
      } else {
        do {
          n = n._item === null ? null : n._item.parent;
          pos--;
        } while (n !== type && n !== null && n._item !== null && n._item.next === null)
        if (n !== null && n !== type) {
          // @ts-gnore we know that n.next !== null because of above loop conditition
          n = n._item === null ? null : /** @type {Y.ContentType} */ (/** @type Y.Item */ (n._item.next).content).type;
        }
      }
    } else {
      const pNodeSize = /** @type {any} */ (mapping.get(n) || { nodeSize: 0 }).nodeSize;
      if (n._first !== null && pos < pNodeSize) {
        n = /** @type {Y.ContentType} */ (n._first.content).type;
        pos--;
      } else {
        if (pos === 1 && n._length === 0 && pNodeSize > 1) {
          // edge case, should end in this paragraph
          return new Y__namespace.RelativePosition(n._item === null ? null : n._item.id, n._item === null ? Y__namespace.findRootTypeKey(n) : null, null)
        }
        pos -= pNodeSize;
        if (n._item !== null && n._item.next !== null) {
          n = /** @type {Y.ContentType} */ (n._item.next.content).type;
        } else {
          if (pos === 0) {
            // set to end of n.parent
            n = n._item === null ? n : n._item.parent;
            return new Y__namespace.RelativePosition(n._item === null ? null : n._item.id, n._item === null ? Y__namespace.findRootTypeKey(n) : null, null)
          }
          do {
            n = /** @type {Y.Item} */ (n._item).parent;
            pos--;
          } while (n !== type && /** @type {Y.Item} */ (n._item).next === null)
          // if n is null at this point, we have an unexpected case
          if (n !== type) {
            // We know that n._item.next is defined because of above loop condition
            n = /** @type {Y.ContentType} */ (/** @type {Y.Item} */ (/** @type {Y.Item} */ (n._item).next).content).type;
          }
        }
      }
    }
    if (n === null) {
      throw error__namespace.unexpectedCase()
    }
    if (pos === 0 && n.constructor !== Y__namespace.XmlText && n !== type) { // TODO: set to <= 0
      return createRelativePosition(n._item.parent, n._item)
    }
  }
  return Y__namespace.createRelativePositionFromTypeIndex(type, type._length)
};

const createRelativePosition = (type, item) => {
  let typeid = null;
  let tname = null;
  if (type._item === null) {
    tname = Y__namespace.findRootTypeKey(type);
  } else {
    typeid = Y__namespace.createID(type._item.id.client, type._item.id.clock);
  }
  return new Y__namespace.RelativePosition(typeid, tname, item.id)
};

/**
 * @param {Y.Doc} y
 * @param {Y.XmlFragment} documentType Top level type that is bound to pView
 * @param {any} relPos Encoded Yjs based relative position
 * @param {ProsemirrorMapping} mapping
 * @return {null|number}
 */
const relativePositionToAbsolutePosition = (y, documentType, relPos, mapping) => {
  const decodedPos = Y__namespace.createAbsolutePositionFromRelativePosition(relPos, y);
  if (decodedPos === null || (decodedPos.type !== documentType && !Y__namespace.isParentOf(documentType, decodedPos.type._item))) {
    return null
  }
  let type = decodedPos.type;
  let pos = 0;
  if (type.constructor === Y__namespace.XmlText) {
    pos = decodedPos.index;
  } else if (type._item === null || !type._item.deleted) {
    let n = type._first;
    let i = 0;
    while (i < type._length && i < decodedPos.index && n !== null) {
      if (!n.deleted) {
        const t = /** @type {Y.ContentType} */ (n.content).type;
        i++;
        if (t instanceof Y__namespace.XmlText) {
          pos += t._length;
        } else {
          pos += /** @type {any} */ (mapping.get(t)).nodeSize;
        }
      }
      n = /** @type {Y.Item} */ (n.right);
    }
    pos += 1; // increase because we go out of n
  }
  while (type !== documentType && type._item !== null) {
    // @ts-ignore
    const parent = type._item.parent;
    // @ts-ignore
    if (parent._item === null || !parent._item.deleted) {
      pos += 1; // the start tag
      let n = /** @type {Y.AbstractType} */ (parent)._first;
      // now iterate until we found type
      while (n !== null) {
        const contentType = /** @type {Y.ContentType} */ (n.content).type;
        if (contentType === type) {
          break
        }
        if (!n.deleted) {
          if (contentType instanceof Y__namespace.XmlText) {
            pos += contentType._length;
          } else {
            pos += /** @type {any} */ (mapping.get(contentType)).nodeSize;
          }
        }
        n = n.right;
      }
    }
    type = /** @type {Y.AbstractType} */ (parent);
  }
  return pos - 1 // we don't count the most outer tag, because it is a fragment
};

/**
 * Utility method to convert a Prosemirror Doc Node into a Y.Doc.
 *
 * This can be used when importing existing content to Y.Doc for the first time,
 * note that this should not be used to rehydrate a Y.Doc from a database once
 * collaboration has begun as all history will be lost
 *
 * @param {Node} doc
 * @param {string} xmlFragment
 * @return {Y.Doc}
 */
function prosemirrorToYDoc (doc, xmlFragment = 'prosemirror') {
  const ydoc = new Y__namespace.Doc();
  const type = /** @type {Y.XmlFragment} */ (ydoc.get(xmlFragment, Y__namespace.XmlFragment));
  if (!type.doc) {
    return ydoc
  }

  prosemirrorToYXmlFragment(doc, type);
  return type.doc
}

/**
 * Utility method to update an empty Y.XmlFragment with content from a Prosemirror Doc Node.
 *
 * This can be used when importing existing content to Y.Doc for the first time,
 * note that this should not be used to rehydrate a Y.Doc from a database once
 * collaboration has begun as all history will be lost
 *
 * Note: The Y.XmlFragment does not need to be part of a Y.Doc document at the time that this
 * method is called, but it must be added before any other operations are performed on it.
 *
 * @param {Node} doc prosemirror document.
 * @param {Y.XmlFragment} [xmlFragment] If supplied, an xml fragment to be
 *   populated from the prosemirror state; otherwise a new XmlFragment will be created.
 * @return {Y.XmlFragment}
 */
function prosemirrorToYXmlFragment (doc, xmlFragment) {
  const type = xmlFragment || new Y__namespace.XmlFragment();
  const ydoc = type.doc ? type.doc : { transact: (transaction) => transaction(undefined) };
  updateYFragment(ydoc, type, doc, new Map());
  return type
}

/**
 * Utility method to convert Prosemirror compatible JSON into a Y.Doc.
 *
 * This can be used when importing existing content to Y.Doc for the first time,
 * note that this should not be used to rehydrate a Y.Doc from a database once
 * collaboration has begun as all history will be lost
 *
 * @param {Schema} schema
 * @param {any} state
 * @param {string} xmlFragment
 * @return {Y.Doc}
 */
function prosemirrorJSONToYDoc (schema, state, xmlFragment = 'prosemirror') {
  const doc = PModel.Node.fromJSON(schema, state);
  return prosemirrorToYDoc(doc, xmlFragment)
}

/**
 * Utility method to convert Prosemirror compatible JSON to a Y.XmlFragment
 *
 * This can be used when importing existing content to Y.Doc for the first time,
 * note that this should not be used to rehydrate a Y.Doc from a database once
 * collaboration has begun as all history will be lost
 *
 * @param {Schema} schema
 * @param {any} state
 * @param {Y.XmlFragment} [xmlFragment] If supplied, an xml fragment to be
 *   populated from the prosemirror state; otherwise a new XmlFragment will be created.
 * @return {Y.XmlFragment}
 */
function prosemirrorJSONToYXmlFragment (schema, state, xmlFragment) {
  const doc = PModel.Node.fromJSON(schema, state);
  return prosemirrorToYXmlFragment(doc, xmlFragment)
}

/**
 * Utility method to convert a Y.Doc to a Prosemirror Doc node.
 *
 * @param {Schema} schema
 * @param {Y.Doc} ydoc
 * @return {Node}
 */
function yDocToProsemirror (schema, ydoc) {
  const state = yDocToProsemirrorJSON(ydoc);
  return PModel.Node.fromJSON(schema, state)
}

/**
 * Utility method to convert a Y.XmlFragment to a Prosemirror Doc node.
 *
 * @param {Schema} schema
 * @param {Y.XmlFragment} xmlFragment
 * @return {Node}
 */
function yXmlFragmentToProsemirror (schema, xmlFragment) {
  const state = yXmlFragmentToProsemirrorJSON(xmlFragment);
  return PModel.Node.fromJSON(schema, state)
}

/**
 * Utility method to convert a Y.Doc to Prosemirror compatible JSON.
 *
 * @param {Y.Doc} ydoc
 * @param {string} xmlFragment
 * @return {Record<string, any>}
 */
function yDocToProsemirrorJSON (
  ydoc,
  xmlFragment = 'prosemirror'
) {
  return yXmlFragmentToProsemirrorJSON(ydoc.getXmlFragment(xmlFragment))
}

/**
 * Utility method to convert a Y.Doc to Prosemirror compatible JSON.
 *
 * @param {Y.XmlFragment} xmlFragment The fragment, which must be part of a Y.Doc.
 * @return {Record<string, any>}
 */
function yXmlFragmentToProsemirrorJSON (xmlFragment) {
  const items = xmlFragment.toArray();

  function serialize (item) {
    /**
     * @type {Object} NodeObject
     * @property {string} NodeObject.type
     * @property {Record<string, string>=} NodeObject.attrs
     * @property {Array<NodeObject>=} NodeObject.content
     */
    let response;

    // TODO: Must be a better way to detect text nodes than this
    if (!item.nodeName) {
      const delta = item.toDelta();
      response = delta.map((d) => {
        const text = {
          type: 'text',
          text: d.insert
        };

        if (d.attributes) {
          text.marks = Object.keys(d.attributes).map((type) => {
            const attrs = d.attributes[type];
            const mark = {
              type
            };

            if (Object.keys(attrs)) {
              mark.attrs = attrs;
            }

            return mark
          });
        }
        return text
      });
    } else {
      response = {
        type: item.nodeName
      };

      const attrs = item.getAttributes();
      if (Object.keys(attrs).length) {
        response.attrs = attrs;
      }

      const children = item.toArray();
      if (children.length) {
        response.content = children.map(serialize).flat();
      }
    }

    return response
  }

  return {
    type: 'doc',
    content: items.map(serialize)
  }
}

/**
 * Default generator for a cursor element
 *
 * @param {any} user user data
 * @return {HTMLElement}
 */
const defaultCursorBuilder = user => {
  const cursor = document.createElement('span');
  cursor.classList.add('ProseMirror-yjs-cursor');
  cursor.setAttribute('style', `border-color: ${user.color}`);
  const userDiv = document.createElement('div');
  userDiv.setAttribute('style', `background-color: ${user.color}`);
  userDiv.insertBefore(document.createTextNode(user.name), null);
  const nonbreakingSpace1 = document.createTextNode('\u2060');
  const nonbreakingSpace2 = document.createTextNode('\u2060');
  cursor.insertBefore(nonbreakingSpace1, null);
  cursor.insertBefore(userDiv, null);
  cursor.insertBefore(nonbreakingSpace2, null);
  return cursor
};

/**
 * Default generator for the selection attributes
 *
 * @param {any} user user data
 * @return {import('prosemirror-view').DecorationAttrs}
 */
const defaultSelectionBuilder = user => {
  return {
    style: `background-color: ${user.color}70`,
    class: `ProseMirror-yjs-selection`
  }
};

const rxValidColor = /^#[0-9a-fA-F]{6}$/;

/**
 * @param {any} state
 * @param {Awareness} awareness
 * @return {any} DecorationSet
 */
const createDecorations = (state, awareness, createCursor, createSelection) => {
  const ystate = ySyncPluginKey.getState(state);
  const y = ystate.doc;
  const decorations = [];
  if (ystate.snapshot != null || ystate.prevSnapshot != null || ystate.binding === null) {
    // do not render cursors while snapshot is active
    return prosemirrorView.DecorationSet.create(state.doc, [])
  }
  awareness.getStates().forEach((aw, clientId) => {
    if (clientId === y.clientID) {
      return
    }
    if (aw.cursor != null) {
      const user = aw.user || {};
      if (user.color == null) {
        user.color = '#ffa500';
      } else if (!rxValidColor.test(user.color)) {
        // We only support 6-digit RGB colors in y-prosemirror
        console.warn('A user uses an unsupported color format', user);
      }
      if (user.name == null) {
        user.name = `User: ${clientId}`;
      }
      let anchor = relativePositionToAbsolutePosition(y, ystate.type, Y__namespace.createRelativePositionFromJSON(aw.cursor.anchor), ystate.binding.mapping);
      let head = relativePositionToAbsolutePosition(y, ystate.type, Y__namespace.createRelativePositionFromJSON(aw.cursor.head), ystate.binding.mapping);
      if (anchor !== null && head !== null) {
        const maxsize = math__namespace.max(state.doc.content.size - 1, 0);
        anchor = math__namespace.min(anchor, maxsize);
        head = math__namespace.min(head, maxsize);
        decorations.push(prosemirrorView.Decoration.widget(head, () => createCursor(user), { key: clientId + '', side: 10 }));
        const from = math__namespace.min(anchor, head);
        const to = math__namespace.max(anchor, head);
        decorations.push(prosemirrorView.Decoration.inline(from, to, createSelection(user), { inclusiveEnd: true, inclusiveStart: false }));
      }
    }
  });
  return prosemirrorView.DecorationSet.create(state.doc, decorations)
};

/**
 * A prosemirror plugin that listens to awareness information on Yjs.
 * This requires that a `prosemirrorPlugin` is also bound to the prosemirror.
 *
 * @public
 * @param {Awareness} awareness
 * @param {object} [opts]
 * @param {function(any):HTMLElement} [opts.cursorBuilder]
 * @param {function(any):import('prosemirror-view').DecorationAttrs} [opts.selectionBuilder]
 * @param {function(any):any} [opts.getSelection]
 * @param {string} [cursorStateField] By default all editor bindings use the awareness 'cursor' field to propagate cursor information.
 * @return {any}
 */
const yCursorPlugin = (awareness, { cursorBuilder = defaultCursorBuilder, selectionBuilder = defaultSelectionBuilder, getSelection = state => state.selection } = {}, cursorStateField = 'cursor') => new prosemirrorState.Plugin({
  key: yCursorPluginKey,
  state: {
    init (_, state) {
      return createDecorations(state, awareness, cursorBuilder, selectionBuilder)
    },
    apply (tr, prevState, oldState, newState) {
      const ystate = ySyncPluginKey.getState(newState);
      const yCursorState = tr.getMeta(yCursorPluginKey);
      if ((ystate && ystate.isChangeOrigin) || (yCursorState && yCursorState.awarenessUpdated)) {
        return createDecorations(newState, awareness, cursorBuilder, selectionBuilder)
      }
      return prevState.map(tr.mapping, tr.doc)
    }
  },
  props: {
    decorations: state => {
      return yCursorPluginKey.getState(state)
    }
  },
  view: view => {
    const awarenessListener = () => {
      // @ts-ignore
      if (view.docView) {
        setMeta(view, yCursorPluginKey, { awarenessUpdated: true });
      }
    };
    const updateCursorInfo = () => {
      const ystate = ySyncPluginKey.getState(view.state);
      // @note We make implicit checks when checking for the cursor property
      const current = awareness.getLocalState() || {};
      if (ystate.binding == null) {
        return
      }
      if (view.hasFocus()) {
        const selection = getSelection(view.state);
        /**
         * @type {Y.RelativePosition}
         */
        const anchor = absolutePositionToRelativePosition(selection.anchor, ystate.type, ystate.binding.mapping);
        /**
         * @type {Y.RelativePosition}
         */
        const head = absolutePositionToRelativePosition(selection.head, ystate.type, ystate.binding.mapping);
        if (current.cursor == null || !Y__namespace.compareRelativePositions(Y__namespace.createRelativePositionFromJSON(current.cursor.anchor), anchor) || !Y__namespace.compareRelativePositions(Y__namespace.createRelativePositionFromJSON(current.cursor.head), head)) {
          awareness.setLocalStateField(cursorStateField, {
            anchor, head
          });
        }
      } else if (current.cursor != null && relativePositionToAbsolutePosition(ystate.doc, ystate.type, Y__namespace.createRelativePositionFromJSON(current.cursor.anchor), ystate.binding.mapping) !== null) {
        // delete cursor information if current cursor information is owned by this editor binding
        awareness.setLocalStateField(cursorStateField, null);
      }
    };
    awareness.on('change', awarenessListener);
    view.dom.addEventListener('focusin', updateCursorInfo);
    view.dom.addEventListener('focusout', updateCursorInfo);
    return {
      update: updateCursorInfo,
      destroy: () => {
        view.dom.removeEventListener('focusin', updateCursorInfo);
        view.dom.removeEventListener('focusout', updateCursorInfo);
        awareness.off('change', awarenessListener);
        awareness.setLocalStateField(cursorStateField, null);
      }
    }
  }
});

const undo = state => {
  const undoManager = yUndoPluginKey.getState(state).undoManager;
  if (undoManager != null) {
    undoManager.undo();
    return true
  }
};

const redo = state => {
  const undoManager = yUndoPluginKey.getState(state).undoManager;
  if (undoManager != null) {
    undoManager.redo();
    return true
  }
};

const defaultProtectedNodes = new Set(['paragraph']);

const defaultDeleteFilter = (item, protectedNodes) => !(item instanceof Y.Item) ||
!(item.content instanceof Y.ContentType) ||
!(item.content.type instanceof Y.Text ||
  (item.content.type instanceof Y.XmlElement && protectedNodes.has(item.content.type.nodeName))) ||
item.content.type._length === 0;

const yUndoPlugin = ({ protectedNodes = defaultProtectedNodes, trackedOrigins = [], undoManager = null } = {}) => new prosemirrorState.Plugin({
  key: yUndoPluginKey,
  state: {
    init: (initargs, state) => {
      // TODO: check if plugin order matches and fix
      const ystate = ySyncPluginKey.getState(state);
      const _undoManager = undoManager || new Y.UndoManager(ystate.type, {
        trackedOrigins: new Set([ySyncPluginKey].concat(trackedOrigins)),
        deleteFilter: (item) => defaultDeleteFilter(item, protectedNodes),
        captureTransaction: tr => tr.meta.get('addToHistory') !== false
      });
      return {
        undoManager: _undoManager,
        prevSel: null,
        hasUndoOps: _undoManager.undoStack.length > 0,
        hasRedoOps: _undoManager.redoStack.length > 0
      }
    },
    apply: (tr, val, oldState, state) => {
      const binding = ySyncPluginKey.getState(state).binding;
      const undoManager = val.undoManager;
      const hasUndoOps = undoManager.undoStack.length > 0;
      const hasRedoOps = undoManager.redoStack.length > 0;
      if (binding) {
        return {
          undoManager,
          prevSel: getRelativeSelection(binding, oldState),
          hasUndoOps,
          hasRedoOps
        }
      } else {
        if (hasUndoOps !== val.hasUndoOps || hasRedoOps !== val.hasRedoOps) {
          return Object.assign({}, val, {
            hasUndoOps: undoManager.undoStack.length > 0,
            hasRedoOps: undoManager.redoStack.length > 0
          })
        } else { // nothing changed
          return val
        }
      }
    }
  },
  view: view => {
    const ystate = ySyncPluginKey.getState(view.state);
    const undoManager = yUndoPluginKey.getState(view.state).undoManager;
    undoManager.on('stack-item-added', ({ stackItem }) => {
      const binding = ystate.binding;
      if (binding) {
        stackItem.meta.set(binding, yUndoPluginKey.getState(view.state).prevSel);
      }
    });
    undoManager.on('stack-item-popped', ({ stackItem }) => {
      const binding = ystate.binding;
      if (binding) {
        binding.beforeTransactionSelection = stackItem.meta.get(binding) || binding.beforeTransactionSelection;
      }
    });
    return {
      destroy: () => {
        undoManager.destroy();
      }
    }
  }
});

exports.ProsemirrorBinding = ProsemirrorBinding;
exports.absolutePositionToRelativePosition = absolutePositionToRelativePosition;
exports.createDecorations = createDecorations;
exports.defaultCursorBuilder = defaultCursorBuilder;
exports.defaultDeleteFilter = defaultDeleteFilter;
exports.defaultProtectedNodes = defaultProtectedNodes;
exports.defaultSelectionBuilder = defaultSelectionBuilder;
exports.getRelativeSelection = getRelativeSelection;
exports.isVisible = isVisible;
exports.prosemirrorJSONToYDoc = prosemirrorJSONToYDoc;
exports.prosemirrorJSONToYXmlFragment = prosemirrorJSONToYXmlFragment;
exports.prosemirrorToYDoc = prosemirrorToYDoc;
exports.prosemirrorToYXmlFragment = prosemirrorToYXmlFragment;
exports.redo = redo;
exports.relativePositionToAbsolutePosition = relativePositionToAbsolutePosition;
exports.setMeta = setMeta;
exports.undo = undo;
exports.yCursorPlugin = yCursorPlugin;
exports.yCursorPluginKey = yCursorPluginKey;
exports.yDocToProsemirror = yDocToProsemirror;
exports.yDocToProsemirrorJSON = yDocToProsemirrorJSON;
exports.ySyncPlugin = ySyncPlugin;
exports.ySyncPluginKey = ySyncPluginKey;
exports.yUndoPlugin = yUndoPlugin;
exports.yUndoPluginKey = yUndoPluginKey;
exports.yXmlFragmentToProsemirror = yXmlFragmentToProsemirror;
exports.yXmlFragmentToProsemirrorJSON = yXmlFragmentToProsemirrorJSON;
//# sourceMappingURL=y-prosemirror.cjs.map
