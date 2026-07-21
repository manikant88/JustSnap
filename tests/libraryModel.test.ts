import assert from "node:assert/strict";
import { addCapture, applyLibraryMutation, MAX_DOCK_ITEMS, normalizeLibrary } from "../shared/libraryModel";
import { parseStoredCaptureSession } from "../shared/sessionModel";
import type { Capture, LibraryState } from "../shared/types";

const capture = (id: string): Capture => ({
  id,
  createdAt: 1,
  width: 100,
  height: 100,
  thumbnailDataUrl: "data:image/png;base64,AA==",
  imageBlobKey: `capture-${id}`
});

const base: LibraryState = {
  captures: [capture("a"), capture("b"), capture("c")],
  groups: [],
  railOrder: [{ kind: "capture", id: "a" }, { kind: "capture", id: "b" }, { kind: "capture", id: "c" }]
};

{
  const grouped = applyLibraryMutation(base, {
    type: "create_group",
    groupId: "g",
    name: "Group",
    createdAt: 2,
    sourceCaptureId: "c",
    targetCaptureId: "b"
  });
  assert.deepEqual(grouped.groups[0].captureIds, ["b", "c"]);
  assert.deepEqual(grouped.railOrder, [{ kind: "capture", id: "a" }, { kind: "group", id: "g" }]);
}

{
  const grouped = applyLibraryMutation(base, {
    type: "create_group",
    groupId: "g",
    name: "Group",
    createdAt: 2,
    sourceCaptureId: "a",
    targetCaptureId: "c"
  });
  assert.deepEqual(grouped.railOrder, [{ kind: "capture", id: "b" }, { kind: "group", id: "g" }]);
}

{
  const corrupted: LibraryState = {
    captures: [capture("a"), capture("a"), capture("b")],
    groups: [
      { id: "g1", name: "One", createdAt: 1, captureIds: ["a", "missing"] },
      { id: "g2", name: "Two", createdAt: 1, captureIds: ["a", "b"] }
    ],
    railOrder: [{ kind: "capture", id: "missing" }, { kind: "group", id: "g2" }]
  };
  const repaired = normalizeLibrary(corrupted);
  assert.deepEqual(repaired.captures.map((entry) => entry.id), ["a", "b"]);
  assert.deepEqual(repaired.groups.map((group) => group.captureIds), [["a"], ["b"]]);
  assert.deepEqual(repaired.railOrder, [{ kind: "group", id: "g2" }, { kind: "group", id: "g1" }]);
}

{
  const session = parseStoredCaptureSession({
    id: "session",
    captureIds: ["a", "b"],
    startedAt: 10,
    tabId: 42,
    addTarget: { kind: "group", id: "g" }
  });
  assert.deepEqual(session?.captureIds, ["a", "b"]);
  assert.equal(session?.tabId, 42);
  assert.equal(parseStoredCaptureSession({ id: "bad", captureIds: [null], startedAt: 10 }), undefined);
}

{
  let library = normalizeLibrary({ captures: [], groups: [], railOrder: [] });
  for (let index = 0; index < MAX_DOCK_ITEMS; index += 1) {
    library = addCapture(library, capture(`item-${index}`));
  }
  assert.equal(library.docks.length, 1);
  assert.equal(library.docks[0].order.length, MAX_DOCK_ITEMS);

  library = addCapture(library, capture("overflow"));
  assert.equal(library.docks.length, 2);
  assert.equal(library.activeDockId, library.docks[1].id);
  assert.deepEqual(library.docks[1].order, [{ kind: "capture", id: "overflow" }]);
  assert.equal(library.lastAutoCreatedDockId, library.docks[1].id);
}

{
  let library = normalizeLibrary({ captures: [capture("a")], groups: [], railOrder: [{ kind: "capture", id: "a" }] });
  library = applyLibraryMutation(library, {
    type: "create_dock",
    dockId: "workspace",
    name: "Workspace",
    createdAt: 2
  });
  assert.equal(library.docks.length, 2);
  assert.equal(library.activeDockId, "workspace");
  assert.equal(library.docks[0].order.length, 1);
  assert.equal(library.docks[1].order.length, 0);
}

{
  const captures = Array.from({ length: MAX_DOCK_ITEMS + 1 }, (_, index) => capture(`full-${index}`));
  const fullOrder = captures.slice(0, MAX_DOCK_ITEMS).map((entry) => ({ kind: "capture" as const, id: entry.id }));
  let library = normalizeLibrary({
    captures,
    groups: [{ id: "group", name: "Folder", createdAt: 1, captureIds: [] }],
    docks: [
      { id: "full", name: "Full", createdAt: 1, order: fullOrder },
      { id: "source", name: "Source", createdAt: 2, order: [{ kind: "capture", id: captures[MAX_DOCK_ITEMS].id }, { kind: "group", id: "group" }] }
    ],
    activeDockId: "source"
  });
  const unchanged = applyLibraryMutation(library, {
    type: "move_item_to_dock",
    item: { kind: "capture", id: captures[MAX_DOCK_ITEMS].id },
    dockId: "full"
  });
  assert.deepEqual(unchanged.docks, library.docks);

  library = applyLibraryMutation(library, {
    type: "add_capture_to_group",
    captureId: captures[MAX_DOCK_ITEMS].id,
    groupId: "group"
  });
  assert.deepEqual(library.groups.find((group) => group.id === "group")?.captureIds, [captures[MAX_DOCK_ITEMS].id]);
  assert.equal(library.docks.find((dock) => dock.id === "source")?.order.length, 1);
}

{
  const initial = normalizeLibrary({ captures: [], groups: [], railOrder: [] });
  const pending = addCapture(initial, capture("pending"), false);
  assert.equal(pending.captures.length, 1);
  assert.equal(pending.docks[0].order.length, 0);
  assert.equal(pending.railOrder.length, 0);
}

console.log("DockSnip domain tests passed.");
