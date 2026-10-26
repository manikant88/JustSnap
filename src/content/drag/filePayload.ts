export async function copyFilesToClipboard(files: File[]): Promise<boolean> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return false;
  try {
    const images = await prepareClipboardImages(files);
    const items = images.map((image) => new ClipboardItem({ "image/png": image }));
    await navigator.clipboard.write(items);
    return true;
  } catch {
    return false;
  }
}

export async function prepareClipboardImages(
  images: readonly Blob[],
  convertToPng: (image: Blob) => Promise<Blob> = convertImageToPng
): Promise<Blob[]> {
  return Promise.all(images.map(async (image) => image.type === "image/png" ? image : convertToPng(image)));
}

export async function prepareDeliveryImage(
  image: Blob,
  convertToPng: (image: Blob) => Promise<Blob> = convertImageToPng
): Promise<Blob> {
  return image.type === "image/webp" || image.type === "image/avif"
    ? convertToPng(image)
    : image;
}

async function convertImageToPng(image: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(image);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the image for copying.");
    context.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not prepare the image for copying."));
      }, "image/png");
    });
  } finally {
    bitmap.close();
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

export type NativeDragPreview = {
  element: HTMLElement;
  dispose: () => void;
};

export function createCompactDragPreview(
  target: EventTarget,
  kind: "capture" | "group",
  size = 56
): NativeDragPreview | undefined {
  if (!(target instanceof HTMLElement)) return undefined;
  const source = kind === "group"
    ? target.closest<HTMLElement>(".justsnap-dock-folder-button") ?? target
    : target.closest<HTMLElement>(".justsnap-dock-image-button") ?? target;
  const preview = source.cloneNode(true) as HTMLElement;
  preview.removeAttribute("id");
  preview.setAttribute("aria-hidden", "true");
  preview.setAttribute("draggable", "false");
  preview.dataset.docksnipNativeDragPreview = kind;
  Object.assign(preview.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${size}px`,
    height: `${size}px`,
    minWidth: `${size}px`,
    minHeight: `${size}px`,
    maxWidth: `${size}px`,
    maxHeight: `${size}px`,
    margin: "0",
    opacity: "1",
    pointerEvents: "none",
    transform: "none",
    translate: "0 0",
    scale: "1",
    rotate: "0deg",
    transition: "none",
    animation: "none",
    overflow: "hidden"
  });
  preview.querySelectorAll<HTMLElement>("*").forEach((element) => {
    element.style.transition = "none";
    element.style.transform = "none";
  });
  preview.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
    image.style.width = "100%";
    image.style.height = "100%";
    image.style.objectFit = "cover";
  });
  const root = target.getRootNode();
  if (root instanceof ShadowRoot) root.append(preview);
  else document.body.append(preview);
  return {
    element: preview,
    dispose: () => preview.remove()
  };
}
