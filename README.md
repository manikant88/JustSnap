# DockSnip

DockSnip is a local-first Chrome extension for capturing webpage regions, docking screenshots and images in a floating dock, grouping them, and dropping them wherever you work.

Snip it. Dock it. Drop it.

## Local Setup

```bash
npm install
npm run build
```

Load the extension from `dist` in `chrome://extensions` with Developer mode enabled.

## MVP Notes

- Screenshots and docked images are stored locally for user utility.
- DockSnip does not record page URLs, paste/drop destinations, or activity history.
- Full-resolution images are stored once in the browser's local image database; dock thumbnails are lightweight display assets.
