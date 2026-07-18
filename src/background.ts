import { captureImageToBlob, deleteImageBlob, saveImageBlob } from "../shared/blobStore";
import { appendEvent, getLibrary, matchPendingUsage, saveLibrary, setPendingUsage } from "../shared/storage";
import type {
  ActivityEvent,
  BackgroundRequest,
  BackgroundResponse,
  Capture,
  CaptureAddTarget,
  CaptureGroup,
  CaptureImage,
  CaptureSelectionResult,
  ContentMessage,
  RailOrderItem
} from "../shared/types";

let railFollowEnabled = false;
let activeRailTabId: number | undefined;
let captureSession: {
  id: string;
  captureIds: string[];
  startedAt: number;
  tabId?: number;
  addTarget?: CaptureAddTarget;
} | undefined;

type OffscreenCropResult = {
  crop: CaptureImage;
  thumbnail: CaptureImage;
};

chrome.action?.onClicked?.addListener(async (tab) => {
  await toggleRailForTab(tab).catch(() => undefined);
});

chrome.commands.onCommand.addListener(async (command) => {
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

chrome.tabs.onActivated.addListener(({ tabId }) => {
  if (!railFollowEnabled) return;
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    void showOnlyOnTab(tab, messageForTab()).catch(() => undefined);
  });
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (!railFollowEnabled || windowId === chrome.windows.WINDOW_ID_NONE) return;
  chrome.tabs.query({ active: true, windowId }, ([tab]) => {
    if (!tab) return;
    void showOnlyOnTab(tab, messageForTab()).catch(() => undefined);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!railFollowEnabled || changeInfo.status !== "complete" || !tab.active) return;
  void showOnlyOnTab(tab, messageForTab()).catch(() => undefined);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeRailTabId === tabId) activeRailTabId = undefined;
});

chrome.runtime.onMessage.addListener((request: BackgroundRequest, sender, sendResponse) => {
  handleMessage(request, sender).then(sendResponse);
  return true;
});

async function handleMessage(request: BackgroundRequest, sender: chrome.runtime.MessageSender): Promise<BackgroundResponse> {
  try {
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
      return { ok: true, data: await getLibrary() };
    }

    if (request.type === "JUSTSNAP_SAVE_LIBRARY") {
      await saveLibrary(request.library);
      return { ok: true, data: null };
    }

    if (request.type === "JUSTSNAP_APPEND_EVENT") {
      await appendEvent(request.event);
      return { ok: true, data: null };
    }

    if (request.type === "JUSTSNAP_SET_PENDING_USAGE") {
      await setPendingUsage(request.pending);
      return { ok: true, data: null };
    }

    if (request.type === "JUSTSNAP_MATCH_PENDING_USAGE") {
      const pending = await matchPendingUsage();
      if (pending) {
        const event: ActivityEvent = {
          id: crypto.randomUUID(),
          type: request.interaction === "paste" ? "browser_paste_detected" : "browser_drop_detected",
          createdAt: Date.now(),
          captureIds: pending.captureIds,
          groupId: pending.groupId,
          sourceOrigin: pending.sourceOrigin,
          destinationUrl: request.destinationUrl,
          destinationOrigin: request.destinationOrigin,
          confidence: "detected"
        };
        await appendEvent(event);
        return { ok: true, data: event };
      }
      return { ok: true, data: null };
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
  return sessionSnapshot(captureSession);
}

async function showOnlyOnTab(tab: chrome.tabs.Tab, message: ContentMessage = { type: "JUSTSNAP_SHOW_RAIL" }): Promise<void> {
  if (!tab.id || isRestrictedTabUrl(tab.url)) {
    return;
  }
  if (activeRailTabId && activeRailTabId !== tab.id) {
    await sendMessage(activeRailTabId, { type: "JUSTSNAP_CLOSE_RAIL" }).catch(() => undefined);
  }
  activeRailTabId = tab.id;
  await sendMessage(tab.id, message);
}

async function closeRailEverywhere(): Promise<void> {
  railFollowEnabled = false;
  captureSession = undefined;
  if (activeRailTabId) {
    await sendMessage(activeRailTabId, { type: "JUSTSNAP_CLOSE_RAIL" }).catch(() => undefined);
    activeRailTabId = undefined;
    return;
  }
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => (tab.id ? sendMessage(tab.id, { type: "JUSTSNAP_CLOSE_RAIL" }).catch(() => undefined) : undefined)));
}

async function importImageUrl(request: Extract<BackgroundRequest, { type: "JUSTSNAP_IMPORT_IMAGE_URL" }>): Promise<Capture> {
  const response = await fetch(request.imageUrl);
  if (!response.ok) throw new Error("Could not load that image.");
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("That file is not an image.");

  const sourceDataUrl = await blobToDataUrl(blob);
  const { crop, thumbnail } = await prepareImageWithOffscreen(sourceDataUrl);
  const id = crypto.randomUUID();
  const imageBlobKey = `capture-${id}`;
  const imageBlob = await captureImageToBlob(crop);
  await saveImageBlob(imageBlobKey, imageBlob);

  const capture: Capture = {
    id,
    sourceUrl: request.sourceUrl,
    sourceOrigin: request.sourceOrigin,
    pageTitle: request.pageTitle || request.sourceOrigin,
    createdAt: Date.now(),
    width: crop.width,
    height: crop.height,
    thumbnailDataUrl: thumbnail.dataUrl,
    imageBlobKey,
    fullDataUrl: crop.dataUrl
  };
  const event: ActivityEvent = {
    id: crypto.randomUUID(),
    type: "capture_created",
    createdAt: Date.now(),
    captureIds: [id],
    sourceOrigin: capture.sourceOrigin,
    note: "Imported from page image"
  };
  const library = await getLibrary();
  await saveLibrary({
    captures: [capture, ...library.captures],
    groups: library.groups,
    railOrder: [{ kind: "capture", id }, ...library.railOrder.filter((item) => !(item.kind === "capture" && item.id === id))],
    events: [...library.events, event].slice(-500)
  });
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
    sourceUrl: request.sourceUrl,
    sourceOrigin: request.sourceOrigin,
    pageTitle: request.pageTitle || request.sourceOrigin,
    createdAt: Date.now(),
    width: crop.width,
    height: crop.height,
    thumbnailDataUrl: thumbnail.dataUrl,
    imageBlobKey,
    fullDataUrl: crop.dataUrl
  };
  const library = await getLibrary();
  const event: ActivityEvent = {
    id: crypto.randomUUID(),
    type: "capture_created",
    createdAt: Date.now(),
    captureIds: [id],
    sourceOrigin: capture.sourceOrigin
  };

  const isCurrentSession = Boolean(request.sessionId && captureSession?.id === request.sessionId);
  let sessionSnapshotResult = captureSession ? sessionSnapshot(captureSession) : null;
  if (request.sessionId && captureSession?.id === request.sessionId) {
    if (!captureSession.captureIds.includes(id)) captureSession.captureIds.push(id);
    sessionSnapshotResult = sessionSnapshot(captureSession);
  }
  const shouldKeepOutOfTopLevelOrder = Boolean(isCurrentSession && captureSession?.addTarget);

  await saveLibrary({
    captures: [capture, ...library.captures],
    groups: library.groups,
    railOrder: shouldKeepOutOfTopLevelOrder
      ? library.railOrder.filter((item) => !(item.kind === "capture" && item.id === id))
      : [{ kind: "capture", id }, ...library.railOrder.filter((item) => !(item.kind === "capture" && item.id === id))],
    events: [...library.events, event].slice(-500)
  });

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

async function prepareImageWithOffscreen(dataUrl: string): Promise<OffscreenCropResult> {
  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({
    type: "JUSTSNAP_OFFSCREEN_PREPARE_IMAGE",
    dataUrl
  });
  if (!response?.ok) throw new Error(response?.error ?? "Could not prepare DockSnip image.");
  return response.data as OffscreenCropResult;
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

  const library = await getLibrary();
  const captureIds = sessionCaptureIds.filter((captureId) =>
    library.captures.some((capture) => capture.id === captureId)
  );
  if (!captureIds.length) {
    return { captureIds };
  }

  if (addTarget?.kind === "group") {
    const targetGroup = library.groups.find((group) => group.id === addTarget.id);
    if (!targetGroup) return { captureIds };
    const captureIdSet = new Set(captureIds);
    const captures = library.captures.map((capture) =>
      captureIdSet.has(capture.id) ? { ...capture, groupId: targetGroup.id } : capture
    );
    const groups = library.groups.map((group) => {
      if (group.id !== targetGroup.id) {
        return { ...group, captureIds: group.captureIds.filter((captureId) => !captureIdSet.has(captureId)) };
      }
      return {
        ...group,
        captureIds: [...group.captureIds.filter((captureId) => !captureIdSet.has(captureId)), ...captureIds]
      };
    });
    const event: ActivityEvent = {
      id: crypto.randomUUID(),
      type: "capture_grouped",
      createdAt: Date.now(),
      captureIds,
      groupId: targetGroup.id,
      sourceOrigin: captures.find((capture) => captureIds.includes(capture.id))?.sourceOrigin
    };
    await saveLibrary({
      captures,
      groups,
      railOrder: removeCapturesFromOrder(library.railOrder, captureIds),
      events: [...library.events, event].slice(-500)
    });
    return { groupId: targetGroup.id, captureIds };
  }

  if (addTarget?.kind === "capture") {
    const targetCapture = library.captures.find((capture) => capture.id === addTarget.id);
    if (!targetCapture) return { captureIds };
    return await createGroupFromCaptures(library, [targetCapture.id, ...captureIds], "Added captures");
  }

  return { captureIds };
}

async function cancelCaptureSession(sessionId: string): Promise<{ captureIds: string[] }> {
  if (!captureSession || captureSession.id !== sessionId) {
    return { captureIds: [] };
  }

  const sessionCaptureIds = [...captureSession.captureIds];
  captureSession = undefined;

  const library = await getLibrary();
  const captureIdSet = new Set(sessionCaptureIds);
  const capturesToDelete = library.captures.filter((capture) => captureIdSet.has(capture.id));
  await Promise.all(capturesToDelete.map((capture) => deleteImageBlob(capture.imageBlobKey).catch(() => undefined)));

  await saveLibrary({
    captures: library.captures.filter((capture) => !captureIdSet.has(capture.id)),
    groups: library.groups
      .map((group) => ({
        ...group,
        captureIds: group.captureIds.filter((captureId) => !captureIdSet.has(captureId))
      }))
      .filter((group) => group.captureIds.length > 0),
    railOrder: removeCapturesFromOrder(library.railOrder, sessionCaptureIds),
    events: library.events
  });

  return { captureIds: sessionCaptureIds };
}

async function createGroupFromCaptures(
  library: Awaited<ReturnType<typeof getLibrary>>,
  captureIds: string[],
  name: string
): Promise<{ groupId: string; captureIds: string[] }> {
  const group: CaptureGroup = {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
    captureIds,
    collapsed: false
  };
  const captureIdSet = new Set(captureIds);
  const captures = library.captures.map((capture) =>
    captureIdSet.has(capture.id) ? { ...capture, groupId: group.id } : capture
  );
  const groups = [
    group,
    ...library.groups
      .map((currentGroup) => ({
        ...currentGroup,
        captureIds: currentGroup.captureIds.filter((captureId) => !captureIdSet.has(captureId))
      }))
      .filter((currentGroup) => currentGroup.captureIds.length > 0)
  ];
  const event: ActivityEvent = {
    id: crypto.randomUUID(),
    type: "group_created",
    createdAt: Date.now(),
    captureIds,
    groupId: group.id,
    sourceOrigin: captures.find((capture) => captureIds.includes(capture.id))?.sourceOrigin
  };

  await saveLibrary({
    captures,
    groups,
    railOrder: replaceCapturesWithGroupInOrder(library.railOrder, captureIds, group.id),
    events: [...library.events, event].slice(-500)
  });

  return { groupId: group.id, captureIds };
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

function removeCapturesFromOrder(order: RailOrderItem[], captureIds: string[]): RailOrderItem[] {
  const captureIdSet = new Set(captureIds);
  return order.filter((item) => !(item.kind === "capture" && captureIdSet.has(item.id)));
}

function replaceCapturesWithGroupInOrder(order: RailOrderItem[], captureIds: string[], groupId: string): RailOrderItem[] {
  const captureIdSet = new Set(captureIds);
  const next: RailOrderItem[] = [];
  let inserted = false;

  for (const item of order) {
    if (item.kind === "capture" && captureIdSet.has(item.id)) {
      if (!inserted) {
        next.push({ kind: "group", id: groupId });
        inserted = true;
      }
      continue;
    }
    next.push(item);
  }

  return inserted ? next : [{ kind: "group", id: groupId }, ...next];
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
