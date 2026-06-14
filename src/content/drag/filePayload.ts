import type { Capture } from "../../../shared/types";
import { dataUrlToBlob } from "../imageTools";

export async function copyFilesToClipboard(files: File[]): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return;
  try {
    const items = files.map((file) => new ClipboardItem({ [file.type || "image/png"]: file }));
    await navigator.clipboard.write(items);
  } catch {
    // Drag-to-paste still tries synthetic paste/drop when clipboard writes are blocked.
  }
}

export function captureFileForDrag(capture: Capture, blob: Blob | undefined): File | undefined {
  const imageBlob = blob ?? (capture.fullDataUrl ? dataUrlToBlob(capture.fullDataUrl) : undefined);
  if (!imageBlob) return undefined;
  return new File([imageBlob], "image.png", { type: "image/png" });
}

export function dragPreviewElement(target: EventTarget, kind: "capture" | "group"): Element | undefined {
  if (!(target instanceof Element)) return undefined;
  if (kind === "group") {
    return target.closest(".justsnap-dock-folder-button") ?? target;
  }
  return target.querySelector("img") ?? target;
}
