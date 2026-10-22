import type { CaptureGroup } from "./types";

export const FOLDER_COLOR_SLOT_COUNT = 12;

export function isFolderColorSlot(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < FOLDER_COLOR_SLOT_COUNT;
}

export function nextFolderColorSlot(groups: readonly CaptureGroup[]): number {
  const usage = Array.from({ length: FOLDER_COLOR_SLOT_COUNT }, () => 0);
  for (const group of groups) {
    if (isFolderColorSlot(group.colorSlot)) usage[group.colorSlot] += 1;
  }
  return leastUsedSlot(usage);
}

export function normalizeFolderColorSlots(groups: readonly CaptureGroup[]): CaptureGroup[] {
  const usage = Array.from({ length: FOLDER_COLOR_SLOT_COUNT }, () => 0);
  for (const group of groups) {
    if (isFolderColorSlot(group.colorSlot)) usage[group.colorSlot] += 1;
  }
  return groups.map((group) => {
    if (isFolderColorSlot(group.colorSlot)) return group;
    const colorSlot = leastUsedSlot(usage);
    usage[colorSlot] += 1;
    return { ...group, colorSlot };
  });
}

function leastUsedSlot(usage: readonly number[]): number {
  let selected = 0;
  for (let index = 1; index < usage.length; index += 1) {
    if (usage[index] < usage[selected]) selected = index;
  }
  return selected;
}
