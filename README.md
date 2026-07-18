# DockSnip

DockSnip is a local-first Chrome extension for capturing webpage regions, docking screenshots and page images in a floating dock, grouping them, and dropping them wherever you work.

Snip it. Dock it. Drop it.

## Local Setup

```bash
npm install
npm run build
```

Load the extension from `dist` in `chrome://extensions` with Developer mode enabled.

## MVP Notes

- Screenshots and docked images are stored locally for user utility.
- Research export contains metadata and activity events only, not raw screenshot image data.
- Browser paste/drop destinations are detected only on pages where the content script can run.
- Native app destinations remain unknown.
