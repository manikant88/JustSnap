import { deleteImageBlob, listImageBlobKeys } from "../shared/blobStore";
import {
  addCapture,
  applyLibraryMutation,
  normalizeLibrary,
  restoreDeletedGroup,
  revealUnownedCaptures
} from "../shared/libraryModel";
import { getLibrary, saveLibrary } from "../shared/storage";
import type { Capture, CaptureGroup, GroupDeletionResult, LibraryMutation, LibraryState } from "../shared/types";

let mutationQueue: Promise<unknown> = Promise.resolve();
let integrityPromise: Promise<void> | undefined;
const GROUP_DELETE_UNDO_MS = 10_000;
type PendingGroupDeletion = {
  group: CaptureGroup;
  captures: Capture[];
  railIndex: number;
  timer: ReturnType<typeof setTimeout>;
};
const pendingGroupDeletions = new Map<string, PendingGroupDeletion>();

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
    for (const deletion of pendingGroupDeletions.values()) {
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

export function stageGroupDeletion(groupId: string): Promise<GroupDeletionResult> {
  return serialize(async () => {
    const current = await getLibrary();
    const group = current.groups.find((entry) => entry.id === groupId);
    if (!group) return { library: current };
    const captureIds = new Set(group.captureIds);
    const captures = current.captures.filter((capture) => captureIds.has(capture.id));
    const railIndex = Math.max(0, current.railOrder.findIndex((item) => item.kind === "group" && item.id === groupId));
    const library = applyLibraryMutation(current, { type: "delete_group", groupId });
    await saveLibrary(library);

    const deletionId = crypto.randomUUID();
    const expiresAt = Date.now() + GROUP_DELETE_UNDO_MS;
    const timer = setTimeout(() => void finalizeGroupDeletion(deletionId), GROUP_DELETE_UNDO_MS);
    pendingGroupDeletions.set(deletionId, { group, captures, railIndex, timer });
    return { library, deletionId, expiresAt };
  });
}

export function undoGroupDeletion(deletionId: string): Promise<LibraryState> {
  return serialize(async () => {
    const deletion = pendingGroupDeletions.get(deletionId);
    const current = await getLibrary();
    if (!deletion) return current;
    clearTimeout(deletion.timer);
    pendingGroupDeletions.delete(deletionId);
    const restored = restoreDeletedGroup(current, deletion.group, deletion.captures, deletion.railIndex);
    await saveLibrary(restored);
    return restored;
  });
}

function finalizeGroupDeletion(deletionId: string): Promise<void> {
  return serialize(async () => {
    const deletion = pendingGroupDeletions.get(deletionId);
    if (!deletion) return;
    pendingGroupDeletions.delete(deletionId);
    await Promise.all(deletion.captures.map((capture) => deleteImageBlob(capture.imageBlobKey).catch(() => undefined)));
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
