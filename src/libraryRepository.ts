import { deleteImageBlob, listImageBlobKeys } from "../shared/blobStore";
import { addCapture, applyLibraryMutation, normalizeLibrary } from "../shared/libraryModel";
import { getLibrary, saveLibrary } from "../shared/storage";
import type { Capture, LibraryMutation, LibraryState } from "../shared/types";

let mutationQueue: Promise<unknown> = Promise.resolve();
let integrityPromise: Promise<void> | undefined;

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
