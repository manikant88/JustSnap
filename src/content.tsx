import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Camera,
  Settings,
  ListChecks,
  X
} from "lucide-react";
import { captureImageToBlob, deleteImageBlob, getImageBlob, saveImageBlob } from "../shared/blobStore";
import { dockLayoutForCount } from "./content/dockLayout";
import { captureFileForDrag, copyFilesToClipboard, dragPreviewElement } from "./content/drag/filePayload";
import { placeFilesInCurrentPage } from "./content/drag/pageInsert";
import { dataUrlToBlob, loadImage } from "./content/imageTools";
import { LibraryView } from "./content/rail/LibraryView";
import { styles } from "./content/styles";
import type { DragPayload, InternalDrag, Point, Rect } from "./content/types";
import type {
  ActivityEvent,
  BackgroundRequest,
  BackgroundResponse,
  Capture,
  CaptureGroup,
  CaptureImage,
  ContentMessage,
  LibraryState,
  PendingUsage
} from "../shared/types";

const PENDING_USAGE_MS = 2 * 60 * 1000;
const MIN_SELECTION_WIDTH = 32;
const MIN_SELECTION_HEIGHT = 32;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

installDestinationDetector();

chrome.runtime.onMessage.addListener((message: ContentMessage) => {
  if (message.type === "JUSTSNAP_SHOW_RAIL") mountRail();
  if (message.type === "JUSTSNAP_START_CAPTURE") mountRail("start_capture");
  if (message.type === "JUSTSNAP_CLOSE_RAIL") unmountRail();
  if (message.type === "JUSTSNAP_CAPTURE_ERROR") alert(`JustSnap could not capture: ${message.error}`);
});

type ContentCommand = { id: number; type: "start_capture" };

let commandId = 0;

function mountRail(commandType?: ContentCommand["type"]) {
  if (host && !host.isConnected) {
    root = undefined;
    host = undefined;
  }
  if (!host) {
    host = document.createElement("div");
    host.id = "justsnap-root";
    document.documentElement.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    const app = document.createElement("div");
    shadow.append(app);
    root = createRoot(app);
  }
  root?.render(<JustSnapApp command={commandType ? { id: ++commandId, type: commandType } : undefined} />);
}

function unmountRail() {
  root?.unmount();
  host?.remove();
  root = undefined;
  host = undefined;
}

function JustSnapApp({ command }: { command?: ContentCommand }) {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [groups, setGroups] = useState<CaptureGroup[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [captureMode, setCaptureMode] = useState(false);
  const [captureHidden, setCaptureHidden] = useState(false);
  const [viewportCapture, setViewportCapture] = useState<CaptureImage | null>(null);
  const [start, setStart] = useState<Point | null>(null);
  const [current, setCurrent] = useState<Point | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState<InternalDrag | null>(null);
  const [blobCache, setBlobCache] = useState<Record<string, Blob>>({});
  const [recentlyAddedCaptureId, setRecentlyAddedCaptureId] = useState<string | null>(null);
  const hasLoggedOpen = useRef(false);
  const pendingDragPayload = useRef<DragPayload | null>(null);
  const lastDragPoint = useRef<Point | null>(null);

  useEffect(() => {
    let cancelled = false;
    sendBackground<LibraryState>({ type: "JUSTSNAP_GET_LIBRARY" })
      .then((library) => {
        if (cancelled) return;
        setCaptures(library.captures);
        setGroups(library.groups);
        setEvents(library.events);
        setLoaded(true);
        if (!hasLoggedOpen.current) {
          hasLoggedOpen.current = true;
          void addEvent("rail_opened", []);
        }
      })
      .catch((loadError) => setError(errorText(loadError)));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    sendBackground({
      type: "JUSTSNAP_SAVE_LIBRARY",
      library: { captures, groups, events }
    }).catch(() => undefined);
  }, [captures, events, groups, loaded]);

  useEffect(() => {
    let cancelled = false;
    const missing = captures.filter((capture) => !blobCache[capture.id]);
    if (!missing.length) return;
    void Promise.all(
      missing.map(async (capture) => {
        const blob = await getImageBlob(capture.imageBlobKey);
        if (!blob && capture.fullDataUrl) return [capture.id, dataUrlToBlob(capture.fullDataUrl)] as const;
        return blob ? ([capture.id, blob] as const) : undefined;
      })
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, Blob> = {};
      for (const entry of entries) {
        if (entry) next[entry[0]] = entry[1];
      }
      if (Object.keys(next).length) setBlobCache((currentCache) => ({ ...currentCache, ...next }));
    });
    return () => {
      cancelled = true;
    };
  }, [blobCache, captures]);

  useEffect(() => {
    const rememberDragPoint = (event: DragEvent) => {
      if (!pendingDragPayload.current) return;
      if (event.clientX || event.clientY) {
        lastDragPoint.current = { x: event.clientX, y: event.clientY };
      }
    };
    document.addEventListener("dragover", rememberDragPoint, true);
    document.addEventListener("drop", rememberDragPoint, true);
    return () => {
      document.removeEventListener("dragover", rememberDragPoint, true);
      document.removeEventListener("drop", rememberDragPoint, true);
    };
  }, []);

  useEffect(() => {
    if (!recentlyAddedCaptureId) return;
    const timer = window.setTimeout(() => setRecentlyAddedCaptureId(null), 900);
    return () => window.clearTimeout(timer);
  }, [recentlyAddedCaptureId]);

  const activeRect = useMemo(() => {
    if (!start || !current) return null;
    return normalizeRect(start, current);
  }, [current, start]);

  const ungroupedCaptures = useMemo(
    () => captures.filter((capture) => !capture.groupId),
    [captures]
  );

  const addEvent = useCallback(
    async (
      type: ActivityEvent["type"],
      captureIds: string[],
      patch: Partial<Omit<ActivityEvent, "id" | "type" | "createdAt" | "captureIds">> = {}
    ) => {
      const event: ActivityEvent = {
        id: crypto.randomUUID(),
        type,
        createdAt: Date.now(),
        captureIds,
        ...patch
      };
      setEvents((currentEvents) => [...currentEvents, event].slice(-500));
      await sendBackground({ type: "JUSTSNAP_APPEND_EVENT", event }).catch(() => undefined);
    },
    []
  );

  const beginCapture = async () => {
    try {
      setError("");
      setCaptureHidden(true);
      await nextAnimationFrame();
      const dataUrl = await sendBackground<string>({ type: "JUSTSNAP_CAPTURE_VISIBLE" });
      const image = await loadImage(dataUrl);
      setViewportCapture(image);
      setCaptureMode(true);
      setStart(null);
      setCurrent(null);
      await addEvent("capture_started", [], { sourceOrigin: currentOrigin() });
    } catch (captureError) {
      setError(errorText(captureError));
    } finally {
      setCaptureHidden(false);
    }
  };

  const beginSelection = (event: React.PointerEvent) => {
    if (!captureMode) return;
    const point = { x: event.clientX, y: event.clientY };
    setStart(point);
    setCurrent(point);
  };

  const updateSelection = (event: React.PointerEvent) => {
    if (!captureMode || !start) return;
    setCurrent({ x: event.clientX, y: event.clientY });
  };

  const finishSelection = async () => {
    if (!viewportCapture || !start || !current) return;
    const rect = normalizeRect(start, current);
    setStart(null);
    setCurrent(null);
    if (rect.width < MIN_SELECTION_WIDTH || rect.height < MIN_SELECTION_HEIGHT) {
      setError("Select a larger area.");
      return;
    }

    try {
      const crop = await cropImage(viewportCapture, rect);
      const thumb = await resizeImage(crop.dataUrl, 360, 0.84);
      const id = crypto.randomUUID();
      const imageBlobKey = `capture-${id}`;
      const blob = await captureImageToBlob(crop);
      await saveImageBlob(imageBlobKey, blob);
      const capture: Capture = {
        id,
        sourceUrl: window.location.href,
        sourceOrigin: currentOrigin(),
        pageTitle: document.title || currentOrigin(),
        createdAt: Date.now(),
        width: crop.width,
        height: crop.height,
        thumbnailDataUrl: thumb.dataUrl,
        imageBlobKey,
        fullDataUrl: crop.dataUrl
      };
      setCaptures((currentCaptures) => [capture, ...currentCaptures]);
      setBlobCache((currentCache) => ({ ...currentCache, [id]: blob }));
      setRecentlyAddedCaptureId(id);
      setCaptureMode(false);
      setViewportCapture(null);
      await addEvent("capture_created", [id], { sourceOrigin: capture.sourceOrigin });
    } catch (selectionError) {
      setError(errorText(selectionError));
    }
  };

  const cancelCapture = () => {
    setCaptureMode(false);
    setViewportCapture(null);
    setStart(null);
    setCurrent(null);
  };

  useEffect(() => {
    if (command?.type === "start_capture") void beginCapture();
  }, [command?.id]);

  useEffect(() => {
    if (!captureMode) return;
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancelCapture();
    };
    document.addEventListener("keydown", cancelOnEscape, true);
    return () => document.removeEventListener("keydown", cancelOnEscape, true);
  }, [captureMode]);

  const openShortcutSettings = async () => {
    await sendBackground({ type: "JUSTSNAP_OPEN_SHORTCUT_SETTINGS" }).catch((settingsError) => setError(errorText(settingsError)));
  };

  const closeRail = async () => {
    await sendBackground({ type: "JUSTSNAP_CLOSE_RAIL_GLOBAL" }).catch(() => unmountRail());
  };

  const startItemDrag = (
    event: React.DragEvent,
    drag: InternalDrag,
    captureIds: string[],
    groupId?: string
  ) => {
    const transfer = event.dataTransfer;
    const dragCaptures = captureIds
      .map((id) => captures.find((capture) => capture.id === id))
      .filter(Boolean) as Capture[];
    const files = dragCaptures
      .map((capture, index) => captureFileForDrag(capture, blobCache[capture.id], index))
      .filter(Boolean) as File[];

    if (!files.length) {
      event.preventDefault();
      setDragging(null);
      setError("Image data is still loading. Try again in a moment.");
      return;
    }

    setDragging(drag);
    pendingDragPayload.current = { files, captures: dragCaptures, captureIds, groupId };
    lastDragPoint.current = { x: event.clientX, y: event.clientY };
    void copyFilesToClipboard(files);
    transfer.clearData();
    transfer.effectAllowed = "copy";
    transfer.dropEffect = "copy";
    transfer.setData("application/x-justsnap", JSON.stringify(drag));

    const firstCapture = dragCaptures[0];
    const firstFile = files[0];
    if (firstCapture && firstFile) {
      transfer.setData(
        "DownloadURL",
        `${firstFile.type || "image/png"}:${firstFile.name}:${firstCapture.fullDataUrl || firstCapture.thumbnailDataUrl}`
      );
    }

    files.forEach((file) => {
      if (!transfer.items) return;
      try {
        transfer.items.add(file);
      } catch {
        // Some targets/browsers reject adding files to DataTransfer.
      }
    });

    const dragImage = dragPreviewElement(event.currentTarget);
    if (dragImage) transfer.setDragImage(dragImage, 24, 24);

    void recordUsage(drag.kind === "group" ? "drag" : "drag", captureIds, groupId ? "group_drag_started" : "capture_drag_started", groupId);
  };

  const finishItemDrag = async (event: React.DragEvent) => {
    const payload = pendingDragPayload.current;
    const point = event.clientX || event.clientY ? { x: event.clientX, y: event.clientY } : lastDragPoint.current;
    pendingDragPayload.current = null;
    lastDragPoint.current = null;
    setDragging(null);
    if (!payload || !point) return;

    const target = elementAtPoint(point);
    if (!target || isJustSnapNode(target)) return;

    const result = await placeFilesInCurrentPage(payload.files, payload.captures, { currentOrigin, isJustSnapNode }, target);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await recordUsage("drag", payload.captureIds, payload.groupId ? "group_inserted" : "capture_inserted", payload.groupId);
  };

  const dropOnCapture = (targetCaptureId: string) => {
    if (!dragging || dragging.kind !== "capture" || dragging.captureId === targetCaptureId) return;
    pendingDragPayload.current = null;
    createOrUpdateGroup(dragging.captureId, targetCaptureId);
    setDragging(null);
  };

  const dropOnGroup = (groupId: string) => {
    if (!dragging) return;
    pendingDragPayload.current = null;
    if (dragging.kind === "capture") addCaptureToGroup(dragging.captureId, groupId);
    setDragging(null);
  };

  const createOrUpdateGroup = async (sourceCaptureId: string, targetCaptureId: string) => {
    const target = captures.find((capture) => capture.id === targetCaptureId);
    if (!target) return;
    if (target.groupId) {
      addCaptureToGroup(sourceCaptureId, target.groupId);
      return;
    }
    const group: CaptureGroup = {
      id: crypto.randomUUID(),
      name: "New collection",
      createdAt: Date.now(),
      captureIds: [targetCaptureId, sourceCaptureId],
      collapsed: false
    };
    setGroups((currentGroups) => [
      group,
      ...currentGroups
        .map((item) => ({
          ...item,
          captureIds: item.captureIds.filter((id) => id !== sourceCaptureId && id !== targetCaptureId)
        }))
        .filter((item) => item.captureIds.length > 0)
    ]);
    setCaptures((currentCaptures) =>
      currentCaptures.map((capture) =>
        capture.id === sourceCaptureId || capture.id === targetCaptureId ? { ...capture, groupId: group.id } : capture
      )
    );
    await addEvent("group_created", group.captureIds, { groupId: group.id, sourceOrigin: currentOrigin() });
  };

  const addCaptureToGroup = async (captureId: string, groupId: string) => {
    setGroups((currentGroups) =>
      currentGroups
        .map((group) => {
          const captureIds = group.captureIds.filter((id) => id !== captureId);
          return group.id === groupId ? { ...group, captureIds: [...captureIds, captureId] } : { ...group, captureIds };
        })
        .filter((group) => group.captureIds.length > 0)
    );
    setCaptures((currentCaptures) =>
      currentCaptures.map((capture) => (capture.id === captureId ? { ...capture, groupId } : capture))
    );
    await addEvent("capture_grouped", [captureId], { groupId, sourceOrigin: currentOrigin() });
  };

  const removeGroup = async (groupId: string) => {
    const group = groups.find((item) => item.id === groupId);
    setGroups((currentGroups) => currentGroups.filter((item) => item.id !== groupId));
    setCaptures((currentCaptures) =>
      currentCaptures.map((capture) => (capture.groupId === groupId ? { ...capture, groupId: undefined } : capture))
    );
    await addEvent("group_removed", group?.captureIds ?? [], { groupId });
  };

  const removeCapture = async (captureId: string) => {
    const capture = captures.find((item) => item.id === captureId);
    if (!capture) return;
    await deleteImageBlob(capture.imageBlobKey).catch(() => undefined);
    setBlobCache((currentCache) => {
      const next = { ...currentCache };
      delete next[captureId];
      return next;
    });
    setCaptures((currentCaptures) => currentCaptures.filter((item) => item.id !== captureId));
    setGroups((currentGroups) =>
      currentGroups
        .map((group) => ({ ...group, captureIds: group.captureIds.filter((id) => id !== captureId) }))
        .filter((group) => group.captureIds.length > 0)
    );
    await addEvent("capture_removed", [captureId], { sourceOrigin: capture.sourceOrigin });
  };

  const exportMetadata = async () => {
    const bundle = {
      exportedAt: new Date().toISOString(),
      version: 1,
      captures: captures.map(
        ({ thumbnailDataUrl: _thumbnailDataUrl, imageBlobKey: _imageBlobKey, fullDataUrl: _fullDataUrl, ...capture }) =>
          capture
      ),
      groups,
      events
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `justsnap-metadata-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    await addEvent("metadata_exported", [], { sourceOrigin: currentOrigin() });
  };

  const recordUsage = async (
    action: PendingUsage["action"],
    captureIds: string[],
    eventType: ActivityEvent["type"],
    groupId?: string
  ) => {
    const sourceOrigin = sourceOriginFor(captureIds, captures);
    const pending: PendingUsage = {
      id: crypto.randomUUID(),
      action,
      createdAt: Date.now(),
      expiresAt: Date.now() + PENDING_USAGE_MS,
      captureIds,
      groupId,
      sourceOrigin
    };
    await sendBackground({ type: "JUSTSNAP_SET_PENDING_USAGE", pending }).catch(() => undefined);
    await addEvent(eventType, captureIds, { groupId, sourceOrigin, confidence: "intent" });
  };
  const visibleGroupCount = groups.filter((group) => group.captureIds.some((captureId) => captures.some((capture) => capture.id === captureId))).length;
  const railLayout = dockLayoutForCount(visibleGroupCount + ungroupedCaptures.length);

  return (
    <>
      <style>{styles}</style>
      <div className={["justsnap-toolbar", captureHidden ? "justsnap-hidden" : ""].join(" ")}>
        <button title="Capture" onClick={beginCapture}>
          <Camera size={18} />
        </button>
        <button title="Customize shortcuts" onClick={openShortcutSettings}>
          <Settings size={18} />
        </button>
        {error && (
          <button className="justsnap-error-dot" title={error} onClick={() => setError("")}>
            !
          </button>
        )}
        <button title="Close JustSnap" onClick={closeRail}>
          <X size={19} />
        </button>
      </div>
      <div
        className={["justsnap-rail-backdrop", captureHidden ? "justsnap-hidden" : ""].join(" ")}
        style={{ "--justsnap-rail-surface": `${railLayout.surfaceWidth}px` } as React.CSSProperties}
      />
      <aside
        className={["justsnap-rail", captureHidden ? "justsnap-hidden" : ""].join(" ")}
        style={{ "--justsnap-rail-surface": `${railLayout.surfaceWidth}px` } as React.CSSProperties}
      >
        <LibraryView
          captures={captures}
          groups={groups}
          ungroupedCaptures={ungroupedCaptures}
          blobCache={blobCache}
          recentlyAddedCaptureId={recentlyAddedCaptureId}
          layout={railLayout}
          onStartDrag={startItemDrag}
          onEndDrag={finishItemDrag}
          onDropCapture={dropOnCapture}
          onDropGroup={dropOnGroup}
          onRemoveGroup={removeGroup}
          onRemoveCapture={removeCapture}
        />
      </aside>

      {captureMode && (
        <div
          className="justsnap-capture-layer"
          onPointerDown={beginSelection}
          onPointerMove={updateSelection}
          onPointerUp={finishSelection}
        >
          <div className="justsnap-capture-toolbar" onPointerDown={(event) => event.stopPropagation()}>
            <span>Drag to capture an area</span>
            <button title="Cancel capture" onClick={cancelCapture}>
              <X size={16} />
            </button>
          </div>
          {activeRect && <div className="justsnap-selection" style={rectStyle(activeRect)} />}
        </div>
      )}
    </>
  );
}

function ActivityView({ events, captures, groups }: { events: ActivityEvent[]; captures: Capture[]; groups: CaptureGroup[] }) {
  if (!events.length) {
    return (
      <div className="justsnap-empty">
        <ListChecks size={22} />
        <span>Workflow activity will appear here.</span>
      </div>
    );
  }

  return (
    <div className="justsnap-activity">
      {[...events].reverse().slice(0, 120).map((event) => (
        <article key={event.id}>
          <strong>{eventLabel(event, groups)}</strong>
          <span>{new Date(event.createdAt).toLocaleString()}</span>
          <small>{eventDetail(event, captures)}</small>
        </article>
      ))}
    </div>
  );
}

function installDestinationDetector() {
  const report = (interaction: "paste" | "drop") => {
    sendBackground({
      type: "JUSTSNAP_MATCH_PENDING_USAGE",
      interaction,
      destinationUrl: window.location.href,
      destinationOrigin: currentOrigin()
    }).catch(() => undefined);
  };
  document.addEventListener("paste", () => report("paste"), true);
  document.addEventListener("drop", () => report("drop"), true);
}

function isJustSnapNode(node: Node): boolean {
  return Boolean(host && (node === host || host.contains(node)));
}

function elementAtPoint(point: Point): Element | undefined {
  const x = Math.max(0, Math.min(window.innerWidth - 1, point.x));
  const y = Math.max(0, Math.min(window.innerHeight - 1, point.y));
  const element = document.elementFromPoint(x, y);
  if (!element) return undefined;
  return element instanceof ShadowRoot ? element.host : element;
}

async function sendBackground<T = unknown>(request: BackgroundRequest): Promise<T> {
  const response = await chrome.runtime.sendMessage<BackgroundRequest, BackgroundResponse<T>>(request);
  if (!response?.ok) throw new Error(response?.error ?? "JustSnap request failed.");
  return response.data;
}

async function cropImage(image: CaptureImage, rect: Rect): Promise<CaptureImage> {
  const viewport = window.visualViewport;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportTop = viewport?.offsetTop ?? 0;
  const scaleX = image.width / viewportWidth;
  const scaleY = image.height / viewportHeight;
  const scale = Math.min(scaleX, scaleY);
  const sourceX = Math.max(0, Math.round((rect.left + viewportLeft) * scale));
  const sourceY = Math.max(0, Math.round((rect.top + viewportTop) * scale));
  const sourceWidth = Math.min(image.width - sourceX, Math.round(rect.width * scale));
  const sourceHeight = Math.min(image.height - sourceY, Math.round(rect.height * scale));
  return drawToDataUrl(image.dataUrl, sourceWidth, sourceHeight, 0.92, {
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight
  });
}

async function resizeImage(dataUrl: string, maxSide: number, quality: number): Promise<CaptureImage> {
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  return drawToDataUrl(dataUrl, Math.round(image.width * scale), Math.round(image.height * scale), quality);
}

async function drawToDataUrl(
  dataUrl: string,
  width: number,
  height: number,
  quality: number,
  crop?: { sourceX: number; sourceY: number; sourceWidth: number; sourceHeight: number }
): Promise<CaptureImage> {
  const image = new window.Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare screenshot canvas.");
  context.drawImage(
    image,
    crop?.sourceX ?? 0,
    crop?.sourceY ?? 0,
    crop?.sourceWidth ?? image.naturalWidth,
    crop?.sourceHeight ?? image.naturalHeight,
    0,
    0,
    width,
    height
  );
  return { dataUrl: canvas.toDataURL("image/png", quality), width, height };
}

function normalizeRect(start: Point, end: Point): Rect {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  return {
    left,
    top,
    width: Math.abs(start.x - end.x),
    height: Math.abs(start.y - end.y)
  };
}

function rectStyle(rect: Rect): React.CSSProperties {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function currentOrigin(): string {
  try {
    return new URL(window.location.href).origin;
  } catch {
    return "unknown";
  }
}

function sourceOriginFor(captureIds: string[], captures: Capture[]): string | undefined {
  return captures.find((capture) => captureIds.includes(capture.id))?.sourceOrigin;
}

function captureLabel(captureId: string, captures: Capture[]): string {
  const capture = captures.find((item) => item.id === captureId);
  return capture ? `${capture.pageTitle} - ${capture.sourceOrigin}` : "JustSnap capture";
}

function eventLabel(event: ActivityEvent, groups: CaptureGroup[]): string {
  const labels: Record<ActivityEvent["type"], string> = {
    rail_opened: "Rail opened",
    capture_started: "Capture started",
    capture_created: "Capture created",
    group_created: "Group created",
    group_renamed: "Group renamed",
    capture_grouped: "Capture grouped",
    capture_removed: "Capture removed",
    group_removed: "Group removed",
    capture_copied: "Capture copied",
    group_copied: "Group copied",
    capture_inserted: "Capture inserted",
    group_inserted: "Group inserted",
    capture_downloaded: "Capture downloaded",
    group_downloaded: "Group downloaded",
    capture_drag_started: "Capture drag started",
    group_drag_started: "Group drag started",
    browser_paste_detected: "Browser paste detected",
    browser_drop_detected: "Browser drop detected",
    metadata_exported: "Metadata exported"
  };
  const groupName = event.groupId ? groups.find((group) => group.id === event.groupId)?.name : undefined;
  return groupName ? `${labels[event.type]}: ${groupName}` : labels[event.type];
}

function eventDetail(event: ActivityEvent, captures: Capture[]): string {
  const parts = [
    event.captureIds.length ? `${event.captureIds.length} capture${event.captureIds.length === 1 ? "" : "s"}` : "",
    event.sourceOrigin ? `from ${event.sourceOrigin}` : "",
    event.destinationOrigin ? `to ${event.destinationOrigin}` : "",
    event.confidence ? event.confidence : ""
  ].filter(Boolean);
  if (!parts.length && event.captureIds[0]) return captureLabel(event.captureIds[0], captures);
  return parts.join(" · ") || "Local event";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
