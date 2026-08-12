import assert from "node:assert/strict";
import { addCapture, applyLibraryMutation, normalizeLibrary } from "../shared/libraryModel";
import { parseStoredCaptureSession } from "../shared/sessionModel";
import { dockFolderSize, dockInfluence, dynamicIslandPath } from "../src/content/dockLayout";
import { insertionIndexForPointer, railInsertIntentForIndex } from "../src/content/rail/dndIntent";
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
  assert.equal(dockInfluence(4, null), 0);
  assert.equal(dockInfluence(4, 4), 1);
  assert.equal(dockInfluence(3, 4), 0.28);
  assert.equal(dockInfluence(5, 4), 0.28);
  assert.equal(dockInfluence(2, 4), 0.12);
  assert.equal(dockInfluence(6, 4), 0.12);
  assert.equal(dockInfluence(1, 4), 0);
}

{
  assert.equal(dockFolderSize(52, 0), 52);
  assert.ok(Math.abs(dockFolderSize(52, 1) - 85.8) < 0.001);
  assert.ok(Math.abs(dockFolderSize(28, 1) - 46.2) < 0.001);
  assert.equal(dockFolderSize(60, 1), 88);
  assert.ok(Math.abs(dockFolderSize(52, 0.5) - 68.9) < 0.001);
}

{
  const bands = [
    { item: { kind: "capture" as const, id: "a" }, top: 100, bottom: 152 },
    { item: { kind: "capture" as const, id: "b" }, top: 164, bottom: 216 }
  ];
  assert.equal(insertionIndexForPointer(20, bands), 0);
  assert.equal(insertionIndexForPointer(140, bands), 1);
  assert.equal(insertionIndexForPointer(300, bands), 2);
  assert.deepEqual(railInsertIntentForIndex(0, bands.map(({ item }) => item), bands[1].item), {
    scope: "rail",
    action: "insert-before",
    target: bands[0].item
  });
  assert.deepEqual(railInsertIntentForIndex(2, bands.map(({ item }) => item), bands[0].item), {
    scope: "rail",
    action: "insert-after",
    target: bands[1].item
  });
}

{
  const path = dynamicIslandPath({
    width: 380,
    height: 600,
    baselineLeft: 306,
    regions: [
      { left: 240, top: 100, bottom: 180, curve: 24, outerCurve: 18 },
      { left: 40, top: 210, bottom: 410, curve: 48, outerCurve: 20 },
      { left: 230, top: 440, bottom: 520, curve: 24, outerCurve: 18 }
    ]
  });
  assert.ok(path.startsWith("M 380 0 H 306 V 162"));
  assert.ok(path.includes(" 40 "));
  assert.ok(path.includes("Q 306 210 258 210 H 60 Q 40 210 40 230"));
  assert.ok(path.includes("Q "));
  assert.ok(!path.includes("NaN"));
  assert.ok((path.match(/\bL\b/g) ?? []).length === 0);
  assert.ok(path.endsWith("Z"));
}

{
  const edgePath = dynamicIslandPath({
    width: 380,
    height: 600,
    baselineLeft: 306,
    regions: [
      {
        left: 40,
        top: -8,
        bottom: 608,
        curve: 48,
        outerCurve: 20
      }
    ]
  });
  assert.ok(edgePath.includes("V -56"));
  assert.ok(edgePath.includes("Q 306 -8 258 -8"));
  assert.ok(edgePath.includes("Q 306 608 306 656"));
}

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
