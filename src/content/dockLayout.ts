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

export type DynamicIslandRegion = {
  left: number;
  top: number;
  bottom: number;
  curve: number;
  outerCurve?: number;
};

export function dockBaseIslandPath(options: {
  width: number;
  height: number;
  joinRadius?: number;
  outerRadius?: number;
}): string {
  const width = finiteNumber(options.width);
  const height = finiteNumber(options.height);
  if (width <= 0 || height <= 0) return "";

  const joinRadius = clamp(
    finiteNumber(options.joinRadius ?? 20),
    0,
    Math.min(width, height / 4)
  );
  const outerRadius = clamp(
    finiteNumber(options.outerRadius ?? 28),
    0,
    Math.min(width, (height - joinRadius * 2) / 2)
  );
  const bodyTop = joinRadius;
  const bodyBottom = height - joinRadius;

  return [
    `M ${pathNumber(width)} 0`,
    `Q ${pathNumber(width)} ${pathNumber(bodyTop)} ${pathNumber(
      width - joinRadius
    )} ${pathNumber(bodyTop)}`,
    `H ${pathNumber(outerRadius)}`,
    `Q 0 ${pathNumber(bodyTop)} 0 ${pathNumber(bodyTop + outerRadius)}`,
    `V ${pathNumber(bodyBottom - outerRadius)}`,
    `Q 0 ${pathNumber(bodyBottom)} ${pathNumber(outerRadius)} ${pathNumber(bodyBottom)}`,
    `H ${pathNumber(width - joinRadius)}`,
    `Q ${pathNumber(width)} ${pathNumber(bodyBottom)} ${pathNumber(width)} ${pathNumber(
      height
    )}`,
    "V 0",
    "Z"
  ].join(" ");
}

export function dynamicIslandPath(options: {
  width: number;
  height: number;
  baselineLeft: number;
  regions: DynamicIslandRegion[];
}): string {
  const width = finiteNumber(options.width);
  const height = finiteNumber(options.height);
  const baselineLeft = clamp(finiteNumber(options.baselineLeft), 0, width);
  if (width <= 0 || height <= 0 || options.regions.length === 0) return "";

  const regions = normalizeIslandRegions(
    options.regions,
    width,
    baselineLeft
  );
  if (regions.length === 0) return "";

  const region = regions.reduce((outermost, candidate) =>
    candidate.left < outermost.left ? candidate : outermost
  );
  const protrusion = baselineLeft - region.left;
  if (protrusion < 0.1) return "";

  const itemHeight = region.bottom - region.top;
  const outerRadius = Math.min(region.outerCurve, itemHeight / 2);
  const [topJoinRadius, topOuterRadius] = fitIslandRadii(
    region.curve,
    outerRadius,
    protrusion
  );
  const [bottomJoinRadius, bottomOuterRadius] = fitIslandRadii(
    region.curve,
    outerRadius,
    protrusion
  );

  return [
    `M ${pathNumber(width)} 0`,
    `H ${pathNumber(baselineLeft)}`,
    `V ${pathNumber(region.top - topJoinRadius)}`,
    `Q ${pathNumber(baselineLeft)} ${pathNumber(region.top)} ${pathNumber(
      baselineLeft - topJoinRadius
    )} ${pathNumber(region.top)}`,
    `H ${pathNumber(region.left + topOuterRadius)}`,
    `Q ${pathNumber(region.left)} ${pathNumber(region.top)} ${pathNumber(
      region.left
    )} ${pathNumber(region.top + topOuterRadius)}`,
    `V ${pathNumber(region.bottom - bottomOuterRadius)}`,
    `Q ${pathNumber(region.left)} ${pathNumber(region.bottom)} ${pathNumber(
      region.left + bottomOuterRadius
    )} ${pathNumber(region.bottom)}`,
    `H ${pathNumber(baselineLeft - bottomJoinRadius)}`,
    `Q ${pathNumber(baselineLeft)} ${pathNumber(region.bottom)} ${pathNumber(
      baselineLeft
    )} ${pathNumber(region.bottom + bottomJoinRadius)}`,
    `V ${pathNumber(height)}`,
    `H ${pathNumber(width)}`,
    "Z"
  ].join(" ");
}

export function dockLayoutForCount(count: number, maxHeight = railLibraryHeight()): DockLayout {
  const preferredSize = 52;
  const minSize = 28;
  const minCompressedSize = 8;
  const preferredGap = 8;
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
  const clampedInfluence = Math.max(0, Math.min(1, influence));
  const focusedSize = Math.min(88, baseSize * 1.65);
  return baseSize + (focusedSize - baseSize) * clampedInfluence;
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
  const hoverGap = Math.max(baseGap, baseSize * 0.42);
  return baseGap + (hoverGap - baseGap) * influence;
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

type NormalizedIslandRegion = Required<DynamicIslandRegion>;

function normalizeIslandRegions(
  regions: DynamicIslandRegion[],
  width: number,
  baselineLeft: number
): NormalizedIslandRegion[] {
  return regions
    .map((region) => {
      const top = finiteNumber(region.top);
      const bottom = Math.max(top, finiteNumber(region.bottom));
      return {
        left: clamp(finiteNumber(region.left), 0, Math.min(width, baselineLeft)),
        top,
        bottom,
        curve: Math.max(0, finiteNumber(region.curve)),
        outerCurve: Math.max(0, finiteNumber(region.outerCurve ?? 20))
      };
    })
    .filter((region) => region.bottom - region.top >= 0.1);
}

function fitIslandRadii(
  joinRadius: number,
  outerRadius: number,
  availableWidth: number
): [number, number] {
  const total = joinRadius + outerRadius;
  if (total <= availableWidth || total <= 0) return [joinRadius, outerRadius];
  const scale = availableWidth / total;
  return [joinRadius * scale, outerRadius * scale];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function pathNumber(value: number): string {
  return (Math.round(value * 10) / 10).toString();
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
