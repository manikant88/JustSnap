import { normalizeLibrary } from "./libraryModel";
import type { Capture, CaptureDock, CaptureGroup, LibraryState, RailOrderItem } from "./types";

const CAPTURES_KEY = "justsnap_captures";
const GROUPS_KEY = "justsnap_groups";
const RAIL_ORDER_KEY = "justsnap_rail_order";
const DOCKS_KEY = "docksnip_docks";
const ACTIVE_DOCK_KEY = "docksnip_active_dock";
const DOCK_OVERFLOW_SEEN_KEY = "docksnip_dock_overflow_seen";
const LAST_AUTO_DOCK_KEY = "docksnip_last_auto_dock";
const EVENTS_KEY = "justsnap_events";
const PENDING_KEY = "justsnap_pending_usages";
let legacyTrackingCleared = false;

export async function getLibrary(): Promise<LibraryState> {
  const result = await chrome.storage.local.get([
    CAPTURES_KEY,
    GROUPS_KEY,
    RAIL_ORDER_KEY,
    DOCKS_KEY,
    ACTIVE_DOCK_KEY,
    DOCK_OVERFLOW_SEEN_KEY,
    LAST_AUTO_DOCK_KEY
  ]);
  const rawCaptures = Array.isArray(result[CAPTURES_KEY]) ? result[CAPTURES_KEY] : [];
  const rawGroups = Array.isArray(result[GROUPS_KEY]) ? result[GROUPS_KEY] : [];
  const rawOrder = Array.isArray(result[RAIL_ORDER_KEY]) ? result[RAIL_ORDER_KEY] : [];
  const captures = rawCaptures.map(parseCapture).filter((capture): capture is Capture => Boolean(capture));
  const groups = reconcileLegacyMembership(
    rawGroups.map(parseGroup).filter((group): group is CaptureGroup => Boolean(group)),
    rawCaptures
  );
  if (rawCaptures.some(hasLegacyCaptureFields) || rawGroups.some(hasLegacyGroupFields)) {
    await chrome.storage.local.set({ [CAPTURES_KEY]: captures, [GROUPS_KEY]: groups });
  }
  if (!legacyTrackingCleared) {
    await chrome.storage.local.remove([EVENTS_KEY, PENDING_KEY]);
    legacyTrackingCleared = true;
  }
  const rawDocks = Array.isArray(result[DOCKS_KEY]) ? result[DOCKS_KEY] : [];
  const library = normalizeLibrary({
    captures,
    groups,
    docks: rawDocks.map(parseDock).filter((dock): dock is CaptureDock => Boolean(dock)),
    activeDockId: isId(result[ACTIVE_DOCK_KEY]) ? result[ACTIVE_DOCK_KEY] : undefined,
    hasSeenDockOverflow: result[DOCK_OVERFLOW_SEEN_KEY] === true,
    lastAutoCreatedDockId: isId(result[LAST_AUTO_DOCK_KEY]) ? result[LAST_AUTO_DOCK_KEY] : undefined,
    railOrder: rawOrder.map(parseOrderItem).filter((item): item is RailOrderItem => Boolean(item))
  });
  if (!rawDocks.length) await saveLibrary(library);
  return library;
}

export async function saveLibrary(library: LibraryState): Promise<void> {
  const normalized = normalizeLibrary(library);
  await chrome.storage.local.set({
    [CAPTURES_KEY]: normalized.captures.map(normalizeCapture),
    [GROUPS_KEY]: normalized.groups,
    [RAIL_ORDER_KEY]: normalized.railOrder,
    [DOCKS_KEY]: normalized.docks,
    [ACTIVE_DOCK_KEY]: normalized.activeDockId,
    [DOCK_OVERFLOW_SEEN_KEY]: normalized.hasSeenDockOverflow,
    [LAST_AUTO_DOCK_KEY]: normalized.lastAutoCreatedDockId ?? null
  });
}

function normalizeCapture(capture: Capture): Capture {
  return {
    id: capture.id,
    createdAt: capture.createdAt,
    width: capture.width,
    height: capture.height,
    thumbnailDataUrl: capture.thumbnailDataUrl,
    ...(capture.thumbnailVersion ? { thumbnailVersion: capture.thumbnailVersion } : {}),
    imageBlobKey: capture.imageBlobKey
  };
}

function hasLegacyCaptureFields(capture: unknown): boolean {
  if (!isRecord(capture)) return false;
  const stored = capture;
  return "fullDataUrl" in stored || "sourceUrl" in stored || "sourceOrigin" in stored || "pageTitle" in stored;
}

function hasLegacyGroupFields(group: unknown): boolean {
  return isRecord(group) && "collapsed" in group;
}

function parseCapture(value: unknown): Capture | undefined {
  if (!isRecord(value) || !isId(value.id) || !isFiniteNumber(value.createdAt) || !isDimension(value.width) || !isDimension(value.height)) return undefined;
  if (!isImageDataUrl(value.thumbnailDataUrl) || !isId(value.imageBlobKey)) return undefined;
  return normalizeCapture({
    id: value.id,
    createdAt: value.createdAt,
    width: value.width,
    height: value.height,
    thumbnailDataUrl: value.thumbnailDataUrl,
    thumbnailVersion: isFiniteNumber(value.thumbnailVersion) ? value.thumbnailVersion : undefined,
    imageBlobKey: value.imageBlobKey
  });
}

function parseGroup(value: unknown): CaptureGroup | undefined {
  if (!isRecord(value) || !isId(value.id) || typeof value.name !== "string" || value.name.length > 120 || !isFiniteNumber(value.createdAt)) return undefined;
  if (!Array.isArray(value.captureIds) || !value.captureIds.every(isId)) return undefined;
  return { id: value.id, name: value.name, createdAt: value.createdAt, captureIds: [...value.captureIds] };
}

function parseOrderItem(value: unknown): RailOrderItem | undefined {
  if (!isRecord(value) || (value.kind !== "capture" && value.kind !== "group") || !isId(value.id)) return undefined;
  return { kind: value.kind, id: value.id };
}

function parseDock(value: unknown): CaptureDock | undefined {
  if (!isRecord(value) || !isId(value.id) || typeof value.name !== "string" || value.name.length > 120) return undefined;
  if (!isFiniteNumber(value.createdAt) || !Array.isArray(value.order)) return undefined;
  return {
    id: value.id,
    name: value.name,
    createdAt: value.createdAt,
    order: value.order.map(parseOrderItem).filter((item): item is RailOrderItem => Boolean(item))
  };
}

function reconcileLegacyMembership(groups: CaptureGroup[], rawCaptures: unknown[]): CaptureGroup[] {
  const additions = new Map<string, string[]>();
  for (const value of rawCaptures) {
    if (!isRecord(value) || !isId(value.id) || !isId(value.groupId)) continue;
    additions.set(value.groupId, [...(additions.get(value.groupId) ?? []), value.id]);
  }
  return groups.map((group) => ({
    ...group,
    captureIds: [...group.captureIds, ...(additions.get(group.id) ?? [])]
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 160;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isDimension(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0 && value <= 100_000;
}

function isImageDataUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:image/") && value.length <= 2_500_000;
}
