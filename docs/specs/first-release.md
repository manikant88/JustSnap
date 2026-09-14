# DockSnip First Release

## Product promise

Capture or collect images in a temporary visual dock, group them into Folders, and drag them into the user's next task without creating disposable files.

DockSnip is a visual clipboard, not a screenshot manager, permanent image library, or destination-specific integration.

## Users

DockSnip serves people who repeatedly stage screenshots or webpage images between their source and another work surface. Professions and destinations are examples, not product modes or identities.

## Required workflow

1. Capture a selected region of the visible browser viewport or collect a visible webpage image.
2. Keep captures in the Dock across supported tab changes and browser/service-worker restarts until explicit discard.
3. Optionally create an empty, unnamed Folder and add captures to it.
4. Move captures into, within, or out of a Folder. Folders are flat and cannot contain other Folders.
5. Drag an individual capture or all captures in an ordered Folder toward a Destination.
6. Permit repeated delivery attempts without consuming or changing the captures.
7. Explicitly discard a capture, a Folder and all its contents, or the complete Dock.

## Folder rules

- A Folder is unnamed, flat, and ordered.
- Empty Folders are valid, including multiple empty Folders.
- A capture belongs to at most one Folder.
- Moving a capture out of a Folder makes it an independent Dock entry.
- A closed Folder occupies one Dock position regardless of its contents.
- Deleting the final capture leaves the Folder empty.
- Deleting a Folder deletes every capture inside it.
- Destructive Folder operations must be recoverable.

## Delivery rules

- External delivery always copies and never consumes Dock contents.
- Drag is the primary delivery interaction.
- Individual captures also have an explicit Copy action.
- Starting a drag must not silently replace the user's clipboard.
- Folder delivery supplies captures in user-controlled order, without promising that a Destination preserves that order.
- DockSnip distinguishes a Delivery Attempt from confirmed Delivery and does not infer acceptance by the Destination.
- The first release does not show used, recently dragged, delivery-complete, or post-delivery cleanup state.
- DockSnip must not claim universal Destination compatibility.

## Persistence and cleanup

- Captures and Folders persist until explicit discard; they do not expire automatically.
- Temporary describes intended use, not volatility or retention duration.
- The Dock continues compacting as it fills. The first release must not introduce an internal scroll container because it clips previews and Folder flyouts, disrupts silhouette morphing, and changes drag/reorder geometry. Deliberate density is accepted as the cleanup prompt.
- The free product does not meter captures, Folders, storage, or Destinations.
- No valid capture may become invisible, unreachable, or orphaned because a session closes, is replaced, or is restored.

## Privacy and security

- Captures remain local unless the user deliberately delivers them to another service.
- The first release is account-free and contains no automated product analytics.
- Feedback, surveys, interviews, and diagnostic sharing are user-initiated.
- DockSnip does not collect or transmit image contents, clipboard contents, page contents, URLs, or Destination domains for analytics.
- Remote image collection must enforce bounded downloads and prevent access to private, loopback, link-local, multicast, and reserved network targets, including redirects.
- Extension permissions must be the narrowest practical set and explained to users.

## Supported environment

- Official support: current Chrome on macOS and Windows.
- Minimum Chrome version: 150.
- Release testing covers the current and previous two Chrome releases where compatible with the minimum.
- Linux, ChromeOS, Edge, Brave, and other Chromium browsers are best effort until explicitly tested.
- Maintain an internal compatibility matrix spanning chat, email, AI, design, document/presentation, and issue-tracking surfaces without making any one Destination the product identity.

## First-release exclusions

- User naming, tags, search, favorites, or permanent history
- Nested Folders
- Clipboard-image import
- Full-page capture
- Editing, annotation, OCR, redaction, or formatting
- PDF, report, contact-sheet, image-strip, or ZIP generation
- Cloud sync, accounts, shared workspaces, or team administration
- Automated telemetry
- AI processing
- Video or screen recording
- Native desktop production application

## Release gates

An invited beta is blocked by any known data-loss or invisible-capture path; unreliable session restoration; failure to drag Folders above the preview-cache size; incorrect crops at supported zoom levels; unrecoverable Folder deletion; unbounded or private-network remote-image fetches; inaccessible destructive controls; or failure of representative primary drag paths.

A public release requires users to complete capture, stage, delivery attempt, and discard without assistance; repeat use across real tasks; independent repeat Folder use; categorized and recoverable Destination failures; correct understanding of temporary staging; and no material privacy misunderstanding.

## Commercial boundary

The complete first release is free. Premium work begins only after retained users demonstrate a repeated real task, its current workaround, and willingness to pay. Initial hypotheses are lightweight editing/privacy tools and Folder transformations, tested separately. A future local premium bundle may test a $19–35 one-time license with optional paid major upgrades; this is not a committed price or feature set.
