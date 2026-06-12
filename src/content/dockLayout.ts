import { useLayoutEffect, useState } from "react";
import type React from "react";
import type { Capture } from "../../shared/types";

export type DockLayout = { baseSize: number; gap: number; surfaceWidth: number };

export function dockInfluence(index: number, hoveredIndex: number | null): number {
  if (hoveredIndex === null) return 0;
  const distance = Math.abs(index - hoveredIndex);
  if (distance === 0) return 1;
  if (distance === 1) return 0.28;
  if (distance === 2) return 0.12;
  return 0;
}

export function dockLayoutForCount(count: number, maxHeight = railLibraryHeight()): DockLayout {
  const preferredSize = 52;
  const minSize = 28;
  const minCompressedSize = 8;
  const preferredGap = 15;
  const minGap = 4;
  if (count <= 0) return withDockSurfaceWidth({ baseSize: preferredSize, gap: preferredGap });

  const availableHeight = Math.max(0, maxHeight - 32);
  const preferredTotal = count * preferredSize + Math.max(0, count - 1) * preferredGap;
  if (preferredTotal <= availableHeight) return withDockSurfaceWidth({ baseSize: preferredSize, gap: preferredGap });

  const preferredSizeMinGapTotal = count * preferredSize + Math.max(0, count - 1) * minGap;
  if (preferredSizeMinGapTotal <= availableHeight) {
    const gap = count > 1 ? (availableHeight - count * preferredSize) / (count - 1) : preferredGap;
    return withDockSurfaceWidth({ baseSize: preferredSize, gap: Math.max(minGap, gap) });
  }

  const minTotal = count * minSize + Math.max(0, count - 1) * minGap;
  if (minTotal <= availableHeight) {
    const baseSize = (availableHeight - Math.max(0, count - 1) * minGap) / count;
    return withDockSurfaceWidth({ baseSize: Math.max(minSize, baseSize), gap: minGap });
  }

  const baseSize = Math.max(
    minCompressedSize,
    (availableHeight - Math.max(0, count - 1) * minGap) / Math.max(1, count)
  );
  return withDockSurfaceWidth({ baseSize, gap: minGap });
}

export function dockCaptureThumbnailSize(baseSize: number, influence: number): number {
  const maxSize = Math.min(88, Math.max(64, baseSize * 1.45));
  return baseSize + (maxSize - baseSize) * influence;
}

export function dockFolderSize(baseSize: number, influence: number): number {
  return dockCaptureThumbnailSize(baseSize, influence);
}

export function dockCapturePreviewFrame(
  capture: Capture,
  baseSize: number,
  thumbnailSize: number
): { width: number; height: number } {
  const aspect = capture.width > 0 && capture.height > 0 ? capture.width / capture.height : 1;
  const previewBase = Math.min(260, Math.max(150, baseSize * 4.1, thumbnailSize * 2.05));
  const minimumShortSide = Math.min(previewBase, Math.max(baseSize * 1.65, thumbnailSize + 26));
  const maximumLongSide = Math.min(460, Math.max(previewBase, window.innerWidth - 128));
  let targetWidth = previewBase;
  let targetHeight = previewBase;

  if (Math.abs(aspect - 1) < 0.02) return { width: previewBase, height: previewBase };

  if (aspect >= 1) {
    targetHeight = Math.max(minimumShortSide, previewBase / aspect);
    targetWidth = targetHeight * aspect;
    if (targetWidth > maximumLongSide) {
      targetWidth = maximumLongSide;
      targetHeight = targetWidth / aspect;
    }
  } else {
    targetWidth = Math.max(minimumShortSide, previewBase * aspect);
    targetHeight = targetWidth / aspect;
    if (targetHeight > maximumLongSide) {
      targetHeight = maximumLongSide;
      targetWidth = targetHeight * aspect;
    }
  }

  return {
    width: targetWidth,
    height: targetHeight
  };
}

export function dockItemGap(baseGap: number, baseSize: number, influence: number): number {
  const minimumGap = Math.max(2, Math.min(baseGap, baseSize * 0.08));
  const hoverGap = Math.max(baseGap, baseSize * 0.42);
  return minimumGap + (hoverGap - minimumGap) * influence;
}

export function useDockPreviewOffset(
  slotRef: React.RefObject<HTMLElement | null>,
  isFocused: boolean,
  previewHeight: number
): number {
  const [offset, setOffset] = useState(0);

  useLayoutEffect(() => {
    if (!isFocused) {
      setOffset(0);
      return;
    }

    const updateOffset = () => {
      const slot = slotRef.current;
      if (!slot) return;
      const slotRect = slot.getBoundingClientRect();
      const safeRect = previewSafeRect(slot);
      const centerY = slotRect.top + slotRect.height / 2;
      const previewTop = centerY - previewHeight / 2;
      const previewBottom = centerY + previewHeight / 2;
      let nextOffset = 0;

      if (previewTop < safeRect.top) {
        nextOffset = safeRect.top - previewTop;
      } else if (previewBottom > safeRect.bottom) {
        nextOffset = safeRect.bottom - previewBottom;
      }

      setOffset(Math.round(nextOffset));
    };

    updateOffset();
    window.addEventListener("resize", updateOffset);
    return () => window.removeEventListener("resize", updateOffset);
  }, [isFocused, previewHeight, slotRef]);

  return offset;
}

function withDockSurfaceWidth(layout: Omit<DockLayout, "surfaceWidth">): DockLayout {
  return {
    ...layout,
    surfaceWidth: Math.max(42, Math.min(74, layout.baseSize + 22))
  };
}

function railLibraryHeight(): number {
  const railHeight = Math.min(window.innerHeight * 0.9, window.innerHeight - 24);
  return Math.max(0, railHeight);
}

function previewSafeRect(slot: HTMLElement): { top: number; bottom: number } {
  const container = slot.closest(".justsnap-group-flyout, .justsnap-library");
  const rect = container?.getBoundingClientRect();
  const viewportTop = 12;
  const viewportBottom = window.innerHeight - 12;
  if (!rect) return { top: viewportTop, bottom: viewportBottom };
  return {
    top: Math.max(viewportTop, rect.top + 4),
    bottom: Math.min(viewportBottom, rect.bottom - 4)
  };
}
