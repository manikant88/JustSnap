import type { Rect } from "./types";

export type SurfaceBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type SnipAvoidance = {
  toolbar: boolean;
  dock: boolean;
};

export function snipAvoidanceForSelection(
  selection: Rect,
  surfaces: { toolbar?: SurfaceBounds | null; dock?: SurfaceBounds | null }
): SnipAvoidance {
  return {
    toolbar: rectIntersectsBounds(selection, surfaces.toolbar),
    dock: rectIntersectsBounds(selection, surfaces.dock)
  };
}

function rectIntersectsBounds(rect: Rect, bounds?: SurfaceBounds | null): boolean {
  if (!bounds || rect.width <= 0 || rect.height <= 0) return false;
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  return rect.left < bounds.right && right > bounds.left && rect.top < bounds.bottom && bottom > bounds.top;
}
