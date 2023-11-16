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
export function prosemirrorToYDoc(doc: Node, xmlFragment?: string): Y.Doc;
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
export function prosemirrorToYXmlFragment(doc: Node, xmlFragment?: Y.XmlFragment): Y.XmlFragment;
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
export function prosemirrorJSONToYDoc(schema: Schema, state: any, xmlFragment?: string): Y.Doc;
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
export function prosemirrorJSONToYXmlFragment(schema: Schema, state: any, xmlFragment?: Y.XmlFragment): Y.XmlFragment;
/**
 * Utility method to convert a Y.Doc to a Prosemirror Doc node.
 *
 * @param {Schema} schema
 * @param {Y.Doc} ydoc
 * @return {Node}
 */
export function yDocToProsemirror(schema: Schema, ydoc: Y.Doc): Node;
/**
 * Utility method to convert a Y.XmlFragment to a Prosemirror Doc node.
 *
 * @param {Schema} schema
 * @param {Y.XmlFragment} xmlFragment
 * @return {Node}
 */
export function yXmlFragmentToProsemirror(schema: Schema, xmlFragment: Y.XmlFragment): Node;
/**
 * Utility method to convert a Y.Doc to Prosemirror compatible JSON.
 *
 * @param {Y.Doc} ydoc
 * @param {string} xmlFragment
 * @return {Record<string, any>}
 */
export function yDocToProsemirrorJSON(ydoc: Y.Doc, xmlFragment?: string): Record<string, any>;
/**
 * Utility method to convert a Y.Doc to Prosemirror compatible JSON.
 *
 * @param {Y.XmlFragment} xmlFragment The fragment, which must be part of a Y.Doc.
 * @return {Record<string, any>}
 */
export function yXmlFragmentToProsemirrorJSON(xmlFragment: Y.XmlFragment): Record<string, any>;
export function setMeta(view: any, key: any, value: any): void;
export function absolutePositionToRelativePosition(pos: number, type: Y.XmlFragment, mapping: ProsemirrorMapping): any;
export function relativePositionToAbsolutePosition(y: Y.Doc, documentType: Y.XmlFragment, relPos: any, mapping: ProsemirrorMapping): null | number;
/**
 * Either a node if type is YXmlElement or an Array of text nodes if YXmlText
 */
export type ProsemirrorMapping = Map<Y.AbstractType<any>, Node | Array<Node>>;
import { Node } from "prosemirror-model";
import * as Y from "yjs";
import { Schema } from "prosemirror-model";
