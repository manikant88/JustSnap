import {
  decodeLibraryStorage,
  encodeLibraryStorage,
  LIBRARY_STORAGE_KEYS,
} from "./libraryStorageCodec";
import type { LibraryState } from "./types";

const LEGACY_STORAGE_KEYS = [
  "justsnap_events",
  "justsnap_pending_usages",
  "docksnip_dock_overflow_seen",
  "docksnip_last_auto_dock"
];
let legacyTrackingCleared = false;

export async function getLibrary(): Promise<LibraryState> {
  const stored = await chrome.storage.local.get(Object.values(LIBRARY_STORAGE_KEYS));
  const decoded = decodeLibraryStorage(stored);

  // Product analytics is intentionally account-free and interview-led for v1.
  // Clear any data left behind by experimental builds instead of migrating it.
  if (!legacyTrackingCleared) {
    await chrome.storage.local.remove(LEGACY_STORAGE_KEYS);
    legacyTrackingCleared = true;
  }

  if (decoded.needsWrite) {
    await saveLibrary(decoded.library);
  }

  return decoded.library;
}

export async function saveLibrary(library: LibraryState): Promise<void> {
  await chrome.storage.local.set(encodeLibraryStorage(library));
}
