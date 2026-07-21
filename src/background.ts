import { captureImageToBlob, deleteImageBlob, getImageBlob, saveImageBlob } from "../shared/blobStore";
import { parseStoredCaptureSession } from "../shared/sessionModel";
import type { ActiveCaptureSession } from "../shared/sessionModel";
import type {
  BackgroundRequest,
  BackgroundResponse,
  Capture,
  CaptureAddTarget,
  CaptureGroup,
  CaptureImage,
  CaptureSelectionResult,
  ContentMessage,
  LibraryMutation,
  LibraryState,
  RailOrderItem
} from "../shared/types";
import { insertCapture, mutateLibrary, readLibrary, updateLibrary } from "./libraryRepository";

let railFollowEnabled = false;
let activeRailTabId: number | undefined;
let captureSession: ActiveCaptureSession | undefined;
let runtimeStateLoaded = false;
let runtimeStateLoadPromise: Promise<void> | undefined;
let runtimeStateWriteQueue: Promise<void> = Promise.resolve();
const RUNTIME_STATE_KEY = "docksnip_runtime_state";

type OffscreenCropResult = {
  crop: CaptureImage;
  thumbnail: CaptureImage;
};

type OffscreenPreparedImage = {
  width: number;
  height: number;
  thumbnail: CaptureImage;
};

const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);
const THUMBNAIL_RENDER_VERSION = 2;
let thumbnailRepairPromise: Promise<void> | undefined;

chrome.action?.onClicked?.addListener(async (tab) => {
  await ensureRuntimeState();
  await toggleRailForTab(tab).catch(() => undefined);
});

chrome.commands.onCommand.addListener(async (command) => {
  await ensureRuntimeState();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  if (command === "toggle-justsnap") {
    await toggleRailForTab(tab).catch(() => undefined);
    return;
  }
  if (command === "start-capture") {
    await startCaptureOnTab(tab).catch(() => undefined);
    return;
  }
  if (command === "close-justsnap") {
    await closeRailEverywhere().catch(() => undefined);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await ensureRuntimeState();
  if (!railFollowEnabled) return;
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    void showOnlyOnTab(tab, messageForTab()).catch(() => undefined);
  });
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  await ensureRuntimeState();
  if (!railFollowEnabled || windowId === chrome.windows.WINDOW_ID_NONE) return;
  chrome.tabs.query({ active: true, windowId }, ([tab]) => {
    if (!tab) return;
    void showOnlyOnTab(tab, messageForTab()).catch(() => undefined);
  });
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  await ensureRuntimeState();
  if (!railFollowEnabled || changeInfo.status !== "complete" || !tab.active) return;
  void showOnlyOnTab(tab, messageForTab()).catch(() => undefined);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await ensureRuntimeState();
  let changed = false;
  if (activeRailTabId === tabId) {
    activeRailTabId = undefined;
    changed = true;
  }
  if (captureSession?.tabId === tabId) {
    captureSession.tabId = undefined;
    changed = true;
  }
  if (changed) await persistRuntimeState();
});

chrome.runtime.onMessage.addListener((request: unknown, sender, sendResponse) => {
  const validatedRequest = validateBackgroundRequest(request, sender);
  if (!validatedRequest) return false;
  handleMessage(validatedRequest, sender).then(sendResponse);
  return true;
});

async function handleMessage(request: BackgroundRequest, sender: chrome.runtime.MessageSender): Promise<BackgroundResponse> {
  try {
    await ensureRuntimeState();
    if (request.type === "JUSTSNAP_TOGGLE_RAIL") {
      const tab = sender.tab ?? (await getActiveTab());
      if (!tab?.id) return { ok: false, error: "No active tab available." };
      if (isRestrictedTabUrl(tab.url)) return { ok: false, error: restrictedPageMessage(tab.url) };
      await toggleRailForTab(tab);
      return { ok: true, data: null };
    }

    if (request.type === "JUSTSNAP_CLOSE_RAIL_GLOBAL") {
      await closeRailEverywhere();
      return { ok: true, data: null };
    }

    if (request.type === "JUSTSNAP_OPEN_SHORTCUT_SETTINGS") {
      await chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
      return { ok: true, data: null };
    }

    if (request.type === "JUSTSNAP_START_CAPTURE_ACTIVE") {
      const session = await startCaptureOnTab(sender.tab ?? (await getActiveTab()), request.addTarget);
      return { ok: true, data: session };
    }

    if (request.type === "JUSTSNAP_PREPARE_CAPTURE_SESSION") {
      const session = await prepareCaptureSession(sender.tab ?? (await getActiveTab()), request.addTarget);
      return { ok: true, data: session };
    }

    if (request.type === "JUSTSNAP_IMPORT_IMAGE_URL") {
      const capture = await importImageUrl(request);
      return { ok: true, data: capture };
    }

    if (request.type === "JUSTSNAP_CAPTURE_SELECTION") {
      const result = await captureSelection(request, sender);
      return { ok: true, data: result };
    }

    if (request.type === "JUSTSNAP_FINISH_CAPTURE_SESSION") {
      const result = await finishCaptureSession(request.sessionId);
      return { ok: true, data: result };
    }

    if (request.type === "JUSTSNAP_CANCEL_CAPTURE_SESSION") {
      const result = await cancelCaptureSession(request.sessionId);
      return { ok: true, data: result };
    }

    if (request.type === "JUSTSNAP_GET_LIBRARY") {
      await ensureCurrentThumbnails();
      return { ok: true, data: await readLibrary() };
    }

    if (request.type === "JUSTSNAP_GET_IMAGE_DATA") {
      const blob = await getImageBlob(request.imageBlobKey);
      return { ok: true, data: blob ? await blobToDataUrl(blob) : null };
    }

    if (request.type === "JUSTSNAP_MUTATE_LIBRARY") {
      return { ok: true, data: await mutateLibrary(request.mutation) };
    }

    return { ok: false, error: "Unsupported DockSnip request." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "DockSnip request failed."
    };
  }
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function toggleRailForTab(tab: chrome.tabs.Tab): Promise<void> {
  if (railFollowEnabled) {
    await closeRailEverywhere();
    return;
  }
  railFollowEnabled = true;
  await persistRuntimeState();
  await showOnlyOnTab(tab);
}

async function startCaptureOnTab(tab: chrome.tabs.Tab | undefined, addTarget?: CaptureAddTarget) {
  const session = await prepareCaptureSession(tab, addTarget);
  await showOnlyOnTab(tab as chrome.tabs.Tab, captureStartMessage(captureSession!));
  return session;
}

async function prepareCaptureSession(tab: chrome.tabs.Tab | undefined, addTarget?: CaptureAddTarget) {
  if (!tab?.id) throw new Error("No active tab available.");
  if (isRestrictedTabUrl(tab.url)) throw new Error(restrictedPageMessage(tab.url));

  captureSession = {
    id: crypto.randomUUID(),
    captureIds: [],
    startedAt: Date.now(),
    tabId: tab.id,
    addTarget
  };
  railFollowEnabled = true;
  await persistRuntimeState();
  return sessionSnapshot(captureSession);
}

async function showOnlyOnTab(tab: chrome.tabs.Tab, message: ContentMessage = { type: "JUSTSNAP_SHOW_RAIL" }): Promise<void> {
  if (!tab.id || isRestrictedTabUrl(tab.url)) {
    if (activeRailTabId) await sendMessage(activeRailTabId, { type: "JUSTSNAP_CLOSE_RAIL" }).catch(() => undefined);
    activeRailTabId = undefined;
    await persistRuntimeState();
    return;
  }
  if (activeRailTabId && activeRailTabId !== tab.id) {
    await sendMessage(activeRailTabId, { type: "JUSTSNAP_CLOSE_RAIL" }).catch(() => undefined);
  }
  activeRailTabId = tab.id;
  if (captureSession) captureSession.tabId = tab.id;
  await persistRuntimeState();
  await sendMessage(tab.id, message);
}

async function closeRailEverywhere(): Promise<void> {
  railFollowEnabled = false;
  captureSession = undefined;
  activeRailTabId = undefined;
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => (tab.id ? sendMessage(tab.id, { type: "JUSTSNAP_CLOSE_RAIL" }).catch(() => undefined) : undefined)));
  await persistRuntimeState();
}

async function importImageUrl(request: Extract<BackgroundRequest, { type: "JUSTSNAP_IMPORT_IMAGE_URL" }>): Promise<Capture> {
  assertSupportedImageUrl(request.imageUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const response = await fetch(request.imageUrl, { signal: controller.signal }).finally(() => clearTimeout(timeout));
  if (!response.ok) throw new Error("Could not load that image.");
  assertSupportedImageUrl(response.url);
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMPORT_BYTES) {
    throw new Error("That image is larger than the 50 MB import limit.");
  }
  const blob = await response.blob();
  if (blob.size > MAX_IMPORT_BYTES) throw new Error("That image is larger than the 50 MB import limit.");
  if (!SUPPORTED_IMAGE_TYPES.has(blob.type.toLowerCase())) throw new Error("That image format is not supported.");

  const sourceDataUrl = await blobToDataUrl(blob);
  const { width, height, thumbnail } = await prepareImageWithOffscreen(sourceDataUrl);
  const id = crypto.randomUUID();
  const imageBlobKey = `capture-${id}`;
  await saveImageBlob(imageBlobKey, blob);

  const capture: Capture = {
    id,
    createdAt: Date.now(),
    width,
    height,
    thumbnailDataUrl: thumbnail.dataUrl,
    thumbnailVersion: THUMBNAIL_RENDER_VERSION,
    imageBlobKey
  };
  await insertCapture(capture);
  return capture;
}

async function captureSelection(
  request: Extract<BackgroundRequest, { type: "JUSTSNAP_CAPTURE_SELECTION" }>,
  sender: chrome.runtime.MessageSender
): Promise<CaptureSelectionResult> {
  const tab = await resolveCaptureTab(sender);
  if (!tab?.id || !tab.windowId) throw new Error("No active tab available to capture.");
  if (isRestrictedTabUrl(tab.url)) throw new Error(restrictedPageMessage(tab.url));

  const screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  const { crop, thumbnail } = await cropWithOffscreen(screenshotDataUrl, request.rect, request.viewport);
  const id = crypto.randomUUID();
  const imageBlobKey = `capture-${id}`;
  const blob = await captureImageToBlob(crop);
  await saveImageBlob(imageBlobKey, blob);

  const capture: Capture = {
    id,
    createdAt: Date.now(),
    width: crop.width,
    height: crop.height,
    thumbnailDataUrl: thumbnail.dataUrl,
    thumbnailVersion: THUMBNAIL_RENDER_VERSION,
    imageBlobKey
  };
  const isCurrentSession = Boolean(request.sessionId && captureSession?.id === request.sessionId);
  let sessionSnapshotResult = captureSession ? sessionSnapshot(captureSession) : null;
  if (request.sessionId && captureSession?.id === request.sessionId) {
    if (!captureSession.captureIds.includes(id)) captureSession.captureIds.push(id);
    sessionSnapshotResult = sessionSnapshot(captureSession);
    await persistRuntimeState();
  }
  const shouldKeepOutOfTopLevelOrder = Boolean(isCurrentSession && captureSession?.addTarget);

  await insertCapture(capture, !shouldKeepOutOfTopLevelOrder);

  return { capture, session: sessionSnapshotResult };
}

async function resolveCaptureTab(
  sender: chrome.runtime.MessageSender
): Promise<chrome.tabs.Tab | undefined> {
  const senderTab = sender.tab?.id ? await chrome.tabs.get(sender.tab.id).catch(() => undefined) : undefined;
  if (senderTab?.id && !isRestrictedTabUrl(senderTab.url)) return senderTab;
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (activeTab?.id && !isRestrictedTabUrl(activeTab.url)) return activeTab;
  return undefined;
}

async function cropWithOffscreen(
  screenshotDataUrl: string,
  rect: Extract<BackgroundRequest, { type: "JUSTSNAP_CAPTURE_SELECTION" }>["rect"],
  viewport: Extract<BackgroundRequest, { type: "JUSTSNAP_CAPTURE_SELECTION" }>["viewport"]
): Promise<OffscreenCropResult> {
  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({
    type: "JUSTSNAP_OFFSCREEN_CROP",
    screenshotDataUrl,
    rect,
    viewport
  });
  if (!response?.ok) throw new Error(response?.error ?? "Could not crop DockSnip capture.");
  return response.data as OffscreenCropResult;
}

async function prepareImageWithOffscreen(dataUrl: string): Promise<OffscreenPreparedImage> {
  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({
    type: "JUSTSNAP_OFFSCREEN_PREPARE_IMAGE",
    dataUrl
  });
  if (!response?.ok) throw new Error(response?.error ?? "Could not prepare DockSnip image.");
  return response.data as OffscreenPreparedImage;
}

async function ensureCurrentThumbnails(): Promise<void> {
  if (thumbnailRepairPromise) return thumbnailRepairPromise;
  thumbnailRepairPromise = repairLegacyThumbnails().catch((error) => {
    thumbnailRepairPromise = undefined;
    throw error;
  });
  return thumbnailRepairPromise;
}

async function repairLegacyThumbnails(): Promise<void> {
  const library = await readLibrary();
  const staleCaptures = library.captures.filter(
    (capture) => capture.thumbnailVersion !== THUMBNAIL_RENDER_VERSION
  );
  if (!staleCaptures.length) return;

  const repaired = new Map<string, string>();
  for (const capture of staleCaptures) {
    try {
      const blob = await getImageBlob(capture.imageBlobKey);
      if (!blob) continue;
      const prepared = await prepareImageWithOffscreen(await blobToDataUrl(blob));
      repaired.set(capture.id, prepared.thumbnail.dataUrl);
    } catch {
      // Keep the existing thumbnail if its source blob cannot be decoded.
    }
  }
  if (!repaired.size) return;

  await updateLibrary((current) => ({
    ...current,
    captures: current.captures.map((capture) => {
      const thumbnailDataUrl = repaired.get(capture.id);
      return thumbnailDataUrl
        ? { ...capture, thumbnailDataUrl, thumbnailVersion: THUMBNAIL_RENDER_VERSION }
        : capture;
    })
  }));
}

async function ensureOffscreenDocument(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: [chrome.offscreen.Reason.BLOBS],
    justification: "Prepare DockSnip image captures in a hidden canvas document."
  });
}

async function finishCaptureSession(sessionId: string): Promise<{ groupId?: string; captureIds: string[] }> {
  if (!captureSession || captureSession.id !== sessionId) {
    return { captureIds: [] };
  }

  const sessionCaptureIds = [...captureSession.captureIds];
  const addTarget = captureSession.addTarget;
  captureSession = undefined;
  await persistRuntimeState();

  const library = await readLibrary();
  const captureIds = sessionCaptureIds.filter((captureId) =>
    library.captures.some((capture) => capture.id === captureId)
  );
  if (!captureIds.length) {
    return { captureIds };
  }

  if (addTarget?.kind === "group") {
    const targetGroup = library.groups.find((group) => group.id === addTarget.id);
    if (!targetGroup) return { captureIds };
    for (const captureId of captureIds) {
      await mutateLibrary({ type: "add_capture_to_group", captureId, groupId: targetGroup.id });
    }
    return { groupId: targetGroup.id, captureIds };
  }

  if (addTarget?.kind === "capture") {
    const targetCapture = library.captures.find((capture) => capture.id === addTarget.id);
    if (!targetCapture) return { captureIds };
    return await createGroupFromCaptures([targetCapture.id, ...captureIds], "Added captures");
  }

  return { captureIds };
}

async function cancelCaptureSession(sessionId: string): Promise<{ captureIds: string[] }> {
  if (!captureSession || captureSession.id !== sessionId) {
    return { captureIds: [] };
  }

  const sessionCaptureIds = [...captureSession.captureIds];
  captureSession = undefined;
  await persistRuntimeState();

  const library = await readLibrary();
  const captureIdSet = new Set(sessionCaptureIds);
  const capturesToDelete = library.captures.filter((capture) => captureIdSet.has(capture.id));
  await Promise.all(capturesToDelete.map((capture) => deleteImageBlob(capture.imageBlobKey).catch(() => undefined)));

  await updateLibrary((current) => ({
    ...current,
    captures: current.captures.filter((capture) => !captureIdSet.has(capture.id)),
    groups: current.groups.map((group) => ({ ...group, captureIds: group.captureIds.filter((id) => !captureIdSet.has(id)) })),
    docks: current.docks.map((dock) => ({
      ...dock,
      order: dock.order.filter((item) => !(item.kind === "capture" && captureIdSet.has(item.id)))
    }))
  }));

  return { captureIds: sessionCaptureIds };
}

async function createGroupFromCaptures(
  captureIds: string[],
  name: string
): Promise<{ groupId: string; captureIds: string[] }> {
  const [targetCaptureId, sourceCaptureId, ...remaining] = captureIds;
  if (!targetCaptureId || !sourceCaptureId) throw new Error("A folder needs at least two images.");
  const groupId = crypto.randomUUID();
  await mutateLibrary({
    type: "create_group",
    groupId,
    name,
    createdAt: Date.now(),
    sourceCaptureId,
    targetCaptureId
  });
  for (const captureId of remaining) {
    await mutateLibrary({ type: "add_capture_to_group", captureId, groupId });
  }
  return { groupId, captureIds };
}

function messageForTab(): ContentMessage {
  return captureSession ? captureStartMessage(captureSession) : { type: "JUSTSNAP_SHOW_RAIL" };
}

function captureStartMessage(session: NonNullable<typeof captureSession>): ContentMessage {
  return {
    type: "JUSTSNAP_START_CAPTURE",
    ...sessionSnapshot(session)
  };
}

function sessionSnapshot(session: NonNullable<typeof captureSession>) {
  return {
    sessionId: session.id,
    captureCount: session.captureIds.length,
    captureIds: [...session.captureIds],
    addTarget: session.addTarget
  };
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
}

async function sendMessage(tabId: number, message: ContentMessage): Promise<void> {
  try {
    await chrome.tabs.sendMessage<ContentMessage>(tabId, message);
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
    await chrome.tabs.sendMessage<ContentMessage>(tabId, message);
  }
}

function isRestrictedTabUrl(url: string | undefined): boolean {
  if (!url) return true;
  return /^(chrome|chrome-extension|edge|about|devtools):\/\//i.test(url);
}

function restrictedPageMessage(url: string | undefined): string {
  const scheme = url?.split(":")[0] || "this";
  return `DockSnip cannot run on ${scheme}:// pages. Try it on a normal website tab.`;
}

function assertSupportedImageUrl(value: string): void {
  if (value.startsWith("data:image/")) {
    if (value.length > Math.ceil(MAX_IMPORT_BYTES * 1.4)) throw new Error("That image is larger than the 50 MB import limit.");
    return;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("That image URL is invalid.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only web images can be docked.");
  }
  if (isPrivateHostname(url.hostname)) {
    throw new Error("Images from local or private-network addresses cannot be docked.");
  }
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized === "::1") return true;
  const octets = normalized.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return octets[0] === 10 || octets[0] === 127 || octets[0] === 0 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
}

function validateBackgroundRequest(value: unknown, sender: chrome.runtime.MessageSender): BackgroundRequest | undefined {
  if (!isTrustedSender(sender) || !isRecord(value) || typeof value.type !== "string") return undefined;
  switch (value.type) {
    case "JUSTSNAP_TOGGLE_RAIL":
    case "JUSTSNAP_CLOSE_RAIL_GLOBAL":
    case "JUSTSNAP_OPEN_SHORTCUT_SETTINGS":
    case "JUSTSNAP_GET_LIBRARY":
      return { type: value.type };
    case "JUSTSNAP_GET_IMAGE_DATA":
      return isBoundedString(value.imageBlobKey, 160)
        ? { type: value.type, imageBlobKey: value.imageBlobKey }
        : undefined;
    case "JUSTSNAP_START_CAPTURE_ACTIVE":
    case "JUSTSNAP_PREPARE_CAPTURE_SESSION": {
      const addTarget = value.addTarget === undefined ? undefined : parseAddTarget(value.addTarget);
      if (value.addTarget !== undefined && !addTarget) return undefined;
      return { type: value.type, ...(addTarget ? { addTarget } : {}) };
    }
    case "JUSTSNAP_IMPORT_IMAGE_URL":
      return isBoundedString(value.imageUrl, Math.ceil(MAX_IMPORT_BYTES * 1.4))
        ? { type: value.type, imageUrl: value.imageUrl }
        : undefined;
    case "JUSTSNAP_CAPTURE_SELECTION": {
      const rect = parseRect(value.rect);
      const viewport = parseViewport(value.viewport);
      const sessionId = value.sessionId === undefined ? undefined : parseId(value.sessionId);
      if (!rect || !viewport || (value.sessionId !== undefined && !sessionId)) return undefined;
      return { type: value.type, rect, viewport, ...(sessionId ? { sessionId } : {}) };
    }
    case "JUSTSNAP_FINISH_CAPTURE_SESSION":
    case "JUSTSNAP_CANCEL_CAPTURE_SESSION": {
      const sessionId = parseId(value.sessionId);
      return sessionId ? { type: value.type, sessionId } : undefined;
    }
    case "JUSTSNAP_MUTATE_LIBRARY": {
      const mutation = parseLibraryMutation(value.mutation);
      return mutation ? { type: value.type, mutation } : undefined;
    }
    default:
      return undefined;
  }
}

function isTrustedSender(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id) return false;
  if (sender.tab) return !isRestrictedTabUrl(sender.tab.url);
  return Boolean(sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`));
}

function parseLibraryMutation(value: unknown): LibraryMutation | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  if (value.type === "move_rail_item") {
    const item = parseOrderItem(value.item);
    const target = parseOrderItem(value.target);
    const position = value.position === "insert-before" || value.position === "insert-after" ? value.position : undefined;
    return item && target && position ? { type: value.type, item, target, position } : undefined;
  }
  if (value.type === "create_group") {
    const groupId = parseId(value.groupId);
    const sourceCaptureId = parseId(value.sourceCaptureId);
    const targetCaptureId = parseId(value.targetCaptureId);
    if (!groupId || !sourceCaptureId || !targetCaptureId || !isBoundedString(value.name, 120) || !isFiniteNumber(value.createdAt)) return undefined;
    return { type: value.type, groupId, sourceCaptureId, targetCaptureId, name: value.name, createdAt: value.createdAt };
  }
  if (value.type === "add_capture_to_group") {
    const captureId = parseId(value.captureId);
    const groupId = parseId(value.groupId);
    return captureId && groupId ? { type: value.type, captureId, groupId } : undefined;
  }
  if (value.type === "move_capture_in_group") {
    const captureId = parseId(value.captureId);
    const groupId = parseId(value.groupId);
    const targetCaptureId = parseId(value.targetCaptureId);
    const position = value.position === "insert-before" || value.position === "insert-after" ? value.position : undefined;
    return captureId && groupId && targetCaptureId && position
      ? { type: value.type, captureId, groupId, targetCaptureId, position }
      : undefined;
  }
  if (value.type === "ungroup_capture" || value.type === "delete_capture") {
    const captureId = parseId(value.captureId);
    return captureId ? { type: value.type, captureId } : undefined;
  }
  if (value.type === "delete_group") {
    const groupId = parseId(value.groupId);
    return groupId ? { type: value.type, groupId } : undefined;
  }
  if (value.type === "rename_group") {
    const groupId = parseId(value.groupId);
    return groupId && isBoundedString(value.name, 120) ? { type: value.type, groupId, name: value.name } : undefined;
  }
  if (value.type === "create_empty_group") {
    const groupId = parseId(value.groupId);
    return groupId && isBoundedString(value.name, 120) && isFiniteNumber(value.createdAt)
      ? { type: value.type, groupId, name: value.name, createdAt: value.createdAt }
      : undefined;
  }
  if (value.type === "create_dock") {
    const dockId = parseId(value.dockId);
    return dockId && isBoundedString(value.name, 120) && isFiniteNumber(value.createdAt) &&
      (value.activate === undefined || typeof value.activate === "boolean")
      ? { type: value.type, dockId, name: value.name, createdAt: value.createdAt, ...(value.activate !== undefined ? { activate: value.activate } : {}) }
      : undefined;
  }
  if (value.type === "set_active_dock" || value.type === "delete_dock") {
    const dockId = parseId(value.dockId);
    return dockId ? { type: value.type, dockId } : undefined;
  }
  if (value.type === "rename_dock") {
    const dockId = parseId(value.dockId);
    return dockId && isBoundedString(value.name, 120) ? { type: value.type, dockId, name: value.name } : undefined;
  }
  if (value.type === "move_item_to_dock") {
    const item = parseOrderItem(value.item);
    const dockId = parseId(value.dockId);
    return item && dockId ? { type: value.type, item, dockId } : undefined;
  }
  if (value.type === "acknowledge_dock_overflow") return { type: value.type };
  return undefined;
}

function parseOrderItem(value: unknown): RailOrderItem | undefined {
  if (!isRecord(value) || (value.kind !== "capture" && value.kind !== "group")) return undefined;
  const id = parseId(value.id);
  return id ? { kind: value.kind, id } : undefined;
}

function parseAddTarget(value: unknown): CaptureAddTarget | undefined {
  return parseOrderItem(value);
}

function parseRect(value: unknown) {
  if (!isRecord(value) || !isFiniteNumber(value.left) || !isFiniteNumber(value.top) || !isPositiveDimension(value.width) || !isPositiveDimension(value.height)) return undefined;
  return { left: value.left, top: value.top, width: value.width, height: value.height };
}

function parseViewport(value: unknown) {
  if (!isRecord(value) || !isPositiveDimension(value.width) || !isPositiveDimension(value.height) || !isFiniteNumber(value.offsetLeft) || !isFiniteNumber(value.offsetTop)) return undefined;
  return { width: value.width, height: value.height, offsetLeft: value.offsetLeft, offsetTop: value.offsetTop };
}

function parseId(value: unknown): string | undefined {
  return isBoundedString(value, 160) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveDimension(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0 && value <= 100_000;
}

async function ensureRuntimeState(): Promise<void> {
  if (runtimeStateLoaded) return;
  if (!runtimeStateLoadPromise) {
    runtimeStateLoadPromise = chrome.storage.session.get(RUNTIME_STATE_KEY).then((result) => {
      const stored = result[RUNTIME_STATE_KEY];
      if (isRecord(stored)) {
        railFollowEnabled = stored.railFollowEnabled === true;
        activeRailTabId = typeof stored.activeRailTabId === "number" ? stored.activeRailTabId : undefined;
        captureSession = parseStoredCaptureSession(stored.captureSession);
      }
      runtimeStateLoaded = true;
    });
  }
  await runtimeStateLoadPromise;
}

async function persistRuntimeState(): Promise<void> {
  const snapshot = { railFollowEnabled, activeRailTabId, captureSession };
  const write = () => chrome.storage.session.set({ [RUNTIME_STATE_KEY]: snapshot });
  runtimeStateWriteQueue = runtimeStateWriteQueue.then(write, write);
  await runtimeStateWriteQueue;
}
