import { deleteImageBlob, listImageBlobKeys } from "../shared/blobStore";
import {
  addCapture,
  applyLibraryMutation,
  normalizeLibrary,
  restoreClearedLibrary,
  restoreDeletedCapture,
  restoreDeletedGroup,
  revealUnownedCaptures
} from "../shared/libraryModel";
import { getLibrary, saveLibrary } from "../shared/storage";
import type { Capture, DeletionKind, DeletionResult, LibraryMutation, LibraryState } from "../shared/types";

let mutationQueue: Promise<unknown> = Promise.resolve();
let integrityPromise: Promise<void> | undefined;
const DELETE_UNDO_MS = 5_000;
type PendingDeletion = {
  captures: Capture[];
  restore: (library: LibraryState) => LibraryState;
  timer: ReturnType<typeof setTimeout>;
};
const pendingDeletions = new Map<string, PendingDeletion>();

export function readLibrary(): Promise<LibraryState> {
  return serialize(async () => {
    await ensureLibraryIntegrity();
    return getLibrary();
  });
}

function ensureLibraryIntegrity(): Promise<void> {
  if (integrityPromise) return integrityPromise;
  integrityPromise = (async () => {
    const library = await getLibrary();
    const blobKeys = new Set(await listImageBlobKeys());
    const validCaptures = library.captures.filter((capture) => blobKeys.has(capture.imageBlobKey));
    const referenced = new Set(validCaptures.map((capture) => capture.imageBlobKey));
    for (const deletion of pendingDeletions.values()) {
      for (const capture of deletion.captures) referenced.add(capture.imageBlobKey);
    }
    const orphans = [...blobKeys].filter((key) => !referenced.has(key));
    if (validCaptures.length !== library.captures.length) {
      await saveLibrary(normalizeLibrary({ ...library, captures: validCaptures }));
    }
    await Promise.all(orphans.map((key) => deleteImageBlob(key).catch(() => undefined)));
  })().catch((error) => {
    integrityPromise = undefined;
    throw error;
  });
  return integrityPromise;
}

export function mutateLibrary(mutation: LibraryMutation): Promise<LibraryState> {
  return serialize(async () => {
    const current = await getLibrary();
    const removedBlobKeys = blobsRemovedByMutation(current, mutation);
    const next = applyLibraryMutation(current, mutation);
    await saveLibrary(next);
    await Promise.all(removedBlobKeys.map((key) => deleteImageBlob(key).catch(() => undefined)));
    return next;
  });
}

export function insertCapture(capture: Capture, topLevel = true): Promise<LibraryState> {
  return updateLibrary((library) => addCapture(library, capture, topLevel));
}

export function recoverUnownedCaptures(pendingCaptureIds: readonly string[] = []): Promise<LibraryState> {
  return updateLibrary((library) => revealUnownedCaptures(library, pendingCaptureIds));
}

export function stageCaptureDeletion(captureId: string): Promise<DeletionResult> {
  return serialize(async () => {
    const current = await getLibrary();
    const capture = current.captures.find((entry) => entry.id === captureId);
    if (!capture) return { library: current };
    const group = current.groups.find((entry) => entry.captureIds.includes(captureId));
    const placement = {
      railIndex: Math.max(0, current.railOrder.findIndex((item) => item.kind === "capture" && item.id === captureId)),
      ...(group ? { groupId: group.id, groupIndex: group.captureIds.indexOf(captureId) } : {})
    };
    const library = applyLibraryMutation(current, { type: "delete_capture", captureId });
    await saveLibrary(library);
    return stageDeletion("capture", library, [capture], (latest) =>
      restoreDeletedCapture(latest, capture, placement)
    );
  });
}

export function stageGroupDeletion(groupId: string): Promise<DeletionResult> {
  return serialize(async () => {
    const current = await getLibrary();
    const group = current.groups.find((entry) => entry.id === groupId);
    if (!group) return { library: current };
    const captureIds = new Set(group.captureIds);
    const captures = current.captures.filter((capture) => captureIds.has(capture.id));
    const railIndex = Math.max(0, current.railOrder.findIndex((item) => item.kind === "group" && item.id === groupId));
    const library = applyLibraryMutation(current, { type: "delete_group", groupId });
    await saveLibrary(library);

    return stageDeletion("group", library, captures, (latest) =>
      restoreDeletedGroup(latest, group, captures, railIndex)
    );
  });
}

export function stageClearLibrary(): Promise<DeletionResult> {
  return serialize(async () => {
    const current = await getLibrary();
    if (!current.captures.length && !current.groups.length) return { library: current };
    const library = applyLibraryMutation(current, { type: "clear_library" });
    await saveLibrary(library);
    return stageDeletion("dock", library, current.captures, (latest) =>
      restoreClearedLibrary(latest, current)
    );
  });
}

export function undoDeletion(deletionId: string): Promise<LibraryState> {
  return serialize(async () => {
    const deletion = pendingDeletions.get(deletionId);
    const current = await getLibrary();
    if (!deletion) return current;
    clearTimeout(deletion.timer);
    pendingDeletions.delete(deletionId);
    const restored = deletion.restore(current);
    await saveLibrary(restored);
    return restored;
  });
}

function stageDeletion(
  kind: DeletionKind,
  library: LibraryState,
  captures: Capture[],
  restore: (library: LibraryState) => LibraryState
): DeletionResult {
  const deletionId = crypto.randomUUID();
  const expiresAt = Date.now() + DELETE_UNDO_MS;
  const timer = setTimeout(() => void finalizeDeletion(deletionId), DELETE_UNDO_MS);
  pendingDeletions.set(deletionId, { captures, restore, timer });
  return { library, deletionId, expiresAt, kind };
}

function finalizeDeletion(deletionId: string): Promise<void> {
  return serialize(async () => {
    const deletion = pendingDeletions.get(deletionId);
    if (!deletion) return;
    pendingDeletions.delete(deletionId);
    const current = await getLibrary();
    const retainedBlobKeys = new Set(current.captures.map((capture) => capture.imageBlobKey));
    await Promise.all(
      deletion.captures
        .filter((capture) => !retainedBlobKeys.has(capture.imageBlobKey))
        .map((capture) => deleteImageBlob(capture.imageBlobKey).catch(() => undefined))
    );
  });
}

export function updateLibrary(update: (library: LibraryState) => LibraryState): Promise<LibraryState> {
  return serialize(async () => {
    const next = normalizeLibrary(update(await getLibrary()));
    await saveLibrary(next);
    return next;
  });
}

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const next = mutationQueue.then(operation, operation);
  mutationQueue = next.then(() => undefined, () => undefined);
  return next;
}

function blobsRemovedByMutation(library: LibraryState, mutation: LibraryMutation): string[] {
  if (mutation.type === "delete_capture") {
    const capture = library.captures.find((entry) => entry.id === mutation.captureId);
    return capture ? [capture.imageBlobKey] : [];
  }
  if (mutation.type === "delete_group") {
    const group = library.groups.find((entry) => entry.id === mutation.groupId);
    if (!group) return [];
    const ids = new Set(group.captureIds);
    return library.captures.filter((capture) => ids.has(capture.id)).map((capture) => capture.imageBlobKey);
  }
  if (mutation.type === "clear_library") return library.captures.map((capture) => capture.imageBlobKey);
  return [];
}
