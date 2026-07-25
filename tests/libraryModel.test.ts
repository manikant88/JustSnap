import assert from "node:assert/strict";
import { addCapture, applyLibraryMutation, normalizeLibrary } from "../shared/libraryModel";
import { parseStoredCaptureSession } from "../shared/sessionModel";
import type { Capture } from "../shared/types";

const capture = (id: string): Capture => ({
  id,
  createdAt: 1,
  width: 100,
  height: 100,
  thumbnailDataUrl: "data:image/png;base64,AA==",
  imageBlobKey: `capture-${id}`
});

const base = normalizeLibrary({
  captures: [capture("a"), capture("b"), capture("c")],
  groups: [],
  railOrder: [{ kind: "capture", id: "a" }, { kind: "capture", id: "b" }, { kind: "capture", id: "c" }]
});

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
  const corrupted = {
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
  for (let index = 0; index < 20; index += 1) {
    library = addCapture(library, capture(`item-${index}`));
  }
  assert.equal(library.docks.length, 1);
  assert.equal(library.docks[0].order.length, 20);
  assert.deepEqual(library.railOrder.slice(0, 2), [
    { kind: "capture", id: "item-19" },
    { kind: "capture", id: "item-18" }
  ]);
}

{
  const captures = [capture("a"), capture("b"), capture("c"), capture("d")];
  const library = normalizeLibrary({
    captures,
    groups: [],
    docks: [
      {
        id: "older",
        name: "Older",
        createdAt: 1,
        order: [{ kind: "capture", id: "a" }, { kind: "capture", id: "b" }]
      },
      {
        id: "active",
        name: "Active",
        createdAt: 2,
        order: [{ kind: "capture", id: "c" }, { kind: "capture", id: "a" }]
      }
    ],
    activeDockId: "active",
    railOrder: [{ kind: "capture", id: "d" }]
  });
  assert.equal(library.docks.length, 1);
  assert.equal(library.activeDockId, "active");
  assert.deepEqual(library.railOrder, [
    { kind: "capture", id: "c" },
    { kind: "capture", id: "a" },
    { kind: "capture", id: "b" },
    { kind: "capture", id: "d" }
  ]);
}

{
  const cleared = applyLibraryMutation(base, { type: "clear_library" });
  assert.deepEqual(cleared.captures, []);
  assert.deepEqual(cleared.groups, []);
  assert.deepEqual(cleared.railOrder, []);
  assert.equal(cleared.docks.length, 1);
  assert.deepEqual(cleared.docks[0].order, []);
}

{
  const grouped = applyLibraryMutation(base, {
    type: "create_group",
    groupId: "delete-me",
    name: "Temporary",
    createdAt: 2,
    sourceCaptureId: "b",
    targetCaptureId: "a"
  });
  const deleted = applyLibraryMutation(grouped, { type: "delete_group", groupId: "delete-me" });
  assert.deepEqual(deleted.captures.map((entry) => entry.id), ["c"]);
  assert.deepEqual(deleted.groups, []);
  assert.deepEqual(deleted.railOrder, [{ kind: "capture", id: "c" }]);
}

{
  const moved = applyLibraryMutation(base, {
    type: "move_rail_item",
    item: { kind: "capture", id: "c" },
    target: { kind: "capture", id: "a" },
    position: "insert-before"
  });
  assert.deepEqual(moved.railOrder, [
    { kind: "capture", id: "c" },
    { kind: "capture", id: "a" },
    { kind: "capture", id: "b" }
  ]);
}

{
  const initial = normalizeLibrary({ captures: [], groups: [], railOrder: [] });
  const pending = addCapture(initial, capture("pending"), false);
  assert.equal(pending.captures.length, 1);
  assert.equal(pending.docks[0].order.length, 0);
  assert.equal(pending.railOrder.length, 0);
  assert.equal(normalizeLibrary(pending).railOrder.length, 0);
}

console.log("DockSnip domain tests passed.");
