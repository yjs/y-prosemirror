export function undo(state: any): boolean;
export function redo(state: any): boolean;
export const defaultProtectedNodes: Set<string>;
export function defaultDeleteFilter(item: any, protectedNodes: any): boolean;
export function yUndoPlugin({ protectedNodes, trackedOrigins, undoManager }?: {
    protectedNodes?: Set<string>;
    trackedOrigins?: any[];
    undoManager?: any;
}): Plugin<{
    undoManager: any;
    prevSel: any;
    hasUndoOps: boolean;
    hasRedoOps: boolean;
}>;
import { Plugin } from "prosemirror-state";
