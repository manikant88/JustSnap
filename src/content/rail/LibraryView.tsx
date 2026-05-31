import React, { useEffect, useMemo, useRef, useState } from "react";
import { Files, Trash2 } from "lucide-react";
import type { Capture, CaptureGroup } from "../../../shared/types";
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
import type { InternalDrag } from "../types";

type RailEntry =
  | { kind: "group"; group: CaptureGroup; captures: Capture[] }
  | { kind: "capture"; capture: Capture };

export function LibraryView(props: {
  captures: Capture[];
  groups: CaptureGroup[];
  ungroupedCaptures: Capture[];
  blobCache: Record<string, Blob>;
  recentlyAddedCaptureId: string | null;
  layout: DockLayout;
  onStartDrag: (event: React.DragEvent, drag: InternalDrag, captureIds: string[], groupId?: string) => void;
  onEndDrag: (event: React.DragEvent) => void;
  onDropCapture: (captureId: string) => void;
  onDropGroup: (groupId: string) => void;
  onRemoveGroup: (groupId: string) => void;
  onRemoveCapture: (captureId: string) => void;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
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
    () => [
      ...visibleGroups.map((entry) => ({ kind: "group" as const, ...entry })),
      ...props.ungroupedCaptures.map((capture) => ({ kind: "capture" as const, capture }))
    ],
    [props.ungroupedCaptures, visibleGroups]
  );
  const layout = props.layout;

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

  if (!props.captures.length) {
    return (
      <div className="justsnap-empty" title="Captured screenshots will appear here">
        <Files size={22} />
      </div>
    );
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
            active={activeGroupId === entry.group.id}
            baseSize={layout.baseSize}
            baseGap={layout.gap}
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
            baseSize={layout.baseSize}
            baseGap={layout.gap}
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
      )}
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
  baseSize: number;
  baseGap: number;
  setHoveredIndex: (index: number | null) => void;
  onHover?: () => void;
  onDragStart: (event: React.DragEvent) => void;
  onDragEnd: (event: React.DragEvent) => void;
  onDrop: () => void;
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
        isFocused ? "justsnap-dock-slot-hovered" : ""
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
          width: frame.width,
          height: frame.height
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
  baseSize: number;
  baseGap: number;
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
        isFocused ? "justsnap-dock-slot-hovered" : ""
      ].join(" ")}
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
                onDrop={() => props.onDropCapture(capture.id)}
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
  onDrop: () => void;
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
      className={["justsnap-dock-slot", "justsnap-group-flyout-slot", isFocused ? "justsnap-dock-slot-hovered" : ""].join(" ")}
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
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        props.onDrop();
      }}
    >
      <button
        className={["justsnap-dock-image-button", props.blobReady ? "" : "justsnap-card-loading"].join(" ")}
        style={{ width: frame.width, height: frame.height }}
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
