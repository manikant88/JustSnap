import type { CaptureAddTarget } from "./types";

export type ActiveCaptureSession = {
  id: string;
  captureIds: string[];
  startedAt: number;
  tabId?: number;
  addTarget?: CaptureAddTarget;
};

export function parseStoredCaptureSession(value: unknown): ActiveCaptureSession | undefined {
  if (!isRecord(value) || !isId(value.id) || !Array.isArray(value.captureIds) || !isFiniteNumber(value.startedAt)) return undefined;
  if (!value.captureIds.every(isId)) return undefined;
  const addTarget = value.addTarget === undefined ? undefined : parseAddTarget(value.addTarget);
  if (value.addTarget !== undefined && !addTarget) return undefined;
  const tabId = typeof value.tabId === "number" && Number.isInteger(value.tabId) ? value.tabId : undefined;
  return {
    id: value.id,
    captureIds: [...value.captureIds],
    startedAt: value.startedAt,
    ...(tabId !== undefined ? { tabId } : {}),
    ...(addTarget ? { addTarget } : {})
  };
}

function parseAddTarget(value: unknown): CaptureAddTarget | undefined {
  if (!isRecord(value) || (value.kind !== "capture" && value.kind !== "group") || !isId(value.id)) return undefined;
  return { kind: value.kind, id: value.id };
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
