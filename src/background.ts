import { appendEvent, getLibrary, matchPendingUsage, saveLibrary, setPendingUsage } from "../shared/storage";
import type { ActivityEvent, BackgroundRequest, BackgroundResponse, ContentMessage } from "../shared/types";

let railFollowEnabled = false;
let activeRailTabId: number | undefined;

chrome.action.onClicked.addListener(async (tab) => {
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
    railFollowEnabled = true;
    await showOnlyOnTab(tab, { type: "JUSTSNAP_START_CAPTURE" }).catch(() => undefined);
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
    void showOnlyOnTab(tab).catch(() => undefined);
  });
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (!railFollowEnabled || windowId === chrome.windows.WINDOW_ID_NONE) return;
  chrome.tabs.query({ active: true, windowId }, ([tab]) => {
    if (!tab) return;
    void showOnlyOnTab(tab).catch(() => undefined);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!railFollowEnabled || tabId !== activeRailTabId || changeInfo.status !== "complete") return;
  void showOnlyOnTab(tab).catch(() => undefined);
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

    if (request.type === "JUSTSNAP_CAPTURE_VISIBLE") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.windowId) return { ok: false, error: "No active tab available to capture." };
      if (isRestrictedTabUrl(tab.url)) return { ok: false, error: restrictedPageMessage(tab.url) };
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
  if (activeRailTabId) {
    await sendMessage(activeRailTabId, { type: "JUSTSNAP_CLOSE_RAIL" }).catch(() => undefined);
    activeRailTabId = undefined;
    return;
  }
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => (tab.id ? sendMessage(tab.id, { type: "JUSTSNAP_CLOSE_RAIL" }).catch(() => undefined) : undefined)));
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
  return `JustSnap cannot run on ${scheme}:// pages. Try it on a normal website tab.`;
}
