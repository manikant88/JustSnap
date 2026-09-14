export async function copyFilesToClipboard(files: File[]): Promise<boolean> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return false;
  try {
    const items = files.map((file) => new ClipboardItem({ [file.type || "image/png"]: file }));
    await navigator.clipboard.write(items);
    return true;
  } catch {
    return false;
  }
}

export function captureFileForDrag(blob: Blob | undefined): File | undefined {
  if (!blob) return undefined;
  const type = blob.type || "image/png";
  return new File([blob], `image.${extensionForImageType(type)}`, { type });
}

function extensionForImageType(type: string): string {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  if (type === "image/avif") return "avif";
  return "png";
}

export function dragPreviewElement(target: EventTarget, kind: "capture" | "group"): Element | undefined {
  if (!(target instanceof Element)) return undefined;
  if (kind === "group") {
    return target.closest(".justsnap-dock-folder-button") ?? target;
  }
  return target.querySelector("img") ?? target;
}
