import { normalizeLibrary } from "./libraryModel";
import type { Capture, CaptureDock, CaptureGroup, LibraryState, RailOrderItem } from "./types";
import { isFolderColorSlot } from "./folderColor";

export const LIBRARY_SCHEMA_VERSION = 2;
export const LIBRARY_STORAGE_KEYS = {
  captures: "justsnap_captures",
  groups: "justsnap_groups",
  railOrder: "justsnap_rail_order",
  docks: "docksnip_docks",
  activeDock: "docksnip_active_dock",
  schemaVersion: "docksnip_library_schema_version"
} as const;

export function decodeLibraryStorage(stored: Record<string, unknown>): {
  library: LibraryState;
  needsWrite: boolean;
} {
  const storedVersion = stored[LIBRARY_STORAGE_KEYS.schemaVersion];
  if (isFiniteNumber(storedVersion) && storedVersion > LIBRARY_SCHEMA_VERSION) {
    throw new Error("Docksnip data was written by a newer version of the extension.");
  }
  const activeDockId = stored[LIBRARY_STORAGE_KEYS.activeDock];
  const rawCaptures = arrayAt(stored, LIBRARY_STORAGE_KEYS.captures);
  const rawGroups = arrayAt(stored, LIBRARY_STORAGE_KEYS.groups);
  const rawOrder = arrayAt(stored, LIBRARY_STORAGE_KEYS.railOrder);
  const rawDocks = arrayAt(stored, LIBRARY_STORAGE_KEYS.docks);
  const captures = rawCaptures.map(parseCapture).filter((capture): capture is Capture => Boolean(capture));
  const groups = reconcileLegacyMembership(
    rawGroups.map(parseGroup).filter((group): group is CaptureGroup => Boolean(group)),
    rawCaptures
  );
  return {
    library: normalizeLibrary({
      captures,
      groups,
      docks: rawDocks.map(parseDock).filter((dock): dock is CaptureDock => Boolean(dock)),
      activeDockId: isId(activeDockId) ? activeDockId : undefined,
      railOrder: rawOrder.map(parseOrderItem).filter((item): item is RailOrderItem => Boolean(item))
    }),
    needsWrite:
      stored[LIBRARY_STORAGE_KEYS.schemaVersion] !== LIBRARY_SCHEMA_VERSION ||
      rawDocks.length !== 1 ||
      rawCaptures.some(hasLegacyCaptureFields) ||
      rawGroups.some(hasLegacyGroupFields)
  };
}

export function encodeLibraryStorage(library: LibraryState): Record<string, unknown> {
  const normalized = normalizeLibrary(library);
  return {
    [LIBRARY_STORAGE_KEYS.captures]: normalized.captures.map(normalizeCapture),
    [LIBRARY_STORAGE_KEYS.groups]: normalized.groups,
    [LIBRARY_STORAGE_KEYS.railOrder]: normalized.railOrder,
    [LIBRARY_STORAGE_KEYS.docks]: normalized.docks,
    [LIBRARY_STORAGE_KEYS.activeDock]: normalized.activeDockId,
    [LIBRARY_STORAGE_KEYS.schemaVersion]: LIBRARY_SCHEMA_VERSION
  };
}

function arrayAt(stored: Record<string, unknown>, key: string): unknown[] {
  const value = stored[key];
  return Array.isArray(value) ? value : [];
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
  return isRecord(capture) &&
    ("fullDataUrl" in capture || "sourceUrl" in capture || "sourceOrigin" in capture || "pageTitle" in capture);
}

function hasLegacyGroupFields(group: unknown): boolean {
  return isRecord(group) && ("collapsed" in group || !isFolderColorSlot(group.colorSlot));
}

function parseCapture(value: unknown): Capture | undefined {
  if (!isRecord(value) || !isId(value.id) || !isFiniteNumber(value.createdAt) ||
    !isDimension(value.width) || !isDimension(value.height) ||
    !isImageDataUrl(value.thumbnailDataUrl) || !isId(value.imageBlobKey)) return undefined;
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
  if (!isRecord(value) || !isId(value.id) || typeof value.name !== "string" ||
    value.name.length > 120 || !isFiniteNumber(value.createdAt) ||
    !Array.isArray(value.captureIds) || !value.captureIds.every(isId)) return undefined;
  return {
    id: value.id,
    name: value.name,
    createdAt: value.createdAt,
    colorSlot: isFolderColorSlot(value.colorSlot) ? value.colorSlot : -1,
    captureIds: [...value.captureIds]
  };
}

function parseOrderItem(value: unknown): RailOrderItem | undefined {
  if (!isRecord(value) || (value.kind !== "capture" && value.kind !== "group") || !isId(value.id)) return undefined;
  return { kind: value.kind, id: value.id };
}

function parseDock(value: unknown): CaptureDock | undefined {
  if (!isRecord(value) || !isId(value.id) || typeof value.name !== "string" || value.name.length > 120 ||
    !isFiniteNumber(value.createdAt) || !Array.isArray(value.order)) return undefined;
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
