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

export function captureFileForDrag(capture: Capture, blob: Blob | undefined, index: number): File | undefined {
  const imageBlob = blob ?? (capture.fullDataUrl ? dataUrlToBlob(capture.fullDataUrl) : undefined);
  if (!imageBlob) return undefined;
  return new File([imageBlob], fileNameForCapture(capture, index), { type: "image/png" });
}

export function dragPreviewElement(target: EventTarget): Element | undefined {
  if (!(target instanceof Element)) return undefined;
  return target.querySelector("img") ?? target;
}

function fileNameForCapture(capture: Capture, index: number): string {
  const base = (capture.pageTitle || capture.sourceOrigin || "justsnap")
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${base || "justsnap"}-${index + 1}.png`;
}

