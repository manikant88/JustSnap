import type { CaptureImage } from "./types";

const DB_NAME = "justsnap-images";
const STORE_NAME = "images";
const DB_VERSION = 1;

export async function saveImageBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await runStoreRequest(db, "readwrite", (store) => store.put(blob, key));
}

export async function getImageBlob(key: string): Promise<Blob | undefined> {
  const db = await openDb();
  return runStoreRequest<Blob | undefined>(db, "readonly", (store) => store.get(key));
}

export async function deleteImageBlob(key: string): Promise<void> {
  const db = await openDb();
  await runStoreRequest(db, "readwrite", (store) => store.delete(key));
}

export async function captureImageToBlob(image: CaptureImage, type = "image/png"): Promise<Blob> {
  const response = await fetch(image.dataUrl);
  const blob = await response.blob();
  if (blob.type === type || type === "image/jpeg") return blob;
  return blob;
}

export function blobToObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open JustSnap image store."));
    request.onsuccess = () => resolve(request.result);
  });
}

function runStoreRequest<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onerror = () => reject(request.error ?? new Error("JustSnap image store request failed."));
    request.onsuccess = () => resolve(request.result);
  });
}
