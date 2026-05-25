# JustSnap

JustSnap is a local-first Chrome extension MVP for capturing webpage regions, collecting screenshots in a side rail, grouping them, and exporting metadata-only workflow logs.

## Local Setup

```bash
npm install
npm run build
```

Load the extension from `dist` in `chrome://extensions` with Developer mode enabled.

## MVP Notes

- Screenshots are stored locally for user utility.
- Research export contains metadata and activity events only, not raw screenshot image data.
- Browser paste/drop destinations are detected only on pages where the content script can run.
- Native app destinations remain unknown.
