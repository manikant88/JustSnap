import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Circle, CircleDot, Pencil, Plus, Trash2, X } from "lucide-react";
import { MAX_DOCK_ITEMS } from "../../../shared/libraryModel";
import type { Capture, CaptureDock, CaptureGroup, DockOrderItem } from "../../../shared/types";
import { dockLayoutForCount } from "../dockLayout";
import type { InternalDrag } from "../types";
import { LibraryView } from "../rail/LibraryView";
import { DockFrame } from "./DockFrame";

const OVERVIEW_LAYOUT = dockLayoutForCount(MAX_DOCK_ITEMS + 3, Infinity);
const EMPTY_BLOB_CACHE: Record<string, Blob> = {};

export function DockOverview(props: {
  captures: Capture[];
  groups: CaptureGroup[];
  docks: CaptureDock[];
  activeDockId: string;
  autoCreatedDockId?: string;
  onClose: () => void;
  onSelectDock: (dockId: string) => void;
  onCreateDock: () => void;
  onRenameDock: (dockId: string, name: string) => void;
  onDeleteDock: (dockId: string) => void;
  onMoveItem: (item: DockOrderItem, dockId: string) => void;
  onMessage: (message: string) => void;
}) {
  const [draggedItem, setDraggedItem] = useState<DockOrderItem | null>(null);
  const [deleteDockId, setDeleteDockId] = useState<string | null>(null);
  const dockListRef = useRef<HTMLDivElement | null>(null);
  const orderedDocks = useMemo(() => {
    const activeDock = props.docks.find((dock) => dock.id === props.activeDockId);
    const inactiveDocks = props.docks.filter((dock) => dock.id !== props.activeDockId).reverse();
    return activeDock ? [...inactiveDocks, activeDock] : inactiveDocks;
  }, [props.activeDockId, props.docks]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (deleteDockId) {
        setDeleteDockId(null);
        return;
      }
      props.onClose();
    };
    document.addEventListener("keydown", closeOnEscape, true);
    return () => document.removeEventListener("keydown", closeOnEscape, true);
  }, [deleteDockId, props.onClose]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const dockList = dockListRef.current;
      if (dockList) dockList.scrollLeft = dockList.scrollWidth;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [orderedDocks.length, props.activeDockId]);

  return (
    <div
      className="justsnap-dock-overview-backdrop"
      onPointerDown={() => {
        if (deleteDockId) {
          setDeleteDockId(null);
          return;
        }
        props.onClose();
      }}
    >
      <section
        className="justsnap-dock-overview"
        role="dialog"
        aria-modal="true"
        aria-label="Dock overview"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div ref={dockListRef} className="justsnap-dock-overview-list">
          <button className="justsnap-dock-create-card" onClick={props.onCreateDock}>
            <Plus size={26} />
            <span>Add new dock</span>
          </button>
          {orderedDocks.map((dock) => (
            <DockOverviewPreview
              key={dock.id}
              dock={dock}
              captures={props.captures}
              groups={props.groups}
              active={dock.id === props.activeDockId}
              newlyCreated={dock.id === props.autoCreatedDockId}
              draggedItem={draggedItem}
              onDragItem={setDraggedItem}
              onSelect={() => props.onSelectDock(dock.id)}
              onRename={(name) => props.onRenameDock(dock.id, name)}
              onDelete={() => setDeleteDockId(dock.id)}
              onDropItem={() => {
                if (!draggedItem) return;
                if (dock.order.length >= MAX_DOCK_ITEMS && !dock.order.some((item) => sameItem(item, draggedItem))) {
                  props.onMessage(`${dock.name} is full. Move an item out before adding another.`);
                  setDraggedItem(null);
                  return;
                }
                props.onMoveItem(draggedItem, dock.id);
                setDraggedItem(null);
              }}
            />
          ))}
        </div>

        <button className="justsnap-dock-overview-close" aria-label="Close dock overview" onClick={props.onClose}>
          <X size={17} />
        </button>

      </section>

      {deleteDockId && (
        <div
          className="justsnap-dock-delete-confirm"
          role="alertdialog"
          aria-modal="true"
          aria-label="Delete dock"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <AlertTriangle className="justsnap-dock-delete-confirm-icon" size={17} aria-hidden="true" />
          <span>
            <strong>Delete this dock?</strong>
            <small>Its images and folders will be deleted from DockSnip.</small>
          </span>
          <div>
            <button onClick={() => setDeleteDockId(null)}>Cancel</button>
            <button
              className="justsnap-danger-button"
              onClick={() => {
                props.onDeleteDock(deleteDockId);
                setDeleteDockId(null);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DockOverviewPreview(props: {
  dock: CaptureDock;
  captures: Capture[];
  groups: CaptureGroup[];
  active: boolean;
  newlyCreated: boolean;
  draggedItem: DockOrderItem | null;
  onDragItem: (item: DockOrderItem | null) => void;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onDropItem: () => void;
}) {
  const [editingDock, setEditingDock] = useState(false);
  const [dockName, setDockName] = useState(props.dock.name);
  const dragging = toInternalDrag(props.draggedItem);
  const dockCaptures = capturesForDock(props.dock, props.captures, props.groups);
  const dockGroups = groupsForDock(props.dock, props.groups);

  const commitDockName = () => {
    props.onRename(dockName);
    setEditingDock(false);
  };

  const startDrag = (event: React.DragEvent, drag: InternalDrag) => {
    const item: DockOrderItem = drag.kind === "capture"
      ? { kind: "capture", id: drag.captureId }
      : { kind: "group", id: drag.groupId };
    props.onDragItem(item);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-docksnip-overview", JSON.stringify(item));
  };

  return (
    <DockFrame
      className={[
        "justsnap-overview-dock",
        props.active ? "justsnap-overview-dock-active" : "",
        props.newlyCreated ? "justsnap-overview-dock-new" : ""
      ].join(" ")}
      style={
        {
          "--justsnap-rail-surface": `${OVERVIEW_LAYOUT.surfaceWidth}px`,
          "--justsnap-dock-base": `${OVERVIEW_LAYOUT.baseSize}px`,
          "--justsnap-dock-gap": `${OVERVIEW_LAYOUT.gap}px`
        } as React.CSSProperties
      }
      aria-label={props.dock.name}
      onDragOver={(event) => {
        if (!props.draggedItem) return;
        event.preventDefault();
      }}
      onDrop={(event) => {
        if (!props.draggedItem) return;
        event.preventDefault();
        props.onDropItem();
      }}
      top={editingDock ? (
        <input
          className="justsnap-overview-dock-name-input"
          autoFocus
          value={dockName}
          maxLength={120}
          aria-label="Dock name"
          onChange={(event) => setDockName(event.target.value)}
          onBlur={commitDockName}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitDockName();
            if (event.key === "Escape") {
              setDockName(props.dock.name);
              setEditingDock(false);
            }
          }}
        />
      ) : (
        <button className="justsnap-overview-dock-name" onClick={() => setEditingDock(true)}>
          <span>{props.dock.name}</span>
          <Pencil size={12} />
        </button>
      )}
      bottom={
        <div className="justsnap-overview-dock-actions">
          <button
            className={props.active ? "justsnap-overview-dock-select-active" : ""}
            aria-label={props.active ? `${props.dock.name} is active` : `Open ${props.dock.name}`}
            aria-checked={props.active}
            role="radio"
            onClick={props.onSelect}
          >
            {props.active ? <CircleDot size={18} /> : <Circle size={18} />}
          </button>
          <button aria-label={`Delete ${props.dock.name}`} onClick={props.onDelete}>
            <Trash2 size={16} />
          </button>
        </div>
      }
    >
      <LibraryView
        captures={dockCaptures}
        groups={dockGroups}
        railOrder={props.dock.order}
        blobCache={EMPTY_BLOB_CACHE}
        dragging={dragging}
        recentlyAddedCaptureId={null}
        pendingAddCaptures={[]}
        layout={OVERVIEW_LAYOUT}
        presentationOnly
        onStartDrag={startDrag}
        onEndDrag={() => props.onDragItem(null)}
        onDropIntent={() => undefined}
        onRemoveGroup={() => undefined}
        onRemoveCapture={() => undefined}
        onAddToGroup={() => undefined}
        onAddToCapture={() => undefined}
        onInteractionChange={() => undefined}
        onRequireCaptures={() => undefined}
      />
    </DockFrame>
  );
}

function capturesForDock(dock: CaptureDock, captures: Capture[], groups: CaptureGroup[]): Capture[] {
  const ids = new Set(dock.order.flatMap((item) => {
    if (item.kind === "capture") return [item.id];
    return groups.find((group) => group.id === item.id)?.captureIds ?? [];
  }));
  return captures.filter((capture) => ids.has(capture.id));
}

function groupsForDock(dock: CaptureDock, groups: CaptureGroup[]): CaptureGroup[] {
  const ids = new Set(dock.order.filter((item) => item.kind === "group").map((item) => item.id));
  return groups.filter((group) => ids.has(group.id));
}

function toInternalDrag(item: DockOrderItem | null): InternalDrag | null {
  if (!item) return null;
  return item.kind === "capture"
    ? { kind: "capture", captureId: item.id }
    : { kind: "group", groupId: item.id };
}

function sameItem(first: DockOrderItem, second: DockOrderItem): boolean {
  return first.kind === second.kind && first.id === second.id;
}
