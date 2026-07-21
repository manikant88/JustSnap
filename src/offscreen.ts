import type { CaptureImage, CaptureSelectionRect, CaptureViewport } from "../shared/types";

type OffscreenCropRequest = {
  type: "JUSTSNAP_OFFSCREEN_CROP";
  screenshotDataUrl: string;
  rect: CaptureSelectionRect;
  viewport: CaptureViewport;
};

type OffscreenPrepareImageRequest = {
  type: "JUSTSNAP_OFFSCREEN_PREPARE_IMAGE";
  dataUrl: string;
};

type OffscreenCropResult = {
  crop: CaptureImage;
  thumbnail: CaptureImage;
};

const MAX_IMAGE_PIXELS = 100_000_000;

chrome.runtime.onMessage.addListener((rawMessage: unknown, sender, sendResponse) => {
  const message = validateOffscreenRequest(rawMessage, sender);
  if (!message) return false;
  const operation =
    message.type === "JUSTSNAP_OFFSCREEN_CROP"
      ? cropSelection(message)
      : message.type === "JUSTSNAP_OFFSCREEN_PREPARE_IMAGE"
        ? prepareImage(message)
        : undefined;
  if (!operation) return false;
  operation
    .then((result) => sendResponse({ ok: true, data: result }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Could not crop DockSnip capture."
      })
    );
  return true;
});

function validateOffscreenRequest(
  value: unknown,
  sender: chrome.runtime.MessageSender
): OffscreenCropRequest | OffscreenPrepareImageRequest | undefined {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`)) return undefined;
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  if (value.type === "JUSTSNAP_OFFSCREEN_PREPARE_IMAGE") {
    return isImageDataUrl(value.dataUrl) ? { type: value.type, dataUrl: value.dataUrl } : undefined;
  }
  if (value.type !== "JUSTSNAP_OFFSCREEN_CROP" || !isImageDataUrl(value.screenshotDataUrl)) return undefined;
  if (!isRect(value.rect) || !isViewport(value.viewport)) return undefined;
  return { type: value.type, screenshotDataUrl: value.screenshotDataUrl, rect: value.rect, viewport: value.viewport };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isImageDataUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:image/") && value.length <= 75_000_000;
}

function isRect(value: unknown): value is CaptureSelectionRect {
  return isRecord(value) && isFiniteNumber(value.left) && isFiniteNumber(value.top) &&
    isPositiveDimension(value.width) && isPositiveDimension(value.height);
}

function isViewport(value: unknown): value is CaptureViewport {
  return isRecord(value) && isPositiveDimension(value.width) && isPositiveDimension(value.height) &&
    isFiniteNumber(value.offsetLeft) && isFiniteNumber(value.offsetTop);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveDimension(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0 && value <= 100_000;
}

async function cropSelection(request: OffscreenCropRequest): Promise<OffscreenCropResult> {
  const image = await loadImage(request.screenshotDataUrl);
  const scale = Math.min(image.naturalWidth / request.viewport.width, image.naturalHeight / request.viewport.height);
  const sourceX = Math.max(0, Math.round((request.rect.left + request.viewport.offsetLeft) * scale));
  const sourceY = Math.max(0, Math.round((request.rect.top + request.viewport.offsetTop) * scale));
  const sourceWidth = Math.min(image.naturalWidth - sourceX, Math.round(request.rect.width * scale));
  const sourceHeight = Math.min(image.naturalHeight - sourceY, Math.round(request.rect.height * scale));
  const crop = renderImage(image, sourceWidth, sourceHeight, 0.92, {
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight
  });
  const thumbnailScale = Math.min(1, 360 / Math.max(crop.width, crop.height));
  const thumbnail = await resizeDataUrl(crop.dataUrl, Math.round(crop.width * thumbnailScale), Math.round(crop.height * thumbnailScale), 0.84);
  return { crop, thumbnail };
}

async function prepareImage(request: OffscreenPrepareImageRequest): Promise<{ width: number; height: number; thumbnail: CaptureImage }> {
  const image = await loadImage(request.dataUrl);
  if (image.naturalWidth * image.naturalHeight > MAX_IMAGE_PIXELS) {
    throw new Error("That image exceeds the 100 megapixel import limit.");
  }
  const thumbnailScale = Math.min(1, 360 / Math.max(image.naturalWidth, image.naturalHeight));
  const thumbnail = renderImage(
    image,
    Math.round(image.naturalWidth * thumbnailScale),
    Math.round(image.naturalHeight * thumbnailScale),
    0.84
  );
  return { width: image.naturalWidth, height: image.naturalHeight, thumbnail };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load screenshot for cropping."));
    image.src = dataUrl;
  });
}

async function resizeDataUrl(dataUrl: string, width: number, height: number, quality: number): Promise<CaptureImage> {
  const image = await loadImage(dataUrl);
  return renderImage(image, width, height, quality);
}

function renderImage(
  image: CanvasImageSource,
  width: number,
  height: number,
  quality: number,
  source?: { sourceX: number; sourceY: number; sourceWidth: number; sourceHeight: number }
): CaptureImage {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare screenshot canvas.");
  if (source) {
    context.drawImage(
      image,
      source.sourceX,
      source.sourceY,
      source.sourceWidth,
      source.sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );
  } else {
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  }
  return {
    dataUrl: canvas.toDataURL("image/png", quality),
    width: canvas.width,
    height: canvas.height
  };
}
