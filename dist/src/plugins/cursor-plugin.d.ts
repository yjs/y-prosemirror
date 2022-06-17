export function defaultCursorBuilder(user: any): HTMLElement;
export function defaultSelectionBuilder(user: any): import('prosemirror-view').DecorationAttrs;
export function createDecorations(state: any, awareness: Awareness, createCursor: any, createSelection: any): any;
export function yCursorPlugin(awareness: Awareness, { cursorBuilder, selectionBuilder, getSelection }?: {
    cursorBuilder: (arg0: any) => HTMLElement;
    selectionBuilder: (arg0: any) => import('prosemirror-view').DecorationAttrs;
    getSelection: (arg0: any) => any;
}, cursorStateField?: string): any;
import { Awareness } from "y-protocols/awareness";
