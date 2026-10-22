# Future implementation note: native companion

## Direction

Keep the browser extension as DockSnip's first-release capture and collection surface. Explore a macOS companion after launch rather than replacing the extension or immediately building separate macOS, Windows, and Linux products.

The extension is the lowest-friction way to dock webpage images and capture browser content. A native companion would address the browser's weakest boundary: reliable delivery into desktop applications and complex browser editors through operating-system clipboard types, file URLs, and file promises.

## Proposed responsibility split

- **Extension:** discover webpage images, capture visible browser regions, and send captures to the companion.
- **Native companion:** own the system-wide Dock, local persistence, native clipboard output, genuine cross-application dragging, and future editing/export features.
- **Connection:** use Chrome Native Messaging with an explicitly registered local host. Do not upload capture contents or browsing information.

## Sequence

1. Release and stabilize the account-free extension.
2. Continue user interviews, surveys, and direct feedback instead of adding automated behavioral analytics in the first release.
3. Build a bounded macOS proof of concept.
4. Test native copy and drag with Google Slides, Google Docs, Figma, ChatGPT, Claude, Jira, WhatsApp, Mail, PowerPoint, and Finder.
5. Proceed only if the companion materially improves destination reliability and users value a system-wide Dock.
6. Consider Windows after demonstrated demand. Defer Linux until platform demand justifies its packaging and desktop-environment complexity.

## Folder delivery

Do not represent browser clipboard copying as equivalent to Folder delivery. Browser and operating-system clipboards do not reliably preserve several independent image items for every destination. A native companion may implement Folder delivery with multiple file URLs or file promises while preserving capture order.

## Commercial role

Keep capture, collection, and basic delivery free initially. A native companion could later support the paid personal license through editing, formatting, report/PDF export, and other capabilities validated by user research.

## Reference capabilities

- Chrome Native Messaging: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
- Apple file-promise drag and drop: https://developer.apple.com/documentation/AppKit/supporting-table-view-drag-and-drop-through-file-promises
- Windows application drag and drop: https://learn.microsoft.com/en-us/windows/apps/develop/data/drag-and-drop
