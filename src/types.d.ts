import type * as Y from "@y/y";
import type { Transaction } from "prosemirror-state";
import { ProsemirrorDelta } from "src";

/**
 * If just a fragment, then we compare the latest fragment with the other fragment. If a snapshot is provided, then we compare the fragment at that snapshot with the other snapshot.
 */
export type SnapshotItem = { fragment: Y.XmlFragment; snapshot?: Y.Snapshot };

/**
 * @typedef {Object} YSyncPluginMeta
 */
export type YSyncPluginMeta =
  | {
      type: "initialized";
      ytype: Y.XmlFragment;
    }
  | {
      type: "local-update";
      capturedTransactions: Transaction[];
    }
  | {
      type: "remote-update";
      events: Array<Y.YEvent<Y.XmlFragment>>;
      ytype: Y.XmlFragment;
      attributionFix?: true;
    }
  | {
      type: "render-snapshot";
      snapshot: SnapshotItem;
      prevSnapshot: SnapshotItem;
    }
  | { type: "pause-sync" }
  | { type: "resume-sync" }
  | {
      type: "show-suggestions";
    }
  | {
      type: "hide-suggestions";
    };

export type SyncPluginMode = {
  /**
   * This is the delta that has been captured since the last time the sync was paused
   */
  pendingDelta: ProsemirrorDelta | null;
  /**
   * The main ytype to use for the sync
   */
  ytype: Y.XmlFragment;
  /**
   * Whether we are currently showing suggestions (i.e. the ytype is based on the suggestion doc)
   */
  showSuggestions: boolean;
} & (
  | {
      type: "sync";
    }
  | {
      type: "paused";
      /**
       * This is a snapshot of the content doc at the point in time when the sync was paused
       */
      contentDocSnapshot: Y.Snapshot;
    }
  | {
      // TODO are snapshots really different than suggestion docs?
      type: "snapshot";
      /**
       * The snapshot to display as content
       */
      snapshot: SnapshotItem;
      /**
       * The previous snapshot to use for showing the diff
       */
      prevSnapshot: SnapshotItem;
    }
);
