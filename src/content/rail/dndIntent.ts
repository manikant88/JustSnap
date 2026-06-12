import { getClientRect } from "@dnd-kit/core";

export type VerticalDropZone = "before" | "center" | "after";

export function verticalDropZoneForElement(element: Element, pointerY: number): VerticalDropZone {
  const rect = getClientRect(element);
  const y = pointerY - rect.top;
  if (y < rect.height * 0.25) return "before";
  if (y > rect.height * 0.75) return "after";
  return "center";
}
