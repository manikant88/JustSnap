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

chrome.runtime.onMessage.addListener((message: OffscreenCropRequest | OffscreenPrepareImageRequest, _sender, sendResponse) => {
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

async function prepareImage(request: OffscreenPrepareImageRequest): Promise<OffscreenCropResult> {
  const image = await loadImage(request.dataUrl);
  const crop = renderImage(image, image.naturalWidth, image.naturalHeight, 0.92);
  const thumbnailScale = Math.min(1, 360 / Math.max(crop.width, crop.height));
  const thumbnail = await resizeDataUrl(crop.dataUrl, Math.round(crop.width * thumbnailScale), Math.round(crop.height * thumbnailScale), 0.84);
  return { crop, thumbnail };
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
  context.drawImage(
    image,
    source?.sourceX ?? 0,
    source?.sourceY ?? 0,
    source?.sourceWidth ?? width,
    source?.sourceHeight ?? height,
    0,
    0,
    canvas.width,
    canvas.height
  );
  return {
    dataUrl: canvas.toDataURL("image/png", quality),
    width: canvas.width,
    height: canvas.height
  };
}
