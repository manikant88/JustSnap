import React, { useEffect, useMemo, useRef, useState } from "react";
import { Folder, Plus, Trash2 } from "lucide-react";
import type { Capture, CaptureAddTarget, CaptureGroup, RailOrderItem } from "../../../shared/types";
import {
  dockCapturePreviewFrame,
  dockCaptureThumbnailSize,
  dockFolderSize,
  dockInfluence,
  dockItemGap,
  dockLayoutForCount,
  useDockPreviewOffset
} from "../dockLayout";
import type { DockLayout } from "../dockLayout";
import type { InternalDrag, RailDropIntent } from "../types";
import { verticalDropZoneForElement } from "./dndIntent";

type RailEntry =
  | { kind: "group"; group: CaptureGroup; captures: Capture[] }
  | { kind: "capture"; capture: Capture };

export function LibraryView(props: {
  captures: Capture[];
  groups: CaptureGroup[];
  railOrder: RailOrderItem[];
  blobCache: Record<string, Blob>;
  dragging: InternalDrag | null;
  recentlyAddedCaptureId: string | null;
  activeAddTarget?: CaptureAddTarget;
  pendingAddCaptures: Capture[];
  layout: DockLayout;
  onStartDrag: (event: React.DragEvent, drag: InternalDrag, captureIds: string[]) => void;
  onEndDrag: (event: React.DragEvent) => void;
  onDropIntent: (intent: RailDropIntent) => void;
  onRemoveGroup: (groupId: string) => void;
  onRemoveCapture: (captureId: string) => void;
  onAddToGroup: (groupId: string) => void;
  onAddToCapture: (captureId: string) => void;
  onInteractionChange: (active: boolean) => void;
  onRequireCaptures: (captureIds: string[]) => void;
  presentationOnly?: boolean;
}) {
  const libraryRef = useRef<HTMLDivElement | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [dropIntent, setDropIntent] = useState<RailDropIntent | null>(null);
  const onInteractionChange = props.onInteractionChange;
  const interactive = !props.presentationOnly;
  const focusedIndex = interactive ? hoveredIndex : null;
  const captureById = useMemo(
    () => new Map(props.captures.map((capture) => [capture.id, capture])),
    [props.captures]
  );
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
            const captures =
              props.activeAddTarget?.kind === "group" && props.activeAddTarget.id === item.id
                ? [...group.captures, ...props.pendingAddCaptures]
                : group.captures;
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
      props.activeAddTarget,
      props.pendingAddCaptures,
      props.railOrder,
      visibleGroupById,
      visibleGroups
    ]
  );
  const layout = props.layout;

  useStablePointerHover({
    containerRef: libraryRef,
    dataAttribute: "data-docksnip-entry-index",
    focusedIndex: hoveredIndex,
    setFocusedIndex: setHoveredIndex,
    enabled: interactive && !props.dragging && activeGroupId === null
  });

  useEffect(() => {
    if (!interactive) return;
    if (props.activeAddTarget?.kind === "group") {
      setActiveGroupId(props.activeAddTarget.id);
    }
  }, [interactive, props.activeAddTarget]);

  useEffect(() => {
    if (!interactive) return;
    if (!activeGroupId) return;
    const closeActiveGroup = (event: PointerEvent) => {
      const path = event.composedPath();
      if (isActiveRailInteraction(path)) return;
      setActiveGroupId(null);
      setHoveredIndex(null);
    };
    document.addEventListener("pointerdown", closeActiveGroup, true);
    return () => document.removeEventListener("pointerdown", closeActiveGroup, true);
  }, [activeGroupId, interactive]);

  useEffect(() => {
    if (!interactive) return;
    if (!activeGroupId || props.dragging) return;
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
  }, [activeGroupId, interactive, props.dragging]);

  useEffect(() => {
    if (!props.dragging) setDropIntent(null);
  }, [props.dragging]);

  useEffect(() => {
    onInteractionChange(interactive && (hoveredIndex !== null || activeGroupId !== null));
  }, [activeGroupId, hoveredIndex, interactive, onInteractionChange]);

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
      onMouseLeave={() => setDropIntent(null)}
    >
      {entries.map((entry, index) =>
        entry.kind === "group" ? (
          <GroupDockItem
            key={entry.group.id}
            index={index}
            group={entry.group}
            captures={entry.captures}
            blobCache={props.blobCache}
            focusedIndex={focusedIndex}
            active={interactive && (activeGroupId === entry.group.id || props.activeAddTarget?.id === entry.group.id)}
            presentationOnly={props.presentationOnly}
            baseSize={layout.baseSize}
            baseGap={layout.gap}
            setHoveredIndex={setHoveredIndex}
            onActivate={() => setActiveGroupId(entry.group.id)}
            onDragStart={(event) =>
              props.onStartDrag(event, { kind: "group", groupId: entry.group.id }, entry.captures.map((capture) => capture.id))
            }
            onDragEnd={props.onEndDrag}
            dragging={props.dragging}
            dropIntent={dropIntent}
            onDropIntent={props.onDropIntent}
            setDropIntent={setDropIntent}
            onRemove={() => props.onRemoveGroup(entry.group.id)}
            onAdd={() => props.onAddToGroup(entry.group.id)}
            onStartCaptureDrag={(event, capture) =>
              props.onStartDrag(event, { kind: "capture", captureId: capture.id }, [capture.id])
            }
            onRemoveCapture={props.onRemoveCapture}
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
            blobReady={Boolean(props.blobCache[entry.capture.id])}
            blob={props.blobCache[entry.capture.id]}
            blobCache={props.blobCache}
            isNew={props.recentlyAddedCaptureId === entry.capture.id}
            recentlyAddedCaptureId={props.recentlyAddedCaptureId}
            focusedIndex={focusedIndex}
            presentationOnly={props.presentationOnly}
            baseSize={layout.baseSize}
            baseGap={layout.gap}
            setHoveredIndex={setHoveredIndex}
            onHover={() => setActiveGroupId(null)}
            onDragStart={(event) =>
              props.onStartDrag(event, { kind: "capture", captureId: entry.capture.id }, [entry.capture.id])
            }
            onDragEnd={props.onEndDrag}
            dragging={props.dragging}
            dropIntent={dropIntent}
            onDropIntent={props.onDropIntent}
            setDropIntent={setDropIntent}
            onRemove={() => props.onRemoveCapture(entry.capture.id)}
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
  blobReady: boolean;
  blob?: Blob;
  blobCache: Record<string, Blob>;
  isNew?: boolean;
  recentlyAddedCaptureId: string | null;
  focusedIndex: number | null;
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
  onAdd: () => void;
  presentationOnly?: boolean;
}) {
  const activeAdd = Boolean(props.addFlyoutCaptures);
  const influence = activeAdd ? 0 : dockInfluence(props.index, props.focusedIndex);
  const isFocused = !activeAdd && props.focusedIndex === props.index;
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
      className={[
        "justsnap-dock-slot",
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
        if (props.presentationOnly) return;
        props.onHover?.();
        props.setHoveredIndex(props.index);
      }}
      onDragOver={(event) => {
        if (props.presentationOnly) return;
        const intent = railIntentForCapture(event, props.capture.id, props.dragging);
        props.setDropIntent(intent);
        if (intent) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onDrop={(event) => {
        if (props.presentationOnly) return;
        const intent = railIntentForCapture(event, props.capture.id, props.dragging);
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
          style={{ width: frame.width, height: frame.height }}
          aria-label="New collection"
          draggable={false}
          onFocus={() => props.setHoveredIndex(props.index)}
          onBlur={() => props.setHoveredIndex(null)}
        >
          <span className="justsnap-folder-grid" aria-hidden="true">
            {props.addFlyoutCaptures?.slice(0, 4).map((capture) => (
              <img key={capture.id} src={capture.thumbnailDataUrl} alt="" />
            ))}
          </span>
        </button>
      ) : (
        <button
          className={[
            "justsnap-dock-image-button",
            props.presentationOnly || props.blobReady ? "" : "justsnap-card-loading",
            props.isNew ? "justsnap-dock-image-new justsnap-dock-image-added-focus" : ""
          ].join(" ")}
          style={{
            width: frame.width,
            height: frame.height
          }}
          aria-label="DockSnip capture"
          draggable={props.presentationOnly || props.blobReady}
          onDragStart={props.onDragStart}
          onDragEnd={props.onDragEnd}
          onFocus={() => props.setHoveredIndex(props.index)}
          onBlur={() => props.setHoveredIndex(null)}
          onMouseEnter={() => {
            if (props.presentationOnly) return;
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
      {props.addFlyoutCaptures && (
        <AddTargetFlyout
          captures={props.addFlyoutCaptures}
          blobCache={props.blobCache}
          activeCaptureId={props.capture.id}
          recentlyAddedCaptureId={props.recentlyAddedCaptureId}
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
}) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const layout = dockLayoutForCount(props.captures.length, 420);
  const flyoutRef = useRef<HTMLDivElement | null>(null);

  useStablePointerHover({
    containerRef: flyoutRef,
    dataAttribute: "data-docksnip-add-target-index",
    focusedIndex,
    setFocusedIndex,
    enabled: true
  });

  return (
    <div
      ref={flyoutRef}
      className="justsnap-group-flyout justsnap-add-target-flyout"
      aria-label="New collection captures"
      style={
        {
          gap: 0,
          "--justsnap-rail-surface": `${layout.surfaceWidth}px`
        } as React.CSSProperties
      }
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
      className={[
        "justsnap-dock-slot",
        "justsnap-group-flyout-slot",
        isFocused ? "justsnap-dock-slot-hovered" : "",
        props.isTarget ? "justsnap-add-target-origin" : ""
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
  focusedIndex: number | null;
  active: boolean;
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
  presentationOnly?: boolean;
}) {
  const influence = props.active ? 1 : dockInfluence(props.index, props.focusedIndex);
  const size = dockFolderSize(props.baseSize, influence);
  const itemGap = dockItemGap(props.baseGap, props.baseSize, influence);
  const isFocused = props.focusedIndex === props.index || props.active;
  const [flyoutFocusedIndex, setFlyoutFocusedIndex] = useState<number | null>(null);
  const flyoutLayout = dockLayoutForCount(props.captures.length, 420);
  const slotHeight = size + itemGap;
  const flyoutRef = useRef<HTMLDivElement | null>(null);

  useStablePointerHover({
    containerRef: flyoutRef,
    dataAttribute: "data-docksnip-flyout-index",
    focusedIndex: flyoutFocusedIndex,
    setFocusedIndex: setFlyoutFocusedIndex,
    enabled: !props.presentationOnly && props.active && !props.dragging
  });

  return (
    <div
      data-justsnap-group-id={props.group.id}
      data-docksnip-entry-index={props.index}
      className={[
        "justsnap-dock-slot",
        "justsnap-dock-group-slot",
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
        if (props.presentationOnly) return;
        props.onActivate();
        props.setHoveredIndex(props.index);
      }}
      onDragOver={(event) => {
        if (props.presentationOnly) return;
        const intent = railIntentForGroup(event, props.group.id, props.dragging);
        props.setDropIntent(intent);
        if (intent) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onDrop={(event) => {
        if (props.presentationOnly) return;
        const intent = railIntentForGroup(event, props.group.id, props.dragging);
        if (!intent) return;
        event.preventDefault();
        event.stopPropagation();
        props.setDropIntent(null);
        props.onDropIntent(intent);
      }}
    >
      <button
        className="justsnap-dock-folder-button"
        style={{ width: size, height: size }}
        aria-label={`${props.group.name}, ${props.captures.length} captures`}
        draggable={props.presentationOnly || props.captures.every((capture) => props.blobCache[capture.id])}
        onDragStart={props.onDragStart}
        onDragEnd={props.onDragEnd}
        onFocus={() => props.setHoveredIndex(props.index)}
        onBlur={() => props.setHoveredIndex(null)}
        onMouseEnter={() => {
          if (props.presentationOnly) return;
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
            style={
              {
                gap: 0,
                "--justsnap-rail-surface": `${flyoutLayout.surfaceWidth}px`
              } as React.CSSProperties
            }
          >
            {props.captures.length === 0 && (
              <span className="justsnap-empty-folder-message">Add images with the + button</span>
            )}
            {props.captures.map((capture, captureIndex) => (
              <GroupFlyoutDockItem
                key={capture.id}
                index={captureIndex}
                capture={capture}
                blob={props.blobCache[capture.id]}
                blobReady={Boolean(props.blobCache[capture.id])}
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
              />
            ))}
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
      className={[
        "justsnap-dock-slot",
        "justsnap-group-flyout-slot",
        isFocused ? "justsnap-dock-slot-hovered" : "",
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
        className={["justsnap-dock-image-button", props.blobReady ? "" : "justsnap-card-loading"].join(" ")}
        style={{ width: frame.width, height: frame.height }}
        aria-label="Grouped DockSnip capture"
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

function railIntentForCapture(event: React.DragEvent, targetCaptureId: string, drag: InternalDrag | null): RailDropIntent | null {
  if (!drag) return null;
  const zone = verticalDropZone(event);
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
  if (!drag) return null;
  const zone = verticalDropZone(event);
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
