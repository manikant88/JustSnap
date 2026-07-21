import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  CornerDownLeft,
  FolderPlus,
  X
} from "lucide-react";
import { groupContaining, MAX_DOCK_ITEMS } from "../shared/libraryModel";
import { dockLayoutForCount } from "./content/dockLayout";
import { DockOverview } from "./content/docks/DockOverview";
import { DockFrame } from "./content/docks/DockFrame";
import { captureFileForDrag, copyFilesToClipboard, dragPreviewElement } from "./content/drag/filePayload";
import { placeFilesInCurrentPage } from "./content/drag/pageInsert";
import { LibraryView } from "./content/rail/LibraryView";
import { styles } from "./content/styles";
import type { DragPayload, InternalDrag, Point, RailDropIntent, Rect } from "./content/types";
import type {
  BackgroundRequest,
  BackgroundResponse,
  Capture,
  CaptureAddTarget,
  CaptureDock,
  CaptureGroup,
  CaptureSelectionResult,
  CaptureSessionSnapshot,
  ContentMessage,
  LibraryState,
  LibraryMutation,
  RailOrderItem
} from "../shared/types";

const MIN_SELECTION_WIDTH = 32;
const MIN_SELECTION_HEIGHT = 32;
const RAIL_CONTROL_ENTRY_COUNT = 3;
const MAX_BLOB_CACHE_ENTRIES = 16;

type DockInputMode = "dock" | "snip";

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

chrome.runtime.onMessage.addListener((message: ContentMessage) => {
  if (message.type === "JUSTSNAP_SHOW_RAIL") mountRail();
  if (message.type === "JUSTSNAP_START_CAPTURE") mountRail(message);
  if (message.type === "JUSTSNAP_CLOSE_RAIL") unmountRail();
  if (message.type === "JUSTSNAP_CAPTURE_ERROR") mountRail(message);
});

type ContentCommand =
  | { id: number; type: "start_capture"; session: CaptureSessionSnapshot }
  | { id: number; type: "show_error"; error: string };

type PageImageAffordance = {
  imageUrl: string;
  rect: Rect;
  status: "idle" | "saving" | "saved";
};

type PageImageTarget = {
  element: HTMLElement;
  imageUrl: string;
  rect: Rect;
};

let commandId = 0;

function mountRail(message?: Extract<ContentMessage, { type: "JUSTSNAP_START_CAPTURE" | "JUSTSNAP_CAPTURE_ERROR" }>) {
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
      command={
        message?.type === "JUSTSNAP_START_CAPTURE"
          ? { id: ++commandId, type: "start_capture", session: message }
          : message?.type === "JUSTSNAP_CAPTURE_ERROR"
            ? { id: ++commandId, type: "show_error", error: message.error }
            : undefined
      }
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
  const [docks, setDocks] = useState<CaptureDock[]>([]);
  const [activeDockId, setActiveDockId] = useState("");
  const [hasSeenDockOverflow, setHasSeenDockOverflow] = useState(false);
  const [lastAutoCreatedDockId, setLastAutoCreatedDockId] = useState<string | undefined>();
  const [dockOverviewOpen, setDockOverviewOpen] = useState(false);
  const [dockSwitchPulse, setDockSwitchPulse] = useState(false);
  const [highlightDockId, setHighlightDockId] = useState<string | undefined>();
  const [railOrder, setRailOrder] = useState<RailOrderItem[]>([]);
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
  const blobCacheRef = useRef<Record<string, Blob>>({});
  const [recentlyAddedCaptureId, setRecentlyAddedCaptureId] = useState<string | null>(null);
  const pendingDragPayload = useRef<DragPayload | null>(null);
  const lastDragPoint = useRef<Point | null>(null);
  const pageImageTarget = useRef<PageImageTarget | null>(null);
  const captureSessionRef = useRef<CaptureSessionSnapshot | null>(null);
  const captureSessionPromiseRef = useRef<Promise<CaptureSessionSnapshot> | null>(null);
  const handledAutoDockRef = useRef<string | null>(null);
  const activeDockIdRef = useRef("");
  const dockSelectionRequestRef = useRef(0);
  const [pageImageAffordance, setPageImageAffordance] = useState<PageImageAffordance | null>(null);
  const captureMode = inputMode === "snip";

  const applyLibraryState = useCallback((library: LibraryState) => {
    setCaptures(library.captures);
    setGroups(library.groups);
    setDocks(library.docks);
    setActiveDockId(library.activeDockId);
    activeDockIdRef.current = library.activeDockId;
    setHasSeenDockOverflow(library.hasSeenDockOverflow);
    setLastAutoCreatedDockId(library.lastAutoCreatedDockId);
    setRailOrder(library.railOrder);
  }, []);

  const refreshLibrary = useCallback(async () => {
    const library = await sendBackground<LibraryState>({ type: "JUSTSNAP_GET_LIBRARY" });
    applyLibraryState(library);
    setLoaded(true);
  }, [applyLibraryState]);

  const runLibraryMutation = useCallback(async (mutation: LibraryMutation) => {
    const library = await sendBackground<LibraryState>({ type: "JUSTSNAP_MUTATE_LIBRARY", mutation });
    applyLibraryState(library);
    return library;
  }, [applyLibraryState]);

  useEffect(() => {
    if (!lastAutoCreatedDockId || handledAutoDockRef.current === lastAutoCreatedDockId) return;
    handledAutoDockRef.current = lastAutoCreatedDockId;
    setHighlightDockId(lastAutoCreatedDockId);
    if (!hasSeenDockOverflow) setDockOverviewOpen(true);
    else {
      setDockSwitchPulse(true);
      window.setTimeout(() => setDockSwitchPulse(false), 520);
    }
    void runLibraryMutation({ type: "acknowledge_dock_overflow" });
  }, [hasSeenDockOverflow, lastAutoCreatedDockId, runLibraryMutation]);

  useEffect(() => {
    if (!highlightDockId) return;
    const timer = window.setTimeout(() => setHighlightDockId(undefined), 1800);
    return () => window.clearTimeout(timer);
  }, [highlightDockId]);

  useEffect(() => {
    refreshLibrary()
      .then(() => undefined)
      .catch((loadError) => setError(errorText(loadError)));
  }, []);

  useEffect(() => {
    blobCacheRef.current = blobCache;
  }, [blobCache]);

  const requireCaptureBlobs = useCallback(async (captureIds: string[]) => {
    const requested = new Set(captureIds);
    const missing = captures.filter((capture) => requested.has(capture.id) && !blobCacheRef.current[capture.id]);
    if (!missing.length) return;
    const loadedEntries = await Promise.all(
      missing.map(async (capture) => {
        const blob = await loadCaptureBlob(capture.imageBlobKey);
        return blob ? ([capture.id, blob] as const) : undefined;
      })
    );
    setBlobCache((current) => {
      const next = Object.fromEntries(Object.entries(current).slice(-MAX_BLOB_CACHE_ENTRIES)) as Record<string, Blob>;
      for (const entry of loadedEntries) if (entry) next[entry[0]] = entry[1];
      return Object.fromEntries(Object.entries(next).slice(-MAX_BLOB_CACHE_ENTRIES)) as Record<string, Blob>;
    });
  }, [captures]);

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

  const captureSelection = async (rect: Rect, sessionId = captureSessionRef.current?.sessionId) => {
    setCaptureHidden(true);
    await nextAnimationFrame();
    try {
      return await sendBackground<CaptureSelectionResult>({
        type: "JUSTSNAP_CAPTURE_SELECTION",
        sessionId,
        rect,
        viewport: viewportMetrics()
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
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    setStart(point);
    setCurrent(point);
  };

  const updateSelection = (event: React.PointerEvent) => {
    if (!captureMode || !start) return;
    setCurrent({ x: event.clientX, y: event.clientY });
  };

  const finishSelection = async (event: React.PointerEvent) => {
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
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
      const blob = await loadCaptureBlob(result.capture.imageBlobKey);
      if (addTarget) {
        setPendingAddCaptureIds((currentIds) => [...currentIds.filter((id) => id !== result.capture.id), result.capture.id]);
      }
      await refreshLibrary();
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
      applyLibraryState(library);
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
    if (command?.type === "show_error") setError(command.error);
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
    void requireCaptureBlobs(captureIds);
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

    const dragImage = dragPreviewElement(event.currentTarget, drag.kind);
    if (dragImage) transfer.setDragImage(dragImage, 24, 24);

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
  };

  const applyRailDropIntent = async (intent: RailDropIntent) => {
    if (!dragging) return;
    pendingDragPayload.current = null;
    setDragging(null);

    if (intent.scope === "rail" && (intent.action === "insert-before" || intent.action === "insert-after")) {
      const item = dragToRailItem(dragging);
      if (!item) return;
      if (dragging.kind === "capture") {
        await runLibraryMutation({ type: "ungroup_capture", captureId: dragging.captureId });
        await runLibraryMutation({ type: "move_rail_item", item, target: intent.target, position: intent.action });
      } else {
        await runLibraryMutation({ type: "move_rail_item", item, target: intent.target, position: intent.action });
      }
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
    const targetGroup = groupContaining(groups, targetCaptureId);
    if (targetGroup) {
      await addCaptureToGroup(sourceCaptureId, targetGroup.id);
      return;
    }
    await runLibraryMutation({
      type: "create_group",
      groupId: crypto.randomUUID(),
      name: "New collection",
      createdAt: Date.now(),
      sourceCaptureId,
      targetCaptureId
    });
  };

  const addCaptureToGroup = async (captureId: string, groupId: string) => {
    await runLibraryMutation({ type: "add_capture_to_group", captureId, groupId });
  };

  const moveCaptureIntoGroup = async (
    captureId: string,
    groupId: string,
    targetCaptureId: string,
    position: "insert-before" | "insert-after"
  ) => {
    if (captureId === targetCaptureId) return;
    await runLibraryMutation({ type: "move_capture_in_group", captureId, groupId, targetCaptureId, position });
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
    setBlobCache((currentCache) => {
      const next = { ...currentCache };
      for (const captureId of captureIds) delete next[captureId];
      return next;
    });
    await runLibraryMutation({ type: "delete_group", groupId });
  };

  const removeCapture = async (captureId: string) => {
    const capture = captures.find((item) => item.id === captureId);
    if (!capture) return;
    if (activeAddTarget?.kind === "capture" && activeAddTarget.id === captureId) {
      await leaveDeletedDestination();
    }
    setBlobCache((currentCache) => {
      const next = { ...currentCache };
      delete next[captureId];
      return next;
    });
    await runLibraryMutation({ type: "delete_capture", captureId });
  };

  const renameGroup = async (groupId: string, name: string) => {
    await runLibraryMutation({ type: "rename_group", groupId, name });
  };

  const createEmptyFolder = async () => {
    const groupId = crypto.randomUUID();
    const library = await runLibraryMutation({
      type: "create_empty_group",
      groupId,
      name: "New folder",
      createdAt: Date.now()
    });
    const group = library.groups.find((entry) => entry.id === groupId);
    if (group) setActiveAddTarget({ kind: "group", id: group.id });
  };

  const createDock = async () => {
    const dockId = crypto.randomUUID();
    await runLibraryMutation({
      type: "create_dock",
      dockId,
      name: `Dock ${docks.length + 1}`,
      createdAt: Date.now()
    });
    setDockOverviewOpen(true);
  };

  const selectDock = async (dockId: string, closeOverview = true) => {
    const dock = docks.find((entry) => entry.id === dockId);
    if (!dock || dockId === activeDockIdRef.current) {
      if (closeOverview) setDockOverviewOpen(false);
      return;
    }
    const requestId = ++dockSelectionRequestRef.current;
    activeDockIdRef.current = dockId;
    setActiveDockId(dockId);
    setRailOrder(dock.order);
    if (closeOverview) setDockOverviewOpen(false);
    try {
      const library = await sendBackground<LibraryState>({
        type: "JUSTSNAP_MUTATE_LIBRARY",
        mutation: { type: "set_active_dock", dockId }
      });
      if (dockSelectionRequestRef.current === requestId) applyLibraryState(library);
    } catch (selectionError) {
      if (dockSelectionRequestRef.current !== requestId) return;
      setError(errorText(selectionError));
      await refreshLibrary().catch(() => undefined);
    }
  };

  const navigateDock = async (direction: -1 | 1) => {
    const index = docks.findIndex((dock) => dock.id === activeDockIdRef.current);
    const next = docks[index + direction];
    if (!next) return;
    await selectDock(next.id);
  };

  useEffect(() => {
    const navigateDockWithKeyboard = (event: KeyboardEvent) => {
      if (!event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      if (isEditableKeyboardEvent(event)) return;
      event.preventDefault();
      event.stopPropagation();
      void navigateDock(event.key === "ArrowUp" ? -1 : 1);
    };
    document.addEventListener("keydown", navigateDockWithKeyboard, true);
    return () => document.removeEventListener("keydown", navigateDockWithKeyboard, true);
  }, [docks]);

  const deleteDock = async (dockId: string) => {
    const dock = docks.find((entry) => entry.id === dockId);
    if (!dock) return;
    const groupIds = new Set(dock.order.filter((item) => item.kind === "group").map((item) => item.id));
    const captureIds = new Set(dock.order.filter((item) => item.kind === "capture").map((item) => item.id));
    for (const group of groups) {
      if (groupIds.has(group.id)) group.captureIds.forEach((id) => captureIds.add(id));
    }
    if (activeAddTarget &&
      ((activeAddTarget.kind === "group" && groupIds.has(activeAddTarget.id)) ||
       (activeAddTarget.kind === "capture" && captureIds.has(activeAddTarget.id)))) {
      await leaveDeletedDestination();
    }
    setBlobCache((current) => {
      const next = { ...current };
      captureIds.forEach((id) => delete next[id]);
      return next;
    });
    await runLibraryMutation({ type: "delete_dock", dockId });
  };

  const activeDockIndex = Math.max(0, docks.findIndex((dock) => dock.id === activeDockId));

  useEffect(() => {
    if (!loaded || captureMode) {
      pageImageTarget.current = null;
      setPageImageAffordance(null);
      return;
    }

    const showForImage = (target: PageImageTarget) => {
      pageImageTarget.current = target;
      setPageImageAffordance({
        imageUrl: target.imageUrl,
        rect: target.rect,
        status: "idle"
      });
    };

    let pointerFrame = 0;
    let latestPointer: Point | null = null;
    const inspectPointer = () => {
      pointerFrame = 0;
      const point = latestPointer;
      latestPointer = null;
      if (!point) return;

      const target = pageImageTargetAtPoint(point.x, point.y);
      if (target) {
        showForImage(target);
        return;
      }

      const currentTarget = pageImageTarget.current;
      if (!currentTarget) return;
      if (pointInsideRect(point, currentTarget.rect)) {
        setPageImageAffordance((currentAffordance) =>
          currentAffordance
            ? { ...currentAffordance, rect: currentTarget.rect }
            : currentAffordance
        );
        return;
      }
      pageImageTarget.current = null;
      setPageImageAffordance(null);
    };

    const updateFromPointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && isDockSnipNode(target)) return;
      latestPointer = { x: event.clientX, y: event.clientY };
      if (!pointerFrame) pointerFrame = window.requestAnimationFrame(inspectPointer);
    };

    const refreshPosition = () => {
      const target = pageImageTarget.current;
      if (!target || !target.element.isConnected) {
        pageImageTarget.current = null;
        setPageImageAffordance(null);
        return;
      }
      const imageUrl = imageUrlForElement(target.element);
      const refreshedTarget = imageUrl ? pageImageTargetForElement(target.element, imageUrl) : undefined;
      if (!refreshedTarget) {
        pageImageTarget.current = null;
        setPageImageAffordance(null);
        return;
      }
      pageImageTarget.current = refreshedTarget;
      setPageImageAffordance((currentAffordance) =>
        currentAffordance
          ? { ...currentAffordance, imageUrl: refreshedTarget.imageUrl, rect: refreshedTarget.rect }
          : currentAffordance
      );
    };

    document.addEventListener("pointermove", updateFromPointer, true);
    window.addEventListener("scroll", refreshPosition, true);
    window.addEventListener("resize", refreshPosition);
    return () => {
      if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
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
        imageUrl: pageImageAffordance.imageUrl
      });
      const blob = await loadCaptureBlob(capture.imageBlobKey);
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
    setPendingAddCaptureIds([]);

    if (addTarget.kind === "group") {
      await runLibraryMutation({ type: "add_capture_to_group", captureId: capture.id, groupId: addTarget.id });
      return;
    }

    const targetCapture = captures.find((item) => item.id === addTarget.id);
    if (!targetCapture) {
      await refreshLibrary();
      return;
    }
    const groupId = crypto.randomUUID();
    await runLibraryMutation({
      type: "create_group",
      groupId,
      name: "Added captures",
      createdAt: Date.now(),
      sourceCaptureId: capture.id,
      targetCaptureId: targetCapture.id
    });
    setActiveAddTarget({ kind: "group", id: groupId });
  };

  const orderedRailOrder = useMemo(
    () =>
      railOrder.filter(
        (item) => !(item.kind === "capture" && pendingAddCaptureIds.includes(item.id))
      ),
    [pendingAddCaptureIds, railOrder]
  );
  const pendingAddCaptures = useMemo(
    () =>
      pendingAddCaptureIds
        .map((captureId) => captures.find((capture) => capture.id === captureId))
        .filter((capture): capture is Capture => Boolean(capture)),
    [captures, pendingAddCaptureIds]
  );
  const railLayout = dockLayoutForCount(
    MAX_DOCK_ITEMS + RAIL_CONTROL_ENTRY_COUNT,
    Number.POSITIVE_INFINITY
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
      : "image"
    : null;
  const toolbarTitle = destinationLabel ? `Adding to ${destinationLabel}` : "Add images to your dock";
  const toolbarDescription = activeAddTarget
    ? "Dock images or snip screenshots into this folder."
    : "Dock page images or snip any area of the screen.";
  const toolbarDestinationCaptures = activeAddTarget
    ? activeAddTarget.kind === "group"
      ? groups
          .find((group) => group.id === activeAddTarget.id)
          ?.captureIds.map((captureId) => captures.find((capture) => capture.id === captureId))
          .filter((capture): capture is Capture => Boolean(capture))
          .slice(0, 4) ?? []
      : captures.filter((capture) => capture.id === activeAddTarget.id).slice(0, 1)
    : [];
  const showDone = Boolean(activeAddTarget) || captureMode;

  return (
    <>
      <style>{styles}</style>
      <DockFrame
        className={[
          railInteractionActive ? "justsnap-rail-expanded" : "",
          dockSwitchPulse ? "justsnap-rail-switching" : "",
          dockOverviewOpen ? "justsnap-rail-overview-hidden" : ""
        ].join(" ")}
        style={railStyle}
        top={
          <button
            className="justsnap-rail-control"
            aria-label="Create a new folder"
            data-tooltip="New folder"
            onClick={() => void createEmptyFolder()}
          >
            <FolderPlus size={18} />
          </button>
        }
        bottom={
          <div className="justsnap-dock-navigator" aria-label="Dock navigation">
            <button aria-label="Previous dock" disabled={activeDockIndex <= 0} onClick={() => void navigateDock(-1)}>
              <ChevronUp size={17} />
            </button>
            <button aria-label="Open dock overview" data-tooltip="All docks" onClick={() => setDockOverviewOpen(true)}>
              <span>{activeDockIndex + 1}/{Math.max(1, docks.length)}</span>
            </button>
            <button aria-label="Next dock" disabled={activeDockIndex >= docks.length - 1} onClick={() => void navigateDock(1)}>
              <ChevronDown size={17} />
            </button>
          </div>
        }
      >
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
          onRequireCaptures={requireCaptureBlobs}
        />
      </DockFrame>

      {dockOverviewOpen && (
        <DockOverview
          captures={captures}
          groups={groups}
          docks={docks}
          activeDockId={activeDockId}
          autoCreatedDockId={highlightDockId}
          onClose={() => setDockOverviewOpen(false)}
          onSelectDock={(dockId) => void selectDock(dockId)}
          onCreateDock={() => void createDock()}
          onRenameDock={(dockId, name) => void runLibraryMutation({ type: "rename_dock", dockId, name })}
          onDeleteDock={(dockId) => void deleteDock(dockId)}
          onMoveItem={(item, dockId) => void runLibraryMutation({ type: "move_item_to_dock", item, dockId })}
          onMessage={setError}
        />
      )}

      {error && (
        <section className="justsnap-toolbar-notice" role="alert" aria-live="assertive">
          <AlertCircle className="justsnap-toolbar-notice-icon" size={17} aria-hidden="true" />
          <p className="justsnap-toolbar-notice-message">{friendlyErrorMessage(error)}</p>
          <button className="justsnap-toolbar-notice-action" onClick={() => setError("")}>
            OK
          </button>
        </section>
      )}

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
          {toolbarDestinationCaptures.length > 0 && (
            <ToolbarDestinationPreview captures={toolbarDestinationCaptures} />
          )}
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
          <button
            className="justsnap-capture-close"
            aria-label={`Close ${shortcutModifier} ⇧ X`}
            data-tooltip={`Close ${shortcutModifier} ⇧ X`}
            onClick={closeRail}
          >
            <X size={17} />
          </button>
        </div>
      )}

      {captureMode && (
        <div
          className={["justsnap-capture-layer", captureHidden ? "justsnap-capture-frame-clean" : ""].join(" ")}
          onPointerDown={beginSelection}
          onPointerMove={updateSelection}
          onPointerUp={finishSelection}
        >
          <div className="justsnap-capture-toolbar" onPointerDown={(event) => event.stopPropagation()}>
            {toolbarDestinationCaptures.length > 0 && (
              <ToolbarDestinationPreview captures={toolbarDestinationCaptures} />
            )}
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
            <button
              className="justsnap-capture-close"
              aria-label={`Close ${shortcutModifier} ⇧ X`}
              data-tooltip={`Close ${shortcutModifier} ⇧ X`}
              onClick={closeRail}
            >
              <X size={17} />
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

function pageImageTargetAtPoint(x: number, y: number): PageImageTarget | undefined {
  const rawStack = deepElementsFromPoint(x, y).filter((element) => !isDockSnipNode(element));
  const visualLayer = activeVisualLayer(rawStack);
  const stack = visualLayer ? rawStack.filter((element) => isWithinLayer(element, visualLayer)) : rawStack;
  for (const element of stack) {
    const imageCandidates = new Set<HTMLImageElement>();
    if (element instanceof HTMLImageElement) imageCandidates.add(element);
    let ancestor: Element | null = element;
    for (let depth = 0; ancestor && depth < 4; depth += 1, ancestor = ancestor.parentElement) {
      if (ancestor === document.body || ancestor === document.documentElement) break;
      const descendants = ancestor.querySelectorAll<HTMLImageElement>("img");
      for (let index = 0; index < Math.min(descendants.length, 24); index += 1) {
        const image = descendants[index];
        const imageUrl = image.currentSrc || image.src;
        const target = pageImageTargetForElement(image, imageUrl);
        if (target && pointInsideRect({ x, y }, target.rect)) imageCandidates.add(image);
      }
      if (ancestor === visualLayer) break;
    }
    const target = [...imageCandidates]
      .map((image) => pageImageTargetForElement(image, image.currentSrc || image.src))
      .filter((candidate): candidate is PageImageTarget => Boolean(candidate))
      .filter((candidate) => pointInsideRect({ x, y }, candidate.rect))
      .sort((a, b) => rectArea(a.rect) - rectArea(b.rect))[0];
    if (target) return target;
  }

  // CSS backgrounds are a fallback. Keeping the same stack order prevents an
  // obscured feed image from winning over an open modal or lightbox.
  for (const element of stack) {
    let candidate: Element | null = element;
    for (let depth = 0; candidate && depth < 3; depth += 1, candidate = candidate.parentElement) {
      if (candidate === document.body || candidate === document.documentElement) break;
      if (candidate instanceof HTMLElement && pointInsideElement({ x, y }, candidate)) {
        const imageUrl = backgroundImageUrl(candidate);
        const target = imageUrl ? pageImageTargetForElement(candidate, imageUrl) : undefined;
        if (target && pointInsideRect({ x, y }, target.rect)) return target;
      }
      if (candidate === visualLayer) break;
    }
  }
  return undefined;
}

function pageImageTargetForElement(element: HTMLElement, imageUrl: string): PageImageTarget | undefined {
  if (!imageUrl || isDockSnipNode(element) || !/^(https?:|data:image\/)/i.test(imageUrl)) return undefined;
  const style = window.getComputedStyle(element);
  if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return undefined;
  const rect = element instanceof HTMLImageElement
    ? visibleImageContentRect(element, style)
    : clippedElementRect(element);
  if (!rect || rect.width < 140 || rect.height < 100) return undefined;
  return { element, imageUrl, rect };
}

function activeVisualLayer(stack: Element[]): HTMLElement | undefined {
  const topElement = stack[0];
  if (!topElement) return undefined;
  const semanticLayer = topElement.closest<HTMLElement>('dialog, [role="dialog"], [aria-modal="true"]');
  if (semanticLayer) return semanticLayer;

  let ancestor: Element | null = topElement;
  for (let depth = 0; ancestor && depth < 8; depth += 1, ancestor = ancestor.parentElement) {
    if (!(ancestor instanceof HTMLElement)) continue;
    const style = window.getComputedStyle(ancestor);
    const rect = ancestor.getBoundingClientRect();
    const viewportCoverage = (rect.width * rect.height) / Math.max(1, window.innerWidth * window.innerHeight);
    if (style.position === "fixed" && viewportCoverage >= 0.2) return ancestor;
  }
  return undefined;
}

function isWithinLayer(element: Element, layer: HTMLElement): boolean {
  if (element === layer || layer.contains(element)) return true;
  const root = element.getRootNode();
  return root instanceof ShadowRoot && layer.contains(root.host);
}

function deepElementsFromPoint(x: number, y: number): Element[] {
  const elements = document.elementsFromPoint(x, y);
  const result = [...elements];
  for (const element of elements) {
    if (!(element.shadowRoot instanceof ShadowRoot)) continue;
    result.push(...element.shadowRoot.elementsFromPoint(x, y));
  }
  return result;
}

function imageUrlForElement(element: HTMLElement): string | undefined {
  if (element instanceof HTMLImageElement) return element.currentSrc || element.src || undefined;
  return backgroundImageUrl(element);
}

function visibleImageContentRect(image: HTMLImageElement, style: CSSStyleDeclaration): Rect | undefined {
  const box = elementRect(image);
  if (box.width <= 0 || box.height <= 0) return undefined;
  if (!image.naturalWidth || !image.naturalHeight) return clipRectToAncestors(box, image);

  const fit = style.objectFit || "fill";
  if (fit === "fill" || fit === "cover") return clipRectToAncestors(box, image);

  const containScale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
  const scale = fit === "none" ? 1 : fit === "scale-down" ? Math.min(1, containScale) : containScale;
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const [positionX = "50%", positionY = "50%"] = style.objectPosition.split(/\s+/);
  const contentRect: Rect = {
    left: box.left + objectPositionOffset(positionX, box.width - width, "x"),
    top: box.top + objectPositionOffset(positionY, box.height - height, "y"),
    width,
    height
  };
  return clipRectToAncestors(intersectRects(contentRect, box), image);
}

function objectPositionOffset(value: string, remaining: number, axis: "x" | "y"): number {
  const keyword = value.toLowerCase();
  if (keyword === "center") return remaining / 2;
  if (keyword === "left" || keyword === "top") return 0;
  if (keyword === "right" || keyword === "bottom") return remaining;
  if (keyword.endsWith("%")) return remaining * (Number.parseFloat(keyword) / 100);
  if (keyword.endsWith("px")) return Number.parseFloat(keyword);
  if (axis === "y" && (keyword === "left" || keyword === "right")) return remaining / 2;
  return remaining / 2;
}

function clippedElementRect(element: HTMLElement): Rect | undefined {
  return clipRectToAncestors(elementRect(element), element);
}

function clipRectToAncestors(rect: Rect | undefined, element: HTMLElement): Rect | undefined {
  if (!rect) return undefined;
  let clipped: Rect | undefined = intersectRects(rect, {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight
  });
  for (let ancestor = element.parentElement; clipped && ancestor; ancestor = ancestor.parentElement) {
    const style = window.getComputedStyle(ancestor);
    const clipsX = /(hidden|clip|scroll|auto)/.test(style.overflowX);
    const clipsY = /(hidden|clip|scroll|auto)/.test(style.overflowY);
    if (!clipsX && !clipsY) continue;
    const ancestorRect = elementRect(ancestor);
    clipped = intersectRects(clipped, {
      left: clipsX ? ancestorRect.left : clipped.left,
      top: clipsY ? ancestorRect.top : clipped.top,
      width: clipsX ? ancestorRect.width : clipped.width,
      height: clipsY ? ancestorRect.height : clipped.height
    });
  }
  return clipped;
}

function intersectRects(a: Rect | undefined, b: Rect): Rect | undefined {
  if (!a) return undefined;
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  if (right <= left || bottom <= top) return undefined;
  return { left, top, width: right - left, height: bottom - top };
}

function backgroundImageUrl(element: HTMLElement): string | undefined {
  const backgroundImage = window.getComputedStyle(element).backgroundImage;
  const match = backgroundImage.match(/url\((['"]?)(.*?)\1\)/i);
  return match?.[2] || undefined;
}

function pointInsideElement(point: Point, element: Element): boolean {
  return pointInsideRect(point, elementRect(element));
}

function pointInsideRect(point: Point, rect: Rect): boolean {
  return point.x >= rect.left && point.x <= rect.left + rect.width && point.y >= rect.top && point.y <= rect.top + rect.height;
}

function rectArea(rect: Rect): number {
  return rect.width * rect.height;
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

async function loadCaptureBlob(imageBlobKey: string): Promise<Blob | undefined> {
  const dataUrl = await sendBackground<string | null>({ type: "JUSTSNAP_GET_IMAGE_DATA", imageBlobKey });
  return dataUrl ? dataUrlToBlob(dataUrl) : undefined;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64 = ""] = dataUrl.split(",");
  const contentType = header.match(/data:(.*?);base64/)?.[1] ?? "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: contentType });
}

function currentOrigin(): string {
  try {
    return new URL(window.location.href).origin;
  } catch {
    return "unknown";
  }
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

function isEditableKeyboardEvent(event: KeyboardEvent): boolean {
  return event.composedPath().some((target) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
  });
}

function friendlyErrorMessage(error: string): string {
  if (error.includes("WhatsApp did not accept")) {
    return "Couldn't add these images to WhatsApp. Try again or use the attachment button.";
  }
  if (error.includes("Could not find an active message field")) {
    return "Couldn't find where to add the image. Select a message field and try again.";
  }
  if (error.includes("ignored the image insert")) {
    return "Couldn't add the image here. Try again or use the page's attachment button.";
  }
  return error;
}

function ToolbarDestinationPreview({ captures }: { captures: Capture[] }) {
  return (
    <span className="justsnap-toolbar-destination" aria-hidden="true">
      {captures.map((capture) => (
        <img key={capture.id} src={capture.thumbnailDataUrl} alt="" />
      ))}
    </span>
  );
}
