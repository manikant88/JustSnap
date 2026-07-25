import type {
  Capture,
  CaptureDock,
  CaptureGroup,
  DockOrderItem,
  LibraryMutation,
  LibraryState,
  RailOrderItem
} from "./types";

type LibraryInput = Pick<LibraryState, "captures" | "groups"> &
  Partial<Pick<LibraryState, "docks" | "activeDockId" | "railOrder">>;

export function normalizeLibrary(input: LibraryInput): LibraryState {
  const captures = uniqueById(input.captures);
  const captureIds = new Set(captures.map((capture) => capture.id));
  const claimedCaptureIds = new Set<string>();
  const groups = uniqueById(input.groups).map((group) => {
    const available = group.captureIds.filter(
      (id, index, ids) => captureIds.has(id) && ids.indexOf(id) === index && !claimedCaptureIds.has(id)
    );
    available.forEach((id) => claimedCaptureIds.add(id));
    return { ...group, name: cleanName(group.name, "New folder"), captureIds: available };
  });

  const validItems = topLevelItems(captures, groups);
  const validKeys = new Set(validItems.map(itemKey));
  const sourceDocks = uniqueById(input.docks ?? []);
  const activeSource = sourceDocks.find((dock) => dock.id === input.activeDockId);
  const orderedSources = activeSource
    ? [activeSource, ...sourceDocks.filter((dock) => dock.id !== activeSource.id)]
    : sourceDocks;
  const candidates = orderedSources.length
    ? [...orderedSources.flatMap((dock) => dock.order), ...(input.railOrder ?? [])]
    : [...(input.railOrder ?? []), ...validItems];
  const seenItems = new Set<string>();
  const order = candidates.filter((item) => {
    const key = itemKey(item);
    if (!validKeys.has(key) || seenItems.has(key)) return false;
    seenItems.add(key);
    return true;
  });
  const dock = createDock(activeSource?.id ?? "dock-1", "Dock", activeSource?.createdAt ?? Date.now(), order);

  return {
    captures,
    groups,
    docks: [dock],
    activeDockId: dock.id,
    railOrder: dock.order
  };
}

export function applyLibraryMutation(library: LibraryState, mutation: LibraryMutation): LibraryState {
  const current = normalizeLibrary(library);
  switch (mutation.type) {
    case "move_rail_item":
      return normalizeLibrary(withActiveOrder(current, moveRailItem(current.railOrder, mutation.item, mutation.target, mutation.position)));
    case "create_group": {
      if (mutation.sourceCaptureId === mutation.targetCaptureId) return current;
      const availableIds = new Set(current.captures.map((capture) => capture.id));
      if (!availableIds.has(mutation.sourceCaptureId) || !availableIds.has(mutation.targetCaptureId)) return current;
      const targetGroup = groupContaining(current.groups, mutation.targetCaptureId);
      if (targetGroup) {
        return applyLibraryMutation(current, {
          type: "add_capture_to_group",
          captureId: mutation.sourceCaptureId,
          groupId: targetGroup.id
        });
      }
      const group: CaptureGroup = {
        id: mutation.groupId,
        name: cleanName(mutation.name, "New folder"),
        createdAt: mutation.createdAt,
        captureIds: [mutation.targetCaptureId, mutation.sourceCaptureId]
      };
      const docks = replaceCapturesWithGroupAcrossDocks(
        current.docks,
        group.captureIds,
        group.id,
        mutation.targetCaptureId
      );
      return normalizeLibrary({
        ...current,
        groups: [group, ...removeCapturesFromGroups(current.groups, group.captureIds)],
        docks
      });
    }
    case "add_capture_to_group": {
      if (!current.captures.some((capture) => capture.id === mutation.captureId)) return current;
      const target = current.groups.find((group) => group.id === mutation.groupId);
      if (!target) return current;
      return normalizeLibrary({
        ...current,
        groups: current.groups.map((group) => {
          const withoutCapture = group.captureIds.filter((id) => id !== mutation.captureId);
          return group.id === target.id
            ? { ...group, captureIds: [...withoutCapture, mutation.captureId] }
            : { ...group, captureIds: withoutCapture };
        }),
        docks: removeItemFromDocks(current.docks, { kind: "capture", id: mutation.captureId })
      });
    }
    case "move_capture_in_group": {
      if (mutation.captureId === mutation.targetCaptureId) return current;
      const withoutCapture = current.groups.map((group) => ({
        ...group,
        captureIds: group.captureIds.filter((id) => id !== mutation.captureId)
      }));
      return normalizeLibrary({
        ...current,
        groups: withoutCapture.map((group) => {
          if (group.id !== mutation.groupId) return group;
          const targetIndex = group.captureIds.indexOf(mutation.targetCaptureId);
          if (targetIndex < 0) return { ...group, captureIds: [...group.captureIds, mutation.captureId] };
          const insertAt = targetIndex + (mutation.position === "insert-after" ? 1 : 0);
          const ids = [...group.captureIds];
          ids.splice(insertAt, 0, mutation.captureId);
          return { ...group, captureIds: ids };
        }),
        docks: removeItemFromDocks(current.docks, { kind: "capture", id: mutation.captureId })
      });
    }
    case "ungroup_capture": {
      return normalizeLibrary({
        ...current,
        groups: removeCapturesFromGroups(current.groups, [mutation.captureId]),
        docks: updateDock(current.docks, current.activeDockId, (dock) => ({
          ...dock,
          order: dock.order.some((item) => item.kind === "capture" && item.id === mutation.captureId)
            ? dock.order
            : [{ kind: "capture", id: mutation.captureId }, ...dock.order]
        }))
      });
    }
    case "delete_capture":
      return normalizeLibrary({
        ...current,
        captures: current.captures.filter((capture) => capture.id !== mutation.captureId),
        groups: removeCapturesFromGroups(current.groups, [mutation.captureId]),
        docks: removeItemFromDocks(current.docks, { kind: "capture", id: mutation.captureId })
      });
    case "delete_group": {
      const group = current.groups.find((entry) => entry.id === mutation.groupId);
      if (!group) return current;
      const removed = new Set(group.captureIds);
      return normalizeLibrary({
        ...current,
        captures: current.captures.filter((capture) => !removed.has(capture.id)),
        groups: current.groups.filter((entry) => entry.id !== mutation.groupId),
        docks: removeItemFromDocks(current.docks, { kind: "group", id: mutation.groupId })
      });
    }
    case "create_empty_group": {
      if (current.groups.some((group) => group.id === mutation.groupId)) return current;
      const group: CaptureGroup = {
        id: mutation.groupId,
        name: cleanName(mutation.name, "New folder"),
        createdAt: mutation.createdAt,
        captureIds: []
      };
      return addTopLevelEntity(
        current,
        { kind: "group", id: group.id },
        { groups: [group, ...current.groups] }
      );
    }
    case "clear_library":
      return normalizeLibrary({ captures: [], groups: [], railOrder: [] });
  }
}

export function addCapture(library: LibraryState, capture: Capture, topLevel = true): LibraryState {
  const current = normalizeLibrary(library);
  const captures = [capture, ...current.captures.filter((entry) => entry.id !== capture.id)];
  if (!topLevel) {
    return normalizeLibrary({
      ...current,
      captures
    });
  }
  return addTopLevelEntity(current, { kind: "capture", id: capture.id }, { captures });
}

export function groupContaining(groups: CaptureGroup[], captureId: string): CaptureGroup | undefined {
  return groups.find((group) => group.captureIds.includes(captureId));
}

function addTopLevelEntity(
  current: LibraryState,
  item: DockOrderItem,
  additions: Partial<Pick<LibraryState, "captures" | "groups">>
): LibraryState {
  const cleanedDocks = removeItemFromDocks(current.docks, item);
  const active = cleanedDocks.find((dock) => dock.id === current.activeDockId) ?? cleanedDocks[0];
  return normalizeLibrary({
    ...current,
    ...additions,
    docks: updateDock(cleanedDocks, active.id, (dock) => ({ ...dock, order: [item, ...dock.order] })),
    activeDockId: active.id
  });
}

function createDock(id: string, name: string, createdAt: number, order: DockOrderItem[] = []): CaptureDock {
  return { id, name: cleanName(name, "Dock"), createdAt: finiteTimestamp(createdAt), order: [...order] };
}

function topLevelItems(captures: Capture[], groups: CaptureGroup[]): DockOrderItem[] {
  const groupedIds = new Set(groups.flatMap((group) => group.captureIds));
  return [
    ...groups.map((group) => ({ kind: "group" as const, id: group.id })),
    ...captures.filter((capture) => !groupedIds.has(capture.id)).map((capture) => ({ kind: "capture" as const, id: capture.id }))
  ];
}

function withActiveOrder(current: LibraryState, order: DockOrderItem[]): LibraryState {
  return {
    ...current,
    docks: updateDock(current.docks, current.activeDockId, (dock) => ({ ...dock, order }))
  };
}

function updateDock(docks: CaptureDock[], id: string, update: (dock: CaptureDock) => CaptureDock): CaptureDock[] {
  return docks.map((dock) => (dock.id === id ? update(dock) : dock));
}

function removeItemFromDocks(docks: CaptureDock[], item: DockOrderItem): CaptureDock[] {
  return docks.map((dock) => ({ ...dock, order: dock.order.filter((entry) => !sameItem(entry, item)) }));
}

function replaceCapturesWithGroupAcrossDocks(
  docks: CaptureDock[],
  captureIds: string[],
  groupId: string,
  targetCaptureId: string
): CaptureDock[] {
  const captureIdSet = new Set(captureIds);
  let inserted = false;
  const next = docks.map((dock) => ({
    ...dock,
    order: dock.order.flatMap((item): DockOrderItem[] => {
      if (item.kind !== "capture" || !captureIdSet.has(item.id)) return [item];
      if (item.id === targetCaptureId) {
        inserted = true;
        return [{ kind: "group", id: groupId }];
      }
      return [];
    })
  }));
  if (inserted) return next;
  return updateDock(next, next[0].id, (dock) => ({ ...dock, order: [{ kind: "group", id: groupId }, ...dock.order] }));
}

function moveRailItem(order: RailOrderItem[], item: RailOrderItem, target: RailOrderItem, position: "insert-before" | "insert-after") {
  const next = order.filter((entry) => !sameItem(entry, item));
  const targetIndex = next.findIndex((entry) => sameItem(entry, target));
  if (targetIndex < 0) return next;
  next.splice(targetIndex + (position === "insert-after" ? 1 : 0), 0, item);
  return next;
}

function removeCapturesFromGroups(groups: CaptureGroup[], captureIds: string[]): CaptureGroup[] {
  const removed = new Set(captureIds);
  return groups.map((group) => ({ ...group, captureIds: group.captureIds.filter((id) => !removed.has(id)) }));
}

function itemKey(item: DockOrderItem): string {
  return `${item.kind}:${item.id}`;
}

function sameItem(first: DockOrderItem, second: DockOrderItem): boolean {
  return first.kind === second.kind && first.id === second.id;
}

function cleanName(value: string, fallback: string): string {
  const name = value.trim().replace(/\s+/g, " ").slice(0, 120);
  return name || fallback;
}

function finiteTimestamp(value: number): number {
  return Number.isFinite(value) ? value : Date.now();
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id)));
}
