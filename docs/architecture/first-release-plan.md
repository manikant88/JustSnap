# Docksnip first-release architecture plan

## Architectural objective

Make the first-release loop reliable without a broad rewrite:

`capture or collect -> place in Dock/Folder -> deliver a copy -> explicitly discard`

The desired architecture is a small set of deep modules with narrow interfaces. Browser APIs, DOM behavior, and storage remain adapters around testable domain behavior. Introduce a seam only where production and tests both need it or where a release blocker crosses responsibilities.

## Current shape

- `src/background.ts` owns runtime lifecycle, message routing, capture sessions, remote import, screenshot capture, thumbnail repair, and offscreen orchestration.
- `src/content.tsx` owns controller state, runtime communication, blob caching, page-image detection, delivery, and UI coordination.
- `src/content/rail/LibraryView.tsx` owns presentation plus layout, hover, drop intent, item behavior, and Folder flyouts.
- `shared/libraryModel.ts` provides useful pure transitions, but its public model carries speculative multiple-Dock and Folder-name concepts.
- `src/libraryRepository.ts` is the persistence seam, though multi-record operations need clearer atomicity and recovery behavior.
- `src/content/dockLayout.ts` is a valuable pure layout module, but its interface is more general than its one-region production use.

## Target modules

### 1. Capture session

Interface:

```ts
startSession(targetFolderId?: FolderId): Session
recordCapture(sessionId: SessionId, capture: StoredCapture): Result
finishSession(sessionId: SessionId): Result
cancelSession(sessionId: SessionId): Result
recoverSessions(): Result
```

Implementation owns the invariant that every stored capture has exactly one visible owner: top-level Dock order, one Folder, or an explicitly recoverable pending session. Closing the rail must call a defined transition; it must never clear session memory directly.

This is the first seam to create because it fixes the data-loss-class blocker and permits deterministic lifecycle tests without Chrome.

### 2. Dock model

Interface: commands over `captures`, `folders`, and ordered top-level entries, returning a new model plus explicit effects.

After stored-data migration is defined, remove speculative multiple-Dock state and user-visible Folder names. Keep Folder rules in one place: flat, unnamed, ordered, optionally empty, one Folder per capture, cascade deletion.

Do not combine persistence with the pure model. The model decides what changes; the repository performs it.

### 3. Image store

Interface:

```ts
putCapture(metadata, blob): Promise<void>
deleteCaptures(ids): Promise<DeletionReceipt>
restoreDeletion(receipt): Promise<void>
loadBlob(id): Promise<Blob | undefined>
loadBlobs(ids): Promise<Map<CaptureId, Blob>>
verifyIntegrity(): Promise<IntegrityReport>
```

This module hides Chrome storage and IndexedDB coordination, including compensation when one side fails. A deletion receipt supports Folder undo without inventing a permanent history product.

### 4. Image importer

Interface: `collect(url): Promise<ImportedImage>`.

The implementation owns URL policy, DNS/IP classification as applicable, manual redirect validation, credential omission, content-type validation, streaming byte limits, and conversion. Network access is injected so redirects, oversized chunks, and failures are testable locally.

### 5. Delivery

Interface:

```ts
prepareDragPayload(captureIds): Promise<DragPayload>
copyCapture(captureId): Promise<void>
```

Delivery loads source blobs on demand through the image store. Preview-cache membership must never determine whether delivery works. Drag and Copy are distinct commands; only Copy writes to the clipboard. Destination-specific DOM insertion remains an adapter and may fail without implying consumption or cleanup.

### 6. UI controller and views

A `useDockController` hook or reducer should expose state and user actions to presentational Dock views. It owns runtime-message handling and async command state. Views render props and emit intents.

`DockFrame` should receive calculated layout/drop state instead of reading descendant datasets and rectangles. `LibraryView` should not load data or decide persistence effects. This repairs the current frame/library/DnD seam while preserving the visual implementation.

### 7. Pure supporting modules

- `PageImageDetector`: resolves a collectable image target at a point without coupling it to React state.
- `CropGeometry`: calculates crop rectangles under DPR, zoom, and viewport constraints; offscreen canvas remains an adapter.
- `DockLayout`: calculates deliberate compaction while preserving the Dock's overflow-visible coordinate space for previews, Folder flyouts, and drag geometry.

## Dependency direction

```text
Dock views -> UI controller -> domain commands
                              |-> CaptureSession -> DockModel
                              |-> Delivery ------> ImageStore
                              |-> ImageImporter -> network adapter
                              `-> ImageProcessor -> offscreen adapter

DockModel and layout/geometry modules depend on no browser APIs.
```

Chrome runtime, storage, IndexedDB, clipboard, DOM, canvas, and fetch are edge adapters. Tests substitute only those true external dependencies.

## Incremental sequence

1. Add failing tests for session close/replace and large-Folder delivery.
2. Extract CaptureSession and fix ownership without changing UI.
3. Separate drag preparation from explicit clipboard Copy; load delivery blobs on demand.
4. Add deletion receipts and Folder undo at the repository/controller seam.
5. Extract and harden ImageImporter.
6. Keep compaction overflow-visible and protect the non-scrolling layout with a regression test.
7. Move DOM-derived drop intent out of `DockFrame`; split the mixed test module.
8. Migrate terminology and retire unused multi-Dock/settings structures only after stored-data compatibility is covered.

Each step should leave the extension buildable and should replace tests at the new deeper interface instead of duplicating tests around both old and new paths.

## Explicit non-goals

- No framework migration.
- No global state library solely for architectural neatness.
- No generic plugin/provider system for future destinations.
- No server, account, cloud, or analytics abstraction.
- No rewrite of stable visual components unrelated to a release blocker.
- No premature desktop-app sharing layer.
