import type * as Y from "@y/y";
import type { EditorView } from "prosemirror-view";
import type { Transaction } from "prosemirror-state";

/**
 * The {@link SyncedState} is a bi-directional synchronization with the provided {@link Y.XmlFragment} and the {@link EditorView}
 * Any change applied to the {@link EditorView} will be applied (via deltas) to the {@link Y.XmlFragment}, and vice versa.
 */
export type SyncedState = {
  type: "synced";
  /**
   * The main fragment that the editor is currently synced with
   */
  ytype: Y.Type;
  /**
   * The current attribution manager that affects how the content is rendered, and applied
   */
  attributionManager: Y.AbstractAttributionManager|null;
  // TODO should we be capturing the transactions, is there another way around this?
  /**
   * All of the transactions that have been captured since last synced to the ytype
   */
  capturedTransactions: Transaction[];
};

/**
 * When the plugin is first initialized, it starts in a {@link PausedState} which means that it is not synchronizing changes with the provided ytype
 * Once the {@link EditorView} is initialized, this state will be transitioned to a {@link SyncedState}
 */
export type PausedState = {
  type: "paused";
  /**
   * The state prior to being paused
   */
  previousState: SyncedState | null;
  /**
   * All of the transactions that have been captured since last synced to the ytype
   */
  capturedTransactions: Transaction[];
};

export type SyncPluginState = SyncedState | PausedState;

export type SyncPluginTransactionMeta =
  | {
      type: "sync-mode";
      /**
       * If provided, will switch to the given ytype instead of the current ytype
       */
      ytype?: Y.Type;
      /**
       * If provided, will switch to the given attribution manager instead of the current attribution manager
       */
      attributionManager?: Y.AbstractAttributionManager;
    }
  | {
      type: "pause-mode";
      /**
       * If provided, will switch to the given ytype instead of the current ytype
       */
      ytype?: Y.Type;
      /**
       * If provided, will switch to the given attribution manager instead of the current attribution manager
       */
      attributionManager?: Y.AbstractAttributionManager;
    }
  | {
      type: "remote-update";
      events: Array<Y.YEvent<Y.Type>>;
      ytype: Y.Type;
      attributionFix?: true;
    }
  | {
      type: "initialized";
      ytype: Y.Type;
      attributionManager: Y.AbstractAttributionManager;
    };
