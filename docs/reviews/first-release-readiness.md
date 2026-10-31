# Docksnip first-release readiness review

Date: 2026-09-14  
Reviewed branch: `docksnip-sleek`  
Fixed point: `origin/main` (`31126239b90862d228dba09a28319e6db50feffb`)  
Product contract: [`docs/specs/first-release.md`](../specs/first-release.md)

## Outcome

Docksnip already has the core shape of the intended product: local capture storage, an on-page Dock, flat Folders, reordering, individual and Folder drag, deletion, cross-tab persistence, and a compact visual treatment. The release should not be widened. It should be hardened around data ownership, delivery, destructive actions, and remote imports.

Current recommendation: **not ready to ship publicly**. Resolve the P0 release blockers, run the destination matrix, and complete a short release-candidate soak. The architectural work should be limited to seams that directly make those fixes safe and testable.

## What exists today

| Capability | Current state | Release assessment |
| --- | --- | --- |
| Visible-page capture | Implemented through the background capture flow | Keep; harden session ownership |
| Page-image collection | Implemented through content/background messaging | Keep; secure remote import |
| Local persistence | Metadata plus image blobs are persisted locally | Keep; add lifecycle failure tests |
| Flat Folders | Create, add, remove, reorder, and cascade delete exist | Semantics are mostly present; terminology and undo remain |
| Individual drag | Implemented with file payload and page insertion fallbacks | Clipboard side effect violates the contract |
| Folder drag | Implemented only while every image is in the preview cache | Fails above 16 captures |
| Explicit discard | Item, Folder, and clear-all paths exist | Folder deletion is not recoverable |
| Compact Dock | Adaptive shrinking and Folder flyouts exist | Can shrink entries to an unusable 8px |
| Options surface | Present but minimal | Not a release blocker; keep small |
| Automated verification | Type checking, Node tests, and production build exist | No browser E2E, CI, lint, or format gate |

## Standards

No documented repository-standard violations were found. Four judgement-call smells remain:

- **Speculative Generality** — `src/content/dockLayout.ts:65`: `dynamicIslandPath` accepts multiple regions but reduces them to one; production supplies at most one.
- **Divergent Change / Feature Envy** — `src/content/docks/DockFrame.tsx:22`: the frame handles silhouette measurement, refs, and reconstructs library items from descendant DOM datasets.
- **Duplicated Code** — `src/content/docks/DockFrame.tsx:88`: capture/bubble drag-over and drop handlers repeat the same event-handling shapes.
- **Divergent Change** — `tests/libraryModel.test.ts:1`: unrelated library, session, dock geometry, and drag-and-drop tests share one test module.

Worst standards issue: `DockFrame` crosses the frame/library/drag-and-drop boundary by inspecting descendant DOM internals.

## Spec

- **Incorrect — drag overwrites clipboard.** Starting a drag calls `copyFilesToClipboard`, although delivery must not silently replace the user's clipboard (`src/content.tsx:494`).
- **Missing — explicit Copy action.** Capture items expose collection, drag, and removal controls, but no explicit Copy command (`src/content/rail/LibraryView.tsx:341`).
- **Incorrect — closing or replacing a targeted capture session can strand captures.** Closing clears the in-memory session without committing or cancelling it, while targeted captures are deliberately omitted from top-level order (`src/background.ts:262`, `src/background.ts:334`).
- **Missing — large Folder delivery.** The blob cache is capped at 16 entries, while Folder drag requires every Folder capture to be cached (`src/content.tsx:40`, `src/content/rail/LibraryView.tsx:665`).
- **Missing — recoverable Folder deletion.** Removal immediately mutates metadata and deletes blobs; no undo path exists (`src/content.tsx:628`, `src/libraryRepository.ts:35`).
- **Superseded product decision — deliberate compaction.** The later confirmed behavior keeps shrinking a crowded Dock instead of introducing an internal scroll container, because scrolling clips the Dock's expanding previews and disrupts drag geometry.
- **Missing — remote-fetch security.** Redirects are followed before final URL validation, the response is buffered before enforcing actual size, and hostname protection covers only a subset of private/reserved targets (`src/background.ts:276`, `src/background.ts:597`).
- **Scope creep — unused settings protocol.** `JUSTSNAP_OPEN_SETTINGS` was added without a caller even though settings are outside the first-release loop (`shared/types.ts:90`, `src/background.ts:137`).

Worst spec issue: the session lifecycle can make valid captures invisible and unreachable, which is a data-loss-class failure.

## Additional release risks

### Product-language drift

The confirmed user term is **Folder**, but implementation and UI still mix `Group`, `collection`, `Library`, and multi-Dock concepts. Internal migration can happen incrementally, but all visible first-release copy should consistently say Folder and Dock. Folders remain unnamed; autogenerated technical filenames are not user-facing naming features.

### Browser compatibility

`chrome.offscreen.hasDocument()` establishes an effective Chrome 150 floor, but the manifest does not declare `minimum_chrome_version`. Either declare and test that floor or replace the dependency. Claims such as “drop them anywhere” should be narrowed because delivery compatibility is destination-dependent.

### Memory and storage pressure

Image blobs are converted to base64 for runtime transport and converted back in the content process. This multiplies peak memory for large captures. Thumbnail generation requests PNG with a quality argument PNG ignores. These are not reasons to add user-facing storage quotas, but they are reasons to cap inputs safely and avoid unnecessary copies.

### Test confidence

Pure model and layout behavior has some coverage. The riskiest behavior does not: capture-session close/replace/restart, IndexedDB/storage failures, large-Folder delivery, clipboard isolation, remote redirects and streaming limits, crop geometry under zoom/DPR, multi-tab behavior, and real destination interactions.

## Release gates

Ship only when all are true:

1. A capture cannot become invisible after session close, replacement, worker restart, or partial failure.
2. Drag never changes the clipboard; Copy exists as an explicit capture action.
3. A Folder containing more than 16 captures can begin delivery without depending on preview cache residency.
4. Folder deletion has a clearly visible undo window and restores metadata and blobs.
5. Remote import validates every redirect target, rejects private/reserved destinations, and aborts once the byte limit is exceeded.
6. Crowded-Dock compaction preserves overflow-visible previews, Folder flyouts, silhouette morphing, and drag/reorder behavior without internal scrolling.
7. Supported Chrome versions and destination claims are accurate.
8. The browser test matrix passes on macOS and Windows for representative chat, AI, design, document, and issue-tracker destinations.
9. Type checking, unit/integration tests, production build, and package audit pass on the release commit.

## Deferred intentionally

Do not delay the first release for editing, annotation, OCR, redaction, PDF/report generation, search, history, accounts, cloud sync, telemetry, collaboration, team licensing, or a native desktop application. These require user evidence after the capture–collect–deliver–discard loop is stable.
