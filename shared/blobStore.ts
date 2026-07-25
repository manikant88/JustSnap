import type { CaptureImage } from "./types";

const DB_NAME = "justsnap-images";
const STORE_NAME = "images";
const DB_VERSION = 1;
let databasePromise: Promise<IDBDatabase> | undefined;

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

export async function listImageBlobKeys(): Promise<string[]> {
  const db = await openDb();
  return runStoreRequest<IDBValidKey[]>(db, "readonly", (store) => store.getAllKeys()).then((keys) =>
    keys.filter((key): key is string => typeof key === "string")
  );
}

export async function captureImageToBlob(image: CaptureImage): Promise<Blob> {
  const response = await fetch(image.dataUrl);
  const blob = await response.blob();
  return blob;
}

function openDb(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onerror = () => {
      databasePromise = undefined;
      reject(request.error ?? new Error("Could not open DockSnip image store."));
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        databasePromise = undefined;
      };
      resolve(request.result);
    };
  });
  return databasePromise;
}

function runStoreRequest<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    let result: T;
    request.onerror = () => reject(request.error ?? new Error("DockSnip image store request failed."));
    request.onsuccess = () => {
      result = request.result;
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("DockSnip image store transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("DockSnip image store transaction was cancelled."));
    transaction.oncomplete = () => resolve(result);
  });
}
