import React, { forwardRef, useLayoutEffect, useRef, useState } from "react";
import type { RailOrderItem } from "../../../shared/types";
import { dockBaseIslandPath } from "../dockLayout";
import { insertionIndexForPointer, railInsertIntentForIndex, type RailItemBand } from "../rail/dndIntent";
import type { RailDropIntent } from "../types";

type DockFrameProps = React.HTMLAttributes<HTMLElement> & {
  top: React.ReactNode;
  bottom: React.ReactNode;
  draggedItem?: RailOrderItem | null;
  onFallbackDrop?: (intent: RailDropIntent) => void;
};

export const DockFrame = forwardRef<HTMLElement, DockFrameProps>(
  function DockFrame(
    { top, bottom, children, className = "", draggedItem, onFallbackDrop, onDragOver, onDrop, ...props },
    ref
  ) {
    const localRef = useRef<HTMLElement | null>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });

    useLayoutEffect(() => {
      const element = localRef.current;
      if (!element) return;

      const update = () => {
        const rect = element.getBoundingClientRect();
        setSize((current) => {
          const next = { width: rect.width, height: rect.height };
          return current.width === next.width && current.height === next.height ? current : next;
        });
      };
      update();
      const observer = new ResizeObserver(update);
      observer.observe(element);
      return () => observer.disconnect();
    }, []);

    const setRefs = (element: HTMLElement | null) => {
      localRef.current = element;
      if (typeof ref === "function") ref(element);
      else if (ref) ref.current = element;
    };
    const joinRadius = 20;
    const silhouetteHeight = size.height + joinRadius * 2;

    const railItemBands = (): RailItemBand[] => {
      const element = localRef.current;
      if (!element) return [];

      return Array.from(
        element.querySelectorAll<HTMLElement>("[data-docksnip-rail-kind][data-docksnip-rail-id]")
      ).map((entry): RailItemBand | null => {
        const kind = entry.dataset.docksnipRailKind;
        const id = entry.dataset.docksnipRailId;
        if ((kind !== "capture" && kind !== "group") || !id) return null;
        const rect = entry.getBoundingClientRect();
        return { item: { kind, id }, top: rect.top, bottom: rect.bottom };
      }).filter((band): band is RailItemBand => band !== null)
        .sort((first, second) => first.top - second.top);
    };

    const fallbackIntent = (pointerY: number): RailDropIntent | null => {
      if (!draggedItem) return null;

      const bands = railItemBands();
      const insertionIndex = insertionIndexForPointer(pointerY, bands);
      return railInsertIntentForIndex(insertionIndex, bands.map((band) => band.item), draggedItem);
    };

    const edgeFallbackIntent = (pointerY: number): RailDropIntent | null => {
      if (!draggedItem) return null;

      const bands = railItemBands();
      if (!bands.length) return null;
      const first = bands[0];
      const last = bands[bands.length - 1];
      if (pointerY >= first.top && pointerY <= last.bottom) return null;

      return fallbackIntent(pointerY);
    };

    return (
      <aside
        ref={setRefs}
        {...props}
        className={["justsnap-rail", className].filter(Boolean).join(" ")}
        onDragOverCapture={(event) => {
          const intent = edgeFallbackIntent(event.clientY);
          if (!intent) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDropCapture={(event) => {
          const intent = edgeFallbackIntent(event.clientY);
          if (!intent) return;
          event.preventDefault();
          event.stopPropagation();
          onFallbackDrop?.(intent);
        }}
        onDragOver={(event) => {
          onDragOver?.(event);
          if (event.defaultPrevented) return;
          const intent = fallbackIntent(event.clientY);
          if (!intent) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(event) => {
          onDrop?.(event);
          if (event.defaultPrevented) return;
          const intent = fallbackIntent(event.clientY);
          if (!intent) return;
          event.preventDefault();
          event.stopPropagation();
          onFallbackDrop?.(intent);
        }}
      >
        {size.width > 0 && size.height > 0 ? (
          <svg
            className="justsnap-rail-silhouette"
            viewBox={`0 0 ${size.width} ${silhouetteHeight}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d={dockBaseIslandPath({ width: size.width, height: silhouetteHeight, joinRadius })} />
          </svg>
        ) : null}
        <div className="justsnap-rail-control-slot">{top}</div>
        <DockSeparator />
        {children}
        <DockSeparator />
        <div className="justsnap-rail-control-slot justsnap-rail-bottom-control-slot">{bottom}</div>
      </aside>
    );
  }
);

function DockSeparator() {
  return (
    <div className="justsnap-rail-separator-slot">
      <div className="justsnap-rail-separator" />
    </div>
  );
}
