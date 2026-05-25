import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Camera,
  Files,
  ListChecks,
  Trash2,
  X
} from "lucide-react";
import { captureImageToBlob, deleteImageBlob, getImageBlob, saveImageBlob } from "../shared/blobStore";
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

type Point = { x: number; y: number };
type Rect = { left: number; top: number; width: number; height: number };
type InternalDrag = { kind: "capture"; captureId: string } | { kind: "group"; groupId: string };
type DragPayload = { files: File[]; captures: Capture[]; captureIds: string[]; groupId?: string };
type DockEdgeBias = "top" | "bottom" | null;

const PENDING_USAGE_MS = 2 * 60 * 1000;
const MIN_SELECTION_WIDTH = 32;
const MIN_SELECTION_HEIGHT = 32;
const WHATSAPP_WIDE_IMAGE_RATIO = 2.4;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

installDestinationDetector();

chrome.runtime.onMessage.addListener((message: ContentMessage) => {
  if (message.type === "JUSTSNAP_SHOW_RAIL") mountRail();
  if (message.type === "JUSTSNAP_CAPTURE_ERROR") alert(`JustSnap could not capture: ${message.error}`);
});

function mountRail() {
  if (!host) {
    host = document.createElement("div");
    host.id = "justsnap-root";
    document.documentElement.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    const app = document.createElement("div");
    shadow.append(app);
    root = createRoot(app);
  }
  root?.render(<JustSnapApp />);
}

function unmountRail() {
  root?.render(<></>);
}

function JustSnapApp() {
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

  const copyCaptures = async (captureIds: string[], groupId?: string) => {
    const blobs = captureIds.map((id) => blobCache[id]).filter(Boolean);
    if (!blobs.length) {
      setError("Image data is still loading. Try again in a moment.");
      return;
    }
    try {
      const clipboardItems = blobs.map((blob) => new ClipboardItem({ [blob.type || "image/png"]: blob }));
      await navigator.clipboard.write(clipboardItems);
      const type = groupId ? "group_copied" : "capture_copied";
      await recordUsage("copy", captureIds, type, groupId);
      if (groupId && clipboardItems.length !== captureIds.length) {
        setError("Copied the images Chrome could prepare for this group.");
      }
    } catch (copyError) {
      setError(`Copy is not available on this page: ${errorText(copyError)}`);
    }
  };

  const insertCapturesIntoPage = async (captureIds: string[], groupId?: string) => {
    const insertCaptures = captureIds
      .map((id) => captures.find((capture) => capture.id === id))
      .filter(Boolean) as Capture[];
    const files = insertCaptures
      .map((capture, index) => captureFileForDrag(capture, blobCache[capture.id], index))
      .filter(Boolean) as File[];

    if (!files.length) {
      setError("Image data is still loading. Try again in a moment.");
      return;
    }

    const result = await placeFilesInCurrentPage(files, insertCaptures);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    await recordUsage("copy", captureIds, groupId ? "group_inserted" : "capture_inserted", groupId);
  };

  const downloadCaptures = async (captureIds: string[], groupId?: string) => {
    const downloadCaptures = captureIds
      .map((id) => captures.find((capture) => capture.id === id))
      .filter(Boolean) as Capture[];
    const files = downloadCaptures
      .map((capture, index) => captureFileForDrag(capture, blobCache[capture.id], index))
      .filter(Boolean) as File[];

    if (!files.length) {
      setError("Image data is still loading. Try again in a moment.");
      return;
    }

    files.forEach(downloadFile);
    await recordUsage("copy", captureIds, groupId ? "group_downloaded" : "capture_downloaded", groupId);
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

    const result = await placeFilesInCurrentPage(payload.files, payload.captures, target);
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

  const renameGroup = async (groupId: string, name: string) => {
    setGroups((currentGroups) =>
      currentGroups.map((group) => (group.id === groupId ? { ...group, name: name.trim() || "Untitled collection" } : group))
    );
    const group = groups.find((item) => item.id === groupId);
    await addEvent("group_renamed", group?.captureIds ?? [], { groupId });
  };

  const toggleGroup = (groupId: string) => {
    setGroups((currentGroups) =>
      currentGroups.map((group) => (group.id === groupId ? { ...group, collapsed: !group.collapsed } : group))
    );
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

  return (
    <>
      <style>{styles}</style>
      <aside className={["justsnap-rail", captureHidden ? "justsnap-hidden" : ""].join(" ")}>
        <div className="justsnap-rail-action justsnap-rail-action-top" aria-label="JustSnap capture control">
          <button title="Capture" onClick={beginCapture}>
            <Camera size={18} />
          </button>
        </div>

        {error && (
          <button className="justsnap-error-dot" title={error} onClick={() => setError("")}>
            !
          </button>
        )}

        <LibraryView
          captures={captures}
          groups={groups}
          ungroupedCaptures={ungroupedCaptures}
          blobCache={blobCache}
          recentlyAddedCaptureId={recentlyAddedCaptureId}
          dragging={dragging}
          onCopyCaptures={copyCaptures}
          onInsertCaptures={insertCapturesIntoPage}
          onDownloadCaptures={downloadCaptures}
          onStartDrag={startItemDrag}
          onEndDrag={finishItemDrag}
          onDropCapture={dropOnCapture}
          onDropGroup={dropOnGroup}
          onRenameGroup={renameGroup}
          onToggleGroup={toggleGroup}
          onRemoveGroup={removeGroup}
          onRemoveCapture={removeCapture}
        />

        <div className="justsnap-rail-action justsnap-rail-action-bottom" aria-label="JustSnap close control">
          <button title="Close JustSnap" onClick={unmountRail}>
            <X size={19} />
          </button>
        </div>
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

function LibraryView(props: {
  captures: Capture[];
  groups: CaptureGroup[];
  ungroupedCaptures: Capture[];
  blobCache: Record<string, Blob>;
  recentlyAddedCaptureId: string | null;
  dragging: InternalDrag | null;
  onCopyCaptures: (captureIds: string[], groupId?: string) => void;
  onInsertCaptures: (captureIds: string[], groupId?: string) => void;
  onDownloadCaptures: (captureIds: string[], groupId?: string) => void;
  onStartDrag: (event: React.DragEvent, drag: InternalDrag, captureIds: string[], groupId?: string) => void;
  onEndDrag: (event: React.DragEvent) => void;
  onDropCapture: (captureId: string) => void;
  onDropGroup: (groupId: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onToggleGroup: (groupId: string) => void;
  onRemoveGroup: (groupId: string) => void;
  onRemoveCapture: (captureId: string) => void;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [visibleStartIndex, setVisibleStartIndex] = useState(0);
  const libraryRef = useRef<HTMLDivElement | null>(null);
  const focusedIndex = hoveredIndex;
  const visibleGroups = props.groups
    .map((group) => ({
      group,
      captures: group.captureIds
        .map((captureId) => props.captures.find((capture) => capture.id === captureId))
        .filter((capture): capture is Capture => Boolean(capture))
    }))
    .filter((entry) => entry.captures.length > 0);
  const entries = [
    ...visibleGroups.map((entry) => ({ kind: "group" as const, ...entry })),
    ...props.ungroupedCaptures.map((capture) => ({ kind: "capture" as const, capture }))
  ];
  const visibleCount = visibleDockCount();
  const maxStartIndex = Math.max(0, entries.length - visibleCount);
  const visibleEntries = entries.slice(visibleStartIndex, visibleStartIndex + visibleCount);
  const shiftWindow = useCallback((direction: -1 | 1) => {
    setVisibleStartIndex((currentIndex) => clampIndex(currentIndex + direction, 0, maxStartIndex));
  }, [maxStartIndex]);
  useVirtualEdgeScroll(libraryRef, true, shiftWindow);
  useVirtualWheel(libraryRef, true, shiftWindow);

  useEffect(() => {
    if (!activeGroupId) return;
    const closeActiveGroup = (event: PointerEvent) => {
      const path = event.composedPath();
      if (libraryRef.current && path.includes(libraryRef.current)) return;
      setActiveGroupId(null);
      setHoveredIndex(null);
    };
    document.addEventListener("pointerdown", closeActiveGroup, true);
    return () => document.removeEventListener("pointerdown", closeActiveGroup, true);
  }, [activeGroupId]);

  useEffect(() => {
    setVisibleStartIndex((currentIndex) => clampIndex(currentIndex, 0, maxStartIndex));
  }, [maxStartIndex]);

  if (!props.captures.length) {
    return (
      <div className="justsnap-empty" title="Captured screenshots will appear here">
        <Files size={22} />
      </div>
    );
  }

  return (
    <div
      ref={libraryRef}
      className="justsnap-library"
      tabIndex={0}
      onMouseLeave={() => {
        if (!activeGroupId) setHoveredIndex(null);
      }}
    >
      {visibleEntries.map((entry, offset) => {
        const index = visibleStartIndex + offset;
        const edgeBias = dockEdgeBias(offset, visibleEntries.length);
        return (
        entry.kind === "group" ? (
          <GroupDockItem
            key={entry.group.id}
            index={index}
            group={entry.group}
            captures={entry.captures}
            blobCache={props.blobCache}
            focusedIndex={focusedIndex}
            active={activeGroupId === entry.group.id}
            setHoveredIndex={setHoveredIndex}
            onActivate={() => setActiveGroupId(entry.group.id)}
            onDragStart={(event) =>
              props.onStartDrag(event, { kind: "group", groupId: entry.group.id }, entry.captures.map((capture) => capture.id), entry.group.id)
            }
            onDragEnd={props.onEndDrag}
            onDrop={() => props.onDropGroup(entry.group.id)}
            onRemove={() => props.onRemoveGroup(entry.group.id)}
            onStartCaptureDrag={(event, capture) =>
              props.onStartDrag(event, { kind: "capture", captureId: capture.id }, [capture.id], capture.groupId)
            }
            onDropCapture={props.onDropCapture}
            onRemoveCapture={props.onRemoveCapture}
          />
        ) : (
          <CaptureDockItem
            key={entry.capture.id}
            index={index}
            capture={entry.capture}
            blobReady={Boolean(props.blobCache[entry.capture.id])}
            blob={props.blobCache[entry.capture.id]}
            isNew={props.recentlyAddedCaptureId === entry.capture.id}
            focusedIndex={focusedIndex}
            edgeBias={edgeBias}
            setHoveredIndex={setHoveredIndex}
            onHover={() => setActiveGroupId(null)}
            onDragStart={(event) =>
              props.onStartDrag(event, { kind: "capture", captureId: entry.capture.id }, [entry.capture.id], entry.capture.groupId)
            }
            onDragEnd={props.onEndDrag}
            onDrop={() => props.onDropCapture(entry.capture.id)}
            onRemove={() => props.onRemoveCapture(entry.capture.id)}
          />
        )
        );
      })}
    </div>
  );
}

function CaptureDockItem(props: {
  index: number;
  capture: Capture;
  blobReady: boolean;
  blob?: Blob;
  isNew?: boolean;
  focusedIndex: number | null;
  edgeBias?: DockEdgeBias;
  setHoveredIndex: (index: number | null) => void;
  onHover?: () => void;
  onDragStart: (event: React.DragEvent) => void;
  onDragEnd: (event: React.DragEvent) => void;
  onDrop: () => void;
  onRemove: () => void;
}) {
  const influence = dockInfluence(props.index, props.focusedIndex);
  const dimensions = dockImageDimensions(props.capture, influence, props.edgeBias);
  const slotHeight = dimensions.height + 10;
  const isFocused = props.focusedIndex === props.index;
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const previewSource = props.capture.fullDataUrl ?? blobUrl ?? props.capture.thumbnailDataUrl;

  useEffect(() => {
    if (!props.blob) {
      setBlobUrl(null);
      return;
    }
    const nextBlobUrl = URL.createObjectURL(props.blob);
    setBlobUrl(nextBlobUrl);
    return () => URL.revokeObjectURL(nextBlobUrl);
  }, [props.blob]);

  return (
    <div
      className={["justsnap-dock-slot", isFocused ? "justsnap-dock-slot-hovered" : ""].join(" ")}
      style={
        {
          width: dimensions.width,
          height: slotHeight,
          zIndex: Math.round(influence * 20),
          "--justsnap-dock-item-half": `${dimensions.height / 2}px`
        } as React.CSSProperties
      }
      onMouseEnter={() => {
        props.onHover?.();
        props.setHoveredIndex(props.index);
      }}
      onMouseLeave={() => props.setHoveredIndex(null)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        props.onDrop();
      }}
    >
      <button
        className={[
          "justsnap-dock-image-button",
          props.blobReady ? "" : "justsnap-card-loading",
          props.isNew ? "justsnap-dock-image-new justsnap-dock-image-added-focus" : ""
        ].join(" ")}
        style={{
          width: dimensions.width,
          height: dimensions.height
        }}
        aria-label="JustSnap capture"
        draggable={props.blobReady}
        onDragStart={props.onDragStart}
        onDragEnd={props.onDragEnd}
        onFocus={() => props.setHoveredIndex(props.index)}
        onBlur={() => props.setHoveredIndex(null)}
        onMouseEnter={() => {
          props.onHover?.();
          props.setHoveredIndex(props.index);
        }}
      >
        <img src={previewSource} alt="" />
      </button>
      {isFocused && (
        <button
          className="justsnap-dock-remove"
          aria-label="Remove capture"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            props.onRemove();
            props.setHoveredIndex(null);
          }}
        >
          <Trash2 size={14} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}

function GroupDockItem(props: {
  index: number;
  group: CaptureGroup;
  captures: Capture[];
  blobCache: Record<string, Blob>;
  focusedIndex: number | null;
  active: boolean;
  setHoveredIndex: (index: number | null) => void;
  onActivate: () => void;
  onDragStart: (event: React.DragEvent) => void;
  onDragEnd: (event: React.DragEvent) => void;
  onDrop: () => void;
  onRemove: () => void;
  onStartCaptureDrag: (event: React.DragEvent, capture: Capture) => void;
  onDropCapture: (captureId: string) => void;
  onRemoveCapture: (captureId: string) => void;
}) {
  const influence = props.active ? 1 : dockInfluence(props.index, props.focusedIndex);
  const size = dockFolderSize(influence);
  const slotHeight = size + 10;
  const isFocused = props.focusedIndex === props.index || props.active;
  const [flyoutFocusedIndex, setFlyoutFocusedIndex] = useState<number | null>(null);
  const [flyoutStartIndex, setFlyoutStartIndex] = useState(0);
  const flyoutRef = useRef<HTMLDivElement | null>(null);
  const flyoutVisibleCount = visibleDockCount();
  const flyoutMaxStartIndex = Math.max(0, props.captures.length - flyoutVisibleCount);
  const flyoutCaptures = props.captures.slice(flyoutStartIndex, flyoutStartIndex + flyoutVisibleCount);
  const shiftFlyoutWindow = useCallback((direction: -1 | 1) => {
    setFlyoutStartIndex((currentIndex) => clampIndex(currentIndex + direction, 0, flyoutMaxStartIndex));
  }, [flyoutMaxStartIndex]);
  useVirtualEdgeScroll(flyoutRef, props.active, shiftFlyoutWindow);
  useVirtualWheel(flyoutRef, props.active, shiftFlyoutWindow);

  useEffect(() => {
    setFlyoutStartIndex((currentIndex) => clampIndex(currentIndex, 0, flyoutMaxStartIndex));
  }, [flyoutMaxStartIndex]);

  return (
    <div
      className={["justsnap-dock-slot", "justsnap-dock-group-slot", isFocused ? "justsnap-dock-slot-hovered" : ""].join(" ")}
      style={
        {
          width: size,
          height: slotHeight,
          zIndex: Math.round(influence * 20),
          "--justsnap-dock-item-half": `${size / 2}px`
        } as React.CSSProperties
      }
      onMouseEnter={() => {
        props.onActivate();
        props.setHoveredIndex(props.index);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        props.onDrop();
      }}
    >
      <button
        className="justsnap-dock-folder-button"
        style={{ width: size, height: size }}
        aria-label={`${props.group.name}, ${props.captures.length} captures`}
        draggable={props.captures.every((capture) => props.blobCache[capture.id])}
        onDragStart={props.onDragStart}
        onDragEnd={props.onDragEnd}
        onFocus={() => props.setHoveredIndex(props.index)}
        onBlur={() => props.setHoveredIndex(null)}
        onMouseEnter={() => {
          props.onActivate();
          props.setHoveredIndex(props.index);
        }}
      >
        <span className="justsnap-folder-grid" aria-hidden="true">
          {props.captures.slice(0, 4).map((capture) => (
            <img key={capture.id} src={capture.thumbnailDataUrl} alt="" />
          ))}
        </span>
        <span className="justsnap-folder-count">{props.captures.length}</span>
      </button>
      {isFocused && (
        <>
          <button
            className="justsnap-dock-remove"
            aria-label="Remove group"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              props.onRemove();
              props.setHoveredIndex(null);
            }}
          >
            <Trash2 size={14} strokeWidth={2.2} />
          </button>
          <div
            ref={flyoutRef}
            className="justsnap-group-flyout"
            aria-label={`${props.group.name} captures`}
            onMouseLeave={() => setFlyoutFocusedIndex(null)}
          >
            {flyoutCaptures.map((capture, offset) => {
              const captureIndex = flyoutStartIndex + offset;
              const edgeBias = dockEdgeBias(offset, flyoutCaptures.length);
              return (
              <GroupFlyoutDockItem
                key={capture.id}
                index={captureIndex}
                capture={capture}
                blob={props.blobCache[capture.id]}
                blobReady={Boolean(props.blobCache[capture.id])}
                focusedIndex={flyoutFocusedIndex}
                edgeBias={edgeBias}
                setFocusedIndex={setFlyoutFocusedIndex}
                onDragStart={(event) => props.onStartCaptureDrag(event, capture)}
                onDragEnd={props.onDragEnd}
                onDrop={() => props.onDropCapture(capture.id)}
                onRemove={() => props.onRemoveCapture(capture.id)}
              />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function GroupFlyoutDockItem(props: {
  index: number;
  capture: Capture;
  blob?: Blob;
  blobReady: boolean;
  focusedIndex: number | null;
  edgeBias?: DockEdgeBias;
  setFocusedIndex: (index: number | null) => void;
  onDragStart: (event: React.DragEvent) => void;
  onDragEnd: (event: React.DragEvent) => void;
  onDrop: () => void;
  onRemove: () => void;
}) {
  const influence = dockInfluence(props.index, props.focusedIndex);
  const dimensions = dockImageDimensions(props.capture, influence, props.edgeBias);
  const slotHeight = dimensions.height + 10;
  const isFocused = props.focusedIndex === props.index;
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const previewSource = props.capture.fullDataUrl ?? blobUrl ?? props.capture.thumbnailDataUrl;

  useEffect(() => {
    if (!props.blob) {
      setBlobUrl(null);
      return;
    }
    const nextBlobUrl = URL.createObjectURL(props.blob);
    setBlobUrl(nextBlobUrl);
    return () => URL.revokeObjectURL(nextBlobUrl);
  }, [props.blob]);

  return (
    <div
      className={["justsnap-dock-slot", "justsnap-group-flyout-slot", isFocused ? "justsnap-dock-slot-hovered" : ""].join(" ")}
      style={
        {
          width: dimensions.width,
          height: slotHeight,
          zIndex: Math.round(influence * 20),
          "--justsnap-dock-item-half": `${dimensions.height / 2}px`
        } as React.CSSProperties
      }
      onMouseEnter={() => props.setFocusedIndex(props.index)}
      onMouseLeave={() => props.setFocusedIndex(null)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        props.onDrop();
      }}
    >
      <button
        className={["justsnap-dock-image-button", props.blobReady ? "" : "justsnap-card-loading"].join(" ")}
        style={{ width: dimensions.width, height: dimensions.height }}
        aria-label="Grouped JustSnap capture"
        draggable={props.blobReady}
        onDragStart={props.onDragStart}
        onDragEnd={props.onDragEnd}
        onFocus={() => props.setFocusedIndex(props.index)}
        onBlur={() => props.setFocusedIndex(null)}
        onMouseEnter={() => props.setFocusedIndex(props.index)}
      >
        <img src={previewSource} alt="" />
      </button>
      {isFocused && (
        <button
          className="justsnap-dock-remove"
          aria-label="Remove capture"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            props.onRemove();
            props.setFocusedIndex(null);
          }}
        >
          <Trash2 size={14} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}

function useVirtualEdgeScroll(
  ref: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  onStep: (direction: -1 | 1) => void
) {
  const frameRef = useRef<number | null>(null);
  const directionRef = useRef<-1 | 0 | 1>(0);
  const lastStepRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const element = ref.current;
    if (!element) return;

    const stop = () => {
      directionRef.current = 0;
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };

    const tick = () => {
      if (!directionRef.current) {
        frameRef.current = null;
        return;
      }
      const now = performance.now();
      if (now - lastStepRef.current > 160) {
        onStep(directionRef.current);
        lastStepRef.current = now;
      }
      frameRef.current = window.requestAnimationFrame(tick);
    };

    const start = () => {
      if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(tick);
    };

    const update = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      const visibleRailLeft = rect.right - 74;
      if (event.clientX < visibleRailLeft || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
        stop();
        return;
      }

      const zone = Math.min(76, rect.height / 3);
      const topDistance = event.clientY - rect.top;
      const bottomDistance = rect.bottom - event.clientY;

      if (topDistance < zone) {
        directionRef.current = -1;
        start();
        return;
      }

      if (bottomDistance < zone) {
        directionRef.current = 1;
        start();
        return;
      }

      stop();
    };

    document.addEventListener("pointermove", update, true);
    document.addEventListener("pointerleave", stop, true);
    document.addEventListener("pointercancel", stop, true);
    return () => {
      document.removeEventListener("pointermove", update, true);
      document.removeEventListener("pointerleave", stop, true);
      document.removeEventListener("pointercancel", stop, true);
      stop();
    };
  }, [enabled, ref, onStep]);
}

function useVirtualWheel(
  ref: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  onStep: (direction: -1 | 1) => void
) {
  useEffect(() => {
    if (!enabled) return;
    const element = ref.current;
    if (!element) return;

    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 4) return;
      event.preventDefault();
      onStep(event.deltaY > 0 ? 1 : -1);
    };

    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [enabled, ref, onStep]);
}

function dockImageDimensions(image: Capture, influence: number, edgeBias: DockEdgeBias = null): { width: number; height: number } {
  const base = 52;
  const neighborMax = Math.min(116, Math.max(92, window.innerHeight * 0.12));
  if (influence < 0.95) {
    const size = base + (neighborMax - base) * influence;
    return { width: size, height: size };
  }

  const aspect = image.width > 0 && image.height > 0 ? image.width / image.height : 1;
  const maxWidth = Math.max(180, Math.min(360, window.innerWidth - 112));
  const viewportMaxHeight = edgeBias ? window.innerHeight * 0.34 : window.innerHeight - 32;
  const maxHeight = Math.max(180, Math.min(320, viewportMaxHeight));
  let width = maxWidth;
  let height = width / aspect;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspect;
  }
  return { width, height };
}

function visibleDockCount(): number {
  const railHeight = Math.min(window.innerHeight * 0.8, window.innerHeight - 24);
  const libraryHeight = Math.max(260, railHeight - 116);
  const contentHeight = Math.max(0, libraryHeight - 32);
  const exactCount = (contentHeight + 12) / 76;
  const baseCount = Math.floor(exactCount);
  const remainder = exactCount - baseCount;
  return Math.max(3, baseCount + (remainder > 0.42 ? 1 : 0));
}

function clampIndex(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function dockInfluence(index: number, hoveredIndex: number | null): number {
  if (hoveredIndex === null) return 0;
  const distance = Math.abs(index - hoveredIndex);
  if (distance === 0) return 1;
  if (distance === 1) return 0.45;
  if (distance === 2) return 0.22;
  return 0;
}

function dockEdgeBias(offset: number, visibleLength: number): DockEdgeBias {
  if (offset === 0) return "top";
  if (offset === visibleLength - 1) return "bottom";
  return null;
}

function dockFolderSize(influence: number): number {
  const base = 52;
  const max = Math.min(116, Math.max(92, window.innerHeight * 0.12));
  return base + (max - base) * influence;
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

async function placeFilesInCurrentPage(
  files: File[],
  captures: Capture[],
  preferredTarget?: Element
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (currentOrigin().includes("web.whatsapp.com")) {
    const whatsappFiles = await prepareFilesForWhatsApp(files);
    const whatsappAttached = await attachFilesViaWhatsApp(whatsappFiles, preferredTarget);
    if (whatsappAttached) return { ok: true };
    return {
      ok: false,
      error: "WhatsApp did not accept the image through its attachment input."
    };
  }

  const fileInput = findAttachmentInput(preferredTarget);
  if (fileInput) {
    const assigned = await withInsertionSignal(() => assignFilesToInput(fileInput, files));
    if (assigned) return { ok: true };
  }

  const target = resolveInsertTarget(preferredTarget);
  if (target) {
    target.focus();
    await nextAnimationFrame();
    const pasted = await withInsertionSignal(() => dispatchPasteWithFiles(target, files, captures));
    const dropped = pasted || (await withInsertionSignal(() => dispatchDropWithFiles(target, files, captures)));
    if (pasted || dropped) return { ok: true };
  }

  const fallbackTarget = findPageInsertTarget();
  if (!fallbackTarget) {
    return {
      ok: false,
      error: "Could not find an active message field or attachment input on this page."
    };
  }

  fallbackTarget.focus();
  await nextAnimationFrame();

  const pasted = await withInsertionSignal(() => dispatchPasteWithFiles(fallbackTarget, files, captures));
  const dropped = pasted || (await withInsertionSignal(() => dispatchDropWithFiles(fallbackTarget, files, captures)));
  if (pasted || dropped) return { ok: true };

  return {
    ok: false,
    error: "This page ignored the image insert. Try the paperclip/plus attachment button or press Cmd+V after dragging."
  };
}

async function attachFilesViaWhatsApp(files: File[], preferredTarget?: Element): Promise<boolean> {
  const existingInput = findWhatsAppPhotoInput(preferredTarget);
  if (existingInput) {
    const assigned = await withInsertionSignal(() => assignFilesToInput(existingInput, files), 2200);
    if (assigned) return true;
  }

  const attachButton = findWhatsAppAttachButton();
  if (!attachButton) return false;

  attachButton.click();
  await sleep(250);
  const openedInput = await waitForWhatsAppPhotoInput(1600, preferredTarget);
  if (!openedInput) return false;

  return withInsertionSignal(() => assignFilesToInput(openedInput, files), 2600);
}

async function prepareFilesForWhatsApp(files: File[]): Promise<File[]> {
  return Promise.all(files.map((file) => padWideImageForWhatsApp(file)));
}

async function padWideImageForWhatsApp(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  let image: CaptureImage | undefined;
  try {
    image = await loadImage(url);
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
  const ratio = image.width / image.height;
  if (ratio <= WHATSAPP_WIDE_IMAGE_RATIO) return file;

  const size = image.width;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return file;

  const top = Math.round((size - image.height) / 2);
  const bitmap = await loadBitmap(file);
  context.fillStyle = await sampledEdgeColor(bitmap);
  context.fillRect(0, 0, size, size);
  context.drawImage(bitmap, 0, top, image.width, image.height);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
  const blob = await canvasToBlob(canvas);
  return new File([blob], file.name.replace(/\.png$/i, "-whatsapp.png"), { type: "image/png" });
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

async function sampledEdgeColor(bitmap: ImageBitmap): Promise<string> {
  const sample = document.createElement("canvas");
  sample.width = 1;
  sample.height = 1;
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context) return "transparent";
  context.drawImage(bitmap, 0, 0, bitmap.width, 1, 0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  if (alpha === 0) return "transparent";
  return `rgb(${red}, ${green}, ${blue})`;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not prepare WhatsApp image."));
    }, "image/png");
  });
}

function findWhatsAppAttachButton(): HTMLElement | undefined {
  const selectors = [
    'button[aria-label*="Attach" i]',
    'div[role="button"][aria-label*="Attach" i]',
    'button[title*="Attach" i]',
    'span[data-icon="plus"]',
    'span[data-icon="attach-menu-plus"]',
    'span[data-icon="clip"]'
  ];
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);
    const clickable = element?.closest<HTMLElement>('button, [role="button"]') ?? element;
    if (clickable && !isJustSnapNode(clickable) && isVisibleElement(clickable)) return clickable;
  }

  const footerButtons = Array.from(document.querySelectorAll<HTMLElement>('footer button, footer [role="button"]'));
  return footerButtons.find((button) => !isJustSnapNode(button) && isVisibleElement(button));
}

async function waitForWhatsAppPhotoInput(timeoutMs: number, nearTarget?: Element): Promise<HTMLInputElement | undefined> {
  const existing = findWhatsAppPhotoInput(nearTarget);
  if (existing) return existing;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await sleep(100);
    const input = findWhatsAppPhotoInput(nearTarget);
    if (input) return input;
  }
  return undefined;
}

function findWhatsAppPhotoInput(nearTarget?: Element): HTMLInputElement | undefined {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  const pageInputs = inputs.filter((input) => !isJustSnapNode(input));
  const imageInputs = pageInputs.filter(isWhatsAppPhotoVideoInput);
  const nearDialog = nearTarget?.closest('[role="dialog"], footer, main');
  if (nearDialog) {
    const nearby = imageInputs.find((input) => nearDialog.contains(input));
    if (nearby) return nearby;
  }
  return imageInputs[0];
}

function isWhatsAppPhotoVideoInput(input: HTMLInputElement): boolean {
  const accept = input.accept.toLowerCase();
  if (!accept) return false;
  const supportsRasterImage =
    accept.includes("image/*") || accept.includes("image/jpeg") || accept.includes("image/jpg") || accept.includes("image/png");
  const supportsVideo = accept.includes("video/");
  const looksStickerOnly = accept.includes("webp") && !supportsVideo && !accept.includes("jpeg") && !accept.includes("jpg") && !accept.includes("png");
  return supportsRasterImage && !looksStickerOnly;
}

function resolveInsertTarget(target: Element | undefined): HTMLElement | undefined {
  if (!target || isJustSnapNode(target)) return undefined;
  if (target instanceof HTMLElement && isEditableTarget(target)) return target;
  const closestEditable = target.closest<HTMLElement>(
    '[contenteditable="true"], textarea, input, [role="textbox"], canvas, [data-testid*="canvas"], [class*="canvas"]'
  );
  if (closestEditable && !isJustSnapNode(closestEditable) && isVisibleElement(closestEditable)) return closestEditable;
  if (target instanceof HTMLElement && isVisibleElement(target)) return target;
  return undefined;
}

function findAttachmentInput(nearTarget?: Element): HTMLInputElement | undefined {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  const pageInputs = inputs.filter((input) => !isJustSnapNode(input));
  const nearForm = nearTarget?.closest("form");
  const nearbyInputs =
    nearForm instanceof HTMLFormElement
      ? pageInputs.filter((input) => nearForm.contains(input))
      : [];
  const imageInputs = pageInputs.filter((input) => {
    const accept = input.accept.toLowerCase();
    return accept.includes("image") || accept.includes("png") || accept.includes("jpeg") || accept.includes("jpg");
  });
  const nearbyImageInputs = nearbyInputs.filter((input) => imageInputs.includes(input));
  if (nearbyImageInputs[0]) return nearbyImageInputs[0];
  if (nearbyInputs[0]) return nearbyInputs[0];
  return imageInputs[0] ?? pageInputs[0];
}

function assignFilesToInput(input: HTMLInputElement, files: File[]): boolean {
  try {
    input.value = "";
    input.files = filesToTransfer(files).files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  } catch {
    return false;
  }
}

function findPageInsertTarget(): HTMLElement | undefined {
  const active = document.activeElement;
  if (active instanceof HTMLElement && !isJustSnapNode(active) && isEditableTarget(active)) return active;

  const selectors = [
    'footer [contenteditable="true"][role="textbox"]',
    '[contenteditable="true"][aria-placeholder]',
    '[contenteditable="true"][data-tab]',
    '[contenteditable="true"][role="textbox"]',
    'textarea',
    '[contenteditable="true"]'
  ];
  for (const selector of selectors) {
    const match = Array.from(document.querySelectorAll<HTMLElement>(selector)).find(
      (element) => !isJustSnapNode(element) && isVisibleElement(element)
    );
    if (match) return match;
  }
  return document.body;
}

function isEditableTarget(element: HTMLElement): boolean {
  return element.isContentEditable || element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement;
}

function dispatchPasteWithFiles(target: HTMLElement, files: File[], _captures: Capture[]): boolean {
  try {
    const transfer = filesToTransfer(files);
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer
    });
    return !target.dispatchEvent(event) || event.defaultPrevented;
  } catch {
    return false;
  }
}

function dispatchDropWithFiles(target: HTMLElement, files: File[], _captures: Capture[]): boolean {
  try {
    const transfer = filesToTransfer(files);
    let accepted = false;
    for (const type of ["dragenter", "dragover", "drop"]) {
      const event = new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer
      });
      const dispatched = target.dispatchEvent(event);
      accepted = accepted || !dispatched || event.defaultPrevented;
    }
    return accepted;
  } catch {
    return false;
  }
}

async function withInsertionSignal(action: () => boolean | Promise<boolean>, timeoutMs = 1200): Promise<boolean> {
  let changed = false;
  const observer = new MutationObserver((records) => {
    if (records.some((record) => !isJustSnapNode(record.target))) changed = true;
  });
  observer.observe(document.body, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true
  });
  try {
    const attempted = await action();
    if (!attempted) return false;
    await sleep(timeoutMs);
    return changed;
  } finally {
    observer.disconnect();
  }
}

async function copyFilesToClipboard(files: File[]): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return;
  try {
    const items = files.map((file) => new ClipboardItem({ [file.type || "image/png"]: file }));
    await navigator.clipboard.write(items);
  } catch {
    // Drag-to-paste still tries synthetic paste/drop when clipboard writes are blocked.
  }
}

function filesToTransfer(files: File[]): DataTransfer {
  const transfer = new DataTransfer();
  files.forEach((file) => transfer.items.add(file));
  return transfer;
}

function isVisibleElement(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function sendBackground<T = unknown>(request: BackgroundRequest): Promise<T> {
  const response = await chrome.runtime.sendMessage<BackgroundRequest, BackgroundResponse<T>>(request);
  if (!response?.ok) throw new Error(response?.error ?? "JustSnap request failed.");
  return response.data;
}

async function loadImage(dataUrl: string): Promise<CaptureImage> {
  const image = new window.Image();
  image.src = dataUrl;
  await image.decode();
  return { dataUrl, width: image.naturalWidth, height: image.naturalHeight };
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

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64 = ""] = dataUrl.split(",");
  const contentType = header.match(/data:(.*?);base64/)?.[1] ?? "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: contentType });
}

function captureFileForDrag(capture: Capture, blob: Blob | undefined, index: number): File | undefined {
  const imageBlob = blob ?? (capture.fullDataUrl ? dataUrlToBlob(capture.fullDataUrl) : undefined);
  if (!imageBlob) return undefined;
  return new File([imageBlob], fileNameForCapture(capture, index), { type: "image/png" });
}

function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileNameForCapture(capture: Capture, index: number): string {
  const base = (capture.pageTitle || capture.sourceOrigin || "justsnap")
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${base || "justsnap"}-${index + 1}.png`;
}

function dragPreviewElement(target: EventTarget): Element | undefined {
  if (!(target instanceof Element)) return undefined;
  return target.querySelector("img") ?? target;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const styles = `
  :host, * { box-sizing: border-box; }
  button, input { font: inherit; }
  .justsnap-hidden { opacity: 0 !important; pointer-events: none !important; }
  .justsnap-rail {
    position: fixed;
    top: 50%;
    right: 0;
    z-index: 2147483646;
    width: 74px;
    height: 80vh;
    max-height: calc(100vh - 24px);
    display: flex;
    flex-direction: column;
    color: #172033;
    background: #f6f9fc;
    border: 1px solid #d8e0eb;
    border-left: 1px solid #d8e0eb;
    border-right: 0;
    border-radius: 14px 0 0 14px;
    box-shadow: -10px 0 28px rgba(15, 23, 42, 0.10);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    overflow: visible;
    translate: 0 -50%;
  }
  .justsnap-rail-action {
    position: relative;
    z-index: 20;
    flex: 0 0 auto;
    height: 58px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fff;
  }
  .justsnap-rail-action-top {
    border-bottom: 1px solid #e2e8f0;
    border-radius: 14px 0 0 0;
  }
  .justsnap-rail-action-bottom {
    border-top: 1px solid #e2e8f0;
    border-radius: 0 0 0 14px;
  }
  .justsnap-rail button {
    width: 32px;
    min-width: 32px;
    height: 32px;
    border: 0;
    border-radius: 7px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #24324a;
    background: transparent;
    cursor: pointer;
  }
  .justsnap-rail button:hover:not(:disabled) { background: #f1f5f9; }
  .justsnap-rail button:disabled { opacity: 0.45; cursor: not-allowed; }
  .justsnap-error-dot {
    position: absolute;
    top: 62px;
    left: 50%;
    translate: -50% 0;
    width: 22px !important;
    min-width: 22px !important;
    height: 22px !important;
    border-radius: 999px !important;
    color: #8f1f1f;
    background: #fff2f2;
    box-shadow: inset 0 0 0 1px #fac5c5;
    font-size: 12px;
    font-weight: 800;
    z-index: 3;
  }
  .justsnap-empty {
    margin: 18px auto;
    width: 52px;
    height: 52px;
    border: 1px dashed #c8d3e0;
    border-radius: 10px;
    display: grid;
    place-items: center;
    color: #66768a;
    background: rgba(255,255,255,0.74);
  }
  .justsnap-library {
    position: relative;
    flex: 1;
    align-self: flex-end;
    width: min(380px, calc(100vw - 16px));
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: flex-end;
    overflow: visible;
    padding: 16px 9px 16px 0;
    background: linear-gradient(to right, transparent 0 calc(100% - 74px), #f6f9fc calc(100% - 74px) 100%);
    outline: none;
    pointer-events: auto;
  }
  .justsnap-activity {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0 12px 18px;
  }
  .justsnap-dock-slot {
    position: relative;
    width: 52px;
    height: 64px;
    flex: 0 0 auto;
    transition: width 120ms ease-out, height 120ms ease-out;
    overflow: visible;
  }
  .justsnap-dock-image-button {
    position: absolute;
    top: 50%;
    right: 0;
    z-index: 1;
    width: 52px;
    height: 52px;
    border: 2px solid transparent;
    border-radius: 8px;
    padding: 0;
    overflow: hidden;
    background: #e8eef5;
    cursor: grab;
    transform-origin: center right;
    translate: 0 -50%;
    transition: width 120ms ease-out, height 120ms ease-out, border-color 150ms ease, box-shadow 150ms ease;
    will-change: width, height;
  }
  .justsnap-dock-image-new {
    animation: justsnap-capture-added 520ms cubic-bezier(0.18, 0.9, 0.22, 1.18);
  }
  .justsnap-dock-image-added-focus {
    border-color: #0ea5e9;
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.22), 0 10px 24px rgba(15, 32, 48, 0.24);
    z-index: 3;
  }
  @keyframes justsnap-capture-added {
    0% { scale: 0.72; opacity: 0.35; }
    58% { scale: 1.12; opacity: 1; }
    100% { scale: 1; opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .justsnap-dock-image-new { animation: none; }
  }
  .justsnap-dock-image-button:hover,
  .justsnap-dock-image-button:focus-visible {
    border-color: #0ea5e9;
    box-shadow: 0 10px 24px rgba(15, 32, 48, 0.24);
    z-index: 2;
  }
  .justsnap-dock-image-button:active { cursor: grabbing; }
  .justsnap-dock-folder-button {
    position: absolute;
    top: 50%;
    right: 0;
    z-index: 1;
    width: 52px;
    height: 52px;
    border: 2px solid transparent !important;
    border-radius: 15px !important;
    padding: 6px !important;
    overflow: hidden;
    background: linear-gradient(135deg, rgba(255,255,255,0.86), rgba(226,232,240,0.88)) !important;
    box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.32);
    cursor: grab;
    transform-origin: center right;
    translate: 0 -50%;
    transition: width 120ms ease-out, height 120ms ease-out, border-color 150ms ease, box-shadow 150ms ease;
    will-change: width, height;
  }
  .justsnap-dock-folder-button:hover,
  .justsnap-dock-folder-button:focus-visible {
    border-color: #0ea5e9 !important;
    box-shadow: 0 10px 24px rgba(15, 32, 48, 0.24), inset 0 0 0 1px rgba(148, 163, 184, 0.32);
    z-index: 2;
  }
  .justsnap-dock-folder-button:active { cursor: grabbing; }
  .justsnap-folder-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: 4px;
    width: 100%;
    height: 100%;
  }
  .justsnap-folder-grid img {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    border-radius: 9px;
    object-fit: cover;
    display: block;
    background: #fff;
  }
  .justsnap-folder-count {
    position: absolute;
    right: 5px;
    bottom: 5px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    background: rgba(15, 23, 42, 0.78);
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.24);
    font-size: 10px;
    font-weight: 800;
    line-height: 1;
  }
  .justsnap-dock-image-button img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    background: #f7f9fc;
    image-rendering: auto;
  }
  .justsnap-dock-remove {
    position: absolute;
    top: calc(50% - var(--justsnap-dock-item-half, 26px) + 7px);
    right: 7px;
    z-index: 5;
    width: 24px !important;
    min-width: 24px !important;
    height: 24px !important;
    border: 1px solid rgba(20, 32, 48, 0.12) !important;
    border-radius: 999px !important;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #243449;
    background: rgba(255,255,255,0.9) !important;
    box-shadow: 0 6px 14px rgba(15, 32, 48, 0.18);
    cursor: pointer;
    line-height: 0;
  }
  .justsnap-dock-remove:hover {
    color: #b42318;
    background: #fff !important;
  }
  .justsnap-dock-remove svg {
    display: block;
    flex: 0 0 auto;
  }
  .justsnap-group-flyout {
    position: absolute;
    top: 50%;
    right: calc(100% + 8px);
    z-index: 4;
    width: min(380px, calc(100vw - 120px));
    max-height: min(420px, calc(100vh - 28px));
    padding: 10px 9px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-end;
    overflow: visible;
    background: transparent;
    translate: 0 -50%;
  }
  .justsnap-group-flyout::before {
    content: "";
    position: absolute;
    inset: 0 0 0 auto;
    z-index: 0;
    width: 74px;
    border: 1px solid #d8e0eb;
    border-right: 0;
    border-radius: 14px 0 0 14px;
    background: #f6f9fc;
    pointer-events: none;
  }
  .justsnap-group-flyout > * {
    position: relative;
    z-index: 1;
  }
  .justsnap-group-flyout-slot { flex: 0 0 auto; }
  .justsnap-card-loading { cursor: wait; opacity: 0.78; }
  .justsnap-activity { display: grid; gap: 8px; align-content: start; }
  .justsnap-activity article {
    padding: 10px;
    border: 1px solid #dde6f0;
    border-radius: 8px;
    display: grid;
    gap: 3px;
    background: #fff;
  }
  .justsnap-activity article strong { font-size: 12px; }
  .justsnap-activity article span, .justsnap-activity article small { font-size: 11px; }
  .justsnap-capture-layer {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    cursor: crosshair;
    background: rgba(7, 14, 24, 0.24);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .justsnap-capture-toolbar {
    position: fixed;
    top: 14px;
    left: 50%;
    translate: -50% 0;
    min-height: 42px;
    padding: 6px 8px 6px 14px;
    border: 1px solid rgba(255,255,255,0.22);
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: #fff;
    background: rgba(15, 23, 42, 0.9);
    box-shadow: 0 14px 30px rgba(0,0,0,0.24);
  }
  .justsnap-capture-toolbar button {
    width: 30px;
    height: 30px;
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 7px;
    color: #fff;
    background: rgba(255,255,255,0.08);
    cursor: pointer;
  }
  .justsnap-selection {
    position: fixed;
    border: 2px solid #45a6ff;
    background: rgba(69, 166, 255, 0.12);
    box-shadow: 0 0 0 9999px rgba(7, 14, 24, 0.34);
  }
`;
