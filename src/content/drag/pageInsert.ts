import type { Capture, CaptureImage } from "../../../shared/types";
import { loadImage } from "../imageTools";

const WHATSAPP_WIDE_IMAGE_RATIO = 2.4;

export type PageInsertEnvironment = {
  currentOrigin: () => string;
  isJustSnapNode: (node: Node) => boolean;
};

export async function placeFilesInCurrentPage(
  files: File[],
  captures: Capture[],
  env: PageInsertEnvironment,
  preferredTarget?: Element
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (env.currentOrigin().includes("web.whatsapp.com")) {
    const whatsappFiles = await prepareFilesForWhatsApp(files);
    const whatsappAttached = await attachFilesViaWhatsApp(whatsappFiles, env, preferredTarget);
    if (whatsappAttached) return { ok: true };
    return {
      ok: false,
      error: "WhatsApp did not accept the image through its attachment input."
    };
  }

  const fileInput = findAttachmentInput(env, preferredTarget);
  if (fileInput) {
    const assigned = await withInsertionSignal(() => assignFilesToInput(fileInput, files), env);
    if (assigned) return { ok: true };
  }

  const target = resolveInsertTarget(env, preferredTarget);
  if (target) {
    target.focus();
    await nextAnimationFrame();
    const pasted = await withInsertionSignal(() => dispatchPasteWithFiles(target, files), env);
    const dropped = pasted || (await withInsertionSignal(() => dispatchDropWithFiles(target, files), env));
    if (pasted || dropped) return { ok: true };
  }

  const fallbackTarget = findPageInsertTarget(env);
  if (!fallbackTarget) {
    return {
      ok: false,
      error: "Could not find an active message field or attachment input on this page."
    };
  }

  fallbackTarget.focus();
  await nextAnimationFrame();

  const pasted = await withInsertionSignal(() => dispatchPasteWithFiles(fallbackTarget, files), env);
  const dropped = pasted || (await withInsertionSignal(() => dispatchDropWithFiles(fallbackTarget, files), env));
  if (pasted || dropped) return { ok: true };

  return {
    ok: false,
    error: "This page ignored the image insert. Try the paperclip/plus attachment button or press Cmd+V after dragging."
  };
}

async function attachFilesViaWhatsApp(
  files: File[],
  env: PageInsertEnvironment,
  preferredTarget?: Element
): Promise<boolean> {
  const existingInput = findWhatsAppPhotoInput(env, preferredTarget);
  if (existingInput) {
    const assigned = await withInsertionSignal(() => assignFilesToInput(existingInput, files), env, 2200);
    if (assigned) return true;
  }

  const attachButton = findWhatsAppAttachButton(env);
  if (!attachButton) return false;

  attachButton.click();
  await sleep(250);
  const openedInput = await waitForWhatsAppPhotoInput(1600, env, preferredTarget);
  if (!openedInput) return false;

  return withInsertionSignal(() => assignFilesToInput(openedInput, files), env, 2600);
}

async function prepareFilesForWhatsApp(files: File[]): Promise<File[]> {
  return Promise.all(files.map((file) => padWideImageForWhatsApp(file)));
}

async function padWideImageForWhatsApp(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  let image: CaptureImage | undefined;
  try {
    image = await loadImage(url);
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
  const ratio = image.width / image.height;
  if (ratio <= WHATSAPP_WIDE_IMAGE_RATIO) return file;

  const size = image.width;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return file;

  const top = Math.round((size - image.height) / 2);
  const bitmap = await loadBitmap(file);
  context.fillStyle = await sampledEdgeColor(bitmap);
  context.fillRect(0, 0, size, size);
  context.drawImage(bitmap, 0, top, image.width, image.height);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
  const blob = await canvasToBlob(canvas);
  return new File([blob], file.name.replace(/\.png$/i, "-whatsapp.png"), { type: "image/png" });
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

async function sampledEdgeColor(bitmap: ImageBitmap): Promise<string> {
  const sample = document.createElement("canvas");
  sample.width = 1;
  sample.height = 1;
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context) return "transparent";
  context.drawImage(bitmap, 0, 0, bitmap.width, 1, 0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  if (alpha === 0) return "transparent";
  return `rgb(${red}, ${green}, ${blue})`;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not prepare WhatsApp image."));
    }, "image/png");
  });
}

function findWhatsAppAttachButton(env: PageInsertEnvironment): HTMLElement | undefined {
  const selectors = [
    'button[aria-label*="Attach" i]',
    'div[role="button"][aria-label*="Attach" i]',
    'button[title*="Attach" i]',
    'span[data-icon="plus"]',
    'span[data-icon="attach-menu-plus"]',
    'span[data-icon="clip"]'
  ];
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);
    const clickable = element?.closest<HTMLElement>('button, [role="button"]') ?? element;
    if (clickable && !env.isJustSnapNode(clickable) && isVisibleElement(clickable)) return clickable;
  }

  const footerButtons = Array.from(document.querySelectorAll<HTMLElement>('footer button, footer [role="button"]'));
  return footerButtons.find((button) => !env.isJustSnapNode(button) && isVisibleElement(button));
}

async function waitForWhatsAppPhotoInput(
  timeoutMs: number,
  env: PageInsertEnvironment,
  nearTarget?: Element
): Promise<HTMLInputElement | undefined> {
  const existing = findWhatsAppPhotoInput(env, nearTarget);
  if (existing) return existing;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await sleep(100);
    const input = findWhatsAppPhotoInput(env, nearTarget);
    if (input) return input;
  }
  return undefined;
}

function findWhatsAppPhotoInput(env: PageInsertEnvironment, nearTarget?: Element): HTMLInputElement | undefined {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  const pageInputs = inputs.filter((input) => !env.isJustSnapNode(input));
  const imageInputs = pageInputs.filter(isWhatsAppPhotoVideoInput);
  const nearDialog = nearTarget?.closest('[role="dialog"], footer, main');
  if (nearDialog) {
    const nearby = imageInputs.find((input) => nearDialog.contains(input));
    if (nearby) return nearby;
  }
  return imageInputs[0];
}

function isWhatsAppPhotoVideoInput(input: HTMLInputElement): boolean {
  const accept = input.accept.toLowerCase();
  if (!accept) return false;
  const supportsRasterImage =
    accept.includes("image/*") || accept.includes("image/jpeg") || accept.includes("image/jpg") || accept.includes("image/png");
  const supportsVideo = accept.includes("video/");
  const looksStickerOnly = accept.includes("webp") && !supportsVideo && !accept.includes("jpeg") && !accept.includes("jpg") && !accept.includes("png");
  return supportsRasterImage && !looksStickerOnly;
}

function resolveInsertTarget(env: PageInsertEnvironment, target: Element | undefined): HTMLElement | undefined {
  if (!target || env.isJustSnapNode(target)) return undefined;
  if (target instanceof HTMLElement && isEditableTarget(target)) return target;
  const closestEditable = target.closest<HTMLElement>(
    '[contenteditable="true"], textarea, input, [role="textbox"], canvas, [data-testid*="canvas"], [class*="canvas"]'
  );
  if (closestEditable && !env.isJustSnapNode(closestEditable) && isVisibleElement(closestEditable)) return closestEditable;
  if (target instanceof HTMLElement && isVisibleElement(target)) return target;
  return undefined;
}

function findAttachmentInput(env: PageInsertEnvironment, nearTarget?: Element): HTMLInputElement | undefined {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  const pageInputs = inputs.filter((input) => !env.isJustSnapNode(input));
  const nearForm = nearTarget?.closest("form");
  const nearbyInputs =
    nearForm instanceof HTMLFormElement
      ? pageInputs.filter((input) => nearForm.contains(input))
      : [];
  const imageInputs = pageInputs.filter((input) => {
    const accept = input.accept.toLowerCase();
    return accept.includes("image") || accept.includes("png") || accept.includes("jpeg") || accept.includes("jpg");
  });
  const nearbyImageInputs = nearbyInputs.filter((input) => imageInputs.includes(input));
  if (nearbyImageInputs[0]) return nearbyImageInputs[0];
  if (nearbyInputs[0]) return nearbyInputs[0];
  return imageInputs[0] ?? pageInputs[0];
}

function assignFilesToInput(input: HTMLInputElement, files: File[]): boolean {
  try {
    input.value = "";
    input.files = filesToTransfer(files).files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  } catch {
    return false;
  }
}

function findPageInsertTarget(env: PageInsertEnvironment): HTMLElement | undefined {
  const active = document.activeElement;
  if (active instanceof HTMLElement && !env.isJustSnapNode(active) && isEditableTarget(active)) return active;

  const selectors = [
    'footer [contenteditable="true"][role="textbox"]',
    '[contenteditable="true"][aria-placeholder]',
    '[contenteditable="true"][data-tab]',
    '[contenteditable="true"][role="textbox"]',
    'textarea',
    '[contenteditable="true"]'
  ];
  for (const selector of selectors) {
    const match = Array.from(document.querySelectorAll<HTMLElement>(selector)).find(
      (element) => !env.isJustSnapNode(element) && isVisibleElement(element)
    );
    if (match) return match;
  }
  return document.body;
}

function isEditableTarget(element: HTMLElement): boolean {
  return element.isContentEditable || element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement;
}

function dispatchPasteWithFiles(target: HTMLElement, files: File[]): boolean {
  try {
    const transfer = filesToTransfer(files);
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer
    });
    return !target.dispatchEvent(event) || event.defaultPrevented;
  } catch {
    return false;
  }
}

function dispatchDropWithFiles(target: HTMLElement, files: File[]): boolean {
  try {
    const transfer = filesToTransfer(files);
    let accepted = false;
    for (const type of ["dragenter", "dragover", "drop"]) {
      const event = new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer
      });
      const dispatched = target.dispatchEvent(event);
      accepted = accepted || !dispatched || event.defaultPrevented;
    }
    return accepted;
  } catch {
    return false;
  }
}

async function withInsertionSignal(
  action: () => boolean | Promise<boolean>,
  env: PageInsertEnvironment,
  timeoutMs = 1200
): Promise<boolean> {
  let changed = false;
  const observer = new MutationObserver((records) => {
    if (records.some((record) => !env.isJustSnapNode(record.target))) changed = true;
  });
  observer.observe(document.body, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true
  });
  try {
    const attempted = await action();
    if (!attempted) return false;
    await sleep(timeoutMs);
    return changed;
  } finally {
    observer.disconnect();
  }
}

function filesToTransfer(files: File[]): DataTransfer {
  const transfer = new DataTransfer();
  files.forEach((file) => transfer.items.add(file));
  return transfer;
}

function isVisibleElement(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

