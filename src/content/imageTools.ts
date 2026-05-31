import type { CaptureImage } from "../../shared/types";

export async function loadImage(dataUrl: string): Promise<CaptureImage> {
  const image = new window.Image();
  image.src = dataUrl;
  await image.decode();
  return { dataUrl, width: image.naturalWidth, height: image.naturalHeight };
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64 = ""] = dataUrl.split(",");
  const contentType = header.match(/data:(.*?);base64/)?.[1] ?? "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: contentType });
}

