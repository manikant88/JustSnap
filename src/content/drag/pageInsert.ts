import type { Capture } from "../../../shared/types";

export type PageInsertEnvironment = {
  currentOrigin: () => string;
  isDockSnipNode: (node: Node) => boolean;
};

export async function placeFilesInCurrentPage(
  files: File[],
  captures: Capture[],
  env: PageInsertEnvironment,
  preferredTarget?: Element
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (files.length > 1 && isWhatsAppOrigin(env.currentOrigin())) {
    const pasted = await pasteFilesIntoPage(files, env, preferredTarget, 1800);
    if (pasted) return { ok: true };
    return {
      ok: false,
      error: "WhatsApp did not accept the folder images through paste."
    };
  }

  if (files.length === 1) {
    const pasted = await pasteFilesIntoPage(files, env, preferredTarget);
    if (pasted) return { ok: true };
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
    const dropped = await withInsertionSignal(() => dispatchDropWithFiles(target, files), env);
    if (dropped) return { ok: true };
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

  const dropped = await withInsertionSignal(() => dispatchDropWithFiles(fallbackTarget, files), env);
  if (dropped) return { ok: true };

  if (files.length > 1) {
    const pasted = await pasteFilesIntoPage(files, env, preferredTarget);
    if (pasted) return { ok: true };
  }

  return {
    ok: false,
    error: "This page ignored the image insert. Try the paperclip/plus attachment button or press Cmd+V after dragging."
  };
}

async function pasteFilesIntoPage(
  files: File[],
  env: PageInsertEnvironment,
  preferredTarget?: Element,
  timeoutMs = 1200
): Promise<boolean> {
  const target = resolveInsertTarget(env, preferredTarget) ?? findPageInsertTarget(env);
  if (!target) return false;
  target.focus();
  await nextAnimationFrame();
  return withInsertionSignal(() => dispatchPasteWithFiles(target, files), env, timeoutMs);
}

function isWhatsAppOrigin(origin: string): boolean {
  return origin.includes("web.whatsapp.com");
}

function resolveInsertTarget(env: PageInsertEnvironment, target: Element | undefined): HTMLElement | undefined {
  if (!target || env.isDockSnipNode(target)) return undefined;
  if (target instanceof HTMLElement && isEditableTarget(target)) return target;
  const closestEditable = target.closest<HTMLElement>(
    '[contenteditable="true"], textarea, input, [role="textbox"], canvas, [data-testid*="canvas"], [class*="canvas"]'
  );
  if (closestEditable && !env.isDockSnipNode(closestEditable) && isVisibleElement(closestEditable)) return closestEditable;
  if (target instanceof HTMLElement && isVisibleElement(target)) return target;
  return undefined;
}

function findAttachmentInput(env: PageInsertEnvironment, nearTarget?: Element): HTMLInputElement | undefined {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  const pageInputs = inputs.filter((input) => !env.isDockSnipNode(input));
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
  if (active instanceof HTMLElement && !env.isDockSnipNode(active) && isEditableTarget(active)) return active;

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
      (element) => !env.isDockSnipNode(element) && isVisibleElement(element)
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
    // The user already generated native dragenter/dragover events while moving
    // the capture. Replaying dragover can trip passive page listeners in apps
    // such as Google Docs, so the insertion fallback only supplies the drop.
    const event = new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer
    });
    return !target.dispatchEvent(event) || event.defaultPrevented;
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
    if (records.some((record) => !env.isDockSnipNode(record.target))) changed = true;
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
