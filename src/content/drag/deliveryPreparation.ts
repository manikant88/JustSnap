import type { Capture } from "../../../shared/types";
import { captureFileForDrag } from "./filePayload";

export function deliveryCaptureKey(captureIds: readonly string[]): string {
  return captureIds.join("\u0000");
}

export function filesForDelivery(
  captureIds: readonly string[],
  captures: readonly Capture[],
  blobs: ReadonlyMap<string, Blob>
): File[] | undefined {
  const captureById = new Map(captures.map((capture) => [capture.id, capture]));
  const files: File[] = [];
  for (const captureId of captureIds) {
    if (!captureById.has(captureId)) return undefined;
    const file = captureFileForDrag(blobs.get(captureId));
    if (!file) return undefined;
    files.push(file);
  }
  return files;
}
