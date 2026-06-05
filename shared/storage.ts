import type { ActivityEvent, Capture, CaptureGroup, LibraryState, PendingUsage, RailOrderItem } from "./types";

const CAPTURES_KEY = "justsnap_captures";
const GROUPS_KEY = "justsnap_groups";
const RAIL_ORDER_KEY = "justsnap_rail_order";
const EVENTS_KEY = "justsnap_events";
const PENDING_KEY = "justsnap_pending_usages";

const EVENT_LIMIT = 500;
const PENDING_TTL_MS = 2 * 60 * 1000;

export async function getLibrary(): Promise<LibraryState> {
  const result = await chrome.storage.local.get([CAPTURES_KEY, GROUPS_KEY, RAIL_ORDER_KEY, EVENTS_KEY, PENDING_KEY]);
  const captures = (result[CAPTURES_KEY] as Capture[] | undefined) ?? [];
  const groups = (result[GROUPS_KEY] as CaptureGroup[] | undefined) ?? [];
  return {
    captures,
    groups,
    railOrder: normalizeRailOrder((result[RAIL_ORDER_KEY] as RailOrderItem[] | undefined) ?? [], captures, groups),
    events: (result[EVENTS_KEY] as ActivityEvent[] | undefined) ?? [],
    pendingUsages: prunePending((result[PENDING_KEY] as PendingUsage[] | undefined) ?? [])
  };
}

export async function saveLibrary(library: Pick<LibraryState, "captures" | "groups" | "railOrder" | "events">): Promise<void> {
  await chrome.storage.local.set({
    [CAPTURES_KEY]: library.captures,
    [GROUPS_KEY]: library.groups,
    [RAIL_ORDER_KEY]: normalizeRailOrder(library.railOrder, library.captures, library.groups),
    [EVENTS_KEY]: library.events.slice(-EVENT_LIMIT)
  });
}

export async function appendEvent(event: ActivityEvent): Promise<void> {
  const { events } = await getLibrary();
  await chrome.storage.local.set({
    [EVENTS_KEY]: [...events, event].slice(-EVENT_LIMIT)
  });
}

export async function setPendingUsage(pending: PendingUsage): Promise<void> {
  const { pendingUsages } = await getLibrary();
  await chrome.storage.local.set({
    [PENDING_KEY]: [...pendingUsages, pending].slice(-30)
  });
}

export async function matchPendingUsage(): Promise<PendingUsage | undefined> {
  const { pendingUsages } = await getLibrary();
  const pruned = prunePending(pendingUsages);
  const match = [...pruned].reverse()[0];
  await chrome.storage.local.set({
    [PENDING_KEY]: match ? pruned.filter((pending) => pending.id !== match.id) : pruned
  });
  return match;
}

function prunePending(pending: PendingUsage[]): PendingUsage[] {
  const cutoff = Date.now() + PENDING_TTL_MS;
  return pending.filter((item) => item.expiresAt > Date.now() && item.expiresAt <= cutoff);
}

function normalizeRailOrder(order: RailOrderItem[], captures: Capture[], groups: CaptureGroup[]): RailOrderItem[] {
  const captureById = new Map(captures.map((capture) => [capture.id, capture]));
  const visibleGroupIds = new Set(
    groups
      .filter((group) => group.captureIds.some((captureId) => captureById.has(captureId)))
      .map((group) => group.id)
  );
  const topLevelCaptureIds = new Set(captures.filter((capture) => !capture.groupId).map((capture) => capture.id));
  const seen = new Set<string>();
  const normalized: RailOrderItem[] = [];

  for (const item of order) {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) continue;
    if (item.kind === "group" && visibleGroupIds.has(item.id)) {
      normalized.push(item);
      seen.add(key);
    }
    if (item.kind === "capture" && topLevelCaptureIds.has(item.id)) {
      normalized.push(item);
      seen.add(key);
    }
  }

  for (const groupId of visibleGroupIds) {
    const key = `group:${groupId}`;
    if (!seen.has(key)) normalized.push({ kind: "group", id: groupId });
  }
  for (const captureId of topLevelCaptureIds) {
    const key = `capture:${captureId}`;
    if (!seen.has(key)) normalized.push({ kind: "capture", id: captureId });
  }

  return normalized;
}
