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

export function dragPreviewElement(target: EventTarget, kind: "capture" | "group"): Element | undefined {
  if (!(target instanceof Element)) return undefined;
  if (kind === "group") {
    return target.closest(".justsnap-dock-folder-button") ?? target;
  }
  return target.querySelector("img") ?? target;
}
