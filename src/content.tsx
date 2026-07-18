import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { arrayMove } from "@dnd-kit/sortable";
import {
  Camera,
  Settings,
  ListChecks,
  Check,
  CornerDownLeft,
  X
} from "lucide-react";
import { deleteImageBlob, getImageBlob } from "../shared/blobStore";
import { dockLayoutForCount } from "./content/dockLayout";
import { captureFileForDrag, copyFilesToClipboard, dragPreviewElement } from "./content/drag/filePayload";
import { placeFilesInCurrentPage } from "./content/drag/pageInsert";
import { dataUrlToBlob } from "./content/imageTools";
import { LibraryView } from "./content/rail/LibraryView";
import { styles } from "./content/styles";
import type { DragPayload, InternalDrag, Point, RailDropIntent, Rect } from "./content/types";
import type {
  ActivityEvent,
  BackgroundRequest,
  BackgroundResponse,
  Capture,
  CaptureAddTarget,
  CaptureGroup,
  CaptureSelectionResult,
  CaptureSessionSnapshot,
  ContentMessage,
  LibraryState,
  PendingUsage,
  RailOrderItem
} from "../shared/types";

const PENDING_USAGE_MS = 2 * 60 * 1000;
const MIN_SELECTION_WIDTH = 32;
const MIN_SELECTION_HEIGHT = 32;
const RAIL_CONTROL_ENTRY_COUNT = 4;

type DockInputMode = "dock" | "snip";

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

installDestinationDetector();

chrome.runtime.onMessage.addListener((message: ContentMessage) => {
  if (message.type === "JUSTSNAP_SHOW_RAIL") mountRail();
  if (message.type === "JUSTSNAP_START_CAPTURE") mountRail(message);
  if (message.type === "JUSTSNAP_CLOSE_RAIL") unmountRail();
  if (message.type === "JUSTSNAP_CAPTURE_ERROR") alert(`DockSnip could not capture: ${message.error}`);
});

type ContentCommand =
  | { id: number; type: "start_capture"; session: CaptureSessionSnapshot };

type PageImageAffordance = {
  imageUrl: string;
  rect: Rect;
  status: "idle" | "saving" | "saved";
};

let commandId = 0;

function mountRail(message?: Extract<ContentMessage, { type: "JUSTSNAP_START_CAPTURE" }>) {
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
  root?.render(
    <DockSnipApp
      command={message ? { id: ++commandId, type: "start_capture", session: message } : undefined}
    />
  );
}

function unmountRail() {
  root?.unmount();
  host?.remove();
  root = undefined;
  host = undefined;
}

function DockSnipApp({ command }: { command?: ContentCommand }) {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [groups, setGroups] = useState<CaptureGroup[]>([]);
  const [railOrder, setRailOrder] = useState<RailOrderItem[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [inputMode, setInputMode] = useState<DockInputMode>("dock");
  const [captureHidden, setCaptureHidden] = useState(false);
  const [captureSession, setCaptureSession] = useState<CaptureSessionSnapshot | null>(null);
  const [activeAddTarget, setActiveAddTarget] = useState<CaptureAddTarget | null>(null);
  const [pendingAddCaptureIds, setPendingAddCaptureIds] = useState<string[]>([]);
  const [railInteractionActive, setRailInteractionActive] = useState(false);
  const [start, setStart] = useState<Point | null>(null);
  const [current, setCurrent] = useState<Point | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState<InternalDrag | null>(null);
  const [blobCache, setBlobCache] = useState<Record<string, Blob>>({});
  const [recentlyAddedCaptureId, setRecentlyAddedCaptureId] = useState<string | null>(null);
  const hasLoggedOpen = useRef(false);
  const pendingDragPayload = useRef<DragPayload | null>(null);
  const lastDragPoint = useRef<Point | null>(null);
  const pageImageTarget = useRef<HTMLImageElement | null>(null);
  const captureSessionRef = useRef<CaptureSessionSnapshot | null>(null);
  const captureSessionPromiseRef = useRef<Promise<CaptureSessionSnapshot> | null>(null);
  const [pageImageAffordance, setPageImageAffordance] = useState<PageImageAffordance | null>(null);
  const captureMode = inputMode === "snip";

  const refreshLibrary = useCallback(async () => {
    const library = await sendBackground<LibraryState>({ type: "JUSTSNAP_GET_LIBRARY" });
    setCaptures(library.captures);
    setGroups(library.groups);
    setRailOrder(library.railOrder);
    setEvents(library.events);
    setLoaded(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    refreshLibrary()
      .then(() => {
        if (cancelled) return;
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
      library: { captures, groups, railOrder, events }
    }).catch(() => undefined);
  }, [captures, events, groups, loaded, railOrder]);

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

  useEffect(() => {
    captureSessionRef.current = captureSession;
  }, [captureSession]);

  const activeRect = useMemo(() => {
    if (!start || !current) return null;
    return normalizeRect(start, current);
  }, [current, start]);

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

  const captureSelection = async (rect: Rect, sessionId = captureSessionRef.current?.sessionId) => {
    setCaptureHidden(true);
    await nextAnimationFrame();
    try {
      return await sendBackground<CaptureSelectionResult>({
        type: "JUSTSNAP_CAPTURE_SELECTION",
        sessionId,
        rect,
        viewport: viewportMetrics(),
        sourceUrl: window.location.href,
        sourceOrigin: currentOrigin(),
        pageTitle: document.title || currentOrigin()
      });
    } finally {
      setCaptureHidden(false);
    }
  };

  const beginCapture = async (session: CaptureSessionSnapshot) => {
    try {
      setError("");
      setCaptureSession(session);
      captureSessionRef.current = session;
      setActiveAddTarget(session.addTarget ?? null);
      setPendingAddCaptureIds(session.addTarget ? session.captureIds : []);
      setInputMode("snip");
      setStart(null);
      setCurrent(null);
      await addEvent("capture_started", [], { sourceOrigin: currentOrigin() });
    } catch (captureError) {
      setError(errorText(captureError));
    } finally {
      setCaptureHidden(false);
    }
  };

  const startAddMode = async (addTarget: CaptureAddTarget) => {
    setError("");
    if (captureSessionRef.current) {
      await finishSnipSession({ keepDestination: false });
    }
    setActiveAddTarget(addTarget);
    setInputMode("dock");
    setPendingAddCaptureIds([]);
    setStart(null);
    setCurrent(null);
  };

  const activateDockMode = async () => {
    setError("");
    if (captureSessionRef.current) {
      await finishSnipSession({ keepDestination: true });
      return;
    }
    setInputMode("dock");
    setStart(null);
    setCurrent(null);
  };

  const activateSnipMode = async () => {
    setError("");
    setInputMode("snip");
    setStart(null);
    setCurrent(null);
    const addTarget = activeAddTarget ?? undefined;
    const existingSession = captureSessionRef.current;
    if (existingSession && sameAddTarget(existingSession.addTarget, addTarget)) return;

    const sessionPromise = sendBackground<CaptureSessionSnapshot>({
      type: "JUSTSNAP_PREPARE_CAPTURE_SESSION",
      addTarget
    });
    captureSessionPromiseRef.current = sessionPromise;
    try {
      const session = await sessionPromise;
      if (captureSessionPromiseRef.current !== sessionPromise) return;
      captureSessionPromiseRef.current = null;
      setCaptureSession(session);
      captureSessionRef.current = session;
      setPendingAddCaptureIds(session.captureIds);
      await addEvent("capture_started", [], { sourceOrigin: currentOrigin() });
    } catch (captureError) {
      if (captureSessionPromiseRef.current !== sessionPromise) return;
      captureSessionPromiseRef.current = null;
      setInputMode("dock");
      setStart(null);
      setCurrent(null);
      setError(errorText(captureError));
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
    if (!start || !current) return;
    const rect = normalizeRect(start, current);
    setStart(null);
    setCurrent(null);
    if (rect.width < MIN_SELECTION_WIDTH || rect.height < MIN_SELECTION_HEIGHT) {
      setError("Select a larger area.");
      return;
    }

    try {
      let session = captureSessionRef.current;
      if (!session && captureSessionPromiseRef.current) {
        session = await captureSessionPromiseRef.current;
        captureSessionPromiseRef.current = null;
        setCaptureSession(session);
      }
      const result = await captureSelection(rect, session?.sessionId);
      const addTarget = result.session?.addTarget ?? session?.addTarget ?? activeAddTarget;
      const blob = result.capture.fullDataUrl
        ? await dataUrlToBlob(result.capture.fullDataUrl)
        : await getImageBlob(result.capture.imageBlobKey);
      setCaptures((currentCaptures) => [result.capture, ...currentCaptures.filter((capture) => capture.id !== result.capture.id)]);
      if (addTarget) {
        setPendingAddCaptureIds((currentIds) => [...currentIds.filter((id) => id !== result.capture.id), result.capture.id]);
      } else {
        setRailOrder((currentOrder) => prependRailItem(currentOrder, { kind: "capture", id: result.capture.id }));
      }
      setEvents((currentEvents) =>
        [
          ...currentEvents,
          {
            id: crypto.randomUUID(),
            type: "capture_created" as const,
            createdAt: Date.now(),
            captureIds: [result.capture.id],
            sourceOrigin: result.capture.sourceOrigin
          }
        ].slice(-500)
      );
      if (blob) setBlobCache((currentCache) => ({ ...currentCache, [result.capture.id]: blob }));
      setRecentlyAddedCaptureId(result.capture.id);

      const nextSession = result.session ?? session ?? captureSession;
      setCaptureSession(nextSession);
      captureSessionRef.current = nextSession;
      setStart(null);
      setCurrent(null);
      setError("");
    } catch (selectionError) {
      setError(errorText(selectionError));
    }
  };

  const resetCaptureState = (options: { keepAddTarget?: boolean } = {}) => {
    setInputMode("dock");
    setCaptureSession(null);
    captureSessionRef.current = null;
    setPendingAddCaptureIds([]);
    setStart(null);
    setCurrent(null);
    captureSessionPromiseRef.current = null;
    if (!options.keepAddTarget) setActiveAddTarget(null);
  };

  const finishSnipSession = async ({ keepDestination }: { keepDestination: boolean }) => {
    let session = captureSessionRef.current;
    if (!session && captureSessionPromiseRef.current) {
      try {
        session = await captureSessionPromiseRef.current;
      } catch {
        session = null;
      }
    }
    const previousTarget = activeAddTarget;
    setInputMode("dock");
    setStart(null);
    setCurrent(null);
    setCaptureHidden(false);
    if (!session) {
      if (!keepDestination) setActiveAddTarget(null);
      return;
    }
    setCaptureSession(null);
    captureSessionRef.current = null;
    captureSessionPromiseRef.current = null;
    await sendBackground({ type: "JUSTSNAP_FINISH_CAPTURE_SESSION", sessionId: session.sessionId }).catch((finishError) =>
      setError(errorText(finishError))
    );
    const library = await sendBackground<LibraryState>({ type: "JUSTSNAP_GET_LIBRARY" }).catch((refreshError) => {
      setError(errorText(refreshError));
      return null;
    });
    if (library) {
      setCaptures(library.captures);
      setGroups(library.groups);
      setRailOrder(library.railOrder);
      setEvents(library.events);
      if (keepDestination && previousTarget?.kind === "capture") {
        const createdGroup = library.groups.find((group) => group.captureIds.includes(previousTarget.id));
        if (createdGroup) setActiveAddTarget({ kind: "group", id: createdGroup.id });
      }
    }
    setPendingAddCaptureIds([]);
    if (!keepDestination) setActiveAddTarget(null);
  };

  const finishDestination = async () => {
    await finishSnipSession({ keepDestination: false });
    setActiveAddTarget(null);
    setInputMode("dock");
  };

  useEffect(() => {
    if (command?.type === "start_capture") void beginCapture(command.session);
  }, [command?.id]);

  useEffect(() => {
    const finishOnShortcut = (event: KeyboardEvent) => {
      if (event.key !== "Escape" && event.key !== "Enter") return;
      if (event.key === "Escape") {
        if (captureMode) {
          event.preventDefault();
          event.stopPropagation();
          void activateDockMode();
        } else if (activeAddTarget) {
          event.preventDefault();
          event.stopPropagation();
          void finishDestination();
        }
        return;
      }
      if (!captureMode && !activeAddTarget) return;
      event.preventDefault();
      event.stopPropagation();
      if (activeAddTarget) void finishDestination();
      else void activateDockMode();
    };
    document.addEventListener("keydown", finishOnShortcut, true);
    return () => document.removeEventListener("keydown", finishOnShortcut, true);
  }, [activeAddTarget, captureMode, captureSession]);

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
      .map((capture) => captureFileForDrag(capture, blobCache[capture.id]))
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

    files.forEach((file) => {
      if (!transfer.items) return;
      try {
        transfer.items.add(file);
      } catch {
        // Some targets/browsers reject adding files to DataTransfer.
      }
    });

    const dragImage = dragPreviewElement(event.currentTarget, drag.kind);
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
    if (!target || isDockSnipNode(target)) return;

    const result = await placeFilesInCurrentPage(payload.files, payload.captures, { currentOrigin, isDockSnipNode }, target);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await recordUsage("drag", payload.captureIds, payload.groupId ? "group_inserted" : "capture_inserted", payload.groupId);
  };

  const applyRailDropIntent = async (intent: RailDropIntent) => {
    if (!dragging) return;
    pendingDragPayload.current = null;
    setDragging(null);

    if (intent.scope === "rail" && (intent.action === "insert-before" || intent.action === "insert-after")) {
      const item = dragToRailItem(dragging);
      if (!item) return;
      if (dragging.kind === "capture") {
        ungroupCapture(dragging.captureId);
        setRailOrder((currentOrder) => moveRailItem(currentOrder, item, intent.target, intent.action));
      } else {
        setRailOrder((currentOrder) => moveRailItem(currentOrder, item, intent.target, intent.action));
      }
      await addEvent("rail_reordered", dragging.kind === "capture" ? [dragging.captureId] : [], {
        groupId: dragging.kind === "group" ? dragging.groupId : undefined,
        sourceOrigin: currentOrigin()
      });
      return;
    }

    if (intent.scope === "rail" && intent.action === "create-folder") {
      if (dragging.kind !== "capture") return;
      await createOrUpdateGroup(dragging.captureId, intent.target.id);
      return;
    }

    if (intent.scope === "rail" && intent.action === "add-to-folder") {
      if (dragging.kind !== "capture") return;
      await addCaptureToGroup(dragging.captureId, intent.target.id);
      return;
    }

    if (intent.scope === "folder" && (intent.action === "insert-before" || intent.action === "insert-after")) {
      if (dragging.kind !== "capture") return;
      await moveCaptureIntoGroup(dragging.captureId, intent.groupId, intent.targetCaptureId, intent.action);
      return;
    }

    if (intent.scope === "folder" && intent.action === "add-to-folder") {
      if (dragging.kind !== "capture") return;
      await addCaptureToGroup(dragging.captureId, intent.groupId);
    }
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
      ...removeCapturesFromGroups(currentGroups, [sourceCaptureId, targetCaptureId])
    ]);
    setCaptures((currentCaptures) =>
      currentCaptures.map((capture) =>
        capture.id === sourceCaptureId || capture.id === targetCaptureId ? { ...capture, groupId: group.id } : capture
      )
    );
    setRailOrder((currentOrder) => replaceCaptureWithGroupInOrder(currentOrder, sourceCaptureId, targetCaptureId, group.id));
    await addEvent("group_created", group.captureIds, { groupId: group.id, sourceOrigin: currentOrigin() });
  };

  const addCaptureToGroup = async (captureId: string, groupId: string) => {
    setGroups((currentGroups) =>
      moveCaptureInGroups(currentGroups, captureId, groupId)
    );
    setCaptures((currentCaptures) =>
      currentCaptures.map((capture) => (capture.id === captureId ? { ...capture, groupId } : capture))
    );
    setRailOrder((currentOrder) => currentOrder.filter((item) => !(item.kind === "capture" && item.id === captureId)));
    await addEvent("capture_grouped", [captureId], { groupId, sourceOrigin: currentOrigin() });
  };

  const moveCaptureIntoGroup = async (
    captureId: string,
    groupId: string,
    targetCaptureId: string,
    position: "insert-before" | "insert-after"
  ) => {
    if (captureId === targetCaptureId) return;
    setGroups((currentGroups) =>
      moveCaptureInGroups(currentGroups, captureId, groupId, targetCaptureId, position)
    );
    setCaptures((currentCaptures) =>
      currentCaptures.map((capture) => (capture.id === captureId ? { ...capture, groupId } : capture))
    );
    setRailOrder((currentOrder) => currentOrder.filter((item) => !(item.kind === "capture" && item.id === captureId)));
    await addEvent("folder_reordered", [captureId], { groupId, sourceOrigin: currentOrigin() });
  };

  const ungroupCapture = (captureId: string) => {
    setGroups((currentGroups) => removeCapturesFromGroups(currentGroups, [captureId]));
    setCaptures((currentCaptures) =>
      currentCaptures.map((capture) => (capture.id === captureId ? { ...capture, groupId: undefined } : capture))
    );
  };

  const leaveDeletedDestination = async () => {
    const session = captureSessionRef.current;
    if (session) {
      await sendBackground({ type: "JUSTSNAP_CANCEL_CAPTURE_SESSION", sessionId: session.sessionId }).catch(() => undefined);
    }
    resetCaptureState();
  };

  const removeGroup = async (groupId: string) => {
    const group = groups.find((item) => item.id === groupId);
    if (!group) return;
    if (activeAddTarget?.kind === "group" && activeAddTarget.id === groupId) {
      await leaveDeletedDestination();
    }
    const captureIds = group.captureIds;
    const capturesToDelete = captures.filter((capture) => captureIds.includes(capture.id));
    await Promise.all(capturesToDelete.map((capture) => deleteImageBlob(capture.imageBlobKey).catch(() => undefined)));
    setBlobCache((currentCache) => {
      const next = { ...currentCache };
      for (const captureId of captureIds) delete next[captureId];
      return next;
    });
    setGroups((currentGroups) => removeCapturesFromGroups(currentGroups.filter((item) => item.id !== groupId), captureIds));
    setCaptures((currentCaptures) => currentCaptures.filter((capture) => !captureIds.includes(capture.id)));
    setRailOrder((currentOrder) =>
      currentOrder.filter(
        (item) =>
          !(item.kind === "group" && item.id === groupId) &&
          !(item.kind === "capture" && captureIds.includes(item.id))
      )
    );
    await addEvent("group_removed", captureIds, { groupId });
  };

  const removeCapture = async (captureId: string) => {
    const capture = captures.find((item) => item.id === captureId);
    if (!capture) return;
    if (activeAddTarget?.kind === "capture" && activeAddTarget.id === captureId) {
      await leaveDeletedDestination();
    }
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
    setRailOrder((currentOrder) => currentOrder.filter((item) => !(item.kind === "capture" && item.id === captureId)));
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
      railOrder,
      events
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `docksnip-metadata-${new Date().toISOString().slice(0, 10)}.json`;
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

  useEffect(() => {
    if (!loaded || captureMode) {
      pageImageTarget.current = null;
      setPageImageAffordance(null);
      return;
    }

    const showForImage = (image: HTMLImageElement) => {
      const imageUrl = image.currentSrc || image.src;
      if (!isEligiblePageImage(image, imageUrl)) return;
      pageImageTarget.current = image;
      setPageImageAffordance({
        imageUrl,
        rect: elementRect(image),
        status: "idle"
      });
    };

    const updateFromPointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && isDockSnipNode(target)) return;
      const image = target instanceof Element ? target.closest("img") : null;
      if (image instanceof HTMLImageElement) {
        showForImage(image);
        return;
      }

      const currentImage = pageImageTarget.current;
      if (!currentImage) return;
      const rect = currentImage.getBoundingClientRect();
      const isInsideCurrentImage =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (isInsideCurrentImage) {
        setPageImageAffordance((currentAffordance) =>
          currentAffordance ? { ...currentAffordance, rect: elementRect(currentImage) } : currentAffordance
        );
        return;
      }
      pageImageTarget.current = null;
      setPageImageAffordance(null);
    };

    const refreshPosition = () => {
      const image = pageImageTarget.current;
      if (!image || !image.isConnected || !isEligiblePageImage(image, image.currentSrc || image.src)) {
        pageImageTarget.current = null;
        setPageImageAffordance(null);
        return;
      }
      setPageImageAffordance((currentAffordance) =>
        currentAffordance ? { ...currentAffordance, rect: elementRect(image) } : currentAffordance
      );
    };

    document.addEventListener("pointermove", updateFromPointer, true);
    window.addEventListener("scroll", refreshPosition, true);
    window.addEventListener("resize", refreshPosition);
    return () => {
      document.removeEventListener("pointermove", updateFromPointer, true);
      window.removeEventListener("scroll", refreshPosition, true);
      window.removeEventListener("resize", refreshPosition);
    };
  }, [captureMode, loaded]);

  const importPageImage = async () => {
    if (!pageImageAffordance || pageImageAffordance.status === "saving") return;
    const addTarget = activeAddTarget;
    setPageImageAffordance((currentAffordance) =>
      currentAffordance ? { ...currentAffordance, status: "saving" } : currentAffordance
    );
    try {
      const capture = await sendBackground<Capture>({
        type: "JUSTSNAP_IMPORT_IMAGE_URL",
        imageUrl: pageImageAffordance.imageUrl,
        sourceUrl: window.location.href,
        sourceOrigin: currentOrigin(),
        pageTitle: document.title || currentOrigin()
      });
      const blob = capture.fullDataUrl ? dataUrlToBlob(capture.fullDataUrl) : undefined;
      if (blob) setBlobCache((currentCache) => ({ ...currentCache, [capture.id]: blob }));
      setRecentlyAddedCaptureId(capture.id);
      if (addTarget) {
        await addImportedCaptureToTarget(capture, addTarget);
      } else {
        await refreshLibrary();
      }
      setPageImageAffordance((currentAffordance) =>
        currentAffordance ? { ...currentAffordance, status: "saved" } : currentAffordance
      );
      window.setTimeout(() => {
        setPageImageAffordance((currentAffordance) =>
          currentAffordance?.status === "saved" ? null : currentAffordance
        );
      }, 650);
    } catch (importError) {
      setError(errorText(importError));
      setPageImageAffordance((currentAffordance) =>
        currentAffordance ? { ...currentAffordance, status: "idle" } : currentAffordance
      );
    }
  };

  const addImportedCaptureToTarget = async (capture: Capture, addTarget: CaptureAddTarget) => {
    setCaptures((currentCaptures) => [
      { ...capture, groupId: addTarget.kind === "group" ? addTarget.id : undefined },
      ...currentCaptures.filter((item) => item.id !== capture.id)
    ]);
    setPendingAddCaptureIds([]);

    if (addTarget.kind === "group") {
      setGroups((currentGroups) =>
        currentGroups.map((group) =>
          group.id === addTarget.id
            ? { ...group, captureIds: [...group.captureIds.filter((id) => id !== capture.id), capture.id] }
            : group
        )
      );
      setRailOrder((currentOrder) => currentOrder.filter((item) => !(item.kind === "capture" && item.id === capture.id)));
      await addEvent("capture_grouped", [capture.id], { groupId: addTarget.id, sourceOrigin: capture.sourceOrigin });
      return;
    }

    const targetCapture = captures.find((item) => item.id === addTarget.id);
    if (!targetCapture) {
      await refreshLibrary();
      return;
    }
    const group: CaptureGroup = {
      id: crypto.randomUUID(),
      name: "Added captures",
      createdAt: Date.now(),
      captureIds: [targetCapture.id, capture.id],
      collapsed: false
    };
    setGroups((currentGroups) => [group, ...removeCapturesFromGroups(currentGroups, group.captureIds)]);
    setCaptures((currentCaptures) =>
      currentCaptures.map((item) =>
        item.id === targetCapture.id || item.id === capture.id ? { ...item, groupId: group.id } : item
      )
    );
    setActiveAddTarget({ kind: "group", id: group.id });
    setRailOrder((currentOrder) => replaceCaptureWithGroupInOrder(currentOrder, capture.id, targetCapture.id, group.id));
    await addEvent("group_created", group.captureIds, { groupId: group.id, sourceOrigin: capture.sourceOrigin });
  };

  const orderedRailOrder = useMemo(
    () =>
      normalizeRailOrderForState(railOrder, captures, groups).filter(
        (item) => !(item.kind === "capture" && pendingAddCaptureIds.includes(item.id))
      ),
    [captures, groups, pendingAddCaptureIds, railOrder]
  );
  const pendingAddCaptures = useMemo(
    () =>
      pendingAddCaptureIds
        .map((captureId) => captures.find((capture) => capture.id === captureId))
        .filter((capture): capture is Capture => Boolean(capture)),
    [captures, pendingAddCaptureIds]
  );
  const railLayout = dockLayoutForCount(
    orderedRailOrder.length + RAIL_CONTROL_ENTRY_COUNT,
    railInteractionActive ? Number.POSITIVE_INFINITY : undefined
  );
  const railStyle = {
    "--justsnap-rail-surface": `${railLayout.surfaceWidth}px`,
    "--justsnap-dock-base": `${railLayout.baseSize}px`,
    "--justsnap-dock-gap": `${railLayout.gap}px`
  } as React.CSSProperties;
  const shortcutModifier = platformShortcutModifier();
  const destinationLabel = activeAddTarget
    ? activeAddTarget.kind === "group"
      ? groups.find((group) => group.id === activeAddTarget.id)?.name ?? "folder"
      : captures.find((capture) => capture.id === activeAddTarget.id)?.pageTitle ?? "image"
    : null;
  const toolbarTitle = destinationLabel ? `Adding to ${destinationLabel}` : "Add images to your dock";
  const toolbarDescription = activeAddTarget
    ? "Dock images or snip screenshots into this folder."
    : "Dock page images or snip any area of the screen.";
  const showDone = Boolean(activeAddTarget) || captureMode;

  return (
    <>
      <style>{styles}</style>
      <aside
        className={[
          "justsnap-rail",
          railInteractionActive ? "justsnap-rail-expanded" : ""
        ].join(" ")}
        style={railStyle}
      >
        <div className="justsnap-rail-control-slot">
          <button
            className="justsnap-rail-control"
            aria-label={`Capture ${shortcutModifier} ⇧ S`}
            data-tooltip={`Capture ${shortcutModifier} ⇧ S`}
            onClick={() => void activateSnipMode()}
          >
            <Camera size={18} />
          </button>
        </div>
        <div className="justsnap-rail-separator-slot">
          <div className="justsnap-rail-separator" />
        </div>
        <LibraryView
          captures={captures}
          groups={groups}
          railOrder={orderedRailOrder}
          blobCache={blobCache}
          dragging={dragging}
          recentlyAddedCaptureId={recentlyAddedCaptureId}
          activeAddTarget={activeAddTarget ?? captureSession?.addTarget}
          pendingAddCaptures={pendingAddCaptures}
          layout={railLayout}
          onStartDrag={startItemDrag}
          onEndDrag={finishItemDrag}
          onDropIntent={applyRailDropIntent}
          onRemoveGroup={removeGroup}
          onRemoveCapture={removeCapture}
          onAddToGroup={(groupId) => void startAddMode({ kind: "group", id: groupId })}
          onAddToCapture={(captureId) => void startAddMode({ kind: "capture", id: captureId })}
          onInteractionChange={setRailInteractionActive}
        />
        <div className="justsnap-rail-separator-slot">
          <div className="justsnap-rail-separator" />
        </div>
        <div className="justsnap-rail-control-slot justsnap-settings-control-hidden">
          <button
            className="justsnap-rail-control"
            aria-label="Customize shortcuts"
            data-tooltip="Customize shortcuts"
            onClick={openShortcutSettings}
          >
            <Settings size={18} />
            {error && <span className="justsnap-control-badge" aria-label={error} />}
          </button>
        </div>
        <div className="justsnap-rail-control-slot">
          <button
            className="justsnap-rail-control"
            aria-label={`Close ${shortcutModifier} ⇧ X`}
            data-tooltip={`Close ${shortcutModifier} ⇧ X`}
            onClick={closeRail}
          >
            <X size={19} />
          </button>
        </div>
      </aside>

      {pageImageAffordance && !captureMode && (
        <button
          className={[
            "justsnap-page-image-add",
            pageImageAffordance.status === "saving" ? "justsnap-page-image-add-saving" : "",
            pageImageAffordance.status === "saved" ? "justsnap-page-image-add-saved" : ""
          ].join(" ")}
          style={pageImageAffordanceStyle(pageImageAffordance.rect)}
          aria-label={activeAddTarget ? "Add image to stack" : "Dock image"}
          data-tooltip={activeAddTarget ? "Add to stack" : "Dock image"}
          disabled={pageImageAffordance.status === "saving"}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void importPageImage();
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {pageImageAffordance.status === "saved" ? <Check size={17} /> : <Camera size={17} />}
        </button>
      )}

      {!captureMode && (
        <div className="justsnap-capture-toolbar" onPointerDown={(event) => event.stopPropagation()}>
          <span className="justsnap-capture-toolbar-copy">
            <strong>{toolbarTitle}</strong>
            <small>{toolbarDescription}</small>
          </span>
          <div className="justsnap-capture-modes" role="group" aria-label="Image input mode">
            <button className="justsnap-capture-mode-active" aria-pressed="true" onClick={() => void activateDockMode()}>
              Dock it
            </button>
            <button aria-pressed="false" onClick={() => void activateSnipMode()}>
              Snip it
            </button>
          </div>
          {showDone && (
            <button className="justsnap-capture-done" title="Done (Enter)" onClick={() => void finishDestination()}>
              <span>Done</span>
              <CornerDownLeft size={13} />
            </button>
          )}
        </div>
      )}

      {captureMode && (
        <div
          className={["justsnap-capture-layer", captureHidden ? "justsnap-hidden" : ""].join(" ")}
          onPointerDown={beginSelection}
          onPointerMove={updateSelection}
          onPointerUp={finishSelection}
        >
          <div className="justsnap-capture-toolbar" onPointerDown={(event) => event.stopPropagation()}>
            <span className="justsnap-capture-toolbar-copy">
              <strong>{toolbarTitle}</strong>
              <small>{toolbarDescription}</small>
            </span>
            <div className="justsnap-capture-modes" role="group" aria-label="Image input mode">
              <button aria-pressed="false" onClick={() => void activateDockMode()}>
                Dock it
              </button>
              <button className="justsnap-capture-mode-active" aria-pressed="true" onClick={() => void activateSnipMode()}>
                Snip it
              </button>
            </div>
            <button
              className="justsnap-capture-done"
              title="Done (Enter)"
              onClick={() => void (activeAddTarget ? finishDestination() : activateDockMode())}
            >
              <span>Done</span>
              <CornerDownLeft size={13} />
            </button>
          </div>
          {activeRect && <div className="justsnap-selection" style={rectStyle(activeRect)} />}
        </div>
      )}
    </>
  );
}

function dragToRailItem(drag: InternalDrag): RailOrderItem | undefined {
  if (drag.kind === "capture") return { kind: "capture", id: drag.captureId };
  if (drag.kind === "group") return { kind: "group", id: drag.groupId };
  return undefined;
}

function platformShortcutModifier(): "⌘" | "Ctrl" {
  const userAgentData = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = userAgentData.userAgentData?.platform ?? navigator.platform ?? navigator.userAgent ?? "";
  return /mac|iphone|ipad|ipod/i.test(platform) ? "⌘" : "Ctrl";
}

function sameAddTarget(a?: CaptureAddTarget, b?: CaptureAddTarget): boolean {
  if (!a && !b) return true;
  return Boolean(a && b && a.kind === b.kind && a.id === b.id);
}

function isEligiblePageImage(image: HTMLImageElement, imageUrl: string): boolean {
  if (!imageUrl || isDockSnipNode(image)) return false;
  if (!/^(https?:|data:image\/)/i.test(imageUrl)) return false;
  const rect = image.getBoundingClientRect();
  if (rect.width < 140 || rect.height < 100) return false;
  if (rect.bottom < 0 || rect.right < 0 || rect.top > window.innerHeight || rect.left > window.innerWidth) return false;
  const style = window.getComputedStyle(image);
  if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false;
  return true;
}

function elementRect(element: Element): Rect {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  };
}

function pageImageAffordanceStyle(rect: Rect): React.CSSProperties {
  return {
    left: rect.left + rect.width / 2,
    top: rect.top + rect.height / 2
  };
}

function normalizeRailOrderForState(order: RailOrderItem[], captures: Capture[], groups: CaptureGroup[]): RailOrderItem[] {
  const captureById = new Map(captures.map((capture) => [capture.id, capture]));
  const visibleGroupIds = groups
    .filter((group) => group.captureIds.some((captureId) => captureById.has(captureId)))
    .map((group) => group.id);
  const topLevelCaptureIds = captures.filter((capture) => !capture.groupId).map((capture) => capture.id);
  const seen = new Set<string>();
  const normalized: RailOrderItem[] = [];

  for (const item of order) {
    const key = railItemKey(item);
    if (seen.has(key)) continue;
    if (item.kind === "group" && visibleGroupIds.includes(item.id)) {
      normalized.push(item);
      seen.add(key);
    }
    if (item.kind === "capture" && topLevelCaptureIds.includes(item.id)) {
      normalized.push(item);
      seen.add(key);
    }
  }

  for (const groupId of visibleGroupIds) {
    const item = { kind: "group" as const, id: groupId };
    if (!seen.has(railItemKey(item))) normalized.push(item);
  }
  for (const captureId of topLevelCaptureIds) {
    const item = { kind: "capture" as const, id: captureId };
    if (!seen.has(railItemKey(item))) normalized.push(item);
  }

  return normalized;
}

function prependRailItem(order: RailOrderItem[], item: RailOrderItem): RailOrderItem[] {
  return [item, ...order.filter((orderItem) => railItemKey(orderItem) !== railItemKey(item))];
}

function moveRailItem(
  order: RailOrderItem[],
  source: RailOrderItem,
  target: RailOrderItem,
  position: "insert-before" | "insert-after"
): RailOrderItem[] {
  const sourceKey = railItemKey(source);
  const targetKey = railItemKey(target);
  if (sourceKey === targetKey) return order;
  const sourceIndex = order.findIndex((item) => railItemKey(item) === sourceKey);
  const targetIndex = order.findIndex((item) => railItemKey(item) === targetKey);
  if (targetIndex < 0) return order;
  if (sourceIndex < 0) {
    const insertIndex = position === "insert-before" ? targetIndex : targetIndex + 1;
    return [
      ...order.slice(0, insertIndex),
      source,
      ...order.slice(insertIndex)
    ];
  }
  const targetOffset = position === "insert-after" ? 1 : 0;
  const adjustedTargetIndex = targetIndex + targetOffset;
  const destinationIndex = sourceIndex < adjustedTargetIndex ? adjustedTargetIndex - 1 : adjustedTargetIndex;
  return arrayMove(order, sourceIndex, Math.max(0, Math.min(order.length - 1, destinationIndex)));
}

function replaceCaptureWithGroupInOrder(
  order: RailOrderItem[],
  sourceCaptureId: string,
  targetCaptureId: string,
  groupId: string
): RailOrderItem[] {
  const next: RailOrderItem[] = [];
  let inserted = false;
  for (const item of order) {
    if (item.kind === "capture" && item.id === sourceCaptureId) continue;
    if (item.kind === "capture" && item.id === targetCaptureId) {
      if (!inserted) {
        next.push({ kind: "group", id: groupId });
        inserted = true;
      }
      continue;
    }
    next.push(item);
  }
  return inserted ? next : prependRailItem(next, { kind: "group", id: groupId });
}

function removeCapturesFromGroups(groups: CaptureGroup[], captureIdsToRemove: string[]): CaptureGroup[] {
  const removeSet = new Set(captureIdsToRemove);
  return groups
    .map((group) => ({ ...group, captureIds: group.captureIds.filter((captureId) => !removeSet.has(captureId)) }))
    .filter((group) => group.captureIds.length > 0);
}

function moveCaptureInGroups(
  groups: CaptureGroup[],
  captureId: string,
  targetGroupId: string,
  targetCaptureId?: string,
  position: "insert-before" | "insert-after" = "insert-after"
): CaptureGroup[] {
  return groups
    .map((group) => {
      const withoutCapture = group.captureIds.filter((id) => id !== captureId);
      if (group.id !== targetGroupId) return { ...group, captureIds: withoutCapture };
      const targetIndex = targetCaptureId ? withoutCapture.indexOf(targetCaptureId) : -1;
      const insertIndex =
        targetIndex < 0 ? withoutCapture.length : position === "insert-before" ? targetIndex : targetIndex + 1;
      return {
        ...group,
        captureIds: [
          ...withoutCapture.slice(0, insertIndex),
          captureId,
          ...withoutCapture.slice(insertIndex)
        ]
      };
    })
    .filter((group) => group.captureIds.length > 0);
}

function railItemKey(item: RailOrderItem): string {
  return `${item.kind}:${item.id}`;
}

function ActivityView({ events, captures, groups }: { events: ActivityEvent[]; captures: Capture[]; groups: CaptureGroup[] }) {
  if (!events.length) {
    return (
      <div className="justsnap-empty">
        <ListChecks size={22} />
        <span>Dock activity will appear here.</span>
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

function isDockSnipNode(node: Node): boolean {
  if (!host) return false;
  if (node === host || host.contains(node)) return true;
  const rootNode = node.getRootNode();
  return rootNode instanceof ShadowRoot && rootNode.host === host;
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
  if (!response?.ok) throw new Error(response?.error ?? "DockSnip request failed.");
  return response.data;
}

function viewportMetrics() {
  const viewport = window.visualViewport;
  return {
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
    offsetLeft: viewport?.offsetLeft ?? 0,
    offsetTop: viewport?.offsetTop ?? 0
  };
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
  return capture ? `${capture.pageTitle} - ${capture.sourceOrigin}` : "DockSnip capture";
}

function eventLabel(event: ActivityEvent, groups: CaptureGroup[]): string {
  const labels: Record<ActivityEvent["type"], string> = {
    rail_opened: "Dock opened",
    capture_started: "Snip started",
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
    rail_reordered: "Dock reordered",
    folder_reordered: "Folder reordered",
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
