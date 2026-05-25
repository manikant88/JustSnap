import { appendEvent, getLibrary, matchPendingUsage, saveLibrary, setPendingUsage } from "../shared/storage";
import type { ActivityEvent, BackgroundRequest, BackgroundResponse, ContentMessage } from "../shared/types";

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  await showRail(tab.id);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-justsnap") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  await showRail(tab.id);
});

chrome.runtime.onMessage.addListener((request: BackgroundRequest, sender, sendResponse) => {
  handleMessage(request, sender).then(sendResponse);
  return true;
});

async function handleMessage(request: BackgroundRequest, sender: chrome.runtime.MessageSender): Promise<BackgroundResponse> {
  try {
    if (request.type === "JUSTSNAP_TOGGLE_RAIL") {
      const tabId = sender.tab?.id ?? (await getActiveTabId());
      if (!tabId) return { ok: false, error: "No active tab available." };
      await showRail(tabId);
      return { ok: true, data: null };
    }

    if (request.type === "JUSTSNAP_CAPTURE_VISIBLE") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.windowId) return { ok: false, error: "No active tab available to capture." };
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      return { ok: true, data: dataUrl };
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

    return { ok: false, error: "Unsupported JustSnap request." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "JustSnap request failed."
    };
  }
}

async function getActiveTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function showRail(tabId: number): Promise<void> {
  const message: ContentMessage = { type: "JUSTSNAP_SHOW_RAIL" };
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
