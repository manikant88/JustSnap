import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
  onStartDrag: (event: React.DragEvent, drag: InternalDrag, captureIds: string[], groupId?: string) => void;
  onEndDrag: (event: React.DragEvent) => void;
  onDropIntent: (intent: RailDropIntent) => void;
  onRemoveGroup: (groupId: string) => void;
  onRemoveCapture: (captureId: string) => void;
  onAddToGroup: (groupId: string) => void;
  onAddToCapture: (captureId: string) => void;
  onInteractionChange: (active: boolean) => void;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [dropIntent, setDropIntent] = useState<RailDropIntent | null>(null);
  const onInteractionChange = props.onInteractionChange;
  const focusedIndex = hoveredIndex;
  const visibleGroups = useMemo(
    () =>
      props.groups
        .map((group) => ({
          group,
          captures: group.captureIds
            .map((captureId) => props.captures.find((capture) => capture.id === captureId))
            .filter((capture): capture is Capture => Boolean(capture))
        }))
        .filter((entry) => entry.captures.length > 0),
    [props.captures, props.groups]
  );
  const entries = useMemo<RailEntry[]>(
    () =>
      props.railOrder
        .map((item) => {
          if (item.kind === "group") {
            const group = visibleGroups.find((entry) => entry.group.id === item.id);
            if (!group) return undefined;
            const captures =
              props.activeAddTarget?.kind === "group" && props.activeAddTarget.id === item.id
                ? [...group.captures, ...props.pendingAddCaptures]
                : group.captures;
            return { kind: "group" as const, group: group.group, captures } satisfies RailEntry;
          }
          const capture = props.captures.find((entry) => entry.id === item.id && !entry.groupId);
          return capture ? ({ kind: "capture" as const, capture } satisfies RailEntry) : undefined;
        })
        .filter((entry): entry is RailEntry => Boolean(entry)),
    [props.activeAddTarget, props.captures, props.pendingAddCaptures, props.railOrder, visibleGroups]
  );
  const layout = props.layout;

  useEffect(() => {
    if (props.activeAddTarget?.kind === "group") {
      setActiveGroupId(props.activeAddTarget.id);
    }
  }, [props.activeAddTarget]);

  useEffect(() => {
    if (!activeGroupId) return;
    const closeActiveGroup = (event: PointerEvent) => {
      const path = event.composedPath();
      if (isActiveRailInteraction(path)) return;
      setActiveGroupId(null);
      setHoveredIndex(null);
    };
    document.addEventListener("pointerdown", closeActiveGroup, true);
    return () => document.removeEventListener("pointerdown", closeActiveGroup, true);
  }, [activeGroupId]);

  useEffect(() => {
    if (!props.dragging) setDropIntent(null);
  }, [props.dragging]);

  useEffect(() => {
    onInteractionChange(hoveredIndex !== null || activeGroupId !== null);
  }, [activeGroupId, hoveredIndex, onInteractionChange]);

  if (!props.captures.length) {
    return null;
  }

  return (
    <div
      className="justsnap-library"
      tabIndex={0}
      style={
        {
          gap: 0,
          "--justsnap-rail-surface": `${layout.surfaceWidth}px`
        } as React.CSSProperties
      }
      onMouseLeave={() => {
        if (!activeGroupId) setHoveredIndex(null);
        setDropIntent(null);
      }}
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
            active={activeGroupId === entry.group.id || props.activeAddTarget?.id === entry.group.id}
            baseSize={layout.baseSize}
            baseGap={layout.gap}
            setHoveredIndex={setHoveredIndex}
            onActivate={() => setActiveGroupId(entry.group.id)}
            onDragStart={(event) =>
              props.onStartDrag(event, { kind: "group", groupId: entry.group.id }, entry.captures.map((capture) => capture.id), entry.group.id)
            }
            onDragEnd={props.onEndDrag}
            dragging={props.dragging}
            dropIntent={dropIntent}
            onDropIntent={props.onDropIntent}
            setDropIntent={setDropIntent}
            onRemove={() => props.onRemoveGroup(entry.group.id)}
            onAdd={() => props.onAddToGroup(entry.group.id)}
            onStartCaptureDrag={(event, capture) =>
              props.onStartDrag(event, { kind: "capture", captureId: capture.id }, [capture.id], capture.groupId)
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
            isNew={props.recentlyAddedCaptureId === entry.capture.id}
            recentlyAddedCaptureId={props.recentlyAddedCaptureId}
            focusedIndex={focusedIndex}
            baseSize={layout.baseSize}
            baseGap={layout.gap}
            setHoveredIndex={setHoveredIndex}
            onHover={() => setActiveGroupId(null)}
            onDragStart={(event) =>
              props.onStartDrag(event, { kind: "capture", captureId: entry.capture.id }, [entry.capture.id], entry.capture.groupId)
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
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const slotRef = useRef<HTMLDivElement | null>(null);
  const previewOffsetY = useDockPreviewOffset(slotRef, false, frame.height);
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
      ref={slotRef}
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
        props.onHover?.();
        props.setHoveredIndex(props.index);
      }}
      onMouseLeave={() => props.setHoveredIndex(null)}
      onDragOver={(event) => {
        const intent = railIntentForCapture(event, props.capture.id, props.dragging);
        props.setDropIntent(intent);
        if (intent) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onDrop={(event) => {
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
            props.blobReady ? "" : "justsnap-card-loading",
            props.isNew ? "justsnap-dock-image-new justsnap-dock-image-added-focus" : ""
          ].join(" ")}
          style={{
            width: frame.width,
            height: frame.height
          }}
          aria-label="DockSnip capture"
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
      )}
      <button
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
      {props.addFlyoutCaptures && (
        <AddTargetFlyout
          captures={props.addFlyoutCaptures}
          activeCaptureId={props.capture.id}
          recentlyAddedCaptureId={props.recentlyAddedCaptureId}
        />
      )}
    </div>
  );
}

function AddTargetFlyout(props: {
  captures: Capture[];
  activeCaptureId: string;
  recentlyAddedCaptureId: string | null;
}) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const layout = dockLayoutForCount(props.captures.length, 420);

  return (
    <div
      className="justsnap-group-flyout justsnap-add-target-flyout"
      aria-label="New collection captures"
      style={
        {
          gap: 0,
          "--justsnap-rail-surface": `${layout.surfaceWidth}px`
        } as React.CSSProperties
      }
      onMouseLeave={() => setFocusedIndex(null)}
    >
      {props.captures.map((capture, captureIndex) => (
        <AddTargetFlyoutItem
          key={capture.id}
          index={captureIndex}
          capture={capture}
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
  const previewSource = props.capture.fullDataUrl ?? props.capture.thumbnailDataUrl;

  return (
    <div
      ref={slotRef}
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
      onMouseLeave={() => props.setFocusedIndex(null)}
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
}) {
  const influence = props.active ? 1 : dockInfluence(props.index, props.focusedIndex);
  const size = dockFolderSize(props.baseSize, influence);
  const slotHeight = size + dockItemGap(props.baseGap, props.baseSize, influence);
  const isFocused = props.focusedIndex === props.index || props.active;
  const [flyoutFocusedIndex, setFlyoutFocusedIndex] = useState<number | null>(null);
  const flyoutLayout = dockLayoutForCount(props.captures.length, 420);

  return (
    <div
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
          "--justsnap-add-item-half": `${size / 2}px`
        } as React.CSSProperties
      }
      onMouseEnter={() => {
        props.onActivate();
        props.setHoveredIndex(props.index);
      }}
      onDragOver={(event) => {
        const intent = railIntentForGroup(event, props.group.id, props.dragging);
        props.setDropIntent(intent);
        if (intent) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onDrop={(event) => {
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
      </button>
      <button
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
            className="justsnap-group-flyout"
            aria-label={`${props.group.name} captures`}
            style={
              {
                gap: 0,
                "--justsnap-rail-surface": `${flyoutLayout.surfaceWidth}px`
              } as React.CSSProperties
            }
            onMouseLeave={() => setFlyoutFocusedIndex(null)}
          >
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
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const slotRef = useRef<HTMLDivElement | null>(null);
  const previewOffsetY = useDockPreviewOffset(slotRef, false, frame.height);
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
      ref={slotRef}
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
      onMouseLeave={() => props.setFocusedIndex(null)}
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
  return { scope: "folder", action: "add-to-folder", groupId, targetCaptureId };
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

function isActiveRailInteraction(path: EventTarget[]): boolean {
  return path.some((target) => {
    if (!(target instanceof Element)) return false;
    return Boolean(
      target.closest(
        [
          ".justsnap-dock-image-button",
          ".justsnap-dock-folder-button",
          ".justsnap-dock-remove"
        ].join(",")
      )
    );
  });
}
