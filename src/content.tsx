import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Copy,
  CornerDownLeft,
  FolderPlus,
  Info,
  Plus,
  Trash2,
  X
} from "lucide-react";
import { groupContaining } from "../shared/libraryModel";
import { dockLayoutForCount } from "./content/dockLayout";
import { DockFrame } from "./content/docks/DockFrame";
import { friendlyErrorMessage, isInsertionFailure } from "./content/errorMessages";
import { captureFileForDrag, copyFilesToClipboard, dragPreviewElement, prepareDeliveryImage } from "./content/drag/filePayload";
import { deliveryCaptureKey, filesForDelivery } from "./content/drag/deliveryPreparation";
import {
  placeFilesInCurrentPage,
  shouldSuppressNativePageDrop
} from "./content/drag/pageInsert";
import { LibraryView } from "./content/rail/LibraryView";
import { snipAvoidanceForSelection, type SnipAvoidance } from "./content/snipAvoidance";
import { styles } from "./content/styles";
import type { DragPayload, InternalDrag, Point, RailDropIntent, Rect } from "./content/types";
import type {
  BackgroundRequest,
  BackgroundResponse,
  Capture,
  CaptureAddTarget,
  CaptureGroup,
  CaptureSelectionResult,
  CaptureSessionSnapshot,
  ContentMessage,
  DeletionKind,
  DeletionResult,
  LibraryState,
  LibraryMutation,
  RailOrderItem
} from "../shared/types";

const MIN_SELECTION_WIDTH = 32;
const MIN_SELECTION_HEIGHT = 32;
const RAIL_CONTROL_ENTRY_COUNT = 3;
const MAX_BLOB_CACHE_ENTRIES = 16;
const TOOLBAR_NOTICE_MS = 5_000;

type DockInputMode = "dock" | "snip";

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
let hostGroteskFont: FontFace | undefined;

type ContentRuntimeMarker = typeof globalThis & {
  __docksnipContentListenerInstalled?: boolean;
};

const contentRuntime = globalThis as ContentRuntimeMarker;
if (!contentRuntime.__docksnipContentListenerInstalled) {
  contentRuntime.__docksnipContentListenerInstalled = true;
  chrome.runtime.onMessage.addListener((message: ContentMessage) => {
    if (message.type === "JUSTSNAP_SHOW_RAIL") mountRail(message);
    if (message.type === "JUSTSNAP_START_CAPTURE") mountRail(message);
    if (message.type === "JUSTSNAP_CLOSE_RAIL") unmountRail();
    if (message.type === "JUSTSNAP_CAPTURE_ERROR") mountRail(message);
  });
}

type ContentCommand =
  | { id: number; type: "start_capture"; session: CaptureSessionSnapshot }
  | { id: number; type: "restore_add_target"; addTarget?: CaptureAddTarget }
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

function mountRail(message?: ContentMessage) {
  ensureHostGroteskFont();
  if (host && !host.isConnected) {
    root = undefined;
    host = undefined;
  }
  if (!host) {
    document.querySelectorAll("#justsnap-root").forEach((existingHost) => existingHost.remove());
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
          : message?.type === "JUSTSNAP_SHOW_RAIL"
            ? { id: ++commandId, type: "restore_add_target", addTarget: message.addTarget }
          : message?.type === "JUSTSNAP_CAPTURE_ERROR"
            ? { id: ++commandId, type: "show_error", error: message.error }
            : undefined
      }
    />
  );
}

function ensureHostGroteskFont(): void {
  if (hostGroteskFont) return;
  const font = new FontFace(
    "Host Grotesk",
    `url("${chrome.runtime.getURL("fonts/HostGrotesk-Variable.woff2")}") format("woff2")`,
    { style: "normal", weight: "100 900" }
  );
  hostGroteskFont = font;
  document.fonts.add(font);
  void font.load().catch(() => {
    document.fonts.delete(font);
    if (hostGroteskFont === font) hostGroteskFont = undefined;
  });
}

function unmountRail() {
  root?.unmount();
  host?.remove();
  root = undefined;
  host = undefined;
}

function DockSnipApp({ command }: { command?: ContentCommand }) {
  const notificationSequenceRef = useRef(0);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [groups, setGroups] = useState<CaptureGroup[]>([]);
  const [clearDockState, setClearDockState] = useState({ pending: false, sequence: 0 });
  const clearDockPending = clearDockState.pending;
  const setClearDockPending = (pending: boolean) => {
    if (pending) {
      notificationSequenceRef.current += 1;
      setClearDockState({ pending: true, sequence: notificationSequenceRef.current });
      return;
    }
    setClearDockState((current) => ({ ...current, pending: false }));
  };
  const [railOrder, setRailOrder] = useState<RailOrderItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [inputMode, setInputMode] = useState<DockInputMode>("dock");
  const [captureFrameClean, setCaptureFrameClean] = useState(false);
  const [captureSession, setCaptureSession] = useState<CaptureSessionSnapshot | null>(null);
  const [activeAddTarget, setActiveAddTarget] = useState<CaptureAddTarget | null>(null);
  const [pendingAddCaptureIds, setPendingAddCaptureIds] = useState<string[]>([]);
  const [railInteractionActive, setRailInteractionActive] = useState(false);
  const [flyoutDismissRevision, setFlyoutDismissRevision] = useState(0);
  const [start, setStart] = useState<Point | null>(null);
  const [current, setCurrent] = useState<Point | null>(null);
  const [errorState, setErrorState] = useState({ message: "", sequence: 0 });
  const error = errorState.message;
  const setError = (message: string) => {
    if (message) {
      notificationSequenceRef.current += 1;
      setErrorState({ message, sequence: notificationSequenceRef.current });
      return;
    }
    setErrorState((current) => ({ ...current, message: "" }));
  };
  const [noticeState, setNoticeState] = useState({ message: "", sequence: 0 });
  const notice = noticeState.message;
  const setNotice = (message: string) => {
    if (message) {
      notificationSequenceRef.current += 1;
      setNoticeState({ message, sequence: notificationSequenceRef.current });
      return;
    }
    setNoticeState((current) => ({ ...current, message: "" }));
  };
  const [pendingDeletion, setPendingDeletion] = useState<{
    deletionId: string;
    expiresAt: number;
    kind: DeletionKind;
  } | null>(null);
  const [dragging, setDragging] = useState<InternalDrag | null>(null);
  const [blobCache, setBlobCache] = useState<Record<string, Blob>>({});
  const blobCacheRef = useRef<Record<string, Blob>>({});
  const blobLoadRef = useRef(new Map<string, Promise<Blob | undefined>>());
  const preparedDeliveryRef = useRef<{ key: string; blobs: Map<string, Blob> } | null>(null);
  const deliveryBlobCacheRef = useRef(new Map<string, { source: Blob; delivery: Blob }>());
  const preparationRevisionRef = useRef(0);
  const [preparedDeliveryKey, setPreparedDeliveryKey] = useState("");
  const [recentlyAddedCaptureId, setRecentlyAddedCaptureId] = useState<string | null>(null);
  const pendingDragPayload = useRef<DragPayload | null>(null);
  const lastDragPoint = useRef<Point | null>(null);
  const pageImageTarget = useRef<PageImageTarget | null>(null);
  const captureSessionRef = useRef<CaptureSessionSnapshot | null>(null);
  const captureSessionPromiseRef = useRef<Promise<CaptureSessionSnapshot> | null>(null);
  const pageImageSavedTimerRef = useRef<number | null>(null);
  const [pageImageAffordance, setPageImageAffordance] = useState<PageImageAffordance | null>(null);
  const [snipAvoidance, setSnipAvoidance] = useState<SnipAvoidance>({ toolbar: false, dock: false });
  const snipAvoidanceRef = useRef<SnipAvoidance>({ toolbar: false, dock: false });
  const dockRef = useRef<HTMLElement | null>(null);
  const captureToolbarRef = useRef<HTMLDivElement | null>(null);
  const snipDockOriginRectRef = useRef<DOMRect | null>(null);
  const snipToolbarOriginRectRef = useRef<DOMRect | null>(null);
  const captureMode = inputMode === "snip";

  const applyLibraryState = useCallback((library: LibraryState) => {
    setCaptures(library.captures);
    setGroups(library.groups);
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
    refreshLibrary()
      .then(() => undefined)
      .catch((loadError) => setError(errorText(loadError)));
  }, [refreshLibrary]);

  useEffect(() => {
    blobCacheRef.current = blobCache;
  }, [blobCache]);

  const addToBlobCache = useCallback((entries: Array<readonly [string, Blob] | undefined>) => {
    setBlobCache((current) => {
      const next = cacheCaptureBlobs(current, entries);
      blobCacheRef.current = next;
      return next;
    });
  }, []);

  useEffect(
    () => () => {
      if (pageImageSavedTimerRef.current !== null) {
        window.clearTimeout(pageImageSavedTimerRef.current);
      }
      blobLoadRef.current.clear();
      preparedDeliveryRef.current = null;
      deliveryBlobCacheRef.current.clear();
    },
    []
  );

  const requireCaptureBlobs = useCallback(async (captureIds: string[]) => {
    const key = deliveryCaptureKey(captureIds);
    if (preparedDeliveryRef.current?.key === key) return;
    const preparationRevision = ++preparationRevisionRef.current;
    const requested = new Set(captureIds);
    const requestedCaptures = captures.filter((capture) => requested.has(capture.id));
    if (requestedCaptures.length !== requested.size) return;
    const loadedEntries = await Promise.all(
      requestedCaptures.map(async (capture) => {
        const cached = blobCacheRef.current[capture.id];
        if (cached) return [capture.id, cached] as const;
        let load = blobLoadRef.current.get(capture.id);
        if (!load) {
          load = loadCaptureBlob(capture.imageBlobKey).finally(() => {
            blobLoadRef.current.delete(capture.id);
          });
          blobLoadRef.current.set(capture.id, load);
        }
        const blob = await load;
        return blob ? ([capture.id, blob] as const) : undefined;
      })
    );
    const completeEntries = loadedEntries.filter((entry): entry is readonly [string, Blob] => Boolean(entry));
    if (completeEntries.length !== captureIds.length) return;
    let deliveryEntries: Array<readonly [string, Blob]>;
    try {
      deliveryEntries = await Promise.all(
        completeEntries.map(async ([captureId, source]) => {
          const cached = deliveryBlobCacheRef.current.get(captureId);
          if (cached?.source === source) return [captureId, cached.delivery] as const;
          const delivery = await prepareDeliveryImage(source);
          deliveryBlobCacheRef.current.delete(captureId);
          deliveryBlobCacheRef.current.set(captureId, { source, delivery });
          while (deliveryBlobCacheRef.current.size > MAX_BLOB_CACHE_ENTRIES) {
            const oldestCaptureId = deliveryBlobCacheRef.current.keys().next().value;
            if (!oldestCaptureId) break;
            deliveryBlobCacheRef.current.delete(oldestCaptureId);
          }
          return [captureId, delivery] as const;
        })
      );
    } catch (preparationError) {
      if (preparationRevisionRef.current === preparationRevision) {
        setError(`Could not prepare this image for delivery. ${errorText(preparationError)}`);
      }
      return;
    }
    if (preparationRevisionRef.current !== preparationRevision) return;
    preparedDeliveryRef.current = { key, blobs: new Map(deliveryEntries) };
    setPreparedDeliveryKey(key);
    addToBlobCache(loadedEntries);
  }, [addToBlobCache, captures]);

  useEffect(() => {
    const rememberDragPoint = (event: DragEvent) => {
      if (!pendingDragPayload.current) return;
      if (event.clientX || event.clientY) {
        lastDragPoint.current = { x: event.clientX, y: event.clientY };
      }
    };
    const handlePageDrop = (event: DragEvent) => {
      rememberDragPoint(event);
      const pathTarget = event.composedPath()[0];
      const targetNode = pathTarget instanceof Node
        ? pathTarget
        : event.target instanceof Node
          ? event.target
          : null;
      const dropOptions = {
        hasPendingPayload: Boolean(pendingDragPayload.current),
        isTrusted: event.isTrusted,
        isDockSnipTarget: Boolean(targetNode && isDockSnipNode(targetNode))
      };
      if (!shouldSuppressNativePageDrop({
        ...dropOptions
      })) return;

      event.preventDefault();
      event.stopImmediatePropagation();
    };
    document.addEventListener("dragover", rememberDragPoint, true);
    document.addEventListener("drop", handlePageDrop, true);
    return () => {
      document.removeEventListener("dragover", rememberDragPoint, true);
      document.removeEventListener("drop", handlePageDrop, true);
    };
  }, []);

  useEffect(() => {
    if (!recentlyAddedCaptureId) return;
    const timer = window.setTimeout(() => setRecentlyAddedCaptureId(null), 900);
    return () => window.clearTimeout(timer);
  }, [recentlyAddedCaptureId]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(""), TOOLBAR_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!notice) return;
    const delay = pendingDeletion
      ? Math.max(0, pendingDeletion.expiresAt - Date.now())
      : TOOLBAR_NOTICE_MS;
    const timer = window.setTimeout(() => {
      setPendingDeletion(null);
      setNotice("");
    }, delay);
    return () => window.clearTimeout(timer);
  }, [notice, pendingDeletion]);

  useEffect(() => {
    captureSessionRef.current = captureSession;
  }, [captureSession]);

  const activeRect = useMemo(() => {
    if (!start || !current) return null;
    return normalizeRect(start, current);
  }, [current, start]);

  const captureSelection = async (rect: Rect, sessionId = captureSessionRef.current?.sessionId) => {
    flushSync(() => setCaptureFrameClean(true));
    await waitForCleanCaptureFrame();
    try {
      return await sendBackground<CaptureSelectionResult>({
        type: "JUSTSNAP_CAPTURE_SELECTION",
        sessionId,
        rect,
        viewport: viewportMetrics()
      });
    } finally {
      setCaptureFrameClean(false);
      const clearedAvoidance = { toolbar: false, dock: false };
      snipAvoidanceRef.current = clearedAvoidance;
      setSnipAvoidance(clearedAvoidance);
      snipDockOriginRectRef.current = null;
      snipToolbarOriginRectRef.current = null;
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
      setCaptureFrameClean(false);
    }
  };

  const startAddMode = async (addTarget: CaptureAddTarget) => {
    setError("");
    if (captureSessionRef.current) {
      await finishSnipSession({ keepDestination: false });
    }
    setActiveAddTarget(addTarget);
    await sendBackground({ type: "JUSTSNAP_SET_ADD_TARGET", addTarget }).catch((targetError) =>
      setError(errorText(targetError))
    );
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
    snipDockOriginRectRef.current = dockRef.current?.getBoundingClientRect() ?? null;
    snipToolbarOriginRectRef.current = captureToolbarRef.current?.getBoundingClientRect() ?? null;
    const clearedAvoidance = { toolbar: false, dock: false };
    snipAvoidanceRef.current = clearedAvoidance;
    setSnipAvoidance(clearedAvoidance);
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
    if (!start) return;
    const endPoint = { x: event.clientX, y: event.clientY };
    const rect = normalizeRect(start, endPoint);
    if (rect.width < MIN_SELECTION_WIDTH || rect.height < MIN_SELECTION_HEIGHT) {
      setStart(null);
      setCurrent(null);
      const clearedAvoidance = { toolbar: false, dock: false };
      snipAvoidanceRef.current = clearedAvoidance;
      setSnipAvoidance(clearedAvoidance);
      snipDockOriginRectRef.current = null;
      snipToolbarOriginRectRef.current = null;
      setError("Select a larger area.");
      return;
    }

    const finalAvoidance = snipAvoidanceForSelection(rect, {
      dock: snipDockOriginRectRef.current,
      toolbar: snipToolbarOriginRectRef.current
    });
    snipAvoidanceRef.current = finalAvoidance;
    flushSync(() => {
      setSnipAvoidance(finalAvoidance);
      setStart(null);
      setCurrent(null);
    });

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
      if (blob) addToBlobCache([[result.capture.id, blob]]);
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
    const clearedAvoidance = { toolbar: false, dock: false };
    snipAvoidanceRef.current = clearedAvoidance;
    setSnipAvoidance(clearedAvoidance);
    snipDockOriginRectRef.current = null;
    snipToolbarOriginRectRef.current = null;
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
    setCaptureFrameClean(false);
    const clearedAvoidance = { toolbar: false, dock: false };
    snipAvoidanceRef.current = clearedAvoidance;
    setSnipAvoidance(clearedAvoidance);
    snipDockOriginRectRef.current = null;
    snipToolbarOriginRectRef.current = null;
    if (!session) {
      if (!keepDestination) {
        setActiveAddTarget(null);
        await sendBackground({ type: "JUSTSNAP_SET_ADD_TARGET" }).catch(() => undefined);
      }
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
        if (createdGroup) {
          const nextTarget = { kind: "group" as const, id: createdGroup.id };
          setActiveAddTarget(nextTarget);
          await sendBackground({ type: "JUSTSNAP_SET_ADD_TARGET", addTarget: nextTarget }).catch(() => undefined);
        }
      }
    }
    setPendingAddCaptureIds([]);
    if (!keepDestination) {
      setActiveAddTarget(null);
      await sendBackground({ type: "JUSTSNAP_SET_ADD_TARGET" }).catch(() => undefined);
    }
  };

  const finishDestination = async () => {
    await finishSnipSession({ keepDestination: false });
    setActiveAddTarget(null);
    setInputMode("dock");
  };

  useEffect(() => {
    if (command?.type === "start_capture") void beginCapture(command.session);
    if (command?.type === "restore_add_target") {
      setActiveAddTarget(command.addTarget ?? null);
      setInputMode("dock");
    }
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
      if (captureMode) void activateDockMode();
      else void finishDestination();
    };
    document.addEventListener("keydown", finishOnShortcut, true);
    return () => document.removeEventListener("keydown", finishOnShortcut, true);
  }, [activeAddTarget, captureMode, captureSession]);

  const closeRail = async () => {
    await sendBackground({ type: "JUSTSNAP_CLOSE_RAIL_GLOBAL" }).catch(() => unmountRail());
  };

  const startItemDrag = (
    event: React.DragEvent,
    drag: InternalDrag,
    captureIds: string[]
  ) => {
    const transfer = event.dataTransfer;
    void requireCaptureBlobs(captureIds);
    const prepared = new Map(
      Object.entries(blobCacheRef.current).map(([captureId, source]) => {
        const cached = deliveryBlobCacheRef.current.get(captureId);
        return [captureId, cached?.source === source ? cached.delivery : source] as const;
      })
    );
    const files = filesForDelivery(captureIds, captures, prepared);

    if (!files?.length) {
      event.preventDefault();
      setDragging(null);
      setError("Image data is still loading. Try again in a moment.");
      return;
    }

    setDragging(drag);
    pendingDragPayload.current = { files };
    lastDragPoint.current = { x: event.clientX, y: event.clientY };
    transfer.clearData();
    transfer.effectAllowed = "copy";
    transfer.dropEffect = "copy";
    transfer.setData("application/x-justsnap", JSON.stringify(drag));
    for (const file of files) {
      try {
        transfer.items.add(file);
      } catch {
        // The current-page delivery adapter still runs on drag end when a browser
        // refuses to expose programmatically-created file items.
      }
    }

    const dragImage = dragPreviewElement(event.currentTarget, drag.kind);
    if (dragImage) transfer.setDragImage(dragImage, 24, 24);

  };

  const copyCapture = async (captureId: string) => {
    setError("");
    setNotice("");
    const capture = captures.find((entry) => entry.id === captureId);
    if (!capture) return;
    const blob = blobCacheRef.current[captureId] ?? await loadCaptureBlob(capture.imageBlobKey);
    const file = captureFileForDrag(blob);
    if (!file) {
      setError("Could not load that image for copying.");
      return;
    }
    addToBlobCache([[captureId, blob]]);
    if (!await copyFilesToClipboard([file])) {
      setError("Could not copy this image. Try copying again from the Dock.");
      return;
    }
    setNotice("Copied image to clipboard.");
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

    const result = await placeFilesInCurrentPage(payload.files, { currentOrigin, isDockSnipNode }, target);
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
      name: "New folder",
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
    await sendBackground({ type: "JUSTSNAP_SET_ADD_TARGET" }).catch(() => undefined);
  };

  const showDeletionUndo = (result: DeletionResult, message: string) => {
    applyLibraryState(result.library);
    if (result.deletionId && result.expiresAt && result.kind) {
      setPendingDeletion({ deletionId: result.deletionId, expiresAt: result.expiresAt, kind: result.kind });
      setNotice(message);
    }
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
      for (const captureId of captureIds) {
        delete next[captureId];
        deliveryBlobCacheRef.current.delete(captureId);
      }
      return next;
    });
    const result = await sendBackground<DeletionResult>({ type: "JUSTSNAP_DELETE_GROUP", groupId });
    showDeletionUndo(result, "Folder deleted.");
  };

  const undoDeletion = async () => {
    const deletion = pendingDeletion;
    if (!deletion) return;
    const library = await sendBackground<LibraryState>({
      type: "JUSTSNAP_UNDO_DELETE",
      deletionId: deletion.deletionId
    });
    applyLibraryState(library);
    setPendingDeletion(null);
    setNotice(
      deletion.kind === "capture"
        ? "Image restored."
        : deletion.kind === "group"
          ? "Folder restored."
          : "Dock restored."
    );
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
      deliveryBlobCacheRef.current.delete(captureId);
      return next;
    });
    const result = await sendBackground<DeletionResult>({ type: "JUSTSNAP_DELETE_CAPTURE", captureId });
    showDeletionUndo(result, "Image deleted.");
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
    if (group) await startAddMode({ kind: "group", id: group.id });
  };

  const clearDock = async () => {
    const session = captureSessionRef.current;
    if (session) {
      await sendBackground({ type: "JUSTSNAP_CANCEL_CAPTURE_SESSION", sessionId: session.sessionId }).catch(() => undefined);
    }
    resetCaptureState();
    await sendBackground({ type: "JUSTSNAP_SET_ADD_TARGET" }).catch(() => undefined);
    setBlobCache({});
    blobCacheRef.current = {};
    blobLoadRef.current.clear();
    deliveryBlobCacheRef.current.clear();
    const result = await sendBackground<DeletionResult>({ type: "JUSTSNAP_CLEAR_LIBRARY" });
    showDeletionUndo(result, "Dock cleared.");
    setClearDockPending(false);
  };

  useEffect(() => {
    if (!clearDockPending) return;
    const cancelClear = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setClearDockPending(false);
    };
    document.addEventListener("keydown", cancelClear, true);
    return () => document.removeEventListener("keydown", cancelClear, true);
  }, [clearDockPending]);

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
      const targetElement =
        target instanceof Element
          ? target
          : target instanceof Node
            ? target.parentElement
            : null;
      if (targetElement?.closest(".justsnap-rail")) {
        pageImageTarget.current = null;
        setPageImageAffordance(null);
        return;
      }
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
      if (blob) addToBlobCache([[capture.id, blob]]);
      setRecentlyAddedCaptureId(capture.id);
      if (addTarget) {
        await addImportedCaptureToTarget(capture, addTarget);
      } else {
        await refreshLibrary();
      }
      setPageImageAffordance((currentAffordance) =>
        currentAffordance ? { ...currentAffordance, status: "saved" } : currentAffordance
      );
      if (pageImageSavedTimerRef.current !== null) {
        window.clearTimeout(pageImageSavedTimerRef.current);
      }
      pageImageSavedTimerRef.current = window.setTimeout(() => {
        pageImageSavedTimerRef.current = null;
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
    const nextTarget = { kind: "group" as const, id: groupId };
    setActiveAddTarget(nextTarget);
    await sendBackground({ type: "JUSTSNAP_SET_ADD_TARGET", addTarget: nextTarget }).catch((targetError) =>
      setError(errorText(targetError))
    );
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
  const railLayout = dockLayoutForCount(orderedRailOrder.length + RAIL_CONTROL_ENTRY_COUNT);
  const draggedRailItem = dragging ? dragToRailItem(dragging) : null;
  const dockAddTarget = activeAddTarget ?? captureSession?.addTarget;
  const railStyle = {
    "--justsnap-rail-surface": `${railLayout.surfaceWidth}px`,
    "--justsnap-dock-base": `${railLayout.baseSize}px`,
    "--justsnap-dock-gap": `${railLayout.gap}px`
  } as React.CSSProperties;
  const shortcutModifier = platformShortcutModifier();
  const destinationLabel = activeAddTarget
    ? activeAddTarget.kind === "group"
      ? "folder"
      : "image"
    : null;
  const toolbarTitle = destinationLabel ? `Adding to ${destinationLabel}` : "Add images to your dock";
  const toolbarDescription = activeAddTarget
    ? "Dock images or snip screenshots into this folder."
    : "Dock images or snip any area of the screen.";
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

  const notificationSurfaces = [
    clearDockPending
      ? { key: "clear-dock", sequence: clearDockState.sequence, kind: "clear-dock" as const }
      : null,
    error
      ? { key: "error", sequence: errorState.sequence, kind: "error" as const }
      : null,
    !error && notice
      ? { key: "notice", sequence: noticeState.sequence, kind: "notice" as const }
      : null
  ]
    .filter((surface): surface is NonNullable<typeof surface> => Boolean(surface))
    .sort((first, second) => second.sequence - first.sequence);

  const updateSnipSurfaceOverlap = (point: Point) => {
    if (!captureMode || !start) return;
    const nextAvoidance = snipAvoidanceForSelection(normalizeRect(start, point), {
      dock: snipDockOriginRectRef.current,
      toolbar: snipToolbarOriginRectRef.current
    });
    if (
      nextAvoidance.dock === snipAvoidanceRef.current.dock &&
      nextAvoidance.toolbar === snipAvoidanceRef.current.toolbar
    ) return;
    snipAvoidanceRef.current = nextAvoidance;
    setSnipAvoidance(nextAvoidance);
  };

  return (
    <>
      <style>{styles}</style>
      <DockFrame
        ref={dockRef}
        className={[
          railInteractionActive ? "justsnap-rail-expanded" : "",
          dockAddTarget ? "justsnap-rail-add-focused" : "",
          captureMode && snipAvoidance.dock ? "justsnap-snip-surface-retreated justsnap-snip-dock-retreated" : "",
          captureMode && captureFrameClean && snipAvoidance.dock ? "justsnap-capture-frame-clean-surface" : ""
        ].filter(Boolean).join(" ")}
        style={railStyle}
        draggedItem={draggedRailItem}
        onFallbackDrop={applyRailDropIntent}
        top={
          <button
            className="justsnap-rail-control"
            aria-label="Add Folder"
            data-tooltip="Add Folder"
            disabled={Boolean(dockAddTarget)}
            onPointerEnter={() => setFlyoutDismissRevision((revision) => revision + 1)}
            onClick={() => void createEmptyFolder()}
          >
            <FolderPlus size={18} />
          </button>
        }
        bottom={
          <button
            className="justsnap-rail-control justsnap-clear-dock-control"
            aria-label="Clear Dock"
            data-tooltip="Clear Dock"
            disabled={!railOrder.length || Boolean(dockAddTarget)}
            onPointerEnter={() => setFlyoutDismissRevision((revision) => revision + 1)}
            onClick={() => setClearDockPending(true)}
          >
            <Trash2 size={18} />
          </button>
        }
      >
        <LibraryView
          captures={captures}
          groups={groups}
          railOrder={orderedRailOrder}
          blobCache={blobCache}
          dragging={dragging}
          recentlyAddedCaptureId={recentlyAddedCaptureId}
          activeAddTarget={dockAddTarget}
          pendingAddCaptures={pendingAddCaptures}
          flyoutDismissRevision={flyoutDismissRevision}
          layout={railLayout}
          onStartDrag={startItemDrag}
          onEndDrag={finishItemDrag}
          onDropIntent={applyRailDropIntent}
          onRemoveGroup={removeGroup}
          onRemoveCapture={removeCapture}
          onCopyCapture={(captureId) => void copyCapture(captureId)}
          onAddToGroup={(groupId) => void startAddMode({ kind: "group", id: groupId })}
          onAddToCapture={(captureId) => void startAddMode({ kind: "capture", id: captureId })}
          onInteractionChange={setRailInteractionActive}
          onRequireCaptures={requireCaptureBlobs}
          preparedDeliveryKey={preparedDeliveryKey}
        />
      </DockFrame>

      {notificationSurfaces.length > 0 && (
        <div className="justsnap-notification-stack">
          {notificationSurfaces.map((surface) => (
            <div className="justsnap-notification-stack-item" key={surface.key}>
              {surface.kind === "clear-dock" ? (
                <div className="justsnap-dock-delete-confirm" role="alertdialog" aria-modal="true" aria-label="Clear Dock">
                  <AlertTriangle className="justsnap-dock-delete-confirm-icon" size={17} aria-hidden="true" />
                  <span>
                    <strong>Clear everything from this dock?</strong>
                    <small>All images and folders will be permanently deleted.</small>
                  </span>
                  <div>
                    <button onClick={() => setClearDockPending(false)}>Cancel</button>
                    <button className="justsnap-danger-button" onClick={() => void clearDock()}>Clear all</button>
                  </div>
                </div>
              ) : surface.kind === "error" ? (
                <ToolbarNotice tone="error" message={<FriendlyErrorMessage error={error} />} onDismiss={() => setError("")} />
              ) : (
                <ToolbarNotice
                  tone="info"
                  message={notice}
                  actionLabel={pendingDeletion ? "Undo" : undefined}
                  onAction={pendingDeletion ? () => void undoDeletion() : undefined}
                  onDismiss={() => {
                    setPendingDeletion(null);
                    setNotice("");
                  }}
                />
              )}
            </div>
          ))}
        </div>
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
          {pageImageAffordance.status === "saved" ? <Check size={17} /> : <Plus size={17} />}
        </button>
      )}

      {!captureMode && (
        <div className="justsnap-capture-toolbar" onPointerDown={(event) => event.stopPropagation()}>
          <ToolbarLogomark />
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
            <button className="justsnap-capture-done" title="Finish adding (Enter)" onClick={() => void finishDestination()}>
              {toolbarDestinationCaptures.length > 0 && (
                <ToolbarDestinationPreview captures={toolbarDestinationCaptures} />
              )}
              <span>Finish adding</span>
              <kbd className="justsnap-shortcut-key" aria-hidden="true">
                <CornerDownLeft size={12} />
              </kbd>
            </button>
          )}
          <ToolbarActions shortcutModifier={shortcutModifier} onClose={closeRail} />
        </div>
      )}

      {captureMode && (
        <div
          className={["justsnap-capture-layer", captureFrameClean ? "justsnap-capture-frame-clean" : ""].join(" ")}
          onPointerDown={beginSelection}
          onPointerMove={(event) => {
            updateSnipSurfaceOverlap({ x: event.clientX, y: event.clientY });
            updateSelection(event);
          }}
          onPointerUp={finishSelection}
        >
          <div
            ref={captureToolbarRef}
            className={[
              "justsnap-capture-toolbar",
              snipAvoidance.toolbar ? "justsnap-snip-surface-retreated justsnap-snip-toolbar-retreated" : "",
              captureFrameClean && snipAvoidance.toolbar ? "justsnap-capture-frame-clean-surface" : ""
            ].filter(Boolean).join(" ")}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <ToolbarLogomark />
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
              title="Done snipping (Enter)"
              onClick={() => void activateDockMode()}
            >
              <span>Done snipping</span>
              <kbd className="justsnap-shortcut-key" aria-hidden="true">
                <CornerDownLeft size={12} />
              </kbd>
            </button>
            <ToolbarActions shortcutModifier={shortcutModifier} onClose={closeRail} />
          </div>
          {activeRect && <div className="justsnap-selection" style={rectStyle(activeRect)} />}
        </div>
      )}
    </>
  );
}

function ToolbarLogomark() {
  return (
    <img
      className="justsnap-toolbar-logomark"
      src={chrome.runtime.getURL("logos/docksnip-logomark.svg")}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

function ToolbarActions({
  shortcutModifier,
  onClose
}: {
  shortcutModifier: string;
  onClose: () => void;
}) {
  return (
    <div className="justsnap-toolbar-actions" role="group" aria-label="DockSnip controls">
      <button
        className="justsnap-toolbar-icon-button justsnap-capture-close"
        aria-label={`Close ${shortcutModifier} ⇧ X`}
        title={`Close (${shortcutModifier} ⇧ X)`}
        onClick={onClose}
      >
        <X size={17} />
      </button>
    </div>
  );
}

function ToolbarNotice({
  tone,
  message,
  actionLabel,
  onAction,
  onDismiss
}: {
  tone: "error" | "info";
  message: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
}) {
  const Icon = tone === "error" ? AlertCircle : Info;
  return (
    <section
      className={`justsnap-toolbar-notice justsnap-toolbar-notice-${tone}`}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
    >
      <Icon className="justsnap-toolbar-notice-icon" size={17} aria-hidden="true" />
      <p className="justsnap-toolbar-notice-message">{message}</p>
      <button className="justsnap-toolbar-notice-action" onClick={onAction ?? onDismiss}>{actionLabel ?? "OK"}</button>
    </section>
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

function cacheCaptureBlobs(
  current: Record<string, Blob>,
  entries: ReadonlyArray<readonly [string, Blob] | undefined>
): Record<string, Blob> {
  const next = new Map(Object.entries(current));
  for (const entry of entries) {
    if (!entry) continue;
    next.delete(entry[0]);
    next.set(entry[0], entry[1]);
  }
  while (next.size > MAX_BLOB_CACHE_ENTRIES) {
    const oldestKey = next.keys().next().value;
    if (oldestKey === undefined) break;
    next.delete(oldestKey);
  }
  return Object.fromEntries(next);
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
  return element instanceof HTMLImageElement ? element.currentSrc || element.src || undefined : undefined;
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

function waitForCleanCaptureFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
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

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function FriendlyErrorMessage({ error }: { error: string }) {
  if (!isInsertionFailure(error)) return friendlyErrorMessage(error);
  return (
    <>
      Couldn't add the image here. Try copying the image
      <Copy className="justsnap-inline-copy-icon" size={14} aria-label="Copy" role="img" />
      from the Dock and pasting it into the page.
    </>
  );
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
