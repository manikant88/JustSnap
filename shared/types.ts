export type Capture = {
  id: string;
  createdAt: number;
  width: number;
  height: number;
  thumbnailDataUrl: string;
  thumbnailVersion?: number;
  imageBlobKey: string;
};

export type CaptureGroup = {
  id: string;
  name: string;
  createdAt: number;
  captureIds: string[];
};

export type RailOrderItem =
  | { kind: "capture"; id: string }
  | { kind: "group"; id: string };

export type DockOrderItem = RailOrderItem;

export type CaptureDock = {
  id: string;
  name: string;
  createdAt: number;
  order: DockOrderItem[];
};

export type LibraryState = {
  captures: Capture[];
  groups: CaptureGroup[];
  docks: CaptureDock[];
  activeDockId: string;
  /** Active dock order. Kept as a compatibility view for existing UI clients. */
  railOrder: RailOrderItem[];
};

export type LibraryMutation =
  | { type: "move_rail_item"; item: RailOrderItem; target: RailOrderItem; position: "insert-before" | "insert-after" }
  | { type: "create_group"; groupId: string; name: string; createdAt: number; sourceCaptureId: string; targetCaptureId: string }
  | { type: "add_capture_to_group"; captureId: string; groupId: string }
  | { type: "move_capture_in_group"; captureId: string; groupId: string; targetCaptureId: string; position: "insert-before" | "insert-after" }
  | { type: "ungroup_capture"; captureId: string }
  | { type: "delete_capture"; captureId: string }
  | { type: "delete_group"; groupId: string }
  | { type: "create_empty_group"; groupId: string; name: string; createdAt: number }
  | { type: "clear_library" };

export type CaptureImage = {
  dataUrl: string;
  width: number;
  height: number;
};

export type CaptureSelectionRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type CaptureViewport = {
  width: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
};

export type CaptureAddTarget =
  | { kind: "capture"; id: string }
  | { kind: "group"; id: string };

export type CaptureSessionSnapshot = {
  sessionId: string;
  captureCount: number;
  captureIds: string[];
  addTarget?: CaptureAddTarget;
};

export type CaptureSelectionResult = {
  capture: Capture;
  session: CaptureSessionSnapshot | null;
};

export type BackgroundRequest =
  | { type: "JUSTSNAP_TOGGLE_RAIL" }
  | { type: "JUSTSNAP_CLOSE_RAIL_GLOBAL" }
  | { type: "JUSTSNAP_OPEN_SETTINGS" }
  | { type: "JUSTSNAP_OPEN_SHORTCUT_SETTINGS" }
  | { type: "JUSTSNAP_START_CAPTURE_ACTIVE"; addTarget?: CaptureAddTarget }
  | { type: "JUSTSNAP_PREPARE_CAPTURE_SESSION"; addTarget?: CaptureAddTarget }
  | {
      type: "JUSTSNAP_IMPORT_IMAGE_URL";
      imageUrl: string;
    }
  | {
      type: "JUSTSNAP_CAPTURE_SELECTION";
      sessionId?: string;
      rect: CaptureSelectionRect;
      viewport: CaptureViewport;
    }
  | { type: "JUSTSNAP_FINISH_CAPTURE_SESSION"; sessionId: string }
  | { type: "JUSTSNAP_CANCEL_CAPTURE_SESSION"; sessionId: string }
  | { type: "JUSTSNAP_GET_LIBRARY" }
  | { type: "JUSTSNAP_GET_IMAGE_DATA"; imageBlobKey: string }
  | { type: "JUSTSNAP_MUTATE_LIBRARY"; mutation: LibraryMutation };

export type BackgroundResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ContentMessage =
  | { type: "JUSTSNAP_SHOW_RAIL" }
  | ({ type: "JUSTSNAP_START_CAPTURE" } & CaptureSessionSnapshot)
  | { type: "JUSTSNAP_CLOSE_RAIL" }
  | { type: "JUSTSNAP_CAPTURE_ERROR"; error: string };
