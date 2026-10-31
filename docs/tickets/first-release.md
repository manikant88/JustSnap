# Docksnip first-release ticket backlog

## Implementation checkpoint — 2026-09-14

| Ticket | Code status | Remaining evidence |
| --- | --- | --- |
| FR-001 | Implemented | Exercise close, replacement, and worker/browser restart in an unpacked extension |
| FR-002 | Implemented | Verify clipboard isolation and explicit Copy permission behavior on macOS and Windows |
| FR-003 | Implemented | Drag 17- and 50-image Folders into representative real destinations |
| FR-004 | Implemented with a 10-second Undo window | Verify restore and expiry in Chrome; worker restart intentionally finalizes the deletion |
| FR-005 | Hardened | Verify real CDN redirects; stable Chrome cannot expose DNS resolution, so public hostnames that resolve to private addresses remain a platform constraint |
| FR-006 | Implemented | Automated Chromium smoke verifies a 20-Folder Dock remains overflow-visible without a max height; visually verify morphing, flyouts, and drag/reorder behavior |
| FR-007 | Started | Automated unpacked-extension smoke covers startup, options/background messaging, keyboard Folder creation, cross-tab persistence, crowded-Dock layout, and delete/undo; capture, drag, Copy, clear, and restart paths remain |
| FR-009 | Implemented | Manifest now declares Chrome 150, matching `chrome.offscreen.hasDocument()` availability |
| FR-010 | Implemented for public UI | Public claims and visible/accessibility language use Folder; internal compatibility types still use `group` |
| FR-011 | Implemented | Confirm the first GitHub Actions run on the release branch |
| FR-012 | Partially implemented | Pure crop geometry covers DPR scaling, viewport clipping, offsets, and fractional coordinates; verify canvas output formats, orientation, transparency, and failures in Chrome |
| FR-014 | Hardened | Versioned migration, newer-schema protection, integrity repair, and compensated blob/metadata writes are implemented; verify injected storage/IndexedDB failure recovery in Chrome |

The next release work is validation rather than feature expansion: finish FR-007, then run FR-008 and the visual/image-processing and accessibility portions of FR-012 and FR-015.

Priority meanings:

- **P0**: blocks public release because it risks data loss, violates a core promise, creates a security boundary failure, or breaks a primary workflow.
- **P1**: required for a credible release candidate and supportable launch.
- **P2**: worthwhile cleanup or confidence improvement that may follow the first public build if capacity is tight.

## P0 — release blockers

### FR-001 — Make capture-session ownership lossless

**Problem:** closing or replacing a targeted session can leave stored captures outside both the top-level Dock order and every Folder.

**Work:** introduce explicit start/record/finish/cancel/recover transitions; define what closing the Dock does; recover pending state after service-worker restart; normalize legacy orphaned items into visible top-level order.

**Acceptance:** no valid capture is invisible after close, replacement, restart, storage failure, or repeated session commands; tests cover each transition.

### FR-002 — Separate Drag from Copy

**Problem:** starting a drag silently writes files to the clipboard.

**Work:** remove clipboard writes from drag start; add an explicit Copy action for an individual capture; communicate Copy success/failure accessibly.

**Acceptance:** clipboard content is unchanged by drag; Copy writes the correct image only after direct user action; failure does not affect drag.

### FR-003 — Deliver Folders independently of the preview cache

**Problem:** a Folder is draggable only if all blobs fit in the 16-entry preview cache.

**Work:** resolve Folder capture IDs in order and load delivery blobs on demand; keep preview cache as a rendering optimization only; show a bounded preparing/error state.

**Acceptance:** Folders with 17, 50, and the supported practical maximum begin drag with all images in order; missing/corrupt blobs produce a clear failure and no partial silent payload.

### FR-004 — Make Folder deletion recoverable

**Problem:** deleting a Folder permanently deletes all captures immediately.

**Work:** stage metadata and blobs for a short undo window; provide Undo; finalize deletion after expiry or replacement by another destructive action; define restart behavior.

**Acceptance:** deleting a non-empty or empty Folder shows Undo; Undo restores order, Folder membership, metadata, and blobs; finalization removes all data without orphans.

### FR-005 — Harden remote image collection

**Problem:** automatic redirects and post-buffer size checks allow requests to unvalidated or oversized resources.

**Work:** validate scheme and every redirect hop; reject localhost, private, link-local, loopback, multicast, unspecified, and reserved targets for IPv4/IPv6; omit credentials; enforce content type; stream with a hard byte cap and timeout.

**Acceptance:** tests cover redirect-to-private, redirect loops, DNS/address-policy cases chosen for the implementation, absent/false `Content-Length`, chunked oversize responses, invalid MIME, timeout, and valid images.

### FR-006 — Preserve non-clipping compaction

**Problem:** Making the Dock internally scrollable clips its expanding previews and Folder flyouts and interferes with morphing and drag/reorder geometry.

**Work:** retain the original deliberate compaction behavior, natural content height, and visible overflow. Add a regression test preventing the Dock contents from becoming a clipping scroll container.

**Acceptance:** crowded Docks continue compacting without a scrollbar; expanded captures and Folder flyouts are not cropped; silhouette morphing and drag insertion continue using the original coordinate space.

## P1 — release-candidate quality

### FR-007 — Add browser-level critical-path tests

Cover install/open, capture, collect page image, create empty Folder, add/move/reorder, individual drag, large-Folder drag preparation, Copy, delete/undo, clear, cross-tab persistence, worker restart, and basic keyboard access. Use a real unpacked extension in supported Chrome.

### FR-008 — Run and document the destination matrix

Test representative categories rather than promise universal support: web chat, AI chat, Figma, browser document/editor, mail, and issue tracker. Record drag behavior, fallback behavior, OS, Chrome version, and known limitations. Test macOS and Windows.

### FR-009 — Declare the actual Chrome support floor

Either declare `minimum_chrome_version` compatible with `chrome.offscreen.hasDocument()` or replace that call. Verify current Chrome plus the previous two releases when APIs allow. Treat other Chromium browsers as best effort until tested.

### FR-010 — Align public and accessible language

Replace user-visible `Group`/`collection` with **Folder** and avoid “drop anywhere” claims. Keep Folders unnamed. Update README, manifest description, options copy, buttons, tooltips, aria labels, and empty states.

### FR-011 — Add continuous release checks

Run type checking, tests, production build, `git diff --check`, and a runtime-dependency audit on pushes and pull requests. Add narrowly configured linting/formatting only if it can be adopted without a noisy whole-codebase rewrite.

### FR-012 — Test crop and image-processing correctness

Extract crop geometry and test DPR, zoom, viewport clipping, fractional coordinates, and failure paths. Verify thumbnail orientation, transparency, and representative image formats.

### FR-013 — Bound memory amplification

Measure capture/import peak memory, avoid base64 transport where browser APIs permit, close the offscreen document when idle if appropriate, and choose a storage-efficient thumbnail format. This must not introduce user-facing screenshot or storage metering.

### FR-014 — Define storage migration and integrity recovery

Version stored data, make normalization idempotent, repair legacy hidden captures, and define compensation for metadata/blob partial failure. Surface a local, privacy-safe recovery message when repair cannot complete.

### FR-015 — Accessibility and interaction pass

Verify focus order, visible focus, keyboard Folder operations, drag alternatives, button names, reduced motion, contrast, screen-reader announcements, and operability at zoomed page scales.

## P2 — focused debt reduction

### FR-016 — Repair the DockFrame seam

Move drop-intent calculation behind the library/controller boundary so `DockFrame` no longer reconstructs item state from descendant DOM datasets. Deduplicate drag event handling.

### FR-017 — Simplify speculative layout generality

Make `dynamicIslandPath` accept the production concept it actually renders, or add a real multi-region requirement before retaining the abstraction.

### FR-018 — Split tests by module responsibility

Separate Dock model, capture session, layout, drag-and-drop, importer, repository, and crop tests. Keep behavior tests at the deepest stable public interface.

### FR-019 — Retire unused first-release protocol and model concepts

After migration coverage exists, remove unused settings messaging, multiple-Dock structures, Folder names, and stale Library/Group terminology from internal types. Do not mix this mechanical cleanup into P0 fixes unless required.

### FR-020 — Reduce always-loaded extension weight

Measure startup and page impact of the content bundle. Lazy-load Dock UI or simplify the options page only if measurements show meaningful benefit.

## Recommended execution order

1. FR-001 and FR-003: establish reliable ownership and delivery data access.
2. FR-002 and FR-004: align user-visible semantics with copy-not-consume and explicit discard.
3. FR-005: close the network security boundary before public exposure.
4. FR-006, FR-007, FR-009, and FR-014: produce the first release candidate.
5. FR-008, FR-010, FR-011, FR-012, and FR-015: validate and polish the candidate.
6. FR-013 and P2 items: complete when measurements or implementation proximity justify them.

## Post-release evidence queue

Keep these as research questions, not build tickets, until user interviews, surveys, and feedback support them:

- lightweight annotation, crop, redaction, or formatting;
- turning a Folder into a PDF, report, or presentation-ready package;
- native desktop capture and cross-application delivery;
- one-time personal licensing with paid major upgrades;
- team licensing after repeated organic multi-seat demand.
