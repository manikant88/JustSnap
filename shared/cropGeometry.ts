import type { CaptureSelectionRect, CaptureViewport } from "./types";

export type SourceCrop = {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
};

export function cropGeometry(
  image: { width: number; height: number },
  rect: CaptureSelectionRect,
  viewport: CaptureViewport
): SourceCrop {
  const scale = Math.min(image.width / viewport.width, image.height / viewport.height);
  const left = Math.round((rect.left + viewport.offsetLeft) * scale);
  const top = Math.round((rect.top + viewport.offsetTop) * scale);
  const right = Math.round((rect.left + viewport.offsetLeft + rect.width) * scale);
  const bottom = Math.round((rect.top + viewport.offsetTop + rect.height) * scale);
  const sourceX = clamp(left, 0, Math.max(0, image.width - 1));
  const sourceY = clamp(top, 0, Math.max(0, image.height - 1));
  const sourceRight = clamp(right, sourceX + 1, image.width);
  const sourceBottom = clamp(bottom, sourceY + 1, image.height);
  return {
    sourceX,
    sourceY,
    sourceWidth: sourceRight - sourceX,
    sourceHeight: sourceBottom - sourceY
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
