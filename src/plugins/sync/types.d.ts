import type * as Y from "@y/y";
import type { Transaction } from "prosemirror-state";

export type SyncPluginState = {
  /**
   * The main fragment that the editor is currently synced with
   */
  ytype: Y.Type | null;
  /**
   * The current attribution manager that affects how the content is rendered, and applied
   */
  attributionManager: Y.AbstractAttributionManager | null;
  /**
   * All of the transactions that have been captured since last synced to the ytype
   */
  capturedTransactions: Transaction[];
};

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
