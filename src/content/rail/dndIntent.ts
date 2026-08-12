import type { RailOrderItem } from "../../../shared/types";
import type { RailDropIntent } from "../types";

export type VerticalDropZone = "before" | "center" | "after";

export type RailItemBand = {
  item: RailOrderItem;
  top: number;
  bottom: number;
};

export function verticalDropZoneForElement(element: Element, pointerY: number): VerticalDropZone {
  const rect = element.getBoundingClientRect();
  const y = pointerY - rect.top;
  if (y < rect.height * 0.25) return "before";
  if (y > rect.height * 0.75) return "after";
  return "center";
}

export function insertionIndexForPointer(pointerY: number, bands: readonly RailItemBand[]): number {
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    if (pointerY < band.top + (band.bottom - band.top) / 2) return index;
  }
  return bands.length;
}

export function railInsertIntentForIndex(
  insertionIndex: number,
  items: readonly RailOrderItem[],
  draggedItem: RailOrderItem | null | undefined
): RailDropIntent | null {
  if (!draggedItem || items.length === 0) return null;

  const index = Math.max(0, Math.min(insertionIndex, items.length));
  const insertAtEnd = index === items.length;
  const target = insertAtEnd ? items[items.length - 1] : items[index];
  if (target.kind === draggedItem.kind && target.id === draggedItem.id) return null;

  return {
    scope: "rail",
    action: insertAtEnd ? "insert-after" : "insert-before",
    target
  };
}
