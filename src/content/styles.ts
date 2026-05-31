export const styles = `
  :host, * { box-sizing: border-box; }
  button, input { font: inherit; }
  .justsnap-hidden { opacity: 0 !important; pointer-events: none !important; }
  .justsnap-toolbar {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 2147483647;
    min-height: 42px;
    padding: 5px;
    border: 1px solid #d8e0eb;
    border-radius: 12px;
    display: flex;
    align-items: center;
    gap: 4px;
    color: #172033;
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.12);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    backdrop-filter: blur(10px);
  }
  .justsnap-rail {
    position: fixed;
    top: 50%;
    right: 0;
    z-index: 2147483646;
    width: var(--justsnap-rail-surface, 74px);
    height: 80vh;
    max-height: calc(100vh - 24px);
    display: flex;
    flex-direction: column;
    color: #172033;
    background: transparent;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    overflow: visible;
    translate: 0 -50%;
  }
  .justsnap-rail-backdrop {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 2147483645;
    width: calc(var(--justsnap-rail-surface, 74px) + 22px);
    background: linear-gradient(
      to left,
      rgba(15, 23, 42, 0.16) 0%,
      rgba(15, 23, 42, 0.08) 52%,
      rgba(15, 23, 42, 0.00) 100%
    );
    pointer-events: none;
  }
  .justsnap-toolbar button {
    width: 32px;
    min-width: 32px;
    height: 32px;
    border: 0;
    border-radius: 7px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #24324a;
    background: transparent;
    cursor: pointer;
  }
  .justsnap-toolbar button:hover:not(:disabled) { background: #f1f5f9; }
  .justsnap-toolbar button:disabled { opacity: 0.45; cursor: not-allowed; }
  .justsnap-error-dot {
    width: 22px !important;
    min-width: 22px !important;
    height: 22px !important;
    border-radius: 999px !important;
    color: #8f1f1f;
    background: #fff2f2;
    box-shadow: inset 0 0 0 1px #fac5c5;
    font-size: 12px;
    font-weight: 800;
  }
  .justsnap-empty {
    margin: 18px auto;
    width: 52px;
    height: 52px;
    border: 1px dashed #c8d3e0;
    border-radius: 10px;
    display: grid;
    place-items: center;
    color: #66768a;
    background: rgba(255,255,255,0.74);
  }
  .justsnap-library {
    position: relative;
    z-index: 1;
    flex: 1;
    align-self: flex-end;
    width: min(380px, calc(100vw - 16px));
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    justify-content: center;
    align-items: flex-end;
    overflow: visible;
    padding: 16px 9px 16px 0;
    background: transparent;
    outline: none;
    pointer-events: auto;
  }
  .justsnap-activity {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0 12px 18px;
  }
  .justsnap-dock-slot {
    position: relative;
    width: 52px;
    height: 64px;
    flex: 0 0 auto;
    transition: width 120ms ease-out, height 120ms ease-out;
    overflow: visible;
  }
  .justsnap-dock-image-button {
    position: absolute;
    top: 50%;
    right: 0;
    z-index: 1;
    width: 52px;
    height: 52px;
    border: 2px solid transparent;
    border-radius: 8px;
    padding: 0;
    overflow: hidden;
    background: #e8eef5;
    cursor: grab;
    transform-origin: center right;
    translate: 0 calc(-50% + var(--justsnap-preview-offset-y, 0px));
    transition: width 120ms ease-out, height 120ms ease-out, border-color 150ms ease, box-shadow 150ms ease;
    will-change: width, height;
  }
  .justsnap-dock-image-new {
    animation: justsnap-capture-added 520ms cubic-bezier(0.18, 0.9, 0.22, 1.18);
  }
  .justsnap-dock-image-added-focus {
    border-color: #0ea5e9;
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.22), 0 10px 24px rgba(15, 32, 48, 0.24);
    z-index: 3;
  }
  @keyframes justsnap-capture-added {
    0% { scale: 0.72; opacity: 0.35; }
    58% { scale: 1.12; opacity: 1; }
    100% { scale: 1; opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .justsnap-dock-image-new { animation: none; }
  }
  .justsnap-dock-image-button:hover,
  .justsnap-dock-image-button:focus-visible {
    border-color: #0ea5e9;
    box-shadow: 0 10px 24px rgba(15, 32, 48, 0.24);
    z-index: 2;
  }
  .justsnap-dock-image-button:active { cursor: grabbing; }
  .justsnap-dock-folder-button {
    position: absolute;
    top: 50%;
    right: 0;
    z-index: 1;
    width: 52px;
    height: 52px;
    border: 2px solid transparent !important;
    border-radius: 8px !important;
    padding: 4px !important;
    overflow: hidden;
    background: linear-gradient(135deg, rgba(255,255,255,0.86), rgba(226,232,240,0.88)) !important;
    box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.32);
    cursor: grab;
    transform-origin: center right;
    translate: 0 -50%;
    transition: width 120ms ease-out, height 120ms ease-out, border-color 150ms ease, box-shadow 150ms ease;
    will-change: width, height;
  }
  .justsnap-dock-folder-button:hover,
  .justsnap-dock-folder-button:focus-visible {
    border-color: #0ea5e9 !important;
    box-shadow: 0 10px 24px rgba(15, 32, 48, 0.24), inset 0 0 0 1px rgba(148, 163, 184, 0.32);
    z-index: 2;
  }
  .justsnap-dock-folder-button:active { cursor: grabbing; }
  .justsnap-folder-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: 3px;
    width: 100%;
    height: 100%;
  }
  .justsnap-folder-grid img {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    border-radius: 5px;
    object-fit: cover;
    display: block;
    background: #fff;
  }
  .justsnap-folder-count {
    position: absolute;
    right: 5px;
    bottom: 5px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    background: rgba(15, 23, 42, 0.78);
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.24);
    font-size: 10px;
    font-weight: 800;
    line-height: 1;
  }
  .justsnap-dock-image-button img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    background: #f7f9fc;
    image-rendering: auto;
  }
  .justsnap-dock-remove {
    position: absolute;
    top: calc(50% + var(--justsnap-preview-offset-y, 0px) - var(--justsnap-dock-item-half, 26px) + 7px);
    right: 7px;
    z-index: 5;
    width: 24px !important;
    min-width: 24px !important;
    height: 24px !important;
    border: 1px solid rgba(20, 32, 48, 0.12) !important;
    border-radius: 999px !important;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #243449;
    background: rgba(255,255,255,0.9) !important;
    box-shadow: 0 6px 14px rgba(15, 32, 48, 0.18);
    cursor: pointer;
    line-height: 0;
  }
  .justsnap-dock-remove:hover {
    color: #b42318;
    background: #fff !important;
  }
  .justsnap-dock-remove svg {
    display: block;
    flex: 0 0 auto;
  }
  .justsnap-group-flyout {
    position: absolute;
    top: 50%;
    right: calc(100% + 8px);
    z-index: 4;
    width: min(380px, calc(100vw - 120px));
    max-height: min(420px, calc(100vh - 28px));
    padding: 10px 9px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    justify-content: center;
    align-items: flex-end;
    overflow: visible;
    background: transparent;
    translate: 0 -50%;
  }
  .justsnap-group-flyout::before {
    content: "";
    position: absolute;
    inset: 0 0 0 auto;
    z-index: 0;
    width: var(--justsnap-rail-surface, 74px);
    border-radius: 14px 0 0 14px;
    pointer-events: none;
  }
  .justsnap-group-flyout > * {
    position: relative;
    z-index: 1;
  }
  .justsnap-group-flyout-slot { flex: 0 0 auto; }
  .justsnap-card-loading { cursor: wait; opacity: 0.78; }
  .justsnap-activity { display: grid; gap: 8px; align-content: start; }
  .justsnap-activity article {
    padding: 10px;
    border: 1px solid #dde6f0;
    border-radius: 8px;
    display: grid;
    gap: 3px;
    background: #fff;
  }
  .justsnap-activity article strong { font-size: 12px; }
  .justsnap-activity article span, .justsnap-activity article small { font-size: 11px; }
  .justsnap-capture-layer {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    cursor: crosshair;
    background: rgba(7, 14, 24, 0.24);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .justsnap-capture-toolbar {
    position: fixed;
    top: 14px;
    left: 50%;
    translate: -50% 0;
    min-height: 42px;
    padding: 6px 8px 6px 14px;
    border: 1px solid rgba(255,255,255,0.22);
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: #fff;
    background: rgba(15, 23, 42, 0.9);
    box-shadow: 0 14px 30px rgba(0,0,0,0.24);
  }
  .justsnap-capture-toolbar button {
    width: 30px;
    height: 30px;
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 7px;
    color: #fff;
    background: rgba(255,255,255,0.08);
    cursor: pointer;
  }
  .justsnap-selection {
    position: fixed;
    border: 2px solid #45a6ff;
    background: rgba(69, 166, 255, 0.12);
    box-shadow: 0 0 0 9999px rgba(7, 14, 24, 0.34);
  }
`;
