export type Capture = {
  id: string;
  sourceUrl: string;
  sourceOrigin: string;
  pageTitle: string;
  createdAt: number;
  width: number;
  height: number;
  thumbnailDataUrl: string;
  imageBlobKey: string;
  fullDataUrl?: string;
  groupId?: string;
};

export type CaptureGroup = {
  id: string;
  name: string;
  createdAt: number;
  captureIds: string[];
  collapsed: boolean;
};

export type ActivityEventType =
  | "rail_opened"
  | "capture_started"
  | "capture_created"
  | "group_created"
  | "group_renamed"
  | "capture_grouped"
  | "capture_removed"
  | "group_removed"
  | "capture_copied"
  | "group_copied"
  | "capture_inserted"
  | "group_inserted"
  | "capture_downloaded"
  | "group_downloaded"
  | "capture_drag_started"
  | "group_drag_started"
  | "browser_paste_detected"
  | "browser_drop_detected"
  | "metadata_exported";

export type ActivityEvent = {
  id: string;
  type: ActivityEventType;
  createdAt: number;
  captureIds: string[];
  groupId?: string;
  sourceOrigin?: string;
  destinationUrl?: string;
  destinationOrigin?: string;
  confidence?: "intent" | "detected";
  note?: string;
};

export type PendingUsage = {
  id: string;
  action: "copy" | "drag";
  createdAt: number;
  expiresAt: number;
  captureIds: string[];
  groupId?: string;
  sourceOrigin?: string;
};

export type LibraryState = {
  captures: Capture[];
  groups: CaptureGroup[];
  events: ActivityEvent[];
  pendingUsages: PendingUsage[];
};

export type CaptureImage = {
  dataUrl: string;
  width: number;
  height: number;
};

export type BackgroundRequest =
  | { type: "JUSTSNAP_TOGGLE_RAIL" }
  | { type: "JUSTSNAP_CLOSE_RAIL_GLOBAL" }
  | { type: "JUSTSNAP_OPEN_SHORTCUT_SETTINGS" }
  | { type: "JUSTSNAP_CAPTURE_VISIBLE" }
  | { type: "JUSTSNAP_GET_LIBRARY" }
  | { type: "JUSTSNAP_SAVE_LIBRARY"; library: Pick<LibraryState, "captures" | "groups" | "events"> }
  | { type: "JUSTSNAP_APPEND_EVENT"; event: ActivityEvent }
  | { type: "JUSTSNAP_SET_PENDING_USAGE"; pending: PendingUsage }
  | { type: "JUSTSNAP_MATCH_PENDING_USAGE"; interaction: "paste" | "drop"; destinationUrl: string; destinationOrigin: string };

export type BackgroundResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ContentMessage =
  | { type: "JUSTSNAP_SHOW_RAIL" }
  | { type: "JUSTSNAP_START_CAPTURE" }
  | { type: "JUSTSNAP_CLOSE_RAIL" }
  | { type: "JUSTSNAP_CAPTURE_ERROR"; error: string };
