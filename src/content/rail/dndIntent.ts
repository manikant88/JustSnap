export type VerticalDropZone = "before" | "center" | "after";

export function verticalDropZoneForElement(element: Element, pointerY: number): VerticalDropZone {
  const rect = element.getBoundingClientRect();
  const y = pointerY - rect.top;
  if (y < rect.height * 0.25) return "before";
  if (y > rect.height * 0.75) return "after";
  return "center";
}
