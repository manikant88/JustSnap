import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Copy, Folder, Plus, Trash2 } from "lucide-react";
import { nextFolderColorSlot } from "../../../shared/folderColor";
import type { Capture, CaptureAddTarget, CaptureGroup, RailOrderItem } from "../../../shared/types";
import {
  dockCapturePreviewFrame,
  dockCaptureThumbnailSize,
  dockFolderSize,
  dockInfluence,
  dockItemGap,
  dockLayoutForCount,
  dynamicIslandEdgePath,
  dynamicIslandPath,
  useDockPreviewOffset
} from "../dockLayout";
import type { DockLayout } from "../dockLayout";
import type { InternalDrag, RailDropIntent } from "../types";
import { verticalDropZoneForElement } from "./dndIntent";
import { deliveryCaptureKey } from "../drag/deliveryPreparation";
import { folderToneForSlot } from "../folderAppearance";

type RailEntry =
  | { kind: "group"; group: CaptureGroup; captures: Capture[] }
  | { kind: "capture"; capture: Capture };

type DragFolderPreview =
  | { kind: "group"; groupId: string; draggedCaptureId: string }
  | { kind: "capture"; targetCaptureId: string; draggedCaptureId: string };

const FOLDER_PREVIEW_SLOW_DWELL_MS = 220;
const FOLDER_PREVIEW_MEDIUM_DWELL_MS = 300;
const FOLDER_PREVIEW_FAST_DWELL_MS = 420;
const FOLDER_PREVIEW_EXIT_GRACE_MS = 180;

export function LibraryView(props: {
  captures: Capture[];
  groups: CaptureGroup[];
  railOrder: RailOrderItem[];
  blobCache: Record<string, Blob>;
  dragging: InternalDrag | null;
  recentlyAddedCaptureId: string | null;
  activeAddTarget?: CaptureAddTarget;
  pendingAddCaptures: Capture[];
  flyoutDismissRevision: number;
  layout: DockLayout;
  onStartDrag: (event: React.DragEvent, drag: InternalDrag, captureIds: string[]) => void;
  onEndDrag: (event: React.DragEvent) => void;
  onDropIntent: (intent: RailDropIntent) => void;
  onRemoveGroup: (groupId: string) => void;
  onRemoveCapture: (captureId: string) => void;
  onCopyCapture: (captureId: string) => void;
  onAddToGroup: (groupId: string) => void;
  onAddToCapture: (captureId: string) => void;
  onInteractionChange: (active: boolean) => void;
  onRequireCaptures: (captureIds: string[]) => void;
  preparedDeliveryKey: string;
  presentationOnly?: boolean;
}) {
  const libraryRef = useRef<HTMLDivElement | null>(null);
  const islandShapeRef = useRef<SVGSVGElement | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [dropIntent, setDropIntent] = useState<RailDropIntent | null>(null);
  const dropIntentRef = useRef<RailDropIntent | null>(null);
  const [hoverLockedAfterDrag, setHoverLockedAfterDrag] = useState(false);
  const [dragFolderPreview, setDragFolderPreview] = useState<DragFolderPreview | null>(null);
  const dragFolderPreviewRef = useRef<DragFolderPreview | null>(null);
  const dragFolderPreviewTimerRef = useRef<number | null>(null);
  const dragFolderPreviewCandidateRef = useRef<string | null>(null);
  const dragFolderPreviewCandidateDelayRef = useRef<number | null>(null);
  const dragFolderPreviewExitTimerRef = useRef<number | null>(null);
  const dragFolderPreviewAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const dragMotionRef = useRef({ x: 0, y: 0, at: 0, speed: 0 });
  const onInteractionChange = props.onInteractionChange;
  const interactive = !props.presentationOnly;
  const pointerHoverEnabled = interactive && !props.dragging && !hoverLockedAfterDrag;
  const focusedIndex = pointerHoverEnabled ? hoveredIndex : null;
  const setItemHoveredIndex = (index: number | null) => {
    if (pointerHoverEnabled) setHoveredIndex(index);
  };
  const captureById = useMemo(
    () => new Map(props.captures.map((capture) => [capture.id, capture])),
    [props.captures]
  );
  const pendingFolderColorSlot = nextFolderColorSlot(props.groups);
  const visibleGroups = useMemo(
    () =>
      props.groups
        .map((group) => ({
          group,
          captures: group.captureIds
            .map((captureId) => captureById.get(captureId))
            .filter((capture): capture is Capture => Boolean(capture))
        })),
    [captureById, props.groups]
  );
  const visibleGroupById = useMemo(
    () => new Map(visibleGroups.map((entry) => [entry.group.id, entry])),
    [visibleGroups]
  );
  const entries = useMemo<RailEntry[]>(
    () => {
      const groupedCaptureIds = new Set(visibleGroups.flatMap((entry) => entry.group.captureIds));
      return props.railOrder
        .map((item) => {
          if (item.kind === "group") {
            const group = visibleGroupById.get(item.id);
            if (!group) return undefined;
            let captures =
              props.activeAddTarget?.kind === "group" && props.activeAddTarget.id === item.id
                ? [...group.captures, ...props.pendingAddCaptures]
                : group.captures;
            if (dragFolderPreview?.kind === "group" && dragFolderPreview.groupId === item.id) {
              const draggedCapture = captureById.get(dragFolderPreview.draggedCaptureId);
              if (draggedCapture && !captures.some((capture) => capture.id === draggedCapture.id)) {
                captures = [...captures, draggedCapture];
              }
            }
            return { kind: "group" as const, group: group.group, captures } satisfies RailEntry;
          }
          const capture = captureById.get(item.id);
          if (capture && groupedCaptureIds.has(capture.id)) return undefined;
          return capture ? ({ kind: "capture" as const, capture } satisfies RailEntry) : undefined;
        })
        .filter((entry): entry is RailEntry => Boolean(entry));
    },
    [
      captureById,
      dragFolderPreview,
      props.activeAddTarget,
      props.pendingAddCaptures,
      props.railOrder,
      visibleGroupById,
      visibleGroups
    ]
  );
  const layout = props.layout;
  const activeAddTargetIndex = props.activeAddTarget
    ? entries.findIndex((entry) =>
        entry.kind === props.activeAddTarget?.kind &&
        (entry.kind === "group" ? entry.group.id : entry.capture.id) === props.activeAddTarget.id
      )
    : -1;
  const draggedCaptureId = props.dragging?.kind === "capture" ? props.dragging.captureId : null;
  const draggedCaptureSourceGroupId = draggedCaptureId
    ? visibleGroups.find((entry) => entry.group.captureIds.includes(draggedCaptureId))?.group.id ?? null
    : null;
  const updateDropIntent = (intent: RailDropIntent | null) => {
    dropIntentRef.current = intent;
    setDropIntent(intent);
  };
  const clearDragFolderPreviewTimer = () => {
    if (dragFolderPreviewTimerRef.current !== null) {
      window.clearTimeout(dragFolderPreviewTimerRef.current);
      dragFolderPreviewTimerRef.current = null;
    }
    dragFolderPreviewCandidateRef.current = null;
    dragFolderPreviewCandidateDelayRef.current = null;
  };
  const clearDragFolderPreviewExitTimer = () => {
    if (dragFolderPreviewExitTimerRef.current === null) return;
    window.clearTimeout(dragFolderPreviewExitTimerRef.current);
    dragFolderPreviewExitTimerRef.current = null;
  };
  const clearDragFolderPreview = () => {
    clearDragFolderPreviewTimer();
    clearDragFolderPreviewExitTimer();
    const current = dragFolderPreviewRef.current;
    dragFolderPreviewRef.current = null;
    dragFolderPreviewAnchorRef.current = null;
    setDragFolderPreview(null);
    if (current?.kind === "group" && current.groupId !== draggedCaptureSourceGroupId) {
      setActiveGroupId((active) => active === current.groupId ? null : active);
    }
  };
  const scheduleDragFolderPreview = (intent: RailDropIntent) => {
    if (!draggedCaptureId || intent.scope !== "rail") return;
    const preview: DragFolderPreview | null = intent.action === "create-folder"
      ? { kind: "capture", targetCaptureId: intent.target.id, draggedCaptureId }
      : intent.action === "add-to-folder"
        ? { kind: "group", groupId: intent.target.id, draggedCaptureId }
        : null;
    if (!preview) return;
    const key = preview.kind === "group" ? `group:${preview.groupId}` : `capture:${preview.targetCaptureId}`;
    const current = dragFolderPreviewRef.current;
    const currentKey = current
      ? current.kind === "group" ? `group:${current.groupId}` : `capture:${current.targetCaptureId}`
      : null;
    if (currentKey === key) return;

    const dwellMs = folderPreviewDwellMsForSpeed(dragMotionRef.current.speed);
    if (dragFolderPreviewCandidateRef.current === key) {
      const scheduledDelay = dragFolderPreviewCandidateDelayRef.current ?? dwellMs;
      if (dwellMs >= scheduledDelay) return;
      clearDragFolderPreviewTimer();
    }

    clearDragFolderPreview();
    dragFolderPreviewCandidateRef.current = key;
    dragFolderPreviewCandidateDelayRef.current = dwellMs;
    dragFolderPreviewTimerRef.current = window.setTimeout(() => {
      dragFolderPreviewTimerRef.current = null;
      dragFolderPreviewCandidateRef.current = null;
      dragFolderPreviewCandidateDelayRef.current = null;
      dragFolderPreviewRef.current = preview;
      dragFolderPreviewAnchorRef.current = {
        x: dragMotionRef.current.x,
        y: dragMotionRef.current.y
      };
      setDragFolderPreview(preview);
      setActiveGroupId(preview.kind === "group" ? preview.groupId : null);
    }, dwellMs);
  };
  const scheduleDragFolderPreviewExit = () => {
    if (dragFolderPreviewExitTimerRef.current !== null) return;
    dragFolderPreviewExitTimerRef.current = window.setTimeout(() => {
      dragFolderPreviewExitTimerRef.current = null;
      updateDropIntent(null);
      clearDragFolderPreview();
    }, FOLDER_PREVIEW_EXIT_GRACE_MS);
  };
  const setDropIntentWithPreview = (intent: RailDropIntent | null) => {
    const current = dragFolderPreviewRef.current;
    if (current) {
      if (intent?.scope === "rail" && (intent.action === "insert-before" || intent.action === "insert-after")) {
        const anchor = dragFolderPreviewAnchorRef.current;
        const targetMatchesPreview = current.kind === "group"
          ? intent.target.kind === "group" && intent.target.id === current.groupId
          : intent.target.kind === "capture" && intent.target.id === current.targetCaptureId;
        const pointerTravel = anchor
          ? Math.hypot(dragMotionRef.current.x - anchor.x, dragMotionRef.current.y - anchor.y)
          : Number.POSITIVE_INFINITY;
        const movingTowardFlyout = Boolean(anchor && dragMotionRef.current.x < anchor.x - 4);
        if (targetMatchesPreview && (pointerTravel <= 12 || movingTowardFlyout)) {
          clearDragFolderPreviewExitTimer();
          return;
        }
        clearDragFolderPreview();
        setActiveGroupId(null);
        updateDropIntent(intent);
        return;
      }
      if (intent?.scope === "folder") {
        clearDragFolderPreviewExitTimer();
        updateDropIntent(intent);
        return;
      }
      if (intent?.scope === "rail" && (intent.action === "create-folder" || intent.action === "add-to-folder")) {
        const matchesCurrent = current.kind === "capture"
          ? intent.action === "create-folder" && intent.target.id === current.targetCaptureId
          : intent.action === "add-to-folder" && intent.target.id === current.groupId;
        if (matchesCurrent) {
          clearDragFolderPreviewExitTimer();
          updateDropIntent(intent);
          return;
        }
        updateDropIntent(intent);
        scheduleDragFolderPreview(intent);
        return;
      }
      scheduleDragFolderPreviewExit();
      return;
    }

    updateDropIntent(intent);
    if (intent?.scope === "rail" && (intent.action === "insert-before" || intent.action === "insert-after")) {
      clearDragFolderPreview();
      setActiveGroupId(null);
      return;
    }
    if (intent?.scope === "rail" && (intent.action === "create-folder" || intent.action === "add-to-folder")) {
      scheduleDragFolderPreview(intent);
      return;
    }
    clearDragFolderPreview();
  };
  const keepSourceGroupOpenDuringDrag = Boolean(
    activeGroupId && draggedCaptureSourceGroupId === activeGroupId
  );
  const keepPreviewGroupOpenDuringDrag = Boolean(
    activeGroupId &&
    dragFolderPreview?.kind === "group" &&
    dragFolderPreview.groupId === activeGroupId
  );
  const activeGroupIndex = (
    pointerHoverEnabled || keepSourceGroupOpenDuringDrag || keepPreviewGroupOpenDuringDrag
  ) && activeGroupId
    ? entries.findIndex((entry) => entry.kind === "group" && entry.group.id === activeGroupId)
    : -1;
  const islandFocusIndex = activeGroupIndex >= 0
    ? activeGroupIndex
    : activeAddTargetIndex >= 0
      ? activeAddTargetIndex
      : focusedIndex;
  const islandFocusEntry =
    islandFocusIndex === null || islandFocusIndex < 0 ? undefined : entries[islandFocusIndex];
  const islandFocusKey = islandFocusEntry
    ? islandFocusEntry.kind === "group"
      ? `group:${islandFocusEntry.group.id}`
      : `capture:${islandFocusEntry.capture.id}`
    : null;

  useStablePointerHover({
    containerRef: libraryRef,
    dataAttribute: "data-docksnip-entry-index",
    focusedIndex: hoveredIndex,
    setFocusedIndex: setHoveredIndex,
    enabled: pointerHoverEnabled && activeGroupId === null && !props.activeAddTarget
  });
  useDynamicIslandShape({
    containerRef: libraryRef,
    shapeRef: islandShapeRef,
    focusedIndex: islandFocusIndex,
    focusedEntryKey: islandFocusKey,
    enabled: interactive
  });

  useEffect(() => {
    if (props.dragging) {
      setHoverLockedAfterDrag(true);
      setHoveredIndex(null);
      const activeDragCaptureId = props.dragging.kind === "capture" ? props.dragging.captureId : null;
      const dragStartedInsideActiveGroup = activeDragCaptureId !== null && visibleGroups.some(
        (entry) => entry.group.id === activeGroupId && entry.group.captureIds.includes(activeDragCaptureId)
      );
      const dragOpenedPreviewGroup = dragFolderPreviewRef.current?.kind === "group" &&
        dragFolderPreviewRef.current.groupId === activeGroupId;
      if (!dragStartedInsideActiveGroup && !dragOpenedPreviewGroup) setActiveGroupId(null);
      return;
    }
    if (!hoverLockedAfterDrag) return;
    const unlockHover = (event: PointerEvent) => {
      setHoverLockedAfterDrag(false);
      const library = libraryRef.current;
      if (!library) return;
      const entry = Array.from(library.querySelectorAll<HTMLElement>("[data-docksnip-entry-index]"))
        .find((element) => {
          const rect = element.getBoundingClientRect();
          return event.clientX >= rect.left && event.clientX <= rect.right &&
            event.clientY >= rect.top && event.clientY <= rect.bottom;
        });
      const index = Number.parseInt(entry?.dataset.docksnipEntryIndex ?? "", 10);
      setHoveredIndex(Number.isInteger(index) ? index : null);
    };
    document.addEventListener("pointermove", unlockHover, { capture: true, once: true });
    return () => document.removeEventListener("pointermove", unlockHover, true);
  }, [activeGroupId, hoverLockedAfterDrag, props.dragging, visibleGroups]);

  useEffect(() => {
    if (!interactive) return;
    if (!props.activeAddTarget) return;
    setHoveredIndex(null);
    if (props.activeAddTarget?.kind === "group") {
      setActiveGroupId(props.activeAddTarget.id);
    } else {
      setActiveGroupId(null);
    }
  }, [interactive, props.activeAddTarget]);

  useEffect(() => {
    if (!interactive || props.activeAddTarget) return;
    setActiveGroupId(null);
    setHoveredIndex(null);
  }, [interactive, props.activeAddTarget, props.flyoutDismissRevision]);

  useEffect(() => {
    if (!interactive || activeGroupId || hoveredIndex === null) return;
    const entry = entries[hoveredIndex];
    if (entry?.kind === "group") setActiveGroupId(entry.group.id);
  }, [activeGroupId, entries, hoveredIndex, interactive]);

  useEffect(() => {
    if (!interactive) return;
    if (!activeGroupId) return;
    if (props.activeAddTarget) return;
    const closeActiveGroup = (event: PointerEvent) => {
      const path = event.composedPath();
      if (isActiveRailInteraction(path)) return;
      setActiveGroupId(null);
      setHoveredIndex(null);
    };
    document.addEventListener("pointerdown", closeActiveGroup, true);
    return () => document.removeEventListener("pointerdown", closeActiveGroup, true);
  }, [activeGroupId, interactive, props.activeAddTarget]);

  useEffect(() => {
    if (!interactive) return;
    if (!activeGroupId || props.dragging) return;
    if (props.activeAddTarget) return;
    const closeWhenPointerLeavesGroup = (event: PointerEvent) => {
      const library = libraryRef.current;
      if (!library) return;
      const group = library.querySelector<HTMLElement>(
        `[data-justsnap-group-id="${CSS.escape(activeGroupId)}"]`
      );
      if (!group) {
        setActiveGroupId(null);
        setHoveredIndex(null);
        return;
      }
      const folderButton = group.querySelector<HTMLElement>(".justsnap-dock-folder-button");
      const proximityTargets = [
        ...(folderButton ? [folderButton] : []),
        ...group.querySelectorAll<HTMLElement>(".justsnap-group-flyout-slot")
      ];
      const isNearFlyout = proximityTargets.some(
        (target) => pointerDistanceFromRect(event.clientX, event.clientY, target.getBoundingClientRect()) <= 64
      );
      if (isNearFlyout) return;
      setActiveGroupId(null);
      setHoveredIndex(null);
    };
    document.addEventListener("pointermove", closeWhenPointerLeavesGroup, true);
    return () => document.removeEventListener("pointermove", closeWhenPointerLeavesGroup, true);
  }, [activeGroupId, interactive, props.activeAddTarget, props.dragging]);

  useEffect(() => {
    if (!props.dragging) {
      updateDropIntent(null);
      dragMotionRef.current = { x: 0, y: 0, at: 0, speed: 0 };
    }
  }, [props.dragging]);

  useEffect(() => {
    if (props.dragging) return;
    clearDragFolderPreview();
  }, [props.dragging]);

  useEffect(() => {
    if (!props.dragging) return;
    const cancelPreviewOutsideDock = (event: DragEvent) => {
      updateDragMotion(dragMotionRef.current, event.clientX, event.clientY, event.timeStamp);
      const library = libraryRef.current;
      if (!library) return;
      const railSlot = Array.from(
        library.querySelectorAll<HTMLElement>("[data-docksnip-rail-kind][data-docksnip-rail-id]")
      ).find((slot) => {
        const hitTarget = slot.querySelector<HTMLElement>(
          ".justsnap-dock-image-button, .justsnap-dock-folder-button"
        );
        return Boolean(hitTarget && pointWithinRect(event, hitTarget.getBoundingClientRect(), 4));
      });
      if (railSlot) {
        const kind = railSlot.dataset.docksnipRailKind;
        const id = railSlot.dataset.docksnipRailId;
        const intent = id
          ? kind === "capture"
            ? railIntentForCapturePoint(railSlot, event.clientY, id, props.dragging)
            : kind === "group"
              ? railIntentForGroupPoint(railSlot, event.clientY, id, props.dragging)
              : null
          : null;
        if (intent) {
          setDropIntentWithPreview(intent);
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
          return;
        }
      }
      if (!dragFolderPreviewRef.current && dragFolderPreviewCandidateRef.current === null) return;
      const preview = dragFolderPreviewRef.current;
      if (preview) {
        let previewIntent: RailDropIntent | null = null;
        if (preview.kind === "group") {
          const groupEntry = entries.find(
            (entry) => entry.kind === "group" && entry.group.id === preview.groupId
          );
          const flyout = library.querySelector<HTMLElement>(
            `[data-justsnap-group-id="${CSS.escape(preview.groupId)}"] .justsnap-group-flyout`
          );
          if (groupEntry?.kind === "group" && flyout && pointWithinRect(event, flyout.getBoundingClientRect(), 16)) {
            previewIntent = folderIntentForPointer(
              flyout,
              event.clientY,
              preview.groupId,
              groupEntry.captures,
              props.dragging
            );
          }
        } else {
          const flyout = library.querySelector<HTMLElement>(
            `[data-docksnip-rail-id="${CSS.escape(preview.targetCaptureId)}"] .justsnap-add-target-flyout`
          );
          if (flyout && pointWithinRect(event, flyout.getBoundingClientRect(), 16)) {
            previewIntent = newFolderIntentForPointer(
              flyout,
              event.clientY,
              preview.targetCaptureId,
              props.dragging
            );
          }
        }
        if (previewIntent) {
          clearDragFolderPreviewExitTimer();
          updateDropIntent(previewIntent);
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
          return;
        }
      }
      const regions = [
        library.getBoundingClientRect(),
        ...Array.from(library.querySelectorAll<HTMLElement>(".justsnap-group-flyout"))
          .map((element) => element.getBoundingClientRect())
      ];
      const remainsInDock = regions.some((rect) =>
        event.clientX >= rect.left - 16 &&
        event.clientX <= rect.right + 16 &&
        event.clientY >= rect.top - 16 &&
        event.clientY <= rect.bottom + 16
      );
      if (remainsInDock) {
        clearDragFolderPreviewExitTimer();
        return;
      }
      scheduleDragFolderPreviewExit();
    };
    document.addEventListener("dragover", cancelPreviewOutsideDock, true);
    return () => document.removeEventListener("dragover", cancelPreviewOutsideDock, true);
  }, [entries, props.dragging]);

  useEffect(() => {
    if (!props.dragging) return;
    const commitFlyoutDrop = (event: DragEvent) => {
      const intent = dropIntentRef.current;
      const isFlyoutIntent = intent?.scope === "folder" ||
        (intent?.scope === "rail" && intent.action === "create-folder" && Boolean(intent.position));
      if (!intent || !isFlyoutIntent) return;
      const library = libraryRef.current;
      if (!library) return;
      const insideFlyout = Array.from(
        library.querySelectorAll<HTMLElement>(".justsnap-group-flyout")
      ).some((flyout) => pointWithinRect(event, flyout.getBoundingClientRect(), 16));
      if (!insideFlyout) return;

      event.preventDefault();
      event.stopPropagation();
      updateDropIntent(null);
      clearDragFolderPreview();
      props.onDropIntent(intent);
    };
    document.addEventListener("drop", commitFlyoutDrop, true);
    return () => document.removeEventListener("drop", commitFlyoutDrop, true);
  }, [props.dragging, props.onDropIntent]);

  useEffect(() => () => {
    clearDragFolderPreviewTimer();
    clearDragFolderPreviewExitTimer();
  }, []);

  useEffect(() => {
    onInteractionChange(
      interactive && (hoveredIndex !== null || activeGroupId !== null || Boolean(props.activeAddTarget))
    );
  }, [activeGroupId, hoveredIndex, interactive, onInteractionChange, props.activeAddTarget]);

  useEffect(() => {
    if (!interactive) return;
    if (hoveredIndex === null) return;
    const entry = entries[hoveredIndex];
    if (!entry) return;
    props.onRequireCaptures(entry.kind === "group" ? entry.captures.map((capture) => capture.id) : [entry.capture.id]);
  }, [entries, hoveredIndex, interactive, props.onRequireCaptures]);

  useEffect(() => {
    if (!interactive) return;
    if (!activeGroupId) return;
    const group = entries.find((entry) => entry.kind === "group" && entry.group.id === activeGroupId);
    if (group?.kind === "group") props.onRequireCaptures(group.captures.map((capture) => capture.id));
  }, [activeGroupId, entries, interactive, props.onRequireCaptures]);

  return (
    <div
      ref={libraryRef}
      className={["justsnap-library", props.presentationOnly ? "justsnap-library-overview" : ""].join(" ")}
      tabIndex={0}
      style={
        {
          gap: 0,
          minHeight: entries.length
            ? entries.length * layout.baseSize + Math.max(0, entries.length - 1) * layout.gap
            : layout.baseSize,
          "--justsnap-rail-surface": `${layout.surfaceWidth}px`
        } as React.CSSProperties
      }
      onMouseLeave={() => setDropIntentWithPreview(null)}
    >
      <svg
        ref={islandShapeRef}
        className="justsnap-dynamic-island-shape"
        data-visible="false"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path className="justsnap-dynamic-island-contour" />
        <path className="justsnap-dynamic-island-edge" />
      </svg>
      {entries.map((entry, index) =>
        entry.kind === "group" ? (
          <GroupDockItem
            key={entry.group.id}
            index={index}
            group={entry.group}
            captures={entry.captures}
            blobCache={props.blobCache}
            deliveryReady={props.preparedDeliveryKey === deliveryCaptureKey(entry.group.captureIds)}
            focusedIndex={focusedIndex}
            addModeActive={Boolean(props.activeAddTarget)}
            active={interactive && (
              props.activeAddTarget
                ? props.activeAddTarget.kind === "group" && props.activeAddTarget.id === entry.group.id
                : activeGroupId === entry.group.id
            )}
            muted={Boolean(
              props.activeAddTarget &&
              !(props.activeAddTarget.kind === "group" && props.activeAddTarget.id === entry.group.id)
            )}
            presentationOnly={props.presentationOnly}
            baseSize={layout.baseSize}
            baseGap={layout.gap}
            setHoveredIndex={setItemHoveredIndex}
            onActivate={() => setActiveGroupId(entry.group.id)}
            onDragStart={(event) =>
              props.onStartDrag(event, { kind: "group", groupId: entry.group.id }, entry.captures.map((capture) => capture.id))
            }
            onDragEnd={props.onEndDrag}
            dragging={props.dragging}
            dropIntent={dropIntent}
            onDropIntent={props.onDropIntent}
            setDropIntent={setDropIntentWithPreview}
            onRemove={() => {
              setHoveredIndex(null);
              setActiveGroupId(null);
              props.onRemoveGroup(entry.group.id);
            }}
            onAdd={() => props.onAddToGroup(entry.group.id)}
            onStartCaptureDrag={(event, capture) =>
              props.onStartDrag(event, { kind: "capture", captureId: capture.id }, [capture.id])
            }
            onRemoveCapture={props.onRemoveCapture}
            onCopyCapture={props.onCopyCapture}
            provisionalCaptureId={
              dragFolderPreview?.kind === "group" && dragFolderPreview.groupId === entry.group.id
                ? dragFolderPreview.draggedCaptureId
                : null
            }
          />
        ) : (
          <CaptureDockItem
            key={entry.capture.id}
            index={index}
            capture={entry.capture}
            addFlyoutCaptures={
              props.activeAddTarget?.kind === "capture" && props.activeAddTarget.id === entry.capture.id
                ? [entry.capture, ...props.pendingAddCaptures]
                : undefined
            }
            dragFolderPreviewCaptures={
              dragFolderPreview?.kind === "capture" &&
              dragFolderPreview.targetCaptureId === entry.capture.id &&
              captureById.has(dragFolderPreview.draggedCaptureId)
                ? [entry.capture, captureById.get(dragFolderPreview.draggedCaptureId)!]
                : undefined
            }
            deliveryReady={props.preparedDeliveryKey === deliveryCaptureKey([entry.capture.id])}
            blob={props.blobCache[entry.capture.id]}
            blobCache={props.blobCache}
            isNew={props.recentlyAddedCaptureId === entry.capture.id}
            recentlyAddedCaptureId={props.recentlyAddedCaptureId}
            focusedIndex={focusedIndex}
            addModeActive={Boolean(props.activeAddTarget)}
            pendingFolderColorSlot={pendingFolderColorSlot}
            muted={Boolean(
              props.activeAddTarget &&
              !(props.activeAddTarget.kind === "capture" && props.activeAddTarget.id === entry.capture.id)
            )}
            presentationOnly={props.presentationOnly}
            baseSize={layout.baseSize}
            baseGap={layout.gap}
            setHoveredIndex={setItemHoveredIndex}
            onHover={() => setActiveGroupId(null)}
            onDragStart={(event) =>
              props.onStartDrag(event, { kind: "capture", captureId: entry.capture.id }, [entry.capture.id])
            }
            onDragEnd={props.onEndDrag}
            dragging={props.dragging}
            dropIntent={dropIntent}
            onDropIntent={props.onDropIntent}
            setDropIntent={setDropIntentWithPreview}
            onRemove={() => {
              setHoveredIndex(null);
              props.onRemoveCapture(entry.capture.id);
            }}
            onCopy={() => props.onCopyCapture(entry.capture.id)}
            onAdd={() => props.onAddToCapture(entry.capture.id)}
          />
        )
      )}
    </div>
  );
}

function CaptureDockItem(props: {
  index: number;
  capture: Capture;
  addFlyoutCaptures?: Capture[];
  dragFolderPreviewCaptures?: Capture[];
  deliveryReady: boolean;
  blob?: Blob;
  blobCache: Record<string, Blob>;
  isNew?: boolean;
  recentlyAddedCaptureId: string | null;
  focusedIndex: number | null;
  addModeActive: boolean;
  pendingFolderColorSlot: number;
  muted?: boolean;
  baseSize: number;
  baseGap: number;
  setHoveredIndex: (index: number | null) => void;
  onHover?: () => void;
  onDragStart: (event: React.DragEvent) => void;
  onDragEnd: (event: React.DragEvent) => void;
  dragging: InternalDrag | null;
  dropIntent: RailDropIntent | null;
  onDropIntent: (intent: RailDropIntent) => void;
  setDropIntent: (intent: RailDropIntent | null) => void;
  onRemove: () => void;
  onCopy: () => void;
  onAdd: () => void;
  presentationOnly?: boolean;
}) {
  const folderFlyoutCaptures = props.addFlyoutCaptures ?? props.dragFolderPreviewCaptures;
  const activeAdd = Boolean(folderFlyoutCaptures);
  const dragPreviewActive = Boolean(props.dragFolderPreviewCaptures);
  const influence = activeAdd || props.muted ? 0 : dockInfluence(props.index, props.focusedIndex);
  const isFocused = !activeAdd && !props.muted && props.focusedIndex === props.index;
  const thumbnailSize = dockCaptureThumbnailSize(props.baseSize, influence);
  const frame = isFocused && !activeAdd
    ? dockCapturePreviewFrame(props.capture, props.baseSize, thumbnailSize)
    : { width: thumbnailSize, height: thumbnailSize };
  const slotWidth = Math.max(thumbnailSize, frame.width);
  const slotHeight = frame.height + dockItemGap(props.baseGap, props.baseSize, influence);
  const slotRef = useRef<HTMLDivElement | null>(null);
  const previewOffsetY = useDockPreviewOffset(slotRef, false, frame.height);
  const previewSource = useBlobUrl(props.blob) ?? props.capture.thumbnailDataUrl;

  return (
    <div
      ref={slotRef}
      data-docksnip-entry-index={props.index}
      data-docksnip-rail-kind="capture"
      data-docksnip-rail-id={props.capture.id}
      className={[
        "justsnap-dock-slot",
        props.muted ? "justsnap-dock-slot-add-muted" : "",
        isFocused ? "justsnap-dock-slot-hovered" : "",
        railIntentClass(props.dropIntent, { kind: "capture", id: props.capture.id })
      ].join(" ")}
      style={
        {
          width: slotWidth,
          height: slotHeight,
          zIndex: Math.round(influence * 20),
          "--justsnap-dock-item-half": `${frame.height / 2}px`,
          "--justsnap-preview-offset-y": `${previewOffsetY}px`,
          "--justsnap-add-offset-y": `${previewOffsetY}px`,
          "--justsnap-add-item-half": `${frame.height / 2}px`
        } as React.CSSProperties
      }
      onMouseEnter={() => {
        if (props.presentationOnly || props.muted) return;
        props.onHover?.();
        props.setHoveredIndex(props.index);
      }}
      onDragOver={(event) => {
        if (props.presentationOnly || props.muted) return;
        const intent = railIntentForCapture(event, props.capture.id, props.dragging);
        props.setDropIntent(intent);
        if (intent) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onDrop={(event) => {
        if (props.presentationOnly || props.muted) return;
        const previewIntent = props.dropIntent?.scope === "rail" &&
          props.dropIntent.action === "create-folder" &&
          props.dropIntent.target.kind === "capture" &&
          props.dropIntent.target.id === props.capture.id
          ? props.dropIntent
          : null;
        const intent = previewIntent ?? railIntentForCapture(event, props.capture.id, props.dragging);
        if (!intent) return;
        event.preventDefault();
        event.stopPropagation();
        props.setDropIntent(null);
        props.onDropIntent(intent);
      }}
    >
      {activeAdd ? (
        <button
          className="justsnap-dock-folder-button justsnap-dock-add-target-folder"
          style={folderButtonStyle(props.pendingFolderColorSlot, frame.width, frame.height)}
          aria-label="New folder"
          draggable={false}
          onFocus={() => props.setHoveredIndex(props.index)}
          onBlur={() => props.setHoveredIndex(null)}
        >
          <span className="justsnap-folder-grid" aria-hidden="true">
            {folderFlyoutCaptures?.slice(0, 4).map((capture) => (
              <img key={capture.id} src={capture.thumbnailDataUrl} alt="" />
            ))}
          </span>
        </button>
      ) : (
        <button
          className={[
            "justsnap-dock-image-button",
            props.presentationOnly || props.deliveryReady ? "" : "justsnap-card-loading",
            props.isNew ? "justsnap-dock-image-new justsnap-dock-image-added-focus" : ""
          ].join(" ")}
          style={{
            width: frame.width,
            height: frame.height
          }}
          aria-label="Docksnip capture"
          aria-disabled={props.muted || undefined}
          tabIndex={props.muted ? -1 : undefined}
          draggable={!props.muted && (props.presentationOnly || props.deliveryReady)}
          onDragStart={props.onDragStart}
          onDragEnd={props.onDragEnd}
          onFocus={() => props.setHoveredIndex(props.index)}
          onBlur={() => props.setHoveredIndex(null)}
          onMouseEnter={() => {
            if (props.presentationOnly || props.muted) return;
            props.onHover?.();
            props.setHoveredIndex(props.index);
          }}
        >
          <img src={previewSource} alt="" />
        </button>
      )}
      {!props.presentationOnly && <button
        className="justsnap-dock-add"
        aria-label="Add captures"
        disabled={props.muted || props.addModeActive}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          props.onAdd();
          props.setHoveredIndex(null);
        }}
      >
        <Plus size={14} strokeWidth={2.4} />
      </button>}
      {!props.presentationOnly && isFocused && (
        <>
          <button
            className="justsnap-dock-copy"
            aria-label="Copy capture"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              props.onCopy();
            }}
          >
            <Copy size={14} strokeWidth={2.2} />
          </button>
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
        </>
      )}
      {folderFlyoutCaptures && (
        <AddTargetFlyout
          captures={folderFlyoutCaptures}
          blobCache={props.blobCache}
          activeCaptureId={props.capture.id}
          recentlyAddedCaptureId={props.recentlyAddedCaptureId}
          dragging={dragPreviewActive ? props.dragging : null}
          dropIntent={props.dropIntent}
          setDropIntent={props.setDropIntent}
          onDropIntent={props.onDropIntent}
        />
      )}
    </div>
  );
}

function AddTargetFlyout(props: {
  captures: Capture[];
  blobCache: Record<string, Blob>;
  activeCaptureId: string;
  recentlyAddedCaptureId: string | null;
  dragging: InternalDrag | null;
  dropIntent: RailDropIntent | null;
  setDropIntent: (intent: RailDropIntent | null) => void;
  onDropIntent: (intent: RailDropIntent) => void;
}) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const layout = dockLayoutForCount(props.captures.length, 420);
  const flyoutRef = useRef<HTMLDivElement | null>(null);

  useStablePointerHover({
    containerRef: flyoutRef,
    dataAttribute: "data-docksnip-add-target-index",
    focusedIndex,
    setFocusedIndex,
    enabled: !props.dragging
  });

  const previewingFolderCreation = props.dragging?.kind === "capture";
  const previewDraggedCaptureId = props.dragging?.kind === "capture" ? props.dragging.captureId : null;

  return (
    <div
      ref={flyoutRef}
      className={[
        "justsnap-group-flyout",
        "justsnap-add-target-flyout",
        previewingFolderCreation ? "justsnap-group-flyout-dragging" : ""
      ].join(" ")}
      aria-label="New folder captures"
      style={
        {
          gap: 0,
          "--justsnap-rail-surface": `${layout.surfaceWidth}px`
        } as React.CSSProperties
      }
      onDragOver={(event) => {
        if (!previewingFolderCreation) return;
        const intent = newFolderIntentForPointer(
          event.currentTarget,
          event.clientY,
          props.activeCaptureId,
          props.dragging
        );
        props.setDropIntent(intent);
        if (!intent) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        if (!previewingFolderCreation) return;
        const intent = newFolderIntentForPointer(
          event.currentTarget,
          event.clientY,
          props.activeCaptureId,
          props.dragging
        );
        if (!intent) return;
        event.preventDefault();
        event.stopPropagation();
        props.setDropIntent(null);
        props.onDropIntent(intent);
      }}
    >
      {props.captures.map((capture, captureIndex) => (
        <AddTargetFlyoutItem
          key={capture.id}
          index={captureIndex}
          capture={capture}
          blob={props.blobCache[capture.id]}
          focusedIndex={focusedIndex}
          baseSize={layout.baseSize}
          baseGap={layout.gap}
          isTarget={capture.id === props.activeCaptureId}
          isNew={capture.id === props.recentlyAddedCaptureId}
          isProvisional={previewingFolderCreation && capture.id === previewDraggedCaptureId}
          dropIntent={props.dropIntent}
          targetCaptureId={props.activeCaptureId}
          setFocusedIndex={setFocusedIndex}
        />
      ))}
    </div>
  );
}

function AddTargetFlyoutItem(props: {
  index: number;
  capture: Capture;
  blob?: Blob;
  focusedIndex: number | null;
  baseSize: number;
  baseGap: number;
  isTarget: boolean;
  isNew: boolean;
  isProvisional: boolean;
  dropIntent: RailDropIntent | null;
  targetCaptureId: string;
  setFocusedIndex: (index: number | null) => void;
}) {
  const influence = dockInfluence(props.index, props.focusedIndex);
  const isFocused = props.focusedIndex === props.index;
  const thumbnailSize = dockCaptureThumbnailSize(props.baseSize, influence);
  const frame = isFocused
    ? dockCapturePreviewFrame(props.capture, props.baseSize, thumbnailSize)
    : { width: thumbnailSize, height: thumbnailSize };
  const slotWidth = Math.max(thumbnailSize, frame.width);
  const slotHeight = frame.height + dockItemGap(props.baseGap, props.baseSize, influence);
  const slotRef = useRef<HTMLDivElement | null>(null);
  const previewOffsetY = useDockPreviewOffset(slotRef, false, frame.height);
  const previewSource = useBlobUrl(props.blob) ?? props.capture.thumbnailDataUrl;

  return (
    <div
      ref={slotRef}
      data-docksnip-add-target-index={props.index}
      data-docksnip-preview-id={props.capture.id}
      className={[
        "justsnap-dock-slot",
        "justsnap-group-flyout-slot",
        isFocused ? "justsnap-dock-slot-hovered" : "",
        props.isTarget ? "justsnap-add-target-origin" : "",
        props.isProvisional ? "justsnap-folder-preview-provisional" : "",
        newFolderIntentClass(props.dropIntent, props.targetCaptureId, props.capture.id)
      ].join(" ")}
      style={
        {
          width: slotWidth,
          height: slotHeight,
          zIndex: Math.round(influence * 20),
          "--justsnap-dock-item-half": `${frame.height / 2}px`,
          "--justsnap-preview-offset-y": `${previewOffsetY}px`
        } as React.CSSProperties
      }
      onMouseEnter={() => props.setFocusedIndex(props.index)}
    >
      <div
        className={[
          "justsnap-dock-image-button",
          props.isNew ? "justsnap-dock-image-new justsnap-dock-image-added-focus" : ""
        ].join(" ")}
        style={{ width: frame.width, height: frame.height }}
      >
        <img src={previewSource} alt="" />
      </div>
    </div>
  );
}

function GroupDockItem(props: {
  index: number;
  group: CaptureGroup;
  captures: Capture[];
  blobCache: Record<string, Blob>;
  deliveryReady: boolean;
  focusedIndex: number | null;
  active: boolean;
  addModeActive: boolean;
  muted?: boolean;
  baseSize: number;
  baseGap: number;
  setHoveredIndex: (index: number | null) => void;
  onActivate: () => void;
  onDragStart: (event: React.DragEvent) => void;
  onDragEnd: (event: React.DragEvent) => void;
  dragging: InternalDrag | null;
  dropIntent: RailDropIntent | null;
  onDropIntent: (intent: RailDropIntent) => void;
  setDropIntent: (intent: RailDropIntent | null) => void;
  onRemove: () => void;
  onAdd: () => void;
  onStartCaptureDrag: (event: React.DragEvent, capture: Capture) => void;
  onRemoveCapture: (captureId: string) => void;
  onCopyCapture: (captureId: string) => void;
  provisionalCaptureId: string | null;
  presentationOnly?: boolean;
}) {
  const influence = props.active ? 1 : props.muted ? 0 : dockInfluence(props.index, props.focusedIndex);
  const size = dockFolderSize(props.baseSize, influence);
  const itemGap = dockItemGap(props.baseGap, props.baseSize, influence);
  const isFocused = (!props.muted && props.focusedIndex === props.index) || props.active;
  const [flyoutFocusedIndex, setFlyoutFocusedIndex] = useState<number | null>(null);
  const persistedCaptureCount = props.provisionalCaptureId
    ? Math.max(1, props.captures.length - 1)
    : props.captures.length;
  const flyoutLayout = dockLayoutForCount(persistedCaptureCount, 420);
  const slotHeight = size + itemGap;
  const flyoutRef = useRef<HTMLDivElement | null>(null);
  const reorderingCaptureId = props.dragging?.kind === "capture" ? props.dragging.captureId : null;
  const reorderingInsideFolder = reorderingCaptureId !== null &&
    props.captures.some((capture) => capture.id === reorderingCaptureId);

  useStablePointerHover({
    containerRef: flyoutRef,
    dataAttribute: "data-docksnip-flyout-index",
    focusedIndex: flyoutFocusedIndex,
    setFocusedIndex: setFlyoutFocusedIndex,
    enabled: !props.presentationOnly && props.active && !props.dragging
  });

  useEffect(() => {
    if (props.dragging) setFlyoutFocusedIndex(null);
  }, [props.dragging]);

  return (
    <div
      data-justsnap-group-id={props.group.id}
      data-docksnip-entry-index={props.index}
      data-docksnip-rail-kind="group"
      data-docksnip-rail-id={props.group.id}
      className={[
        "justsnap-dock-slot",
        "justsnap-dock-group-slot",
        props.muted ? "justsnap-dock-slot-add-muted" : "",
        isFocused ? "justsnap-dock-slot-hovered" : "",
        railIntentClass(props.dropIntent, { kind: "group", id: props.group.id })
      ].join(" ")}
      style={
        {
          width: size,
          height: slotHeight,
          zIndex: Math.round(influence * 20),
          "--justsnap-dock-item-half": `${size / 2}px`,
          "--justsnap-add-offset-y": "0px",
          "--justsnap-add-item-half": `${size / 2}px`,
          "--justsnap-folder-size": `${size}px`,
          "--justsnap-folder-item-gap": `${itemGap}px`
        } as React.CSSProperties
      }
      onMouseEnter={() => {
        if (props.presentationOnly || props.muted) return;
        props.onActivate();
        props.setHoveredIndex(props.index);
      }}
      onDragOver={(event) => {
        if (props.presentationOnly || props.muted) return;
        const intent = railIntentForGroup(event, props.group.id, props.dragging);
        props.setDropIntent(intent);
        if (intent) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onDrop={(event) => {
        if (props.presentationOnly || props.muted) return;
        const previewIntent = props.dropIntent?.scope === "rail" &&
          props.dropIntent.action === "add-to-folder" &&
          props.dropIntent.target.kind === "group" &&
          props.dropIntent.target.id === props.group.id
          ? props.dropIntent
          : null;
        const intent = previewIntent ?? railIntentForGroup(event, props.group.id, props.dragging);
        if (!intent) return;
        event.preventDefault();
        event.stopPropagation();
        props.setDropIntent(null);
        props.onDropIntent(intent);
      }}
    >
      <button
        className="justsnap-dock-folder-button"
        style={folderButtonStyle(props.group.colorSlot, size, size)}
        aria-label={`Folder, ${props.captures.length} captures`}
        aria-disabled={props.muted || undefined}
        tabIndex={props.muted ? -1 : undefined}
        draggable={!props.muted && (props.presentationOnly || props.deliveryReady)}
        onDragStart={props.onDragStart}
        onDragEnd={props.onDragEnd}
        onFocus={() => props.setHoveredIndex(props.index)}
        onBlur={() => props.setHoveredIndex(null)}
        onMouseEnter={() => {
          if (props.presentationOnly || props.muted) return;
          props.onActivate();
          props.setHoveredIndex(props.index);
        }}
      >
        <span className="justsnap-folder-grid" aria-hidden="true">
          {props.captures.length > 0
            ? props.captures.slice(0, 4).map((capture) => (
                <img key={capture.id} src={capture.thumbnailDataUrl} alt="" />
              ))
            : <Folder className="justsnap-empty-folder-icon" size={Math.max(18, size * 0.42)} />}
        </span>
      </button>
      {!props.presentationOnly && <button
        className="justsnap-dock-add"
        aria-label="Add captures to folder"
        disabled={props.muted || props.addModeActive}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          props.onAdd();
          props.setHoveredIndex(null);
        }}
      >
        <Plus size={14} strokeWidth={2.4} />
      </button>}
      {!props.presentationOnly && isFocused && (
        <>
          <button
            className="justsnap-dock-remove"
            aria-label="Remove folder"
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
            className={[
              "justsnap-group-flyout",
              reorderingInsideFolder ? "justsnap-group-flyout-dragging" : ""
            ].join(" ")}
            aria-label="Folder captures"
            style={
              {
                gap: 0,
                "--justsnap-rail-surface": `${flyoutLayout.surfaceWidth}px`
              } as React.CSSProperties
            }
            onDragOver={(event) => {
              if (event.defaultPrevented) return;
              const intent = folderIntentForPointer(
                event.currentTarget,
                event.clientY,
                props.group.id,
                props.captures,
                props.dragging
              );
              props.setDropIntent(intent);
              if (!intent) return;
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(event) => {
              if (event.defaultPrevented) return;
              const intent = folderIntentForPointer(
                event.currentTarget,
                event.clientY,
                props.group.id,
                props.captures,
                props.dragging
              );
              if (!intent) return;
              event.preventDefault();
              event.stopPropagation();
              props.setDropIntent(null);
              props.onDropIntent(intent);
            }}
          >
            {props.captures.map((capture, captureIndex) => (
              <GroupFlyoutDockItem
                key={capture.id}
                index={captureIndex}
                capture={capture}
                blob={props.blobCache[capture.id]}
                deliveryReady={props.deliveryReady}
                focusedIndex={flyoutFocusedIndex}
                baseSize={flyoutLayout.baseSize}
                baseGap={flyoutLayout.gap}
                setFocusedIndex={setFlyoutFocusedIndex}
                onDragStart={(event) => props.onStartCaptureDrag(event, capture)}
                onDragEnd={props.onDragEnd}
                dragging={props.dragging}
                dropIntent={props.dropIntent}
                groupId={props.group.id}
                onDropIntent={props.onDropIntent}
                setDropIntent={props.setDropIntent}
                onRemove={() => props.onRemoveCapture(capture.id)}
                onCopy={() => props.onCopyCapture(capture.id)}
                provisional={capture.id === props.provisionalCaptureId}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function folderButtonStyle(colorSlot: number, width: number, height: number): React.CSSProperties {
  const tone = folderToneForSlot(colorSlot);
  return {
    width,
    height,
    "--docksnip-folder-surface": tone.surface,
    "--docksnip-folder-border": tone.border
  } as React.CSSProperties;
}

function GroupFlyoutDockItem(props: {
  index: number;
  capture: Capture;
  blob?: Blob;
  deliveryReady: boolean;
  focusedIndex: number | null;
  baseSize: number;
  baseGap: number;
  setFocusedIndex: (index: number | null) => void;
  onDragStart: (event: React.DragEvent) => void;
  onDragEnd: (event: React.DragEvent) => void;
  dragging: InternalDrag | null;
  dropIntent: RailDropIntent | null;
  groupId: string;
  onDropIntent: (intent: RailDropIntent) => void;
  setDropIntent: (intent: RailDropIntent | null) => void;
  onRemove: () => void;
  onCopy: () => void;
  provisional: boolean;
}) {
  const influence = dockInfluence(props.index, props.focusedIndex);
  const isFocused = props.focusedIndex === props.index;
  const thumbnailSize = dockCaptureThumbnailSize(props.baseSize, influence);
  const frame = isFocused
    ? dockCapturePreviewFrame(props.capture, props.baseSize, thumbnailSize)
    : { width: thumbnailSize, height: thumbnailSize };
  const slotWidth = Math.max(thumbnailSize, frame.width);
  const slotHeight = frame.height + dockItemGap(props.baseGap, props.baseSize, influence);
  const slotRef = useRef<HTMLDivElement | null>(null);
  const previewOffsetY = useDockPreviewOffset(slotRef, false, frame.height);
  const previewSource = useBlobUrl(props.blob) ?? props.capture.thumbnailDataUrl;

  return (
    <div
      ref={slotRef}
      data-docksnip-flyout-index={props.index}
      data-docksnip-flyout-id={props.capture.id}
      className={[
        "justsnap-dock-slot",
        "justsnap-group-flyout-slot",
        isFocused ? "justsnap-dock-slot-hovered" : "",
        props.provisional ? "justsnap-folder-preview-provisional" : "",
        folderIntentClass(props.dropIntent, props.groupId, props.capture.id)
      ].join(" ")}
      style={
        {
          width: slotWidth,
          height: slotHeight,
          zIndex: Math.round(influence * 20),
          "--justsnap-dock-item-half": `${frame.height / 2}px`,
          "--justsnap-preview-offset-y": `${previewOffsetY}px`
        } as React.CSSProperties
      }
      onMouseEnter={() => props.setFocusedIndex(props.index)}
      onDragOver={(event) => {
        const intent = folderIntentForCapture(event, props.groupId, props.capture.id, props.dragging);
        props.setDropIntent(intent);
        if (intent) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onDrop={(event) => {
        const intent = folderIntentForCapture(event, props.groupId, props.capture.id, props.dragging);
        if (!intent) return;
        event.preventDefault();
        event.stopPropagation();
        props.setDropIntent(null);
        props.onDropIntent(intent);
      }}
    >
      <button
        className={["justsnap-dock-image-button", props.deliveryReady ? "" : "justsnap-card-loading"].join(" ")}
        style={{ width: frame.width, height: frame.height }}
        aria-label="Folder capture"
        draggable={props.deliveryReady && !props.provisional}
        onDragStart={props.onDragStart}
        onDragEnd={props.onDragEnd}
        onFocus={() => props.setFocusedIndex(props.index)}
        onBlur={() => props.setFocusedIndex(null)}
        onMouseEnter={() => props.setFocusedIndex(props.index)}
      >
        <img src={previewSource} alt="" />
      </button>
      {isFocused && (
        <>
          <button
            className="justsnap-dock-copy"
            aria-label="Copy capture"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              props.onCopy();
            }}
          >
            <Copy size={14} strokeWidth={2.2} />
          </button>
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
        </>
      )}
    </div>
  );
}

function railIntentForCapture(event: React.DragEvent, targetCaptureId: string, drag: InternalDrag | null): RailDropIntent | null {
  return railIntentForCapturePoint(event.currentTarget, event.clientY, targetCaptureId, drag);
}

function railIntentForCapturePoint(
  element: Element,
  pointerY: number,
  targetCaptureId: string,
  drag: InternalDrag | null
): RailDropIntent | null {
  if (!drag) return null;
  const zone = verticalDropZoneForElement(element, pointerY);
  if (zone === "before" || zone === "after") {
    if (drag.kind === "capture" && drag.captureId === targetCaptureId) return null;
    return {
      scope: "rail",
      action: zone === "before" ? "insert-before" : "insert-after",
      target: { kind: "capture", id: targetCaptureId }
    };
  }
  if (drag.kind === "capture" && drag.captureId !== targetCaptureId) {
    return { scope: "rail", action: "create-folder", target: { kind: "capture", id: targetCaptureId } };
  }
  return null;
}

function railIntentForGroup(event: React.DragEvent, targetGroupId: string, drag: InternalDrag | null): RailDropIntent | null {
  return railIntentForGroupPoint(event.currentTarget, event.clientY, targetGroupId, drag);
}

function railIntentForGroupPoint(
  element: Element,
  pointerY: number,
  targetGroupId: string,
  drag: InternalDrag | null
): RailDropIntent | null {
  if (!drag) return null;
  const zone = verticalDropZoneForElement(element, pointerY);
  if (zone === "before" || zone === "after") {
    if (drag.kind === "group" && drag.groupId === targetGroupId) return null;
    return {
      scope: "rail",
      action: zone === "before" ? "insert-before" : "insert-after",
      target: { kind: "group", id: targetGroupId }
    };
  }
  if (drag.kind === "capture") {
    return { scope: "rail", action: "add-to-folder", target: { kind: "group", id: targetGroupId } };
  }
  return null;
}

function folderIntentForCapture(
  event: React.DragEvent,
  groupId: string,
  targetCaptureId: string,
  drag: InternalDrag | null
): RailDropIntent | null {
  if (!drag || drag.kind !== "capture" || drag.captureId === targetCaptureId) return null;
  const zone = verticalDropZone(event);
  if (zone === "before" || zone === "after") {
    return {
      scope: "folder",
      action: zone === "before" ? "insert-before" : "insert-after",
      groupId,
      targetCaptureId
    };
  }
  return null;
}

function newFolderIntentForPointer(
  container: HTMLElement,
  pointerY: number,
  targetCaptureId: string,
  drag: InternalDrag | null
): RailDropIntent | null {
  if (!drag || drag.kind !== "capture" || drag.captureId === targetCaptureId) return null;
  const target = container.querySelector<HTMLElement>(
    `[data-docksnip-preview-id="${CSS.escape(targetCaptureId)}"]`
  );
  if (!target) return null;
  const rect = target.getBoundingClientRect();
  return {
    scope: "rail",
    action: "create-folder",
    target: { kind: "capture", id: targetCaptureId },
    position: pointerY < rect.top + rect.height / 2 ? "insert-before" : "insert-after"
  };
}

function folderIntentForPointer(
  container: HTMLElement,
  pointerY: number,
  groupId: string,
  captures: Capture[],
  drag: InternalDrag | null
): RailDropIntent | null {
  if (!drag || drag.kind !== "capture") return null;

  const candidates = captures
    .filter((capture) => capture.id !== drag.captureId)
    .map((capture) => {
      const slot = container.querySelector<HTMLElement>(
        `[data-docksnip-flyout-id="${CSS.escape(capture.id)}"]`
      );
      return slot ? { captureId: capture.id, rect: slot.getBoundingClientRect() } : null;
    })
    .filter((candidate): candidate is { captureId: string; rect: DOMRect } => candidate !== null)
    .sort((first, second) => first.rect.top - second.rect.top);

  if (!candidates.length) return null;
  const target = candidates.find((candidate) => pointerY < candidate.rect.top + candidate.rect.height / 2);
  if (target) {
    return { scope: "folder", action: "insert-before", groupId, targetCaptureId: target.captureId };
  }
  return {
    scope: "folder",
    action: "insert-after",
    groupId,
    targetCaptureId: candidates[candidates.length - 1].captureId
  };
}

function verticalDropZone(event: React.DragEvent): "before" | "center" | "after" {
  return verticalDropZoneForElement(event.currentTarget, event.clientY);
}


function railIntentClass(intent: RailDropIntent | null, item: RailOrderItem): string {
  if (!intent || intent.scope !== "rail") return "";
  if ((intent.action === "insert-before" || intent.action === "insert-after") && railOrderItemMatches(intent.target, item)) {
    return intent.action === "insert-before" ? "justsnap-drop-before" : "justsnap-drop-after";
  }
  if (intent.action === "create-folder" && item.kind === "capture" && intent.target.id === item.id) {
    return "justsnap-drop-create-folder";
  }
  if (intent.action === "add-to-folder" && item.kind === "group" && intent.target.id === item.id) {
    return "justsnap-drop-add-folder";
  }
  return "";
}

function folderIntentClass(intent: RailDropIntent | null, groupId: string, captureId: string): string {
  if (!intent || intent.scope !== "folder" || intent.groupId !== groupId || intent.targetCaptureId !== captureId) return "";
  if (intent.action === "insert-before") return "justsnap-drop-before";
  if (intent.action === "insert-after") return "justsnap-drop-after";
  return "justsnap-drop-add-folder";
}

function newFolderIntentClass(
  intent: RailDropIntent | null,
  targetCaptureId: string,
  captureId: string
): string {
  if (
    !intent ||
    intent.scope !== "rail" ||
    intent.action !== "create-folder" ||
    intent.target.id !== targetCaptureId ||
    captureId !== targetCaptureId ||
    !intent.position
  ) return "";
  return intent.position === "insert-before" ? "justsnap-drop-before" : "justsnap-drop-after";
}

function railOrderItemMatches(first: RailOrderItem, second: RailOrderItem): boolean {
  return first.kind === second.kind && first.id === second.id;
}

function useBlobUrl(blob?: Blob): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(blob);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [blob]);

  return url;
}

function useStablePointerHover(options: {
  containerRef: React.RefObject<HTMLElement | null>;
  dataAttribute: string;
  focusedIndex: number | null;
  setFocusedIndex: (index: number | null) => void;
  enabled: boolean;
}) {
  useEffect(() => {
    if (!options.enabled || options.focusedIndex === null) return;

    const trackPointer = (event: PointerEvent) => {
      const container = options.containerRef.current;
      if (!container) return;

      const pointedEntry = event.composedPath().find(
        (target): target is HTMLElement =>
          target instanceof HTMLElement &&
          target.hasAttribute(options.dataAttribute) &&
          container.contains(target)
      );
      if (pointedEntry) {
        const nextIndex = Number(pointedEntry.getAttribute(options.dataAttribute));
        if (Number.isInteger(nextIndex) && nextIndex !== options.focusedIndex) {
          options.setFocusedIndex(nextIndex);
        }
        return;
      }

      const focusedEntry = container.querySelector<HTMLElement>(
        `[${options.dataAttribute}="${options.focusedIndex}"]`
      );
      if (!focusedEntry) {
        options.setFocusedIndex(null);
        return;
      }

      const hoverSurfaces = [
        focusedEntry,
        ...focusedEntry.querySelectorAll<HTMLElement>(
          [
            ".justsnap-dock-image-button",
            ".justsnap-dock-folder-button",
            ".justsnap-dock-add",
            ".justsnap-dock-remove",
            ".justsnap-add-target-flyout"
          ].join(",")
        )
      ];
      const remainsInHoverEnvelope = hoverSurfaces.some(
        (surface) => pointerDistanceFromRect(event.clientX, event.clientY, surface.getBoundingClientRect()) <= 12
      );
      if (!remainsInHoverEnvelope) options.setFocusedIndex(null);
    };

    document.addEventListener("pointermove", trackPointer, true);
    return () => document.removeEventListener("pointermove", trackPointer, true);
  }, [
    options.containerRef,
    options.dataAttribute,
    options.enabled,
    options.focusedIndex,
    options.setFocusedIndex
  ]);
}

function useDynamicIslandShape(options: {
  containerRef: React.RefObject<HTMLElement | null>;
  shapeRef: React.RefObject<SVGSVGElement | null>;
  focusedIndex: number | null;
  focusedEntryKey: string | null;
  enabled: boolean;
}) {
  useLayoutEffect(() => {
    const container = options.containerRef.current;
    const shape = options.shapeRef.current;
    if (!container || !shape || !options.enabled || options.focusedIndex === null) {
      if (shape) shape.dataset.visible = "false";
      return;
    }

    const focusedEntry = container.querySelector<HTMLElement>(
      `[data-docksnip-entry-index="${options.focusedIndex}"]`
    );
    const focusedSurface =
      focusedEntry?.querySelector<HTMLElement>(
        ".justsnap-dock-image-button, .justsnap-dock-folder-button"
      ) ?? focusedEntry;
    if (!focusedSurface) {
      shape.dataset.visible = "false";
      return;
    }

    let frame = 0;
    let disposed = false;
    const updateShape = () => {
      if (disposed) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (
          disposed ||
          !container.isConnected ||
          !focusedSurface.isConnected ||
          !container.contains(focusedSurface)
        ) {
          if (!disposed) shape.dataset.visible = "false";
          return;
        }

        const containerRect = container.getBoundingClientRect();
        shape.setAttribute(
          "viewBox",
          `0 0 ${Math.max(1, containerRect.width)} ${Math.max(1, containerRect.height)}`
        );
        const railSurfaceWidth =
          Number.parseFloat(
            getComputedStyle(container).getPropertyValue("--justsnap-rail-surface")
          ) || 74;
        const baselineLeft = containerRect.width - railSurfaceWidth;
        const rect = focusedSurface.getBoundingClientRect();
        const padding = 12;
        const left = rect.left - padding - containerRect.left;
        const top = rect.top - padding - containerRect.top;
        const bottom = rect.bottom + padding - containerRect.top;
        const protrusion = Math.max(0, baselineLeft - left);
        const regionHeight = Math.max(0, bottom - top);
        const curve = Math.round(
          Math.max(
            12,
            Math.min(48, Math.max(protrusion * 0.45, regionHeight * 0.32))
          )
        );
        const regions =
          protrusion > 0 && regionHeight > 0
            ? [{ left, top, bottom, curve, outerCurve: 20 }]
            : [];
        const path = shape.querySelector<SVGPathElement>(
          ".justsnap-dynamic-island-contour"
        );
        if (!path || regions.length === 0) {
          shape.dataset.visible = "false";
          return;
        }

        const pathData = dynamicIslandPath({
          width: containerRect.width,
          height: containerRect.height,
          baselineLeft,
          regions
        });
        if (!pathData) {
          shape.dataset.visible = "false";
          return;
        }
        path.setAttribute("d", pathData);
        const edge = shape.querySelector<SVGPathElement>(
          ".justsnap-dynamic-island-edge"
        );
        edge?.setAttribute(
          "d",
          dynamicIslandEdgePath({
            width: containerRect.width,
            height: containerRect.height,
            baselineLeft,
            regions
          })
        );
        shape.dataset.visible = "true";
      });
    };

    updateShape();
    const resizeObserver = new ResizeObserver(updateShape);
    resizeObserver.observe(container);
    resizeObserver.observe(focusedSurface);
    window.addEventListener("resize", updateShape);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateShape);
    };
  }, [
    options.containerRef,
    options.enabled,
    options.focusedEntryKey,
    options.focusedIndex,
    options.shapeRef
  ]);
}

function isActiveRailInteraction(path: EventTarget[]): boolean {
  return path.some((target) => {
    if (!(target instanceof Element)) return false;
    return Boolean(
      target.closest(
        [
          ".justsnap-dock-image-button",
          ".justsnap-dock-folder-button",
          ".justsnap-dock-add",
          ".justsnap-group-flyout",
          ".justsnap-dock-remove"
        ].join(",")
      )
    );
  });
}

function pointerDistanceFromRect(x: number, y: number, rect: DOMRect): number {
  const horizontalDistance = Math.max(rect.left - x, 0, x - rect.right);
  const verticalDistance = Math.max(rect.top - y, 0, y - rect.bottom);
  return Math.hypot(horizontalDistance, verticalDistance);
}

function pointWithinRect(point: { clientX: number; clientY: number }, rect: DOMRect, inset = 0): boolean {
  return point.clientX >= rect.left - inset &&
    point.clientX <= rect.right + inset &&
    point.clientY >= rect.top - inset &&
    point.clientY <= rect.bottom + inset;
}

function updateDragMotion(
  motion: { x: number; y: number; at: number; speed: number },
  x: number,
  y: number,
  at: number
): void {
  const elapsed = at - motion.at;
  if (motion.at <= 0 || elapsed <= 0 || elapsed > 250) {
    motion.speed = 0;
  } else {
    const distance = Math.hypot(x - motion.x, y - motion.y);
    const instantaneousSpeed = distance / (elapsed / 1000);
    motion.speed = motion.speed === 0
      ? instantaneousSpeed
      : motion.speed * 0.6 + instantaneousSpeed * 0.4;
  }
  motion.x = x;
  motion.y = y;
  motion.at = at;
}

function folderPreviewDwellMsForSpeed(speed: number): number {
  if (speed >= 900) return FOLDER_PREVIEW_FAST_DWELL_MS;
  if (speed >= 300) return FOLDER_PREVIEW_MEDIUM_DWELL_MS;
  return FOLDER_PREVIEW_SLOW_DWELL_MS;
}
